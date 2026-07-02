import type { CatalogEvent, CatalogProperty } from '../data/catalog-types';
import { formatCount } from '../utils/format';
import { escapeHtml } from '../utils/html';
import { searchIcon } from './icons';
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
    const key = ev.funnel ?? '기타';
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

export function renderSearchHtml(): string {
  return `
    <span class="event-search-icon">${searchIcon}</span>
    <input type="search" class="event-search" placeholder="이벤트명 또는 라벨 검색"
      value="${escapeHtml(state.searchQuery)}" aria-label="이벤트 검색" />
  `;
}

export function renderEventListHtml(property: CatalogProperty): string {
  const query = state.searchQuery.trim();
  const filtered = property.events.filter((ev) => matchesQuery(ev, query));

  if (filtered.length === 0) {
    return `<p class="event-empty">검색 결과가 없습니다.</p>`;
  }

  const selected = state.selectedEvents[state.property];
  return groupByFunnel(filtered)
    .map(
      (group) => `
        <div class="event-group">
          <h3 class="event-group-title">${escapeHtml(group.funnel)}</h3>
          <ul class="event-rows">
            ${group.events.map((ev) => eventRowHtml(ev, selected.has(ev.name))).join('')}
          </ul>
        </div>
      `,
    )
    .join('');
}

function eventRowHtml(ev: CatalogEvent, selected: boolean): string {
  return `
    <li>
      <button type="button" class="event-row${selected ? ' is-selected' : ''}"
        data-event="${escapeHtml(ev.name)}" aria-pressed="${selected}">
        <div class="event-row-main">
          <span class="event-label">${escapeHtml(ev.label)}</span>
          <span class="event-name">${escapeHtml(ev.name)}</span>
          <span class="event-count">${formatCount(ev.cnt)}</span>
        </div>
        ${ev.description ? `<p class="event-desc">${escapeHtml(ev.description)}</p>` : ''}
      </button>
    </li>
  `;
}
