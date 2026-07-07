import { describe, it, expect, beforeEach } from 'vitest';
import type { CatalogProperty } from '../data/catalog-types';
import {
  filterEvents,
  funnelKey,
  renderEventDetailHtml,
  renderEventListHtml,
} from './events-list';
import { state } from '../state';

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

// 이벤트 사전(dict)은 열람 전용 — 선택을 바꾸는 요소(일괄 버튼·추가 버튼)가 없어야 한다.
// 이벤트 고르기(pick)에만 그 요소들이 있다.
describe('renderEventListHtml — 모달 모드', () => {
  beforeEach(() => {
    state.property = 'gobang';
    state.searchQuery = '';
    state.selectedEvents.gobang = new Set();
  });

  it('pick 모드는 퍼널 그룹 일괄 버튼을 렌더한다', () => {
    const html = renderEventListHtml(property, 'pick');
    expect(html).toContain('data-bulk-scope="group"');
  });

  it('dict 모드는 일괄 버튼을 렌더하지 않는다', () => {
    const html = renderEventListHtml(property, 'dict');
    expect(html).not.toContain('data-bulk-scope');
  });

  it('dict 모드도 검색 일괄 바는 렌더하지 않는다', () => {
    state.searchQuery = 'ad_banner';
    const html = renderEventListHtml(property, 'dict');
    expect(html).not.toContain('event-bulk-btn');
  });

  it('dict 모드에서도 선택된 이벤트는 행에 체크가 읽기전용으로 남는다', () => {
    state.selectedEvents.gobang = new Set(['ad_banner_view']);
    const html = renderEventListHtml(property, 'dict');
    expect(html).toContain('data-event="ad_banner_view"');
    expect(html).toContain('is-selected');
  });
});

describe('renderEventDetailHtml — 모달 모드', () => {
  beforeEach(() => {
    state.property = 'gobang';
    state.selectedEvents.gobang = new Set();
  });

  it('pick 모드는 선택 토글 버튼을 렌더한다', () => {
    const html = renderEventDetailHtml(property, 'ad_banner_view', 'pick');
    expect(html).toContain('event-detail-toggle');
  });

  it('dict 모드는 선택 토글 버튼을 렌더하지 않는다', () => {
    const html = renderEventDetailHtml(property, 'ad_banner_view', 'dict');
    expect(html).not.toContain('event-detail-toggle');
  });

  it('dict 모드에서 이미 담긴 이벤트는 읽기전용 표시만 둔다', () => {
    state.selectedEvents.gobang = new Set(['ad_banner_view']);
    const html = renderEventDetailHtml(property, 'ad_banner_view', 'dict');
    expect(html).toContain('event-detail-selected-note');
    expect(html).not.toContain('event-detail-toggle');
  });
});
