// S6: 상세(Wide) 모드 "포함할 컬럼" 선택 UI.
// 기본 컬럼(event_date/event_time/event_name/user_pseudo_id/user_id/traffic_source 계열)은
// 항상 포함되어 토글 불가 — 정보 표시용 칩만 렌더링한다.
// 선택한 이벤트의 event_params 합집합만 토글 가능한 컬럼 후보로 노출한다(dimensions.ts와 동일 원리).

import type { CatalogProperty } from '../data/catalog-types';
import { escapeHtml } from '../utils/html';
import { unionParamsForEvents, type ParamCandidate } from '../utils/params';

export const FIXED_DETAIL_COLUMN_LABELS = [
  'event_date',
  'event_time',
  'event_name',
  'user_pseudo_id',
  'user_id',
  'traffic_source_source',
  'traffic_source_medium',
  'traffic_source_campaign',
];

function fixedChipHtml(label: string): string {
  return `
    <span class="chip chip-fixed is-selected" title="항상 포함되는 기본 컬럼">
      <span class="chip-mono">${escapeHtml(label)}</span>
    </span>
  `;
}

function paramChipLabel(candidate: ParamCandidate, selectedEventNames: string[]): string {
  if (selectedEventNames.length > 1 && candidate.events.length < selectedEventNames.length) {
    return `${candidate.key} (${candidate.events.join(', ')})`;
  }
  return candidate.key;
}

function toggleChipHtml(key: string, label: string, selected: boolean, title?: string): string {
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
  return `
    <button type="button" class="chip${selected ? ' is-selected' : ''}" data-column-key="${escapeHtml(key)}"
      aria-pressed="${selected}"${titleAttr}>
      <span class="chip-mono">${escapeHtml(label)}</span>
    </button>
  `;
}

export function renderColumnsHtml(
  property: CatalogProperty,
  selectedEventNames: string[],
  selectedColumns: Set<string>,
): string {
  const fixedChips = FIXED_DETAIL_COLUMN_LABELS.map(fixedChipHtml).join('');

  const candidates = unionParamsForEvents(property, selectedEventNames);
  const paramChips = candidates
    .map((c) =>
      toggleChipHtml(c.key, paramChipLabel(c, selectedEventNames), selectedColumns.has(c.key), c.description),
    )
    .join('');

  const paramSection =
    selectedEventNames.length === 0
      ? `<p class="dim-empty-hint">이벤트를 선택하면 포함할 컬럼이 표시됩니다.</p>`
      : candidates.length === 0
        ? `<p class="dim-empty-hint">선택한 이벤트에 event_params가 없습니다.</p>`
        : `<div class="chip-group">${paramChips}</div>`;

  return `
    <div class="dim-subgroup">
      <span class="dim-subgroup-title">기본 (항상 포함)</span>
      <div class="chip-group">${fixedChips}</div>
    </div>
    <div class="dim-subgroup">
      <span class="dim-subgroup-title">event_params (선택)</span>
      ${paramSection}
    </div>
  `;
}
