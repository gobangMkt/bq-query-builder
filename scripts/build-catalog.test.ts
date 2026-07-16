import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCatalog,
  buildMartPropertyEvents,
  determineType,
  parseInventory,
  parseMartInventory,
} from './build-catalog.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const dataDir = path.join(ROOT, 'data');

const gobangInventoryRaw = readFileSync(path.join(dataDir, 'inventory-gobang-20260702.json'), 'utf-8');
const uceoInventoryRaw = readFileSync(path.join(dataDir, 'inventory-uceo-20260702.json'), 'utf-8');
const gobangTaxonomy = JSON.parse(readFileSync(path.join(dataDir, 'taxonomy-gobang.json'), 'utf-8'));
const uceoTaxonomy = JSON.parse(readFileSync(path.join(dataDir, 'taxonomy-uceo.json'), 'utf-8'));
const martSchema = JSON.parse(
  readFileSync(path.join(dataDir, 'mart-schema-gobang-events.json'), 'utf-8'),
);
const martInventoryRaw = readFileSync(
  path.join(dataDir, 'inventory-mart-gobang-20260716.json'),
  'utf-8',
);

describe('parseInventory', () => {
  it('JSON 배열 형식을 파싱하고 숫자 필드를 Number로 변환한다', () => {
    const raw = JSON.stringify([
      { event_name: 'foo', param_key: 'bar', cnt: '10', string_cnt: '10', int_cnt: '0', double_cnt: '0' },
    ]);
    const rows = parseInventory(raw);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      event_name: 'foo',
      param_key: 'bar',
      cnt: 10,
      string_cnt: 10,
      int_cnt: 0,
      double_cnt: 0,
    });
  });

  it('NDJSON(줄 단위 JSON) 형식도 파싱한다', () => {
    const raw = [
      '{"event_name":"foo","param_key":"bar","cnt":"5","string_cnt":"0","int_cnt":"5","double_cnt":"0"}',
      '{"event_name":"foo","param_key":"baz","cnt":"5","string_cnt":"5","int_cnt":"0","double_cnt":"0"}',
    ].join('\n');
    const rows = parseInventory(raw);
    expect(rows).toHaveLength(2);
    expect(rows[0].cnt).toBe(5);
    expect(rows[1].param_key).toBe('baz');
  });
});

describe('determineType', () => {
  it('string_cnt가 최다면 string', () => {
    expect(determineType({ string_cnt: 35, int_cnt: 0, double_cnt: 0 })).toBe('string');
  });

  it('int_cnt가 최다이고 double_cnt=0이면 int', () => {
    expect(determineType({ string_cnt: 0, int_cnt: 18659, double_cnt: 0 })).toBe('int');
  });

  it('int_cnt와 double_cnt가 모두 유의미하면 numeric (혼재)', () => {
    expect(determineType({ string_cnt: 0, int_cnt: 1288844, double_cnt: 2356 })).toBe('numeric');
  });

  it('double_cnt만 유의미하면 numeric', () => {
    expect(determineType({ string_cnt: 0, int_cnt: 0, double_cnt: 100 })).toBe('numeric');
  });

  it('string_cnt가 더 크면 int/double과 관계없이 string', () => {
    expect(determineType({ string_cnt: 100, int_cnt: 1, double_cnt: 1 })).toBe('string');
  });

  it('int_cnt + double_cnt가 더 크고 모두 유의미하면 numeric', () => {
    expect(determineType({ string_cnt: 1, int_cnt: 50, double_cnt: 50 })).toBe('numeric');
  });
});

describe('buildCatalog — 실측 데이터 병합', () => {
  const catalog = buildCatalog({
    gobangInventoryRaw,
    uceoInventoryRaw,
    gobangTaxonomy,
    uceoTaxonomy,
    martColumns: martSchema.columns,
    martInventoryRaw,
  });

  it('프로퍼티 메타(datasetId/label)가 정확하다', () => {
    expect(catalog.projectId).toBe('gobang-bigquery');
    expect(catalog.properties.gobang.datasetId).toBe('analytics_274122040');
    expect(catalog.properties.gobang.label).toBe('고방 원본');
    expect(catalog.properties.uceo.datasetId).toBe('analytics_279311003');
    expect(catalog.properties.uceo.label).toBe('U사장님');
    expect(catalog.properties.gobang_mart.datasetId).toBe('gobang_mart');
    expect(catalog.properties.gobang_mart.label).toBe('고방 마트');
    expect(catalog.properties.gobang_mart.tableId).toBe('Gobang_events');
  });

  it('UI 그룹 메타: 고방 원본·마트는 group "고방"으로 묶이고 variant가, U사장님은 variant 없이 단독이다', () => {
    expect(catalog.properties.gobang.group).toBe('고방');
    expect(catalog.properties.gobang.variant).toBe('원본');
    expect(catalog.properties.gobang_mart.group).toBe('고방');
    expect(catalog.properties.gobang_mart.variant).toBe('마트');
    expect(catalog.properties.uceo.group).toBe('U사장님');
    expect(catalog.properties.uceo.variant).toBeUndefined();
  });

  it('고방 31개, U사장님 13개 이벤트가 정확히 포함된다 (인벤토리 밖 이벤트 없음)', () => {
    expect(catalog.properties.gobang.events).toHaveLength(31);
    expect(catalog.properties.uceo.events).toHaveLength(13);

    const gobangInventoryEventNames = new Set(
      JSON.parse(gobangInventoryRaw).map((r: { event_name: string }) => r.event_name),
    );
    const uceoInventoryEventNames = new Set(
      JSON.parse(uceoInventoryRaw).map((r: { event_name: string }) => r.event_name),
    );

    for (const event of catalog.properties.gobang.events) {
      expect(gobangInventoryEventNames.has(event.name)).toBe(true);
    }
    for (const event of catalog.properties.uceo.events) {
      expect(uceoInventoryEventNames.has(event.name)).toBe(true);
    }
  });

  it('inquiry에 텍소노미 label "문의"가 병합된다', () => {
    const inquiry = catalog.properties.gobang.events.find((e) => e.name === 'inquiry');
    expect(inquiry).toBeDefined();
    expect(inquiry?.label).toBe('문의');
  });

  it('inquiry_method 파라미터에 텍소노미 설명이 병합된다', () => {
    const inquiry = catalog.properties.gobang.events.find((e) => e.name === 'inquiry');
    const inquiryMethod = inquiry?.params.find((p) => p.key === 'inquiry_method');
    expect(inquiryMethod).toBeDefined();
    expect(inquiryMethod?.description).toBe('문의 수단 (전화, 문자, 카톡)');
  });

  it('텍소노미에 없는 이벤트는 label이 event name으로 폴백된다', () => {
    const noTaxoEvent = catalog.properties.gobang.events.find((e) => e.name === 'youth_notices_guide');
    expect(noTaxoEvent).toBeDefined();
    expect(noTaxoEvent?.label).toBe('youth_notices_guide');
    expect(noTaxoEvent?.description).toBeUndefined();
    expect(noTaxoEvent?.funnel).toBeUndefined();
  });

  it('타입 판정: percent_scrolled=int, page_title=string, price_month_max(고방)=numeric', () => {
    const scroll = catalog.properties.uceo.events.find((e) => e.name === 'scroll');
    const percentScrolled = scroll?.params.find((p) => p.key === 'percent_scrolled');
    expect(percentScrolled?.type).toBe('int');

    const adBannerClick = catalog.properties.gobang.events.find((e) => e.name === 'ad_banner_click');
    const pageTitle = adBannerClick?.params.find((p) => p.key === 'page_title');
    expect(pageTitle?.type).toBe('string');

    const branchView = catalog.properties.gobang.events.find((e) => e.name === 'branch_view');
    const priceMonthMax = branchView?.params.find((p) => p.key === 'price_month_max');
    expect(priceMonthMax?.type).toBe('numeric');
  });

  it('모든 cnt 필드는 number 타입이다 (문자열 아님)', () => {
    for (const event of catalog.properties.gobang.events) {
      expect(typeof event.cnt).toBe('number');
      for (const param of event.params) {
        expect(typeof param.cnt).toBe('number');
      }
    }
  });

  it('이벤트/파라미터가 발생량 내림차순으로 정렬된다', () => {
    const events = catalog.properties.gobang.events;
    for (let i = 1; i < events.length; i++) {
      expect(events[i - 1].cnt).toBeGreaterThanOrEqual(events[i].cnt);
    }
  });

  it('고방 마트는 실측 인벤토리의 이벤트 목록(33개)을 쓰며 원본과 다르다', () => {
    const martEvents = catalog.properties.gobang_mart.events;
    const rawEvents = catalog.properties.gobang.events;
    const inventoryNames = new Set(
      parseMartInventory(martInventoryRaw).map((r: { event_name: string }) => r.event_name),
    );
    expect(martEvents).toHaveLength(inventoryNames.size);
    // 마트에만 있는 파생 이벤트가 존재 → 원본과 목록이 다르다.
    expect(martEvents.map((e) => e.name)).not.toEqual(rawEvents.map((e) => e.name));
    expect(martEvents.some((e) => e.name === 'churn_branchview_7d')).toBe(true);
    for (const event of martEvents) {
      expect(inventoryNames.has(event.name)).toBe(true);
    }
  });

  it('고방 마트 건수는 실측값(원본 복사 아님)이다', () => {
    const pageView = catalog.properties.gobang_mart.events.find((e) => e.name === 'page_view');
    // 인벤토리의 실제 event_cnt(2천만대) — 원본 page_view 건수와 다르다.
    expect(pageView?.cnt).toBe(26807602);
  });

  it('고방 마트 파라미터는 이벤트별로 실제 값이 있는 컬럼만 부여된다', () => {
    const events = catalog.properties.gobang_mart.events;
    // 이벤트마다 param 개수가 다르다(전부 40 동일이 아님).
    const paramLens = new Set(events.map((e) => e.params.length));
    expect(paramLens.size).toBeGreaterThan(1);

    // page_view엔 지점 전용 컬럼(branch_id)이 없고, branch_view엔 있다.
    const pageView = events.find((e) => e.name === 'page_view');
    const branchView = events.find((e) => e.name === 'branch_view');
    expect(pageView?.params.some((p) => p.key === 'branch_id')).toBe(false);
    expect(branchView?.params.some((p) => p.key === 'branch_id')).toBe(true);

    // search엔 search_query가 있다.
    const search = events.find((e) => e.name === 'search');
    expect(search?.params.some((p) => p.key === 'search_query')).toBe(true);
  });

  it('고방 마트 param은 마트 스키마 컬럼만 쓰고 타입이 스키마대로다', () => {
    const schemaKeys = new Set(martSchema.columns.map((c: { key: string }) => c.key));
    const typeByKey = new Map(martSchema.columns.map((c: { key: string; type: string }) => [c.key, c.type]));
    for (const event of catalog.properties.gobang_mart.events) {
      for (const param of event.params) {
        expect(schemaKeys.has(param.key)).toBe(true);
        expect(param.type).toBe(typeByKey.get(param.key));
      }
    }
  });
});

describe('buildMartPropertyEvents', () => {
  const rawEvents = [
    { name: 'inquiry', label: '문의', cnt: 100, description: '문의 이벤트', funnel: '전환' },
    { name: 'page_view', label: 'page_view', cnt: 50 },
  ];
  const martColumns = [
    { key: 'branch_id', type: 'int', description: '지점 ID' },
    { key: 'branch_type', type: 'string' },
    { key: 'search_query', type: 'string' },
  ];
  // 실측 인벤토리(wide): 이벤트별 event_cnt + 컬럼별 non-null 개수.
  const inventory = [
    { event_name: 'branch_view', event_cnt: '3000', branch_id: '2900', branch_type: '2900', search_query: '0' },
    { event_name: 'inquiry', event_cnt: '500', branch_id: '480', branch_type: '480', search_query: '0' },
    { event_name: 'churn_7d', event_cnt: '200', branch_id: '0', branch_type: '0', search_query: '0' },
  ];

  it('원본 복사가 아니라 인벤토리의 event_name·건수를 쓴다', () => {
    const events = buildMartPropertyEvents(inventory, martColumns, rawEvents);
    expect(events.map((e) => e.name)).toEqual(['branch_view', 'inquiry', 'churn_7d']);
    expect(events.find((e) => e.name === 'branch_view')?.cnt).toBe(3000);
  });

  it('이벤트별로 non-null > 0 인 컬럼만 params로 부여한다', () => {
    const events = buildMartPropertyEvents(inventory, martColumns, rawEvents);
    const branchView = events.find((e) => e.name === 'branch_view');
    // search_query는 0 → 제외. branch_id/branch_type만.
    expect(branchView?.params.map((p) => p.key).sort()).toEqual(['branch_id', 'branch_type']);
    // 컬럼이 전부 0인 이벤트는 params 없음.
    const churn = events.find((e) => e.name === 'churn_7d');
    expect(churn?.params).toHaveLength(0);
  });

  it('이름이 겹치는 원본 이벤트의 label/description/funnel을 재사용하고, 없으면 이름 폴백', () => {
    const events = buildMartPropertyEvents(inventory, martColumns, rawEvents);
    const inquiry = events.find((e) => e.name === 'inquiry');
    expect(inquiry).toMatchObject({ label: '문의', description: '문의 이벤트', funnel: '전환' });
    const churn = events.find((e) => e.name === 'churn_7d');
    expect(churn?.label).toBe('churn_7d');
    expect(churn?.description).toBeUndefined();
  });

  it('타입·설명이 마트 컬럼 정의대로 매핑되고 param.cnt는 실측 non-null 개수다', () => {
    const events = buildMartPropertyEvents(inventory, martColumns, rawEvents);
    const branchId = events.find((e) => e.name === 'branch_view')?.params.find((p) => p.key === 'branch_id');
    expect(branchId?.type).toBe('int');
    expect(branchId?.description).toBe('지점 ID');
    expect(branchId?.cnt).toBe(2900);
  });
});
