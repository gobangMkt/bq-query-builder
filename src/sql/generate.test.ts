import { describe, expect, it } from 'vitest';
import { generateAggregateSql, generateWideSql } from './generate';
import type { Catalog } from '../data/catalog-types';
import type { AggregateSelection, WideSelection } from './types';
import realCatalog from '../data/catalog.json';

const catalog = realCatalog as Catalog;

// generate.ts는 카탈로그 형태(Catalog)만 의존하므로, 실제 catalog.json 드리프트에
// 흔들리지 않도록 대부분의 테스트는 최소 fixture로 검증한다. 수용 기준 스냅샷 1건만 실제 데이터 사용.
const fixtureCatalog: Catalog = {
  projectId: 'test-project',
  generatedAt: '2026-01-01T00:00:00.000Z',
  properties: {
    gobang: {
      datasetId: 'analytics_111',
      label: '고방',
      events: [
        {
          name: 'branch_view',
          label: '지점 조회',
          cnt: 100,
          params: [
            { key: 'branch_type', type: 'string', cnt: 100 },
            { key: 'price_deposit_min', type: 'numeric', cnt: 100 },
            { key: 'review_count', type: 'int', cnt: 100 },
            { key: 'ga_session_id', type: 'int', cnt: 100 },
            { key: 'page_path', type: 'string', cnt: 100 },
          ],
        },
      ],
    },
    uceo: {
      datasetId: 'analytics_222',
      label: 'U사장님',
      events: [
        {
          name: 'page_view',
          label: '페이지뷰',
          cnt: 10,
          params: [{ key: 'page_hostname', type: 'string', cnt: 10 }],
        },
      ],
    },
  },
};

function baseSelection(overrides: Partial<AggregateSelection> = {}): AggregateSelection {
  return {
    propertyKey: 'gobang',
    dateRange: { start: '2026-06-25', end: '2026-07-01' },
    events: ['branch_view'],
    dimensions: [],
    metrics: ['event_count'],
    filters: [],
    ...overrides,
  };
}

describe('generateAggregateSql — 수용 기준 스냅샷 (실제 catalog.json)', () => {
  it('고방/최근7일/inquiry/차원=event_date,inquiry_method/지표=이벤트수,고유사용자수', () => {
    const selection: AggregateSelection = {
      propertyKey: 'gobang',
      dateRange: { start: '2026-06-25', end: '2026-07-01' },
      events: ['inquiry'],
      dimensions: [{ kind: 'event_date' }, { kind: 'param', key: 'inquiry_method' }],
      metrics: ['event_count', 'unique_users'],
      filters: [],
    };

    const sql = generateAggregateSql(catalog, selection);

    expect(sql).toBe(`/* ===== Assumptions ===== */
/* 기간: 2026-06-25 ~ 2026-07-01 */
/* 이벤트: inquiry */
/* 사람 조건: 없음 (판정 기간 = 조회 기간) */
/* 필터: 없음 */
/* 실행 전 BQ 에디터에서 예상 스캔량을 확인하세요. */

/* ===== base ===== */
WITH base AS (
  SELECT
    PARSE_DATE('%Y%m%d', event_date) AS event_date,
    event_timestamp,
    TIMESTAMP_MICROS(event_timestamp) AS event_time,
    event_name,
    user_pseudo_id,
    user_id,
    traffic_source.source AS traffic_source_source,
    traffic_source.medium AS traffic_source_medium,
    traffic_source.name AS traffic_source_campaign,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'inquiry_method') AS inquiry_method
  FROM \`gobang-bigquery.analytics_274122040.events_*\`
  WHERE _TABLE_SUFFIX BETWEEN '20260625' AND '20260701'
    AND event_name IN ('inquiry')
)

/* ===== Aggregate ===== */
SELECT
  event_date,
  inquiry_method,
  COUNT(*) AS event_count,
  COUNT(DISTINCT user_pseudo_id) AS unique_users
FROM base
GROUP BY event_date, inquiry_method`);
  });
});

describe('generateAggregateSql — 기간 가드', () => {
  it('dateRange가 null이면 throw', () => {
    const selection = baseSelection({ dateRange: null });
    expect(() => generateAggregateSql(fixtureCatalog, selection)).toThrow();
  });

  it('start/end가 빈 문자열이면 throw', () => {
    const selection = baseSelection({ dateRange: { start: '', end: '2026-07-01' } });
    expect(() => generateAggregateSql(fixtureCatalog, selection)).toThrow();
  });
});

describe('generateAggregateSql — 지표 가드', () => {
  it('metrics가 비어있으면 throw', () => {
    const selection = baseSelection({ metrics: [] });
    expect(() => generateAggregateSql(fixtureCatalog, selection)).toThrow();
  });
});

describe('generateAggregateSql — branch_type 차원', () => {
  it('branch_type 선택 시 CASE WHEN 병합 컬럼을 포함한다', () => {
    const selection = baseSelection({ dimensions: [{ kind: 'branch_type' }] });
    const sql = generateAggregateSql(fixtureCatalog, selection);

    expect(sql).toContain(
      "(SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'branch_type') AS branch_type",
    );
    expect(sql).toContain(
      "CASE WHEN branch_type IN ('원룸텔', '고시원') THEN '고시원·원룸텔' ELSE branch_type END AS branch_type_grouped",
    );
    expect(sql).toContain('GROUP BY branch_type_grouped');
  });
});

describe('generateAggregateSql — numeric 파라미터 추출', () => {
  it('numeric 타입 파라미터는 COALESCE + SAFE_CAST 패턴을 사용한다', () => {
    const selection = baseSelection({ dimensions: [{ kind: 'param', key: 'price_deposit_min' }] });
    const sql = generateAggregateSql(fixtureCatalog, selection);

    expect(sql).toContain(
      "(SELECT COALESCE(value.int_value, SAFE_CAST(value.double_value AS INT64)) FROM UNNEST(event_params) WHERE key = 'price_deposit_min') AS price_deposit_min",
    );
  });

  it('int 타입 파라미터도 동일한 COALESCE + SAFE_CAST 패턴을 사용한다', () => {
    const selection = baseSelection({ dimensions: [{ kind: 'param', key: 'review_count' }] });
    const sql = generateAggregateSql(fixtureCatalog, selection);

    expect(sql).toContain(
      "(SELECT COALESCE(value.int_value, SAFE_CAST(value.double_value AS INT64)) FROM UNNEST(event_params) WHERE key = 'review_count') AS review_count",
    );
  });
});

describe('generateAggregateSql — SELECT * 금지 / 주석 서식', () => {
  it('SELECT * 를 포함하지 않는다', () => {
    const selection = baseSelection({ dimensions: [{ kind: 'event_name' }] });
    const sql = generateAggregateSql(fixtureCatalog, selection);
    expect(sql).not.toContain('SELECT *');
  });

  it('-- 스타일 라인 주석을 사용하지 않고, 섹션 헤더는 /* ===== Title ===== */ 형식이다', () => {
    const selection = baseSelection({ dimensions: [{ kind: 'event_name' }] });
    const sql = generateAggregateSql(fixtureCatalog, selection);
    expect(sql).not.toMatch(/^--/m);
    expect(sql).toContain('/* ===== Assumptions ===== */');
    expect(sql).toContain('/* ===== base ===== */');
    expect(sql).toContain('/* ===== Aggregate ===== */');

    // 모든 주석 라인은 블록 주석(/* ... */)이어야 한다
    const commentLines = sql.split('\n').filter((line) => line.trim().startsWith('/*'));
    for (const line of commentLines) {
      expect(line.trim()).toMatch(/^\/\*.+\*\/$/);
    }
  });
});

describe('generateAggregateSql — 지표', () => {
  it('고유세션수 선택 시 ga_session_id를 추출하고 CONCAT 표현식을 사용한다', () => {
    const selection = baseSelection({
      dimensions: [{ kind: 'event_name' }],
      metrics: ['unique_sessions'],
    });
    const sql = generateAggregateSql(fixtureCatalog, selection);

    expect(sql).toContain(
      "(SELECT COALESCE(value.int_value, SAFE_CAST(value.double_value AS INT64)) FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS ga_session_id",
    );
    expect(sql).toContain(
      'COUNT(DISTINCT CONCAT(user_pseudo_id, CAST(ga_session_id AS STRING))) AS unique_sessions',
    );
  });
});

describe('generateAggregateSql — 유입소스 차원', () => {
  it('traffic_source.source/medium/campaign 필드를 매핑한다', () => {
    const selection = baseSelection({
      dimensions: [
        { kind: 'traffic_source', field: 'source' },
        { kind: 'traffic_source', field: 'medium' },
        { kind: 'traffic_source', field: 'campaign' },
      ],
    });
    const sql = generateAggregateSql(fixtureCatalog, selection);

    expect(sql).toContain('GROUP BY traffic_source_source, traffic_source_medium, traffic_source_campaign');
  });
});

describe('generateAggregateSql — 필터 연산자', () => {
  it('= 연산자: 문자열 값은 따옴표로 감싼다', () => {
    const selection = baseSelection({ filters: [{ field: 'event_name', operator: '=', value: 'branch_view' }] });
    const sql = generateAggregateSql(fixtureCatalog, selection);
    expect(sql).toContain("WHERE event_name = 'branch_view'");
  });

  it('!= 연산자', () => {
    const selection = baseSelection({ filters: [{ field: 'event_name', operator: '!=', value: 'branch_view' }] });
    const sql = generateAggregateSql(fixtureCatalog, selection);
    expect(sql).toContain("WHERE event_name != 'branch_view'");
  });

  it('IN 연산자: 여러 값을 콤마로 나열한다', () => {
    const selection = baseSelection({
      filters: [{ field: 'branch_type', operator: 'IN', value: ['원룸텔', '오피스텔'] }],
    });
    const sql = generateAggregateSql(fixtureCatalog, selection);
    expect(sql).toContain("WHERE branch_type IN ('원룸텔', '오피스텔')");
  });

  it('CONTAINS 연산자: LIKE %x% 로 변환한다', () => {
    const selection = baseSelection({ filters: [{ field: 'page_path', operator: 'CONTAINS', value: 'branch' }] });
    const sql = generateAggregateSql(fixtureCatalog, selection);
    expect(sql).toContain("WHERE page_path LIKE '%branch%'");
  });

  it('numeric 타입 필터는 값에 따옴표를 붙이지 않는다', () => {
    const selection = baseSelection({
      filters: [{ field: 'price_deposit_min', operator: '=', value: 50000000 }],
    });
    const sql = generateAggregateSql(fixtureCatalog, selection);
    expect(sql).toContain('WHERE price_deposit_min = 50000000');
  });

  it('필터 2개는 AND로 연결된다', () => {
    const selection = baseSelection({
      filters: [
        { field: 'event_name', operator: '=', value: 'branch_view' },
        { field: 'price_deposit_min', operator: '!=', value: 0 },
      ],
    });
    const sql = generateAggregateSql(fixtureCatalog, selection);
    expect(sql).toContain("WHERE event_name = 'branch_view'\n  AND price_deposit_min != 0");
  });

  it("싱글쿼트가 포함된 값은 이스케이프한다 (O'Brien → O''Brien)", () => {
    const selection = baseSelection({ filters: [{ field: 'page_path', operator: '=', value: "O'Brien" }] });
    const sql = generateAggregateSql(fixtureCatalog, selection);
    expect(sql).toContain("WHERE page_path = 'O''Brien'");
  });

  it('event_date 필터는 = 연산자에서 싱글쿼트로 감싼 날짜 문자열로 변환된다', () => {
    const selection = baseSelection({ filters: [{ field: 'event_date', operator: '=', value: '2026-06-25' }] });
    const sql = generateAggregateSql(fixtureCatalog, selection);
    expect(sql).toContain("WHERE event_date = '2026-06-25'");
  });
});

describe('generateAggregateSql — 프로퍼티/테이블 참조', () => {
  it('propertyKey에 따라 프로젝트.데이터셋을 정확히 참조한다 (uceo)', () => {
    const selection = baseSelection({ propertyKey: 'uceo', events: ['page_view'] });
    const sql = generateAggregateSql(fixtureCatalog, selection);
    expect(sql).toContain('FROM `test-project.analytics_222.events_*`');
  });

  it('이벤트를 선택하지 않으면 event_name IN 조건을 생략한다', () => {
    const selection = baseSelection({ events: [] });
    const sql = generateAggregateSql(fixtureCatalog, selection);
    expect(sql).not.toContain('event_name IN');
    expect(sql).toContain('/* 이벤트: 전체 */');
  });
});

describe('generateAggregateSql — 알 수 없는 파라미터', () => {
  it('카탈로그에 없는 파라미터 키를 차원으로 선택하면 throw', () => {
    const selection = baseSelection({ dimensions: [{ kind: 'param', key: 'not_exist_key' }] });
    expect(() => generateAggregateSql(fixtureCatalog, selection)).toThrow();
  });
});

function baseWideSelection(overrides: Partial<WideSelection> = {}): WideSelection {
  return {
    propertyKey: 'gobang',
    dateRange: { start: '2026-06-25', end: '2026-07-01' },
    events: ['branch_view'],
    columns: [],
    filters: [],
    limit: 1000,
    ...overrides,
  };
}

describe('generateWideSql — 수용 기준 스냅샷 (실제 catalog.json)', () => {
  it('고방/최근7일/inquiry/컬럼=inquiry_method/LIMIT 1000', () => {
    const selection: WideSelection = {
      propertyKey: 'gobang',
      dateRange: { start: '2026-06-25', end: '2026-07-01' },
      events: ['inquiry'],
      columns: ['inquiry_method'],
      filters: [],
      limit: 1000,
    };

    const sql = generateWideSql(catalog, selection);

    expect(sql).toBe(`/* ===== Assumptions ===== */
/* 모드: 상세(Wide) */
/* 기간: 2026-06-25 ~ 2026-07-01 */
/* 이벤트: inquiry */
/* 사람 조건: 없음 (판정 기간 = 조회 기간) */
/* 필터: 없음 */
/* LIMIT: 1000행 */
/* 실행 전 BQ 에디터에서 예상 스캔량을 확인하세요. */

/* ===== base ===== */
WITH base AS (
  SELECT
    PARSE_DATE('%Y%m%d', event_date) AS event_date,
    event_timestamp,
    TIMESTAMP_MICROS(event_timestamp) AS event_time,
    event_name,
    user_pseudo_id,
    user_id,
    traffic_source.source AS traffic_source_source,
    traffic_source.medium AS traffic_source_medium,
    traffic_source.name AS traffic_source_campaign,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'inquiry_method') AS inquiry_method
  FROM \`gobang-bigquery.analytics_274122040.events_*\`
  WHERE _TABLE_SUFFIX BETWEEN '20260625' AND '20260701'
    AND event_name IN ('inquiry')
)

/* ===== Wide ===== */
SELECT
  event_date,
  event_time,
  event_name,
  user_pseudo_id,
  user_id,
  traffic_source_source,
  traffic_source_medium,
  traffic_source_campaign,
  inquiry_method
FROM base
LIMIT 1000`);
  });
});

describe('generateWideSql — 기간 가드', () => {
  it('dateRange가 null이면 throw', () => {
    const selection = baseWideSelection({ dateRange: null });
    expect(() => generateWideSql(fixtureCatalog, selection)).toThrow();
  });

  it('start/end가 빈 문자열이면 throw', () => {
    const selection = baseWideSelection({ dateRange: { start: '', end: '2026-07-01' } });
    expect(() => generateWideSql(fixtureCatalog, selection)).toThrow();
  });
});

describe('generateWideSql — GROUP BY 없음 / SELECT * 금지', () => {
  it('GROUP BY, 집계함수를 포함하지 않는다', () => {
    const selection = baseWideSelection({ columns: ['price_deposit_min'] });
    const sql = generateWideSql(fixtureCatalog, selection);
    expect(sql).not.toContain('GROUP BY');
    expect(sql).not.toContain('COUNT(');
    expect(sql).not.toContain('SELECT *');
  });

  it('기본 컬럼(event_date~traffic_source_campaign)을 항상 포함한다', () => {
    const selection = baseWideSelection();
    const sql = generateWideSql(fixtureCatalog, selection);
    expect(sql).toContain(
      [
        'SELECT',
        '  event_date,',
        '  event_time,',
        '  event_name,',
        '  user_pseudo_id,',
        '  user_id,',
        '  traffic_source_source,',
        '  traffic_source_medium,',
        '  traffic_source_campaign',
        'FROM base',
      ].join('\n'),
    );
  });
});

describe('generateWideSql — LIMIT', () => {
  it('limit이 숫자면 LIMIT n을 마지막 줄에 붙인다', () => {
    const selection = baseWideSelection({ limit: 500 });
    const sql = generateWideSql(fixtureCatalog, selection);
    expect(sql.trim().endsWith('LIMIT 500')).toBe(true);
  });

  it('limit이 null이면 LIMIT 절을 생략하고 Assumptions에 해제 사실을 남긴다', () => {
    const selection = baseWideSelection({ limit: null });
    const sql = generateWideSql(fixtureCatalog, selection);
    expect(sql.trim().endsWith('FROM base')).toBe(true);
    expect(sql).not.toMatch(/\nLIMIT \d+/);
    expect(sql).toContain('/* LIMIT: 해제됨 — 전체 반환, 대량 스캔 주의 */');
  });
});

describe('generateWideSql — event_params 컬럼', () => {
  it('numeric 타입 컬럼은 COALESCE + SAFE_CAST 패턴을 사용한다', () => {
    const selection = baseWideSelection({ columns: ['price_deposit_min'] });
    const sql = generateWideSql(fixtureCatalog, selection);
    expect(sql).toContain(
      "(SELECT COALESCE(value.int_value, SAFE_CAST(value.double_value AS INT64)) FROM UNNEST(event_params) WHERE key = 'price_deposit_min') AS price_deposit_min",
    );
    expect(sql).toContain('  price_deposit_min\nFROM base');
  });

  it('선택한 컬럼 순서를 그대로 보존한다', () => {
    const selection = baseWideSelection({ columns: ['review_count', 'branch_type'] });
    const sql = generateWideSql(fixtureCatalog, selection);
    expect(sql).toContain('  review_count,\n  branch_type\nFROM base');
  });

  it('컬럼을 선택하지 않으면 기본 컬럼만 뽑는다', () => {
    const selection = baseWideSelection({ columns: [] });
    const sql = generateWideSql(fixtureCatalog, selection);
    expect(sql).toContain('  traffic_source_campaign\nFROM base');
  });
});

describe('generateWideSql — 필터', () => {
  it('필터 조건은 집계 모드와 동일한 WHERE 절을 생성한다', () => {
    const selection = baseWideSelection({
      filters: [{ field: 'page_path', operator: 'CONTAINS', value: 'branch' }],
    });
    const sql = generateWideSql(fixtureCatalog, selection);
    expect(sql).toContain("WHERE page_path LIKE '%branch%'");
  });

  it('필터 필드가 columns에 없어도 base CTE에서 자동으로 UNNEST 추출한다', () => {
    const selection = baseWideSelection({
      columns: [],
      filters: [{ field: 'price_deposit_min', operator: '=', value: 50000000 }],
    });
    const sql = generateWideSql(fixtureCatalog, selection);
    expect(sql).toContain(
      "(SELECT COALESCE(value.int_value, SAFE_CAST(value.double_value AS INT64)) FROM UNNEST(event_params) WHERE key = 'price_deposit_min') AS price_deposit_min",
    );
    expect(sql).toContain('WHERE price_deposit_min = 50000000');
  });
});

describe('generateWideSql — 프로퍼티/테이블 참조', () => {
  it('propertyKey에 따라 프로젝트.데이터셋을 정확히 참조한다 (uceo)', () => {
    const selection = baseWideSelection({ propertyKey: 'uceo', events: ['page_view'] });
    const sql = generateWideSql(fixtureCatalog, selection);
    expect(sql).toContain('FROM `test-project.analytics_222.events_*`');
  });

  it('이벤트를 선택하지 않으면 event_name IN 조건을 생략한다', () => {
    const selection = baseWideSelection({ events: [] });
    const sql = generateWideSql(fixtureCatalog, selection);
    expect(sql).not.toContain('event_name IN');
    expect(sql).toContain('/* 이벤트: 전체 */');
  });
});

describe('generateWideSql — 알 수 없는 파라미터', () => {
  it('카탈로그에 없는 파라미터 키를 컬럼으로 선택하면 throw', () => {
    const selection = baseWideSelection({ columns: ['not_exist_key'] });
    expect(() => generateWideSql(fixtureCatalog, selection)).toThrow();
  });
});

// ===== v2: 사람 조건(세그먼트) =====

describe('generateAggregateSql — 사람 조건(세그먼트)', () => {
  it('세그먼트가 없으면 seg_users CTE도 재필터도 없다(회귀)', () => {
    const sql = generateAggregateSql(fixtureCatalog, baseSelection({ segments: [] }));
    expect(sql).not.toContain('seg_users');
    expect(sql).not.toContain('SELECT user_pseudo_id FROM seg_users');
    expect(sql).toContain('/* 사람 조건: 없음 (판정 기간 = 조회 기간) */');
  });

  it('did=true 조건은 COUNTIF(...) > 0 HAVING을 만든다', () => {
    const sql = generateAggregateSql(
      fixtureCatalog,
      baseSelection({ segments: [{ event: 'zzim_memo_place', did: true }] }),
    );
    expect(sql).toContain('seg_users AS (');
    expect(sql).toContain("HAVING COUNTIF(event_name = 'zzim_memo_place') > 0");
    expect(sql).toContain('user_pseudo_id IN (SELECT user_pseudo_id FROM seg_users)');
  });

  it('did=false 조건은 COUNTIF(...) = 0 HAVING을 만든다', () => {
    const sql = generateAggregateSql(
      fixtureCatalog,
      baseSelection({ segments: [{ event: 'read_complete_notices', did: false }] }),
    );
    expect(sql).toContain("HAVING COUNTIF(event_name = 'read_complete_notices') = 0");
  });

  it('혼합 조건(했다+안했다)은 AND로 결합되고 base가 대상+조건 이벤트를 함께 스캔한다', () => {
    const sql = generateAggregateSql(
      fixtureCatalog,
      baseSelection({
        events: ['branch_view'],
        segments: [
          { event: 'zzim_memo_place', did: true },
          { event: 'read_complete_notices', did: false },
        ],
      }),
    );
    // base는 대상(branch_view) + 세그먼트 이벤트를 모두 스캔
    expect(sql).toContain("event_name IN ('branch_view', 'zzim_memo_place', 'read_complete_notices')");
    // HAVING 두 줄 AND 결합
    expect(sql).toContain("HAVING COUNTIF(event_name = 'zzim_memo_place') > 0");
    expect(sql).toContain("AND COUNTIF(event_name = 'read_complete_notices') = 0");
    // 외부 SELECT는 집계 대상만 다시 필터
    expect(sql).toContain("WHERE event_name IN ('branch_view')");
    expect(sql).toContain('AND user_pseudo_id IN (SELECT user_pseudo_id FROM seg_users)');
  });
});

describe('generateWideSql — 사람 조건(세그먼트)', () => {
  it('세그먼트가 있으면 seg_users CTE와 재필터를 만든다', () => {
    const sql = generateWideSql(
      fixtureCatalog,
      baseWideSelection({ segments: [{ event: 'branch_view', did: true }] }),
    );
    expect(sql).toContain('seg_users AS (');
    expect(sql).toContain('user_pseudo_id IN (SELECT user_pseudo_id FROM seg_users)');
  });
});

// 비율 지표용 fixture — 두 이벤트(클릭/조회) + 공유 파라미터(ad_banner_type)
const ratioCatalog: Catalog = {
  projectId: 'test-project',
  generatedAt: '2026-01-01T00:00:00.000Z',
  properties: {
    gobang: {
      datasetId: 'analytics_111',
      label: '고방',
      events: [
        {
          name: 'ad_banner_view',
          label: '배너 조회',
          cnt: 100,
          params: [{ key: 'ad_banner_type', type: 'string', cnt: 100 }],
        },
        {
          name: 'ad_banner_click',
          label: '배너 클릭',
          cnt: 30,
          params: [{ key: 'ad_banner_type', type: 'string', cnt: 30 }],
        },
      ],
    },
    uceo: { datasetId: 'analytics_222', label: 'U사장님', events: [] },
  },
};

function ratioSelection(overrides: Partial<AggregateSelection> = {}): AggregateSelection {
  return {
    propertyKey: 'gobang',
    dateRange: { start: '2026-06-25', end: '2026-07-01' },
    events: ['ad_banner_view', 'ad_banner_click'],
    dimensions: [],
    metrics: [],
    filters: [],
    ratio: {
      numeratorEvent: 'ad_banner_click',
      denominatorEvent: 'ad_banner_view',
      format: 'percent',
      decimals: 2,
    },
    ...overrides,
  };
}

describe('generateAggregateSql — 비율 지표', () => {
  it('퍼센트 비율: SAFE_DIVIDE * 100 + ROUND(자리수) + 분자/분모 건수', () => {
    const sql = generateAggregateSql(ratioCatalog, ratioSelection());
    expect(sql).toContain("COUNTIF(event_name = 'ad_banner_click') AS numerator_count");
    expect(sql).toContain("COUNTIF(event_name = 'ad_banner_view') AS denominator_count");
    expect(sql).toContain(
      "ROUND(SAFE_DIVIDE(COUNTIF(event_name = 'ad_banner_click'), COUNTIF(event_name = 'ad_banner_view')) * 100, 2) AS ratio_pct",
    );
    expect(sql).toContain('/* 비율: ad_banner_click ÷ ad_banner_view (%, 소수점 2자리) */');
  });

  it('소수 비율: * 100 없이 ROUND(SAFE_DIVIDE, 자리수) AS ratio', () => {
    const sql = generateAggregateSql(
      ratioCatalog,
      ratioSelection({ ratio: { numeratorEvent: 'ad_banner_click', denominatorEvent: 'ad_banner_view', format: 'decimal', decimals: 3 } }),
    );
    expect(sql).toContain(
      "ROUND(SAFE_DIVIDE(COUNTIF(event_name = 'ad_banner_click'), COUNTIF(event_name = 'ad_banner_view')), 3) AS ratio",
    );
    expect(sql).not.toContain('* 100');
  });

  it('metrics가 비어도 비율만으로 생성된다', () => {
    const sql = generateAggregateSql(ratioCatalog, ratioSelection());
    expect(sql).toContain('/* ===== Aggregate ===== */');
    expect(sql).not.toContain('COUNT(*) AS event_count');
  });

  it('공유 차원과 함께 GROUP BY 된다 (CTR by ad_banner_type)', () => {
    const sql = generateAggregateSql(
      ratioCatalog,
      ratioSelection({ dimensions: [{ kind: 'param', key: 'ad_banner_type' }] }),
    );
    expect(sql).toContain(
      "(SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'ad_banner_type') AS ad_banner_type",
    );
    expect(sql).toContain('GROUP BY ad_banner_type');
    expect(sql).toContain("event_name IN ('ad_banner_view', 'ad_banner_click')");
  });

  it('소수점 자리수는 0~4로 클램프된다', () => {
    const sql = generateAggregateSql(
      ratioCatalog,
      ratioSelection({ ratio: { numeratorEvent: 'ad_banner_click', denominatorEvent: 'ad_banner_view', format: 'percent', decimals: 9 } }),
    );
    expect(sql).toContain('* 100, 4) AS ratio_pct');
  });

  it('분자/분모가 없으면 비율은 무시되고, metrics도 없으면 에러', () => {
    expect(() =>
      generateAggregateSql(
        ratioCatalog,
        ratioSelection({ metrics: [], ratio: { numeratorEvent: '', denominatorEvent: '', format: 'percent', decimals: 2 } }),
      ),
    ).toThrow('지표를 1개 이상');
  });

  it('metrics와 비율이 함께 있으면 둘 다 출력', () => {
    const sql = generateAggregateSql(ratioCatalog, ratioSelection({ metrics: ['event_count'] }));
    expect(sql).toContain('COUNT(*) AS event_count');
    expect(sql).toContain('AS ratio_pct');
  });
});
