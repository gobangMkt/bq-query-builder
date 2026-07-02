// 차원(행) 선택 칩 렌더링. 상태 변경/이벤트 바인딩은 builder.ts가 담당한다.

import type { CatalogProperty } from '../data/catalog-types';
import type { DimensionSelection, TrafficSourceField } from '../sql/types';
import { dimensionKey } from '../utils/dimension-key';
import { escapeHtml } from '../utils/html';
import { unionParamsForEvents, type ParamCandidate } from '../utils/params';

const TRAFFIC_SOURCE_FIELDS: Array<{ field: TrafficSourceField; label: string }> = [
  { field: 'source', label: '유입 소스' },
  { field: 'medium', label: '유입 매체' },
  { field: 'campaign', label: '캠페인' },
];

function chipHtml(key: string, label: string, selected: boolean, title?: string, mono = false): string {
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
  return `
    <button type="button" class="chip${selected ? ' is-selected' : ''}" data-dim-key="${escapeHtml(key)}"
      aria-pressed="${selected}"${titleAttr}>
      <span${mono ? ' class="chip-mono"' : ''}>${escapeHtml(label)}</span>
    </button>
  `;
}

function paramChipLabel(candidate: ParamCandidate, selectedEventNames: string[]): string {
  if (selectedEventNames.length > 1 && candidate.events.length < selectedEventNames.length) {
    return `${candidate.key} (${candidate.events.join(', ')})`;
  }
  return candidate.key;
}

function paramChipTitle(candidate: ParamCandidate, extra?: string): string | undefined {
  const parts = [candidate.description, extra].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(' — ') : undefined;
}

export function renderDimensionsHtml(
  property: CatalogProperty,
  selectedEventNames: string[],
  selectedDimensions: DimensionSelection[],
): string {
  const selectedKeys = new Set(selectedDimensions.map(dimensionKey));

  const fixedChips = [
    chipHtml('event_date', '일자', selectedKeys.has('event_date')),
    chipHtml('event_name', '이벤트명', selectedKeys.has('event_name')),
  ].join('');

  const trafficChips = TRAFFIC_SOURCE_FIELDS.map(({ field, label }) =>
    chipHtml(`traffic_source:${field}`, label, selectedKeys.has(`traffic_source:${field}`)),
  ).join('');

  const candidates = unionParamsForEvents(property, selectedEventNames);
  const branchType = candidates.find((c) => c.key === 'branch_type');
  const paramCandidates = candidates.filter((c) => c.key !== 'branch_type');

  const branchTypeChip = branchType
    ? chipHtml(
        'branch_type',
        'branch_type',
        selectedKeys.has('branch_type'),
        paramChipTitle(branchType, '고시원·원룸텔은 하나로 병합됩니다'),
        true,
      )
    : '';

  const paramChips = paramCandidates
    .map((c) =>
      chipHtml(
        `param:${c.key}`,
        paramChipLabel(c, selectedEventNames),
        selectedKeys.has(`param:${c.key}`),
        paramChipTitle(c),
        true,
      ),
    )
    .join('');

  const paramSection =
    selectedEventNames.length === 0
      ? `<p class="dim-empty-hint">이벤트를 선택하면 파라미터 차원이 표시됩니다.</p>`
      : `<div class="chip-group">${branchTypeChip}${paramChips}</div>`;

  return `
    <div class="dim-subgroup">
      <span class="dim-subgroup-title">기본</span>
      <div class="chip-group">${fixedChips}</div>
    </div>
    <div class="dim-subgroup">
      <span class="dim-subgroup-title">유입소스</span>
      <div class="chip-group">${trafficChips}</div>
    </div>
    <div class="dim-subgroup">
      <span class="dim-subgroup-title">파라미터</span>
      ${paramSection}
    </div>
  `;
}
