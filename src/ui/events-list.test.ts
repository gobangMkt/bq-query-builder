import { describe, it, expect } from 'vitest';
import type { CatalogProperty } from '../data/catalog-types';
import { filterEvents, funnelKey } from './events-list';

function ev(name: string, label: string, funnel?: string) {
  return { name, label, funnel, cnt: 0, params: [] };
}

const property = {
  label: '고방',
  datasetId: 'analytics_x',
  events: [
    ev('ad_banner_view', '배너 노출', '8. 광고'),
    ev('ad_banner_click', '배너 클릭', '8. 광고'),
    ev('ad_impression', '광고 노출', '8. 광고'),
    ev('page_view', '페이지 조회', '0. 일반'),
    ev('session_start', '세션 시작'),
  ],
} as unknown as CatalogProperty;

describe('filterEvents', () => {
  it('빈 검색어는 전체를 반환', () => {
    expect(filterEvents(property, '').map((e) => e.name)).toHaveLength(5);
  });

  it('이름 부분일치로 키워드 포함 이벤트만 반환(ad_banner)', () => {
    expect(filterEvents(property, 'ad_banner').map((e) => e.name)).toEqual([
      'ad_banner_view',
      'ad_banner_click',
    ]);
  });

  it('라벨로도 매칭되고 대소문자 무시', () => {
    expect(filterEvents(property, 'AD_BANNER')).toHaveLength(2);
    expect(filterEvents(property, '배너').map((e) => e.name)).toEqual([
      'ad_banner_view',
      'ad_banner_click',
    ]);
  });

  it('공백은 트림한다', () => {
    expect(filterEvents(property, '  ad_impression  ').map((e) => e.name)).toEqual([
      'ad_impression',
    ]);
  });
});

describe('funnelKey', () => {
  it('funnel이 있으면 그대로, 없으면 기타', () => {
    expect(funnelKey(ev('ad_banner_view', 'x', '8. 광고'))).toBe('8. 광고');
    expect(funnelKey(ev('session_start', 'x'))).toBe('기타');
  });
});
