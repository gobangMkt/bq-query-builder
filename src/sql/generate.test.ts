import { describe, expect, it } from 'vitest';
import { generateAggregateSql } from './generate';
import type { Catalog } from '../data/catalog-types';
import type { AggregateSelection } from './types';
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
