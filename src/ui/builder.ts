import type { Catalog } from '../data/catalog-types';
import { generateAggregateSql, generateWideSql } from '../sql/generate';
import type { AppMode, FilterOperator, MetricType } from '../sql/types';
import { state } from '../state';
import type { InputMode, PropertyKey } from '../state';
import { renderColumnsHtml } from './columns';
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
  validateFilters,
} from './filters';
import type { FilterFieldOption } from './filters';
import { alertCircleIcon, checkIcon, messageIcon, slidersIcon } from './icons';
import { renderMetricsHtml } from './metrics';
import { renderPreviewHtml, renderWidePreviewHtml } from './preview';
import { defaultSegmentFor, renderSegmentsHtml } from './segments';
import { buildSelectionFromState, buildWideSelectionFromState, renderSqlSectionHtml } from './sql-output';

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
  const inputModeEl = root.querySelector<HTMLElement>('.input-mode-seg')!;
  const selectPanelEl = root.querySelector<HTMLElement>('.input-panel-select')!;
  const chatPanelEl = root.querySelector<HTMLElement>('.input-panel-chat')!;
  const modeToggleEl = root.querySelector<HTMLElement>('.mode-toggle')!;
  const chipsEl = root.querySelector<HTMLElement>('.date-chips')!;
  const segSlotEl = root.querySelector<HTMLElement>('.segment-slot')!;
  const dimGroupsEl = root.querySelector<HTMLElement>('.dim-groups')!;
  const metricGroupEl = root.querySelector<HTMLElement>('.metric-group')!;
  const columnGroupsEl = root.querySelector<HTMLElement>('.column-groups')!;
  const dimSectionEl = root.querySelector<HTMLElement>('.dim-section')!;
  const metricSectionEl = root.querySelector<HTMLElement>('.metric-section')!;
  const columnSectionEl = root.querySelector<HTMLElement>('.column-section')!;
  const filterSlotEl = root.querySelector<HTMLElement>('.filter-slot')!;
  const previewSlotEl = root.querySelector<HTMLElement>('.preview-slot')!;
  const sqlSlotEl = root.querySelector<HTMLElement>('.sql-slot')!;

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

  function renderColumns(): void {
    columnGroupsEl.innerHTML = renderColumnsHtml(
      currentProperty(),
      currentEventNames(),
      state.detailColumns[state.property],
    );
  }

  function renderFilters(): void {
    const options = currentFilterFieldOptions();
    const { errorsByIndex } = validateFilters(state.filters[state.property], options);
    filterSlotEl.innerHTML = renderFiltersHtml(state.filters[state.property], options, errorsByIndex);
  }

  function renderSegments(): void {
    segSlotEl.innerHTML = renderSegmentsHtml(currentProperty(), state.segments[state.property]);
  }

  function syncInputMode(): void {
    const isChat = state.inputMode === 'chat';
    chatPanelEl.classList.toggle('is-hidden', !isChat);
    selectPanelEl.classList.toggle('is-hidden', isChat);
    inputModeEl.querySelectorAll<HTMLButtonElement>('.input-mode-btn').forEach((btn) => {
      const active = btn.dataset.inputMode === state.inputMode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });
  }

  function renderPreview(): void {
    previewSlotEl.innerHTML =
      state.mode === 'detail'
        ? renderWidePreviewHtml(currentProperty(), [...state.detailColumns[state.property]])
        : renderPreviewHtml(currentProperty(), state.dimensions[state.property], [...state.metrics[state.property]]);
  }

  function renderSql(): void {
    sqlSlotEl.innerHTML = renderSqlSectionHtml(state.property);
  }

  function syncModeVisibility(): void {
    const isDetail = state.mode === 'detail';
    dimSectionEl.classList.toggle('is-hidden', isDetail);
    metricSectionEl.classList.toggle('is-hidden', isDetail);
    columnSectionEl.classList.toggle('is-hidden', !isDetail);
    modeToggleEl.querySelectorAll<HTMLButtonElement>('.mode-btn').forEach((btn) => {
      const isActive = btn.dataset.mode === state.mode;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
    });
  }

  // 선택(이벤트/기간/차원/지표/필터)이 바뀌면 이미 생성된 SQL은 stale로 표시해 재생성을 유도한다.
  function invalidateGeneratedSql(): void {
    const current = state.sql[state.property];
    if (current && current.status === 'ok' && !current.stale) {
      state.sql[state.property] = { ...current, stale: true };
    }
  }

  function onSelectionChanged(): void {
    invalidateGeneratedSql();
    renderSql();
  }

  function handleGenerateSql(): void {
    const options = currentFilterFieldOptions();
    try {
      const sql =
        state.mode === 'detail'
          ? generateWideSql(catalog, buildWideSelectionFromState(state.property, options).selection)
          : generateAggregateSql(catalog, buildSelectionFromState(state.property, options).selection);
      state.sql[state.property] = { status: 'ok', code: sql, stale: false };
    } catch (err) {
      state.sql[state.property] = {
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      };
    }
    renderFilters();
    renderSql();
  }

  function handleCopySql(btn: HTMLButtonElement): void {
    const saved = state.sql[state.property];
    if (!saved || saved.status !== 'ok') return;
    if (!navigator.clipboard) return;
    navigator.clipboard
      .writeText(saved.code)
      .then(() => {
        const original = btn.innerHTML;
        btn.innerHTML = `${checkIcon}<span>복사됨</span>`;
        btn.classList.add('is-copied');
        setTimeout(() => {
          btn.innerHTML = original;
          btn.classList.remove('is-copied');
        }, 2000);
      })
      .catch(() => {
        // 클립보드 접근 실패는 조용히 무시(콘솔 에러로 새지 않게)
      });
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

    state.detailColumns[state.property] = new Set(
      [...state.detailColumns[state.property]].filter((key) => validParamKeys.has(key)),
    );

    const validFields = new Set(currentFilterFieldOptions().map((o) => o.field));
    state.filters[state.property] = state.filters[state.property].filter((f) => validFields.has(f.field));
  }

  function refreshAfterSelectionChange(): void {
    pruneStaleSelections();
    renderDims();
    renderColumns();
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
    renderSegments();
    refreshAfterSelectionChange();
    renderSql();
  });

  inputModeEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.input-mode-btn');
    if (!btn) return;
    const inputMode = btn.dataset.inputMode as InputMode;
    if (inputMode === state.inputMode) return;
    state.inputMode = inputMode;
    syncInputMode();
  });

  modeToggleEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.mode-btn');
    if (!btn) return;
    const mode = btn.dataset.mode as AppMode;
    if (mode === state.mode) return;
    state.mode = mode;
    // 모드가 완전히 다른 SQL을 만들어내므로, 이전 모드에서 생성된 결과는 폐기한다(stale 표시가 아니라 제거).
    state.sql[state.property] = null;
    syncModeVisibility();
    renderPreview();
    renderSql();
  });

  segSlotEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const addBtn = target.closest<HTMLButtonElement>('.segment-add');
    if (addBtn) {
      state.segments[state.property].push(defaultSegmentFor(currentProperty()));
      renderSegments();
      onSelectionChanged();
      return;
    }
    const removeBtn = target.closest<HTMLButtonElement>('.segment-remove');
    if (removeBtn) {
      const row = removeBtn.closest<HTMLElement>('.segment-row');
      const idx = Number(row?.dataset.segmentIndex);
      if (Number.isNaN(idx)) return;
      state.segments[state.property].splice(idx, 1);
      renderSegments();
      onSelectionChanged();
      return;
    }
    const didBtn = target.closest<HTMLButtonElement>('.segment-did-btn');
    if (didBtn) {
      const row = didBtn.closest<HTMLElement>('.segment-row');
      const idx = Number(row?.dataset.segmentIndex);
      const seg = state.segments[state.property][idx];
      if (!seg) return;
      seg.did = didBtn.dataset.did === 'true';
      renderSegments();
      onSelectionChanged();
    }
  });

  segSlotEl.addEventListener('change', (e) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('segment-event')) return;
    const row = target.closest<HTMLElement>('.segment-row');
    const idx = Number(row?.dataset.segmentIndex);
    const seg = state.segments[state.property][idx];
    if (!seg) return;
    seg.event = (target as HTMLSelectElement).value;
    onSelectionChanged();
  });

  columnGroupsEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.chip[data-column-key]');
    if (!btn) return;
    const key = btn.dataset.columnKey;
    if (!key) return;
    const set = state.detailColumns[state.property];
    if (set.has(key)) set.delete(key);
    else set.add(key);
    renderColumns();
    renderPreview();
    onSelectionChanged();
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
    onSelectionChanged();
  });

  dateFromInput.addEventListener('change', () => {
    state.dateFrom = dateFromInput.value;
    state.datePreset = null;
    syncPresetChips();
    onSelectionChanged();
  });

  dateToInput.addEventListener('change', () => {
    state.dateTo = dateToInput.value;
    state.datePreset = null;
    syncPresetChips();
    onSelectionChanged();
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
    onSelectionChanged();
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
    onSelectionChanged();
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
    onSelectionChanged();
  });

  filterSlotEl.addEventListener('click', (e) => {
    const addBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('.filter-add');
    if (addBtn) {
      state.filters[state.property].push(defaultFilterFor(currentFilterFieldOptions()));
      renderFilters();
      renderPreview();
      onSelectionChanged();
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
    onSelectionChanged();
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
      onSelectionChanged();
      return;
    }
    if (role === 'operator') {
      filter.operator = (target as HTMLSelectElement).value as FilterOperator;
      renderFilters();
      renderPreview();
      onSelectionChanged();
      return;
    }
    if (role === 'value') {
      const kind = options.find((o) => o.field === filter.field)?.kind ?? 'string';
      filter.value = parseFilterValue((target as HTMLInputElement).value, filter.operator, kind);
      // 값 입력창은 매 키입력마다 renderFilters()를 호출하지 않는다(포커스 유실 방지).
      // 대신 이 필터 행 하나만 에러 표시를 갱신한다.
      syncFilterRowError(idx, options);
      renderPreview();
      onSelectionChanged();
    }
  }

  function syncFilterRowError(idx: number, options: FilterFieldOption[]): void {
    const { errorsByIndex } = validateFilters(state.filters[state.property], options);
    const item = filterSlotEl.querySelectorAll<HTMLElement>('.filter-item')[idx];
    if (!item) return;
    const input = item.querySelector<HTMLInputElement>('.filter-value');
    const message = errorsByIndex.get(idx);
    input?.classList.toggle('has-error', Boolean(message));
    let errEl = item.querySelector<HTMLElement>('.filter-error');
    if (message) {
      if (!errEl) {
        errEl = document.createElement('p');
        errEl.className = 'filter-error';
        item.appendChild(errEl);
      }
      errEl.innerHTML = `${alertCircleIcon}<span>${escapeHtml(message)}</span>`;
    } else if (errEl) {
      errEl.remove();
    }
  }

  // select(field/operator)는 change, text input(value)은 input에서 반응하도록 둘 다 건다.
  filterSlotEl.addEventListener('change', handleFilterFieldChange);
  filterSlotEl.addEventListener('input', (e) => {
    if ((e.target as HTMLElement).dataset.role === 'value') handleFilterFieldChange(e);
  });

  sqlSlotEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const generateBtn = target.closest<HTMLButtonElement>('.sql-generate-btn');
    if (generateBtn && !generateBtn.disabled) {
      handleGenerateSql();
      return;
    }
    const copyBtn = target.closest<HTMLButtonElement>('.sql-copy-btn');
    if (copyBtn) {
      handleCopySql(copyBtn);
    }
  });

  sqlSlotEl.addEventListener('change', (e) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('sql-limit-checkbox')) return;
    state.detailLimitEnabled[state.property] = (target as HTMLInputElement).checked;
    onSelectionChanged();
  });

  renderSearch();
  renderList();
  renderSegments();
  renderDims();
  renderColumns();
  renderMetrics();
  renderFilters();
  renderPreview();
  renderSql();
  syncModeVisibility();
  syncInputMode();
}

function shellHtml(catalog: Catalog): string {
  const properties = catalog.properties;
  const propertyKeys = Object.keys(properties) as PropertyKey[];

  return `
    <div class="workbench">
      <header class="wb-header">
        <h1 class="wb-title">BQ 쿼리 빌더</h1>
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
        <div class="input-mode-seg" role="tablist" aria-label="입력 방식">
          <button type="button" class="input-mode-btn${state.inputMode === 'chat' ? ' is-active' : ''}"
            role="tab" aria-selected="${state.inputMode === 'chat'}" data-input-mode="chat">${messageIcon}<span>대화형</span></button>
          <button type="button" class="input-mode-btn${state.inputMode === 'select' ? ' is-active' : ''}"
            role="tab" aria-selected="${state.inputMode === 'select'}" data-input-mode="select">${slidersIcon}<span>셀렉형</span></button>
        </div>
      </header>

      <div class="wb-body">
        <div class="wb-left">
          <div class="input-panel-chat is-hidden">
            <div class="chat-slot">
              <p class="chat-placeholder">대화형 입력은 곧 제공됩니다. 지금은 셀렉형으로 조립하세요.</p>
            </div>
          </div>

          <div class="input-panel-select">
            <div class="mode-toggle" role="tablist" aria-label="모드">
              <button type="button" class="mode-btn${state.mode === 'aggregate' ? ' is-active' : ''}"
                role="tab" aria-selected="${state.mode === 'aggregate'}" data-mode="aggregate">집계</button>
              <button type="button" class="mode-btn${state.mode === 'detail' ? ' is-active' : ''}"
                role="tab" aria-selected="${state.mode === 'detail'}" data-mode="detail">상세</button>
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

            <section class="panel segment-section">
              <h2 class="panel-title">사람 조건 <span class="panel-sub">(선택)</span></h2>
              <div class="segment-slot"></div>
            </section>

            <section class="panel dim-section${state.mode === 'detail' ? ' is-hidden' : ''}">
              <h2 class="panel-title">차원 (행)</h2>
              <div class="dim-groups"></div>
            </section>

            <section class="panel metric-section${state.mode === 'detail' ? ' is-hidden' : ''}">
              <h2 class="panel-title">지표 (열)</h2>
              <div class="chip-group metric-group"></div>
            </section>

            <section class="panel column-section${state.mode === 'aggregate' ? ' is-hidden' : ''}">
              <h2 class="panel-title">포함할 컬럼</h2>
              <div class="column-groups"></div>
            </section>

            <section class="panel filter-section">
              <h2 class="panel-title">필터</h2>
              <div class="filter-slot"></div>
            </section>
          </div>
        </div>

        <div class="wb-right">
          <section class="panel preview-section">
            <h2 class="panel-title">구조 미리보기</h2>
            <div class="preview-slot"></div>
          </section>

          <section class="panel sql-section">
            <h2 class="panel-title">SQL</h2>
            <div class="sql-slot"></div>
          </section>
        </div>
      </div>
    </div>
  `;
}
