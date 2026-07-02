// 지표(열) 선택 칩 렌더링.

import type { MetricType } from '../sql/types';

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
