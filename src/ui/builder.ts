import type { Catalog } from '../data/catalog-types';
import type { FilterOperator, MetricType } from '../sql/types';
import { state } from '../state';
import type { PropertyKey } from '../state';
import { dimensionKey, parseDimensionKey } from '../utils/dimension-key';
import { presetRange } from '../utils/format';
import { escapeHtml } from '../utils/html';
import { unionParamsForEvents } from '../utils/params';
import { renderDimensionsHtml } from './dimensions';
import { renderEventListHtml, renderSearchHtml } from './events-list';
import {
  buildFilterFieldOptions,
  defaultFilterFor,
  operatorsForKind,
  parseFilterValue,
  renderFiltersHtml,
} from './filters';
import { renderMetricsHtml } from './metrics';
import { renderPreviewHtml } from './preview';

const PRESETS: Array<{ days: 7 | 14 | 30; label: string }> = [
  { days: 7, label: '최근 7일' },
  { days: 14, label: '최근 14일' },
  { days: 30, label: '최근 30일' },
];

export function renderBuilder(root: HTMLElement, catalog: Catalog): void {
  root.innerHTML = shellHtml(catalog);

  const listEl = root.querySelector<HTMLElement>('.event-list')!;
  const searchSlot = root.querySelector<HTMLElement>('.event-search-slot')!;
  const dateFromInput = root.querySelector<HTMLInputElement>('.date-from')!;
  const dateToInput = root.querySelector<HTMLInputElement>('.date-to')!;
  const tabsEl = root.querySelector<HTMLElement>('.property-tabs')!;
  const chipsEl = root.querySelector<HTMLElement>('.date-chips')!;
  const dimGroupsEl = root.querySelector<HTMLElement>('.dim-groups')!;
  const metricGroupEl = root.querySelector<HTMLElement>('.metric-group')!;
  const filterSlotEl = root.querySelector<HTMLElement>('.filter-slot')!;
  const previewSlotEl = root.querySelector<HTMLElement>('.preview-slot')!;

  function currentProperty() {
    return catalog.properties[state.property];
  }

  function currentEventNames(): string[] {
    return [...state.selectedEvents[state.property]];
  }

  function currentFilterFieldOptions() {
    return buildFilterFieldOptions(currentProperty(), currentEventNames());
  }

  function renderList(): void {
    listEl.innerHTML = renderEventListHtml(currentProperty());
  }

  function renderSearch(): void {
    searchSlot.innerHTML = renderSearchHtml();
    const input = searchSlot.querySelector<HTMLInputElement>('.event-search')!;
    input.addEventListener('input', () => {
      state.searchQuery = input.value;
      renderList();
    });
  }

  function renderDims(): void {
    dimGroupsEl.innerHTML = renderDimensionsHtml(
      currentProperty(),
      currentEventNames(),
      state.dimensions[state.property],
    );
  }

  function renderMetrics(): void {
    metricGroupEl.innerHTML = renderMetricsHtml(state.metrics[state.property]);
  }

  function renderFilters(): void {
    filterSlotEl.innerHTML = renderFiltersHtml(state.filters[state.property], currentFilterFieldOptions());
  }

  function renderPreview(): void {
    previewSlotEl.innerHTML = renderPreviewHtml(
      currentProperty(),
      state.dimensions[state.property],
      [...state.metrics[state.property]],
    );
  }

  // 선택된 이벤트가 바뀌면, 더 이상 어떤 선택 이벤트도 갖지 않는 파라미터 차원/필터를 제거한다
  // (리뷰 지시: 파라미터 후보는 선택된 이벤트의 실제 합집합으로만 제한).
  function pruneStaleSelections(): void {
    const property = currentProperty();
    const eventNames = currentEventNames();
    const validParamKeys = new Set(unionParamsForEvents(property, eventNames).map((c) => c.key));

    state.dimensions[state.property] = state.dimensions[state.property].filter((d) => {
      if (d.kind === 'param') return validParamKeys.has(d.key);
      if (d.kind === 'branch_type') return validParamKeys.has('branch_type');
      return true;
    });

    const validFields = new Set(currentFilterFieldOptions().map((o) => o.field));
    state.filters[state.property] = state.filters[state.property].filter((f) => validFields.has(f.field));
  }

  function refreshAfterSelectionChange(): void {
    pruneStaleSelections();
    renderDims();
    renderFilters();
    renderPreview();
  }

  function syncPresetChips(): void {
    chipsEl.querySelectorAll<HTMLButtonElement>('.date-chip').forEach((chip) => {
      chip.classList.toggle('is-selected', state.datePreset === Number(chip.dataset.days));
    });
  }

  function syncTabs(): void {
    tabsEl.querySelectorAll<HTMLButtonElement>('.property-tab').forEach((tab) => {
      const isActive = tab.dataset.property === state.property;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });
  }

  tabsEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.property-tab');
    if (!btn) return;
    const key = btn.dataset.property as PropertyKey;
    if (key === state.property) return;
    state.property = key;
    state.searchQuery = '';
    syncTabs();
    renderSearch();
    renderList();
    renderMetrics();
    refreshAfterSelectionChange();
  });

  chipsEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.date-chip');
    if (!btn) return;
    const days = Number(btn.dataset.days) as 7 | 14 | 30;
    const range = presetRange(days);
    state.datePreset = days;
    state.dateFrom = range.from;
    state.dateTo = range.to;
    dateFromInput.value = range.from;
    dateToInput.value = range.to;
    syncPresetChips();
  });

  dateFromInput.addEventListener('change', () => {
    state.dateFrom = dateFromInput.value;
    state.datePreset = null;
    syncPresetChips();
  });

  dateToInput.addEventListener('change', () => {
    state.dateTo = dateToInput.value;
    state.datePreset = null;
    syncPresetChips();
  });

  listEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.event-row');
    if (!btn) return;
    const name = btn.dataset.event;
    if (!name) return;
    const selected = state.selectedEvents[state.property];
    if (selected.has(name)) selected.delete(name);
    else selected.add(name);
    renderList();
    refreshAfterSelectionChange();
  });

  dimGroupsEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.chip[data-dim-key]');
    if (!btn) return;
    const key = btn.dataset.dimKey;
    if (!key) return;
    const list = state.dimensions[state.property];
    const idx = list.findIndex((d) => dimensionKey(d) === key);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(parseDimensionKey(key));
    renderDims();
    renderPreview();
  });

  metricGroupEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.chip[data-metric-key]');
    if (!btn) return;
    const key = btn.dataset.metricKey as MetricType;
    const set = state.metrics[state.property];
    if (set.has(key)) set.delete(key);
    else set.add(key);
    renderMetrics();
    renderPreview();
  });

  filterSlotEl.addEventListener('click', (e) => {
    const addBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('.filter-add');
    if (addBtn) {
      state.filters[state.property].push(defaultFilterFor(currentFilterFieldOptions()));
      renderFilters();
      renderPreview();
      return;
    }
    const removeBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-role="remove"]');
    if (!removeBtn) return;
    const row = removeBtn.closest<HTMLElement>('.filter-row');
    const idx = Number(row?.dataset.filterIndex);
    if (Number.isNaN(idx)) return;
    state.filters[state.property].splice(idx, 1);
    renderFilters();
    renderPreview();
  });

  function handleFilterFieldChange(e: Event): void {
    const target = e.target as HTMLElement;
    const role = target.dataset.role;
    if (!role) return;
    const row = target.closest<HTMLElement>('.filter-row');
    const idx = Number(row?.dataset.filterIndex);
    const filter = state.filters[state.property][idx];
    if (!filter) return;
    const options = currentFilterFieldOptions();

    if (role === 'field') {
      filter.field = (target as HTMLSelectElement).value;
      const kind = options.find((o) => o.field === filter.field)?.kind ?? 'string';
      const allowed = operatorsForKind(kind);
      if (!allowed.includes(filter.operator)) filter.operator = allowed[0];
      filter.value = '';
      renderFilters();
      renderPreview();
      return;
    }
    if (role === 'operator') {
      filter.operator = (target as HTMLSelectElement).value as FilterOperator;
      renderFilters();
      renderPreview();
      return;
    }
    if (role === 'value') {
      const kind = options.find((o) => o.field === filter.field)?.kind ?? 'string';
      filter.value = parseFilterValue((target as HTMLInputElement).value, filter.operator, kind);
      renderPreview();
    }
  }

  // select(field/operator)는 change, text input(value)은 input에서 반응하도록 둘 다 건다.
  filterSlotEl.addEventListener('change', handleFilterFieldChange);
  filterSlotEl.addEventListener('input', (e) => {
    if ((e.target as HTMLElement).dataset.role === 'value') handleFilterFieldChange(e);
  });

  renderSearch();
  renderList();
  renderDims();
  renderMetrics();
  renderFilters();
  renderPreview();
}

function shellHtml(catalog: Catalog): string {
  const properties = catalog.properties;
  const propertyKeys = Object.keys(properties) as PropertyKey[];

  return `
    <div class="builder">
      <div class="builder-topcard">
        <header class="builder-header">
          <h1 class="builder-title">BQ 쿼리 빌더</h1>
        </header>

        <nav class="property-tabs" role="tablist" aria-label="프로퍼티">
          ${propertyKeys
            .map(
              (key) => `
                <button type="button" class="property-tab${key === state.property ? ' is-active' : ''}"
                  role="tab" aria-selected="${key === state.property}" data-property="${key}">
                  ${escapeHtml(properties[key].label)}
                </button>
              `,
            )
            .join('')}
        </nav>
      </div>

      <section class="panel date-range">
        <h2 class="panel-title">기간</h2>
        <div class="date-chips">
          ${PRESETS.map(
            (p) => `
              <button type="button" class="date-chip${state.datePreset === p.days ? ' is-selected' : ''}"
                data-days="${p.days}">${p.label}</button>
            `,
          ).join('')}
        </div>
        <div class="date-inputs">
          <input type="date" class="date-from" value="${state.dateFrom}" aria-label="시작일" />
          <span class="date-sep">~</span>
          <input type="date" class="date-to" value="${state.dateTo}" aria-label="종료일" />
        </div>
      </section>

      <section class="panel event-section">
        <h2 class="panel-title">이벤트</h2>
        <div class="event-search-slot"></div>
        <div class="event-list"></div>
      </section>

      <section class="panel dim-section">
        <h2 class="panel-title">차원 (행)</h2>
        <div class="dim-groups"></div>
      </section>

      <section class="panel metric-section">
        <h2 class="panel-title">지표 (열)</h2>
        <div class="chip-group metric-group"></div>
      </section>

      <section class="panel filter-section">
        <h2 class="panel-title">필터</h2>
        <div class="filter-slot"></div>
      </section>

      <section class="panel preview-section">
        <h2 class="panel-title">구조 미리보기</h2>
        <div class="preview-slot"></div>
      </section>
    </div>
  `;
}
