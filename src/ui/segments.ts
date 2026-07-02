// 사람 조건(세그먼트) 렌더링. 조회 기간 내에서 특정 이벤트를 했다/안 했다로 유저를 거른다.
// 상태 변경/이벤트 바인딩은 builder.ts가 담당한다.

import type { CatalogProperty } from '../data/catalog-types';
import type { SegmentCondition } from '../sql/types';
import { escapeHtml } from '../utils/html';
import { plusIcon, trashIcon, userCheckIcon, userXIcon } from './icons';

export function defaultSegmentFor(property: CatalogProperty): SegmentCondition {
  return { event: property.events[0]?.name ?? '', did: true };
}

function eventOptionsHtml(property: CatalogProperty, selected: string): string {
  return property.events
    .map((e) => {
      const label = e.label && e.label !== e.name ? `${e.label} · ${e.name}` : e.name;
      const sel = e.name === selected ? ' selected' : '';
      return `<option value="${escapeHtml(e.name)}"${sel}>${escapeHtml(label)}</option>`;
    })
    .join('');
}

function segmentRowHtml(property: CatalogProperty, seg: SegmentCondition, index: number): string {
  return `
    <div class="segment-row" data-segment-index="${index}">
      <select class="segment-event" data-role="event" aria-label="사람 조건 이벤트">
        ${eventOptionsHtml(property, seg.event)}
      </select>
      <div class="segment-did" role="group" aria-label="했다 / 안 했다">
        <button type="button" class="segment-did-btn${seg.did ? ' is-active' : ''}"
          data-role="did" data-did="true" aria-pressed="${seg.did}">${userCheckIcon}<span>했다</span></button>
        <button type="button" class="segment-did-btn${!seg.did ? ' is-active' : ''}"
          data-role="did" data-did="false" aria-pressed="${!seg.did}">${userXIcon}<span>안 했다</span></button>
      </div>
      <button type="button" class="segment-remove" data-role="remove" aria-label="사람 조건 삭제">${trashIcon}</button>
    </div>
  `;
}

export function renderSegmentsHtml(property: CatalogProperty, segments: SegmentCondition[]): string {
  const rows =
    segments.length > 0
      ? `<div class="segment-rows">${segments.map((s, i) => segmentRowHtml(property, s, i)).join('')}</div>`
      : `<p class="segment-empty-hint">특정 행동을 한/안 한 사람만 골라 집계하려면 조건을 추가하세요.</p>`;

  return `
    ${rows}
    <button type="button" class="segment-add">${plusIcon}<span>사람 조건 추가</span></button>
  `;
}
