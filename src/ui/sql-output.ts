// S5: SQL 출력 섹션 — S2 엔진 연결 + 비용 가드(기간 필수/90일 경고) + stale 표시.
// 렌더링만 담당한다. 상태 변경·이벤트 배선은 builder.ts가 담당(다른 슬롯과 동일한 패턴).

import type { AggregateSelection, DateRange, WideSelection } from '../sql/types';
import { DETAIL_LIMIT_VALUE, state } from '../state';
import type { PropertyKey } from '../state';
import { escapeHtml } from '../utils/html';
import type { FilterFieldOption } from './filters';
import { validateFilters } from './filters';
import { alertTriangleIcon, copyIcon } from './icons';

const MAX_RECOMMENDED_DAYS = 90;

// SQL 키워드 하이라이트 대상. 다중 단어(GROUP BY 등)는 단일 토큰처럼 매칭된다.
const SQL_KEYWORDS = [
  'WITH',
  'AS',
  'SELECT',
  'FROM',
  'WHERE',
  'GROUP BY',
  'ORDER BY',
  'COUNT',
  'DISTINCT',
  'UNNEST',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'BETWEEN',
  'AND',
  'IN',
  'LIKE',
];

const KEYWORD_PATTERN = new RegExp(`\\b(${SQL_KEYWORDS.join('|')})\\b`, 'g');

function daysInRange(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

export function isRangeTooLong(from: string, to: string): boolean {
  if (!from || !to) return false;
  return daysInRange(from, to) > MAX_RECOMMENDED_DAYS;
}

interface GenerateGuard {
  canGenerate: boolean;
  reason: string | null;
}

function guardFor(hasRange: boolean, eventCount: number): GenerateGuard {
  if (!hasRange) return { canGenerate: false, reason: '기간을 먼저 선택하세요.' };
  if (eventCount === 0) return { canGenerate: false, reason: '이벤트를 1개 이상 선택하세요.' };
  return { canGenerate: true, reason: null };
}

/** 코드 텍스트를 escape 후 키워드에 하이라이트 span을 씌운다. escape가 항상 먼저다. */
export function highlightSql(code: string): string {
  return escapeHtml(code).replace(KEYWORD_PATTERN, '<span class="sql-kw">$1</span>');
}

/**
 * 현재 state를 S2 엔진이 받는 AggregateSelection으로 변환한다.
 * 빈 값/숫자 아닌 값 필터는 여기서 걸러진다(엔진에 방어적인 입력만 전달).
 */
export function buildSelectionFromState(
  property: PropertyKey,
  filterOptions: FilterFieldOption[],
): { selection: AggregateSelection; filterErrorsByIndex: Map<number, string> } {
  const dateRange: DateRange | null =
    state.dateFrom && state.dateTo ? { start: state.dateFrom, end: state.dateTo } : null;

  const { usableFilters, errorsByIndex } = validateFilters(state.filters[property], filterOptions);

  const selection: AggregateSelection = {
    propertyKey: property,
    dateRange,
    events: [...state.selectedEvents[property]],
    dimensions: state.dimensions[property],
    metrics: [...state.metrics[property]],
    filters: usableFilters,
  };

  return { selection, filterErrorsByIndex: errorsByIndex };
}

/**
 * 현재 state를 상세(Wide) 모드 엔진이 받는 WideSelection으로 변환한다.
 * buildSelectionFromState와 동일한 방어적 필터 정리를 공유한다.
 */
export function buildWideSelectionFromState(
  property: PropertyKey,
  filterOptions: FilterFieldOption[],
): { selection: WideSelection; filterErrorsByIndex: Map<number, string> } {
  const dateRange: DateRange | null =
    state.dateFrom && state.dateTo ? { start: state.dateFrom, end: state.dateTo } : null;

  const { usableFilters, errorsByIndex } = validateFilters(state.filters[property], filterOptions);

  const selection: WideSelection = {
    propertyKey: property,
    dateRange,
    events: [...state.selectedEvents[property]],
    columns: [...state.detailColumns[property]],
    filters: usableFilters,
    limit: state.detailLimitEnabled[property] ? DETAIL_LIMIT_VALUE : null,
  };

  return { selection, filterErrorsByIndex: errorsByIndex };
}

function renderLimitControlHtml(property: PropertyKey): string {
  const enabled = state.detailLimitEnabled[property];
  const warningHtml = !enabled
    ? `<p class="sql-limit-warning">${alertTriangleIcon}<span>LIMIT 해제 — 상세 모드는 행 수가 많을 수 있습니다. 전체 반환 시 대량 스캔에 주의하세요.</span></p>`
    : '';

  return `
    <label class="sql-limit-toggle">
      <input type="checkbox" class="sql-limit-checkbox"${enabled ? ' checked' : ''} />
      <span>LIMIT ${DETAIL_LIMIT_VALUE}행 적용</span>
    </label>
    ${warningHtml}
  `;
}

export function renderSqlSectionHtml(property: PropertyKey): string {
  const eventCount = state.selectedEvents[property].size;
  const hasRange = Boolean(state.dateFrom && state.dateTo);
  const guard = guardFor(hasRange, eventCount);
  const tooLong = hasRange && isRangeTooLong(state.dateFrom, state.dateTo);

  const warningHtml = tooLong
    ? `<p class="sql-range-warning">${alertTriangleIcon}<span>선택한 기간이 90일을 초과했습니다 — 스캔량이 커질 수 있습니다.</span></p>`
    : '';

  const limitControlHtml = state.mode === 'detail' ? renderLimitControlHtml(property) : '';

  const actionsHtml = `
    <div class="sql-actions">
      <button type="button" class="sql-generate-btn"${guard.canGenerate ? '' : ' disabled'}>SQL 생성</button>
      ${!guard.canGenerate ? `<span class="sql-disabled-reason">${escapeHtml(guard.reason ?? '')}</span>` : ''}
    </div>
  `;

  return `${warningHtml}${limitControlHtml}${actionsHtml}${renderOutputHtml(property)}`;
}

function renderOutputHtml(property: PropertyKey): string {
  const saved = state.sql[property];
  if (!saved) return '';

  if (saved.status === 'error') {
    return `
      <p class="sql-error-badge">${alertTriangleIcon}<span>SQL 생성 실패: ${escapeHtml(saved.message)}</span></p>
    `;
  }

  return `
    <div class="sql-output${saved.stale ? ' is-stale' : ''}">
      ${
        saved.stale
          ? `<p class="sql-stale-note">${alertTriangleIcon}<span>선택이 변경됨 — 다시 생성하세요.</span></p>`
          : ''
      }
      <div class="sql-code-wrap">
        <pre class="sql-code"><code>${highlightSql(saved.code)}</code></pre>
        <button type="button" class="sql-copy-btn">${copyIcon}<span>복사</span></button>
      </div>
      <p class="sql-copy-hint">BQ 콘솔에 붙여넣어 실행하세요.</p>
    </div>
  `;
}
