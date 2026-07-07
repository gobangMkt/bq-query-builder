import type { CatalogEvent, CatalogParam, CatalogProperty } from '../data/catalog-types';
import { formatCount } from '../utils/format';
import { escapeHtml } from '../utils/html';
import { checkIcon, plusIcon, searchIcon } from './icons';
import { state } from '../state';

// 숫자 프리픽스 퍼널(0. 일반 ~ 8. 광고)을 앞에, GA4 자동/시스템 생성/기타를 뒤에 배치한다.
function funnelSortKey(funnel: string | undefined): [number, string] {
  if (!funnel) return [900, ''];
  const numbered = funnel.match(/^(\d+)\./);
  if (numbered) return [Number(numbered[1]), funnel];
  if (funnel === 'GA4 자동') return [800, funnel];
  if (funnel === '시스템 생성') return [850, funnel];
  return [890, funnel];
}

interface FunnelGroup {
  funnel: string;
  events: CatalogEvent[];
}

function groupByFunnel(events: CatalogEvent[]): FunnelGroup[] {
  const map = new Map<string, CatalogEvent[]>();
  for (const ev of events) {
    const key = funnelKey(ev);
    const list = map.get(key);
    if (list) list.push(ev);
    else map.set(key, [ev]);
  }
  return [...map.entries()]
    .sort(([, a], [, b]) => {
      const ka = funnelSortKey(a[0].funnel);
      const kb = funnelSortKey(b[0].funnel);
      return ka[0] - kb[0] || ka[1].localeCompare(kb[1]);
    })
    .map(([funnel, evs]) => ({ funnel, events: evs }));
}

function matchesQuery(ev: CatalogEvent, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return ev.name.toLowerCase().includes(q) || ev.label.toLowerCase().includes(q);
}

/** 검색어(이름/라벨 부분일치)로 이벤트를 거른다. 빈 검색어면 전체. 일괄 선택 대상 계산에 재사용. */
export function filterEvents(property: CatalogProperty, query: string): CatalogEvent[] {
  const q = query.trim();
  return property.events.filter((ev) => matchesQuery(ev, q));
}

/** 그룹핑 키 — 리스트 렌더와 일괄 선택이 같은 규칙을 쓰도록 한 곳에서 정의. */
export function funnelKey(ev: CatalogEvent): string {
  return ev.funnel ?? '기타';
}

// 사실상 모든 이벤트에 붙는 파라미터(전역/공통)를 판별한다. 이벤트 사전에서 '공통' 태그로 표시.
function globalParamKeys(property: CatalogProperty): Set<string> {
  const total = property.events.length;
  if (total === 0) return new Set();
  const count = new Map<string, number>();
  for (const ev of property.events) {
    for (const p of ev.params) count.set(p.key, (count.get(p.key) ?? 0) + 1);
  }
  const threshold = Math.ceil(total * 0.8);
  return new Set([...count.entries()].filter(([, c]) => c >= threshold).map(([k]) => k));
}

const TYPE_LABEL: Record<CatalogParam['type'], string> = {
  string: '문자',
  int: '정수',
  numeric: '숫자',
};

// 모달은 두 진입점이 공유한다. 'pick'=이벤트 고르기(선택 토글·일괄 버튼 O), 'dict'=이벤트 사전(열람 전용, 선택 요소 X).
export type EventModalMode = 'dict' | 'pick';

export function renderSearchHtml(): string {
  return `
    <span class="event-search-icon">${searchIcon}</span>
    <input type="search" class="event-search" placeholder="이벤트명 또는 라벨 검색"
      value="${escapeHtml(state.searchQuery)}" aria-label="이벤트 검색" />
  `;
}

export function renderEventListHtml(property: CatalogProperty, mode: EventModalMode = 'pick'): string {
  const query = state.searchQuery.trim();
  const filtered = property.events.filter((ev) => matchesQuery(ev, query));

  if (filtered.length === 0) {
    return `<p class="event-empty">검색 결과가 없습니다.</p>`;
  }

  // 사전 모드는 순수 열람 — 쿼리 선택 상태를 일절 비추지 않는다(체크·일괄바 없음).
  const showBulk = mode === 'pick';
  const selected = showBulk ? state.selectedEvents[state.property] : new Set<string>();

  // 검색 중이면 결과 전체를 한 번에 넣고 빼는 바를 리스트 맨 위에 둔다(이미 전부 선택돼 있으면 '빼기'로 토글).
  const searchBulk =
    showBulk && query
      ? bulkButtonHtml(
          'search',
          query,
          filtered,
          selected,
          (n) => `검색결과 ${n}개 모두`,
        )
      : '';

  const groupsHtml = groupByFunnel(filtered)
    .map(
      (group) => `
        <div class="event-group">
          <div class="event-group-head">
            <h3 class="event-group-title">${escapeHtml(group.funnel)}</h3>
            ${showBulk ? bulkButtonHtml('group', group.funnel, group.events, selected, () => '그룹') : ''}
          </div>
          <ul class="event-rows">
            ${group.events.map((ev) => eventRowHtml(ev, selected.has(ev.name))).join('')}
          </ul>
        </div>
      `,
    )
    .join('');

  return `${searchBulk}${groupsHtml}`;
}

// 일괄 추가/빼기 버튼 1개. 대상이 이미 전부 선택돼 있으면 '빼기', 아니면 '추가'로 렌더.
// scope=search면 클릭 시 현재 검색어로 다시 필터해 처리, group이면 key(=퍼널명)로 필터한다.
function bulkButtonHtml(
  scope: 'search' | 'group',
  key: string,
  events: CatalogEvent[],
  selected: Set<string>,
  label: (count: number) => string,
): string {
  const allSelected = events.length > 0 && events.every((ev) => selected.has(ev.name));
  const action = allSelected ? 'remove' : 'add';
  const cls = scope === 'search' ? 'event-bulk-btn' : 'event-group-bulk';
  const wrap = scope === 'search' ? 'event-bulk' : '';
  const text = allSelected ? `${label(events.length)} 빼기` : `${label(events.length)} 추가`;
  const icon = scope === 'search' ? (allSelected ? checkIcon : plusIcon) : '';
  const btn = `
    <button type="button" class="${cls}${allSelected ? ' is-selected' : ''}"
      data-bulk-scope="${scope}" data-bulk-key="${escapeHtml(key)}" data-bulk-action="${action}">
      ${icon}<span>${escapeHtml(text)}</span>
    </button>`;
  return wrap ? `<div class="${wrap}">${btn}</div>` : btn;
}

function eventRowHtml(ev: CatalogEvent, selected: boolean): string {
  return `
    <li class="event-item">
      <button type="button" class="event-row${selected ? ' is-selected' : ''}"
        data-event="${escapeHtml(ev.name)}" aria-pressed="${selected}">
        <span class="event-check" aria-hidden="true">${selected ? checkIcon : ''}</span>
        <span class="event-label">${escapeHtml(ev.label)}</span>
        <span class="event-name">${escapeHtml(ev.name)}</span>
        <span class="event-count">${formatCount(ev.cnt)}</span>
      </button>
    </li>
  `;
}

/** 모달 우측 상세 pane — 이벤트의 설명 + 추출 가능한 파라미터 표. name=null이면 빈 상태. */
export function renderEventDetailHtml(
  property: CatalogProperty,
  name: string | null,
  mode: EventModalMode = 'pick',
): string {
  if (!name) {
    return `<div class="event-detail-empty">
      <p>왼쪽에서 이벤트를 클릭하면<br />추출 가능한 파라미터와 설명이 여기에 표시됩니다.</p>
    </div>`;
  }
  const ev = property.events.find((e) => e.name === name);
  if (!ev) return '';

  const selected = state.selectedEvents[state.property].has(ev.name);
  const globals = globalParamKeys(property);
  const desc = ev.description
    ? `<p class="event-detail-desc">${escapeHtml(ev.description)}</p>`
    : '';

  const paramBlock =
    ev.params.length === 0
      ? `<p class="event-detail-noparams">기록된 파라미터가 없습니다.</p>`
      : `<table class="param-table">
          <thead><tr><th>파라미터</th><th>타입</th><th>설명</th></tr></thead>
          <tbody>
            ${ev.params
              .map((p) => {
                const common = globals.has(p.key) ? '<span class="param-common">공통</span>' : '';
                const d = p.description ? escapeHtml(p.description) : '';
                return `<tr>
                  <td class="param-key">${escapeHtml(p.key)}${common}</td>
                  <td class="param-type">${TYPE_LABEL[p.type]}</td>
                  <td class="param-desc">${d}</td>
                </tr>`;
              })
              .join('')}
          </tbody>
        </table>`;

  return `
    <div class="event-detail" data-detail-event="${escapeHtml(ev.name)}">
      <div class="event-detail-head">
        <div class="event-detail-titles">
          <h3 class="event-detail-label">${escapeHtml(ev.label)}</h3>
          <span class="event-detail-name">${escapeHtml(ev.name)}</span>
        </div>
        <span class="event-detail-count">${formatCount(ev.cnt)}</span>
      </div>
      ${desc}
      <div class="event-detail-params">
        <span class="event-detail-subhead">추출 가능한 파라미터 <span class="param-count">${ev.params.length}</span></span>
        ${paramBlock}
      </div>
      ${
        mode === 'dict'
          ? // 사전 모드: 순수 열람 — 선택 상태를 비추지 않는다(추가 버튼·담김 표시 모두 없음).
            ''
          : `<button type="button" class="event-detail-toggle${selected ? ' is-selected' : ''}"
        data-event="${escapeHtml(ev.name)}">
        ${selected ? `${checkIcon}<span>선택됨 — 빼기</span>` : '<span>이 이벤트 추가</span>'}
      </button>`
      }
    </div>
  `;
}
