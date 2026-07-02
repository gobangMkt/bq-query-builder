import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog, determineType, parseInventory } from './build-catalog.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const dataDir = path.join(ROOT, 'data');

const gobangInventoryRaw = readFileSync(path.join(dataDir, 'inventory-gobang-20260702.json'), 'utf-8');
const uceoInventoryRaw = readFileSync(path.join(dataDir, 'inventory-uceo-20260702.json'), 'utf-8');
const gobangTaxonomy = JSON.parse(readFileSync(path.join(dataDir, 'taxonomy-gobang.json'), 'utf-8'));
const uceoTaxonomy = JSON.parse(readFileSync(path.join(dataDir, 'taxonomy-uceo.json'), 'utf-8'));

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
  const catalog = buildCatalog({ gobangInventoryRaw, uceoInventoryRaw, gobangTaxonomy, uceoTaxonomy });

  it('프로퍼티 메타(datasetId/label)가 정확하다', () => {
    expect(catalog.projectId).toBe('gobang-bigquery');
    expect(catalog.properties.gobang.datasetId).toBe('analytics_274122040');
    expect(catalog.properties.gobang.label).toBe('고방');
    expect(catalog.properties.uceo.datasetId).toBe('analytics_279311003');
    expect(catalog.properties.uceo.label).toBe('U사장님');
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
});
