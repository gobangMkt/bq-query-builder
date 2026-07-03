import type { CatalogEvent, CatalogParam, CatalogProperty } from '../data/catalog-types';
import { formatCount } from '../utils/format';
import { escapeHtml } from '../utils/html';
import { infoIcon, searchIcon } from './icons';
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
  const globals = globalParamKeys(property);
  return groupByFunnel(filtered)
    .map(
      (group) => `
        <div class="event-group">
          <h3 class="event-group-title">${escapeHtml(group.funnel)}</h3>
          <ul class="event-rows">
            ${group.events.map((ev) => eventRowHtml(ev, selected.has(ev.name), globals)).join('')}
          </ul>
        </div>
      `,
    )
    .join('');
}

// 이벤트 사전 — 파라미터 표. '공통' 파라미터는 태그로 구분(상속/전역 결과 포함).
function dictBodyHtml(ev: CatalogEvent, globals: Set<string>): string {
  const desc = ev.description ? `<p class="dict-desc">${escapeHtml(ev.description)}</p>` : '';
  if (ev.params.length === 0) {
    return `${desc}<p class="dict-empty">기록된 파라미터가 없습니다.</p>`;
  }
  const rows = ev.params
    .map((p) => {
      const tag = globals.has(p.key) ? '<span class="dict-tag">공통</span>' : '';
      const d = p.description ? escapeHtml(p.description) : '';
      return `
        <tr>
          <td class="dict-key">${escapeHtml(p.key)}${tag}</td>
          <td class="dict-type">${TYPE_LABEL[p.type]}</td>
          <td class="dict-pdesc">${d}</td>
        </tr>
      `;
    })
    .join('');
  return `
    ${desc}
    <table class="dict-table">
      <thead><tr><th>파라미터</th><th>타입</th><th>설명</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function eventRowHtml(ev: CatalogEvent, selected: boolean, globals: Set<string>): string {
  return `
    <li class="event-item">
      <div class="event-line">
        <button type="button" class="event-row${selected ? ' is-selected' : ''}"
          data-event="${escapeHtml(ev.name)}" aria-pressed="${selected}">
          <span class="event-label">${escapeHtml(ev.label)}</span>
          <span class="event-name">${escapeHtml(ev.name)}</span>
          <span class="event-count">${formatCount(ev.cnt)}</span>
        </button>
        <details class="event-dict">
          <summary class="event-dict-toggle" aria-label="${escapeHtml(ev.label)} 사전 보기">${infoIcon}</summary>
          <div class="event-dict-body">${dictBodyHtml(ev, globals)}</div>
        </details>
      </div>
    </li>
  `;
}
