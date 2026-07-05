// 지표(열) 선택 칩 렌더링 + 비율 지표 UI.

import type { MetricType } from '../sql/types';
import type { RatioConfigState } from '../state';
import { RATIO_DECIMALS_MAX } from '../state';
import { escapeHtml } from '../utils/html';

const METRIC_LABELS: Array<{ key: MetricType; label: string }> = [
  { key: 'event_count', label: '이벤트수' },
  { key: 'unique_users', label: '고유사용자수' },
  { key: 'unique_sessions', label: '고유세션수' },
];

export function renderMetricsHtml(selected: Set<MetricType>): string {
  return METRIC_LABELS.map(
    ({ key, label }) => `
      <button type="button" class="chip${selected.has(key) ? ' is-selected' : ''}" data-metric-key="${key}"
        aria-pressed="${selected.has(key)}">
        <span>${label}</span>
      </button>
    `,
  ).join('');
}

export interface RatioEventOption {
  name: string;
  label: string;
}

function ratioEventOptions(events: RatioEventOption[], selectedName: string | null): string {
  const placeholder = `<option value=""${selectedName ? '' : ' selected'}>이벤트 선택</option>`;
  const opts = events
    .map(
      (e) =>
        `<option value="${escapeHtml(e.name)}"${e.name === selectedName ? ' selected' : ''}>${escapeHtml(e.label)}</option>`,
    )
    .join('');
  return placeholder + opts;
}

// 비율 지표 UI — 켜기 토글 + 분자/분모 이벤트 select + 표시형식(% / 소수) + 소수점 자리.
export function renderRatioHtml(events: RatioEventOption[], ratio: RatioConfigState): string {
  const toggle = `
    <label class="ratio-toggle">
      <input type="checkbox" class="ratio-enable"${ratio.enabled ? ' checked' : ''} />
      <span>비율 계산 <span class="lead-sub">(분자 ÷ 분모)</span></span>
    </label>
  `;

  if (!ratio.enabled) return `<div class="ratio-block">${toggle}</div>`;

  if (events.length < 2) {
    return `
      <div class="ratio-block is-open">
        ${toggle}
        <p class="ratio-hint">이벤트를 <b>2개 이상</b> 선택하면 두 이벤트의 비율(예: 클릭 ÷ 조회)을 만들 수 있어요.</p>
      </div>
    `;
  }

  const decimalsOptions = Array.from({ length: RATIO_DECIMALS_MAX + 1 }, (_, d) => d)
    .map((d) => `<option value="${d}"${d === ratio.decimals ? ' selected' : ''}>${d}자리</option>`)
    .join('');

  return `
    <div class="ratio-block is-open">
      ${toggle}
      <div class="ratio-config">
        <div class="ratio-row">
          <label class="ratio-field">
            <span class="ratio-field-label">분자</span>
            <select class="ratio-num">${ratioEventOptions(events, ratio.numeratorEvent)}</select>
          </label>
          <span class="ratio-divide" aria-hidden="true">÷</span>
          <label class="ratio-field">
            <span class="ratio-field-label">분모</span>
            <select class="ratio-den">${ratioEventOptions(events, ratio.denominatorEvent)}</select>
          </label>
        </div>
        <div class="ratio-row">
          <div class="ratio-format-seg" role="group" aria-label="표시 형식">
            <button type="button" class="ratio-fmt-btn${ratio.format === 'percent' ? ' is-active' : ''}"
              data-fmt="percent" aria-pressed="${ratio.format === 'percent'}">%</button>
            <button type="button" class="ratio-fmt-btn${ratio.format === 'decimal' ? ' is-active' : ''}"
              data-fmt="decimal" aria-pressed="${ratio.format === 'decimal'}">소수</button>
          </div>
          <label class="ratio-field">
            <span class="ratio-field-label">소수점</span>
            <select class="ratio-decimals">${decimalsOptions}</select>
          </label>
        </div>
      </div>
    </div>
  `;
}
