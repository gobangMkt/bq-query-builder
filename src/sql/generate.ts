// S2: SQL 생성 엔진 — 집계 모드. 순수 함수: (카탈로그, 선택상태) → BigQuery Standard SQL 문자열.
// DOM/브라우저 API 사용 금지.

import type { Catalog, CatalogProperty, ParamType } from '../data/catalog-types';
import type { AggregateSelection, DimensionSelection, FilterCondition, MetricType } from './types';

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

const METRIC_EXPR: Record<MetricType, string> = {
  event_count: 'COUNT(*) AS event_count',
  unique_users: 'COUNT(DISTINCT user_pseudo_id) AS unique_users',
  unique_sessions:
    'COUNT(DISTINCT CONCAT(user_pseudo_id, CAST(ga_session_id AS STRING))) AS unique_sessions',
};

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
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

  return [
    '/* ===== Assumptions ===== */',
    `/* 기간: ${start} ~ ${end} */`,
    `/* 이벤트: ${eventSummary} */`,
    `/* 필터: ${filterSummary} */`,
    '/* 실행 전 BQ 에디터에서 예상 스캔량을 확인하세요. */',
  ].join('\n');
}

export function generateAggregateSql(catalog: Catalog, selection: AggregateSelection): string {
  if (!selection.dateRange || !selection.dateRange.start || !selection.dateRange.end) {
    throw new Error('기간을 먼저 선택하세요. 기간 없이는 SQL을 생성할 수 없습니다.');
  }
  if (selection.metrics.length === 0) {
    throw new Error('지표를 1개 이상 선택하세요.');
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

  const baseWhereLines = [`_TABLE_SUFFIX BETWEEN '${toTableSuffix(start)}' AND '${toTableSuffix(end)}'`];
  if (selection.events.length > 0) {
    const eventList = selection.events.map((e) => `'${escapeSql(e)}'`).join(', ');
    baseWhereLines.push(`event_name IN (${eventList})`);
  }
  const baseWhereClause = baseWhereLines
    .map((line, i) => (i === 0 ? `  WHERE ${line}` : `    AND ${line}`))
    .join('\n');

  const baseCte = [
    'WITH base AS (',
    '  SELECT',
    baseColumns.map((c) => `    ${c}`).join(',\n'),
    `  FROM \`${catalog.projectId}.${property.datasetId}.events_*\``,
    baseWhereClause,
    ')',
  ].join('\n');

  // ----- Aggregate SELECT -----
  const dimensionExprs = selection.dimensions.map(dimensionSelectExpr);
  const metricExprs = selection.metrics.map((m) => METRIC_EXPR[m]);
  const groupByList = selection.dimensions.map(dimensionColumnName);

  const filterExprs = selection.filters.map((f) => {
    const numeric = !FIXED_STRING_FIELDS.has(f.field) && isNumericType(paramTypes.get(f.field));
    return buildFilterExpr(f, numeric);
  });

  const outerLines = [
    'SELECT',
    [...dimensionExprs, ...metricExprs].map((c) => `  ${c}`).join(',\n'),
    'FROM base',
  ];
  if (filterExprs.length > 0) {
    outerLines.push(filterExprs.map((f, i) => (i === 0 ? `WHERE ${f}` : `  AND ${f}`)).join('\n'));
  }
  if (groupByList.length > 0) {
    outerLines.push(`GROUP BY ${groupByList.join(', ')}`);
  }

  return [
    buildAssumptionsComment(selection),
    '',
    '/* ===== base ===== */',
    baseCte,
    '',
    '/* ===== Aggregate ===== */',
    outerLines.join('\n'),
  ].join('\n');
}
