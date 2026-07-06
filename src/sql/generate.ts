// S2: SQL 생성 엔진 — 집계 모드. 순수 함수: (카탈로그, 선택상태) → BigQuery Standard SQL 문자열.
// DOM/브라우저 API 사용 금지.

import type { Catalog, CatalogProperty, ParamType } from '../data/catalog-types';
import type {
  AggregateSelection,
  DimensionSelection,
  FilterCondition,
  MetricType,
  RatioMetric,
  SegmentCondition,
  WideSelection,
} from './types';

const FIXED_STRING_FIELDS = new Set([
  'event_date',
  'event_name',
  'user_pseudo_id',
  'user_id',
  'traffic_source_source',
  'traffic_source_medium',
  'traffic_source_campaign',
]);

// branch_type 병합 규칙(스펙 §5): 원룸텔·고시원은 한 그룹으로 묶는다.
const BRANCH_TYPE_MERGE_VALUES = ['원룸텔', '고시원'];
const BRANCH_TYPE_MERGE_LABEL = '고시원·원룸텔';

// 결과 컬럼 alias는 SQL을 모르는 사람이 바로 읽도록 한글로 둔다(BigQuery는 백틱으로 감싼다).
const METRIC_EXPR: Record<MetricType, string> = {
  event_count: 'COUNT(*) AS `이벤트수`',
  unique_users: 'COUNT(DISTINCT user_pseudo_id) AS `고유사용자수`',
  unique_sessions:
    'COUNT(DISTINCT CONCAT(user_pseudo_id, CAST(ga_session_id AS STRING))) AS `고유세션수`',
};

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

const RATIO_DECIMALS_MIN = 0;
const RATIO_DECIMALS_MAX = 4;

function clampDecimals(decimals: number): number {
  if (!Number.isFinite(decimals)) return 0;
  return Math.max(RATIO_DECIMALS_MIN, Math.min(RATIO_DECIMALS_MAX, Math.round(decimals)));
}

/** 유효한 비율 지표만 반환(분자·분모 이벤트가 모두 있어야 활성). 아니면 null. */
function activeRatio(selection: AggregateSelection): RatioMetric | null {
  const r = selection.ratio;
  if (!r || !r.numeratorEvent || !r.denominatorEvent) return null;
  return r;
}

/** 비율 지표 SELECT 표현식 — 분자/분모 건수 + SAFE_DIVIDE(퍼센트/소수).
 *  분자·분모 컬럼은 어떤 이벤트를 센 건지 바로 알도록 `이벤트명_건수`로, 비율은 단위를 alias에 담는다. */
function buildRatioExprs(ratio: RatioMetric): string[] {
  const numCount = `COUNTIF(event_name = '${escapeSql(ratio.numeratorEvent)}')`;
  const denCount = `COUNTIF(event_name = '${escapeSql(ratio.denominatorEvent)}')`;
  const decimals = clampDecimals(ratio.decimals);
  const divide = `SAFE_DIVIDE(${numCount}, ${denCount})`;
  const ratioExpr =
    ratio.format === 'percent'
      ? `ROUND(${divide} * 100, ${decimals}) AS \`비율(%)\``
      : `ROUND(${divide}, ${decimals}) AS \`비율\``;
  return [
    `${numCount} AS \`${ratio.numeratorEvent}_건수\``,
    `${denCount} AS \`${ratio.denominatorEvent}_건수\``,
    ratioExpr,
  ];
}

function toTableSuffix(date: string): string {
  return date.replace(/-/g, '');
}

function isNumericType(type: ParamType | undefined): boolean {
  return type === 'int' || type === 'numeric';
}

function findParamType(property: CatalogProperty, eventNames: string[], key: string): ParamType {
  for (const name of eventNames) {
    const event = property.events.find((e) => e.name === name);
    const param = event?.params.find((p) => p.key === key);
    if (param) return param.type;
  }
  // 선택된 이벤트에 없으면 프로퍼티 전체에서 탐색 (branch_type처럼 여러 이벤트에 걸친 공통 파라미터 대비)
  for (const event of property.events) {
    const param = event.params.find((p) => p.key === key);
    if (param) return param.type;
  }
  throw new Error(`카탈로그에서 파라미터를 찾을 수 없습니다: ${key}`);
}

function paramColumnExpr(key: string, type: ParamType): string {
  const escKey = escapeSql(key);
  const valueExpr =
    type === 'string'
      ? 'value.string_value'
      : 'COALESCE(value.int_value, SAFE_CAST(value.double_value AS INT64))';
  return `(SELECT ${valueExpr} FROM UNNEST(event_params) WHERE key = '${escKey}') AS ${key}`;
}

function dimensionColumnName(dim: DimensionSelection): string {
  switch (dim.kind) {
    case 'event_date':
      return 'event_date';
    case 'event_name':
      return 'event_name';
    case 'traffic_source':
      return `traffic_source_${dim.field}`;
    case 'branch_type':
      return 'branch_type_grouped';
    case 'param':
      return dim.key;
  }
}

function dimensionSelectExpr(dim: DimensionSelection): string {
  switch (dim.kind) {
    case 'event_date':
      return 'event_date';
    case 'event_name':
      return 'event_name';
    case 'traffic_source':
      return `traffic_source_${dim.field}`;
    case 'branch_type': {
      const inList = BRANCH_TYPE_MERGE_VALUES.map((v) => `'${escapeSql(v)}'`).join(', ');
      return `CASE WHEN branch_type IN (${inList}) THEN '${BRANCH_TYPE_MERGE_LABEL}' ELSE branch_type END AS branch_type_grouped`;
    }
    case 'param':
      return dim.key;
  }
}

function formatFilterValue(value: string | number, numeric: boolean): string {
  if (numeric) return String(value);
  return `'${escapeSql(String(value))}'`;
}

function buildFilterExpr(filter: FilterCondition, numeric: boolean): string {
  const { field, operator, value } = filter;
  if (operator === 'IN') {
    const values = Array.isArray(value) ? value : [value];
    const list = values.map((v) => formatFilterValue(v, numeric)).join(', ');
    return `${field} IN (${list})`;
  }
  if (operator === 'CONTAINS') {
    return `${field} LIKE '%${escapeSql(String(value))}%'`;
  }
  return `${field} ${operator} ${formatFilterValue(value as string | number, numeric)}`;
}

// ===== v2: 사람 조건(세그먼트) =====

function segmentsOf(selection: { segments?: SegmentCondition[] }): SegmentCondition[] {
  return selection.segments ?? [];
}

/** 대상 이벤트 + 세그먼트 조건 이벤트를 합친 목록(순서 보존, 중복 제거). base가 스캔할 이벤트다. */
function unionBaseEvents(events: string[], segments: SegmentCondition[]): string[] {
  const all: string[] = [];
  const add = (name: string) => {
    if (name && !all.includes(name)) all.push(name);
  };
  for (const e of events) add(e);
  for (const s of segments) add(s.event);
  return all;
}

/** seg_users CTE — 조회 기간 내에서 사람 조건(했다/안 했다)을 모두 만족하는 user_pseudo_id 집합 */
function buildSegUsersCte(segments: SegmentCondition[]): string {
  const havingLines = segments.map(
    (s) => `COUNTIF(event_name = '${escapeSql(s.event)}') ${s.did ? '> 0' : '= 0'}`,
  );
  return [
    'seg_users AS (',
    '  SELECT user_pseudo_id',
    '  FROM base',
    '  GROUP BY user_pseudo_id',
    havingLines.map((h, i) => (i === 0 ? `  HAVING ${h}` : `     AND ${h}`)).join('\n'),
    ')',
  ].join('\n');
}

function segmentsSummary(segments: SegmentCondition[]): string {
  if (segments.length === 0) return '없음';
  return segments.map((s) => `${s.event} ${s.did ? '한 사람' : '안 한 사람'}`).join(', ');
}

/** 선택 상태에서 base CTE가 event_params에서 UNNEST로 뽑아야 할 키 목록(순서 보존, 중복 제거) */
function collectParamKeys(selection: AggregateSelection): string[] {
  const keys: string[] = [];
  const add = (key: string) => {
    if (!keys.includes(key)) keys.push(key);
  };

  for (const dim of selection.dimensions) {
    if (dim.kind === 'param') add(dim.key);
    if (dim.kind === 'branch_type') add('branch_type');
  }
  for (const filter of selection.filters) {
    if (!FIXED_STRING_FIELDS.has(filter.field)) add(filter.field);
  }
  if (selection.metrics.includes('unique_sessions')) add('ga_session_id');

  return keys;
}

// assumptions 블록은 base 조립 전에 만들어지므로 카탈로그 타입 조회 없이, 값 타입만 보고 숫자 여부를 표시한다.
function isNumericFilterForDisplay(filter: FilterCondition): boolean {
  return !FIXED_STRING_FIELDS.has(filter.field) && typeof filter.value !== 'string';
}

function buildAssumptionsComment(selection: AggregateSelection): string {
  const { start, end } = selection.dateRange as { start: string; end: string };
  const eventSummary = selection.events.length > 0 ? selection.events.join(', ') : '전체';
  const filterSummary =
    selection.filters.length > 0
      ? selection.filters.map((f) => buildFilterExpr(f, isNumericFilterForDisplay(f))).join(', ')
      : '없음';

  const ratio = activeRatio(selection);
  const ratioLine = ratio
    ? [
        `/* 비율: ${ratio.numeratorEvent} ÷ ${ratio.denominatorEvent}` +
          ` (${ratio.format === 'percent' ? '%' : '소수'}, 소수점 ${clampDecimals(ratio.decimals)}자리) */`,
      ]
    : [];

  return [
    '/* ===== Assumptions ===== */',
    `/* 기간: ${start} ~ ${end} */`,
    `/* 이벤트: ${eventSummary} */`,
    ...ratioLine,
    `/* 사람 조건: ${segmentsSummary(segmentsOf(selection))} (판정 기간 = 조회 기간) */`,
    `/* 필터: ${filterSummary} */`,
    '/* 실행 전 BQ 에디터에서 예상 스캔량을 확인하세요. */',
  ].join('\n');
}

export function generateAggregateSql(catalog: Catalog, selection: AggregateSelection): string {
  if (!selection.dateRange || !selection.dateRange.start || !selection.dateRange.end) {
    throw new Error('기간을 먼저 선택하세요. 기간 없이는 SQL을 생성할 수 없습니다.');
  }
  const ratio = activeRatio(selection);
  if (selection.metrics.length === 0 && !ratio) {
    throw new Error('지표를 1개 이상 선택하거나 비율을 설정하세요.');
  }

  const property = catalog.properties[selection.propertyKey];
  const { start, end } = selection.dateRange;

  const paramKeys = collectParamKeys(selection);
  const paramTypes = new Map<string, ParamType>();
  for (const key of paramKeys) {
    paramTypes.set(key, findParamType(property, selection.events, key));
  }

  // ----- base CTE -----
  const baseColumns = [
    "PARSE_DATE('%Y%m%d', event_date) AS event_date",
    'event_timestamp',
    'TIMESTAMP_MICROS(event_timestamp) AS event_time',
    'event_name',
    'user_pseudo_id',
    'user_id',
    'traffic_source.source AS traffic_source_source',
    'traffic_source.medium AS traffic_source_medium',
    'traffic_source.name AS traffic_source_campaign',
    ...paramKeys.map((key) => paramColumnExpr(key, paramTypes.get(key) as ParamType)),
  ];

  const segments = segmentsOf(selection);
  const ratioEvents = ratio ? [ratio.numeratorEvent, ratio.denominatorEvent] : [];
  const baseEvents = unionBaseEvents([...selection.events, ...ratioEvents], segments);

  const baseCteBody = buildBaseCteBody(catalog, property, baseEvents, { start, end }, baseColumns);
  const cteBodies = [baseCteBody];
  if (segments.length > 0) cteBodies.push(buildSegUsersCte(segments));
  const cteBlock = `WITH ${cteBodies.join(',\n')}`;

  // ----- Aggregate SELECT -----
  const dimensionExprs = selection.dimensions.map(dimensionSelectExpr);
  const metricExprs = selection.metrics.map((m) => METRIC_EXPR[m]);
  const ratioExprs = ratio ? buildRatioExprs(ratio) : [];
  const groupByList = selection.dimensions.map(dimensionColumnName);

  const filterExprs = selection.filters.map((f) => {
    const numeric = !FIXED_STRING_FIELDS.has(f.field) && isNumericType(paramTypes.get(f.field));
    return buildFilterExpr(f, numeric);
  });

  // 세그먼트가 있으면 base가 대상+조건 이벤트를 함께 스캔하므로, 집계 대상만 다시 걸러낸다.
  const whereClauses: string[] = [];
  if (segments.length > 0) {
    if (selection.events.length > 0) {
      const eventList = selection.events.map((e) => `'${escapeSql(e)}'`).join(', ');
      whereClauses.push(`event_name IN (${eventList})`);
    }
    whereClauses.push('user_pseudo_id IN (SELECT user_pseudo_id FROM seg_users)');
  }
  whereClauses.push(...filterExprs);

  const outerLines = [
    'SELECT',
    [...dimensionExprs, ...metricExprs, ...ratioExprs].map((c) => `  ${c}`).join(',\n'),
    'FROM base',
  ];
  if (whereClauses.length > 0) {
    outerLines.push(whereClauses.map((f, i) => (i === 0 ? `WHERE ${f}` : `  AND ${f}`)).join('\n'));
  }
  if (groupByList.length > 0) {
    outerLines.push(`GROUP BY ${groupByList.join(', ')}`);
  }

  return [
    buildAssumptionsComment(selection),
    '',
    '/* ===== base ===== */',
    cteBlock,
    '',
    '/* ===== Aggregate ===== */',
    outerLines.join('\n'),
  ].join('\n');
}

/** base CTE 본문(`base AS (...)`, WITH 없음) — 여러 CTE 조합을 위해 WITH는 호출부에서 붙인다. */
function buildBaseCteBody(
  catalog: Catalog,
  property: CatalogProperty,
  events: string[],
  dateRange: { start: string; end: string },
  baseColumns: string[],
): string {
  const baseWhereLines = [
    `_TABLE_SUFFIX BETWEEN '${toTableSuffix(dateRange.start)}' AND '${toTableSuffix(dateRange.end)}'`,
  ];
  if (events.length > 0) {
    const eventList = events.map((e) => `'${escapeSql(e)}'`).join(', ');
    baseWhereLines.push(`event_name IN (${eventList})`);
  }
  const baseWhereClause = baseWhereLines
    .map((line, i) => (i === 0 ? `  WHERE ${line}` : `    AND ${line}`))
    .join('\n');

  return [
    'base AS (',
    '  SELECT',
    baseColumns.map((c) => `    ${c}`).join(',\n'),
    `  FROM \`${catalog.projectId}.${property.datasetId}.events_*\``,
    baseWhereClause,
    ')',
  ].join('\n');
}

// ===== S6: 상세(Wide) 모드 =====
// 이벤트 1행씩, GROUP BY 없이 기본 컬럼 + 선택한 event_params 개별 컬럼을 그대로 뽑는다.

const WIDE_FIXED_OUTPUT_COLUMNS = [
  'event_date',
  'event_time',
  'event_name',
  'user_pseudo_id',
  'user_id',
  'traffic_source_source',
  'traffic_source_medium',
  'traffic_source_campaign',
];

/** wide 모드 base CTE가 UNNEST로 뽑아야 할 event_params 키 목록(순서 보존, 중복 제거) */
function collectWideParamKeys(selection: WideSelection): string[] {
  const keys: string[] = [];
  const add = (key: string) => {
    if (!keys.includes(key)) keys.push(key);
  };

  for (const key of selection.columns) add(key);
  for (const filter of selection.filters) {
    if (!FIXED_STRING_FIELDS.has(filter.field)) add(filter.field);
  }

  return keys;
}

function buildWideAssumptionsComment(selection: WideSelection): string {
  const { start, end } = selection.dateRange as { start: string; end: string };
  const eventSummary = selection.events.length > 0 ? selection.events.join(', ') : '전체';
  const filterSummary =
    selection.filters.length > 0
      ? selection.filters.map((f) => buildFilterExpr(f, isNumericFilterForDisplay(f))).join(', ')
      : '없음';
  const limitSummary =
    selection.limit !== null ? `${selection.limit}행` : '해제됨 — 전체 반환, 대량 스캔 주의';

  return [
    '/* ===== Assumptions ===== */',
    '/* 모드: 상세(Wide) */',
    `/* 기간: ${start} ~ ${end} */`,
    `/* 이벤트: ${eventSummary} */`,
    `/* 사람 조건: ${segmentsSummary(segmentsOf(selection))} (판정 기간 = 조회 기간) */`,
    `/* 필터: ${filterSummary} */`,
    `/* LIMIT: ${limitSummary} */`,
    '/* 실행 전 BQ 에디터에서 예상 스캔량을 확인하세요. */',
  ].join('\n');
}

export function generateWideSql(catalog: Catalog, selection: WideSelection): string {
  if (!selection.dateRange || !selection.dateRange.start || !selection.dateRange.end) {
    throw new Error('기간을 먼저 선택하세요. 기간 없이는 SQL을 생성할 수 없습니다.');
  }

  const property = catalog.properties[selection.propertyKey];
  const { start, end } = selection.dateRange;

  const paramKeys = collectWideParamKeys(selection);
  const paramTypes = new Map<string, ParamType>();
  for (const key of paramKeys) {
    paramTypes.set(key, findParamType(property, selection.events, key));
  }

  const baseColumns = [
    "PARSE_DATE('%Y%m%d', event_date) AS event_date",
    'event_timestamp',
    'TIMESTAMP_MICROS(event_timestamp) AS event_time',
    'event_name',
    'user_pseudo_id',
    'user_id',
    'traffic_source.source AS traffic_source_source',
    'traffic_source.medium AS traffic_source_medium',
    'traffic_source.name AS traffic_source_campaign',
    ...paramKeys.map((key) => paramColumnExpr(key, paramTypes.get(key) as ParamType)),
  ];

  const segments = segmentsOf(selection);
  const baseEvents = unionBaseEvents(selection.events, segments);
  const baseCteBody = buildBaseCteBody(catalog, property, baseEvents, { start, end }, baseColumns);
  const cteBodies = [baseCteBody];
  if (segments.length > 0) cteBodies.push(buildSegUsersCte(segments));
  const cteBlock = `WITH ${cteBodies.join(',\n')}`;

  const outerColumns = [...WIDE_FIXED_OUTPUT_COLUMNS, ...selection.columns];

  const filterExprs = selection.filters.map((f) => {
    const numeric = !FIXED_STRING_FIELDS.has(f.field) && isNumericType(paramTypes.get(f.field));
    return buildFilterExpr(f, numeric);
  });

  const whereClauses: string[] = [];
  if (segments.length > 0) {
    if (selection.events.length > 0) {
      const eventList = selection.events.map((e) => `'${escapeSql(e)}'`).join(', ');
      whereClauses.push(`event_name IN (${eventList})`);
    }
    whereClauses.push('user_pseudo_id IN (SELECT user_pseudo_id FROM seg_users)');
  }
  whereClauses.push(...filterExprs);

  const outerLines = ['SELECT', outerColumns.map((c) => `  ${c}`).join(',\n'), 'FROM base'];
  if (whereClauses.length > 0) {
    outerLines.push(whereClauses.map((f, i) => (i === 0 ? `WHERE ${f}` : `  AND ${f}`)).join('\n'));
  }
  if (selection.limit !== null) {
    outerLines.push(`LIMIT ${selection.limit}`);
  }

  return [
    buildWideAssumptionsComment(selection),
    '',
    '/* ===== base ===== */',
    cteBlock,
    '',
    '/* ===== Wide ===== */',
    outerLines.join('\n'),
  ].join('\n');
}
