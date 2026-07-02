// 필터 행 렌더링. [파라미터·기본컬럼] [연산자] [값] 행 + 추가/삭제.
// 리뷰 지시: event_date 등 날짜 필드는 =/!= 만, 그 외 필드는 =/!=/IN/CONTAINS 전부 노출.

import type { CatalogProperty } from '../data/catalog-types';
import type { FilterCondition, FilterOperator } from '../sql/types';
import { escapeHtml } from '../utils/html';
import { unionParamsForEvents } from '../utils/params';
import { plusIcon, trashIcon } from './icons';

export type FilterFieldKind = 'date' | 'string' | 'numeric';

export interface FilterFieldOption {
  field: string;
  label: string;
  kind: FilterFieldKind;
  title?: string;
}

const FIXED_FILTER_FIELDS: FilterFieldOption[] = [
  { field: 'event_date', label: '일자 (event_date)', kind: 'date' },
  { field: 'event_name', label: '이벤트명 (event_name)', kind: 'string' },
  { field: 'traffic_source_source', label: '유입 소스', kind: 'string' },
  { field: 'traffic_source_medium', label: '유입 매체', kind: 'string' },
  { field: 'traffic_source_campaign', label: '캠페인', kind: 'string' },
];

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  '=': '같음 (=)',
  '!=': '다름 (!=)',
  IN: '목록 포함 (IN)',
  CONTAINS: '문자열 포함',
};

const DATE_OPERATORS: FilterOperator[] = ['=', '!='];
const ALL_OPERATORS: FilterOperator[] = ['=', '!=', 'IN', 'CONTAINS'];

export function buildFilterFieldOptions(
  property: CatalogProperty,
  selectedEventNames: string[],
): FilterFieldOption[] {
  const paramOptions: FilterFieldOption[] = unionParamsForEvents(property, selectedEventNames).map(
    (c) => ({
      field: c.key,
      label: c.key,
      kind: c.type === 'int' || c.type === 'numeric' ? 'numeric' : 'string',
      title: c.description,
    }),
  );
  return [...FIXED_FILTER_FIELDS, ...paramOptions];
}

export function operatorsForKind(kind: FilterFieldKind): FilterOperator[] {
  return kind === 'date' ? DATE_OPERATORS : ALL_OPERATORS;
}

function fieldKind(field: string, options: FilterFieldOption[]): FilterFieldKind {
  return options.find((o) => o.field === field)?.kind ?? 'string';
}

function filterValueToInputString(value: FilterCondition['value']): string {
  return Array.isArray(value) ? value.join(', ') : String(value);
}

function filterRowHtml(filter: FilterCondition, index: number, options: FilterFieldOption[]): string {
  const kind = fieldKind(filter.field, options);
  const operators = operatorsForKind(kind);

  const fieldSelectHtml = options
    .map((o) => {
      const titleAttr = o.title ? ` title="${escapeHtml(o.title)}"` : '';
      const selectedAttr = o.field === filter.field ? ' selected' : '';
      return `<option value="${escapeHtml(o.field)}"${selectedAttr}${titleAttr}>${escapeHtml(o.label)}</option>`;
    })
    .join('');

  const operatorSelectHtml = operators
    .map((op) => `<option value="${op}"${op === filter.operator ? ' selected' : ''}>${OPERATOR_LABELS[op]}</option>`)
    .join('');

  const valueStr = filterValueToInputString(filter.value);
  const placeholder = filter.operator === 'IN' ? '콤마로 구분해 입력' : '값 입력';

  return `
    <div class="filter-row" data-filter-index="${index}">
      <select class="filter-field" data-role="field" aria-label="필터 대상 필드">${fieldSelectHtml}</select>
      <select class="filter-operator" data-role="operator" aria-label="필터 연산자">${operatorSelectHtml}</select>
      <input type="text" class="filter-value" data-role="value" aria-label="필터 값"
        value="${escapeHtml(valueStr)}" placeholder="${escapeHtml(placeholder)}" />
      <button type="button" class="filter-remove" data-role="remove" aria-label="필터 삭제">${trashIcon}</button>
    </div>
  `;
}

export function renderFiltersHtml(filters: FilterCondition[], options: FilterFieldOption[]): string {
  const rows = filters.map((f, i) => filterRowHtml(f, i, options)).join('');
  return `
    <div class="filter-rows">${rows}</div>
    <button type="button" class="filter-add">${plusIcon}<span>필터 추가</span></button>
  `;
}

export function defaultFilterFor(options: FilterFieldOption[]): FilterCondition {
  const option = options[0];
  return { field: option.field, operator: '=', value: '' };
}

function toTypedScalar(raw: string, kind: FilterFieldKind): string | number {
  const trimmed = raw.trim();
  if (kind === 'numeric' && trimmed !== '') {
    const n = Number(trimmed);
    if (!Number.isNaN(n)) return n;
  }
  return trimmed;
}

/** 필터 값 입력창의 원문 문자열을 연산자·필드 타입에 맞는 FilterCondition['value']로 변환한다. */
export function parseFilterValue(
  raw: string,
  operator: FilterOperator,
  kind: FilterFieldKind,
): FilterCondition['value'] {
  if (operator === 'IN') {
    return raw
      .split(',')
      .map((s) => toTypedScalar(s, kind))
      .filter((v) => v !== '');
  }
  return toTypedScalar(raw, kind);
}
