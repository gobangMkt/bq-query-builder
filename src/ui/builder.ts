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
import { alertCircleIcon, bookIcon, checkIcon, messageIcon, plusIcon, slidersIcon } from './icons';
import { renderMetricsHtml } from './metrics';
import { renderPreviewHtml, renderWidePreviewHtml } from './preview';
import { defaultSegmentFor, renderSegmentsHtml } from './segments';
import { renderChatResultHtml, renderChatShellHtml } from './chat';
import { parseQuery, type ParseResult } from '../nl/parse';
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
  const dateRangeSlotEl = root.querySelector<HTMLElement>('.date-range-slot')!;
  const tabsEl = root.querySelector<HTMLElement>('.property-tabs')!;
  const inputModeEl = root.querySelector<HTMLElement>('.input-mode-seg')!;
  const selectPanelEl = root.querySelector<HTMLElement>('.input-panel-select')!;
  const chatPanelEl = root.querySelector<HTMLElement>('.input-panel-chat')!;
  const chatSlotEl = root.querySelector<HTMLElement>('.chat-slot')!;
  const modeToggleEl = root.querySelector<HTMLElement>('.mode-toggle')!;
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
  const composeRestEl = root.querySelector<HTMLElement>('.compose-rest')!;
  const selectedEventsSlotEl = root.querySelector<HTMLElement>('.selected-events-slot')!;
  const eventModalEl = root.querySelector<HTMLElement>('.event-modal')!;
  const dictOpenBtn = root.querySelector<HTMLButtonElement>('.dict-open-btn')!;
  const dataFromLabelEl = root.querySelector<HTMLElement>('.data-from-label')!;
  const modalPropLabelEl = root.querySelector<HTMLElement>('.modal-prop-label')!;

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
    dictOpenBtn.classList.toggle('is-hidden', isChat);
    inputModeEl.querySelectorAll<HTMLButtonElement>('.input-mode-btn').forEach((btn) => {
      const active = btn.dataset.inputMode === state.inputMode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });
  }

  // 선택한 이벤트가 하나도 없으면 이후 문장(조건·행·값·사람조건)을 감춰 초기 화면을 단순하게 유지.
  function syncComposeProgressive(): void {
    const hasEvent = state.selectedEvents[state.property].size > 0;
    composeRestEl.classList.toggle('is-hidden', !hasEvent);
  }

  function renderSelectedEvents(): void {
    const property = currentProperty();
    const names = [...state.selectedEvents[state.property]];
    const chips = names
      .map((name) => {
        const ev = property.events.find((e) => e.name === name);
        const label = ev ? ev.label : name;
        return `
          <span class="ev-chip" data-event="${escapeHtml(name)}">
            <span class="ev-chip-label">${escapeHtml(label)}</span>
            <span class="ev-chip-name">${escapeHtml(name)}</span>
            <button type="button" class="ev-chip-x" data-remove-event="${escapeHtml(name)}" aria-label="빼기">✕</button>
          </span>
        `;
      })
      .join('');
    const emptyHint = names.length === 0 ? '<span class="ev-empty">아직 없음 — 이벤트를 고르세요</span>' : '';
    selectedEventsSlotEl.innerHTML = `${chips}${emptyHint}<button type="button" class="ev-add-btn">${plusIcon}<span>이벤트</span></button>`;
  }

  function openEventModal(): void {
    eventModalEl.classList.remove('is-hidden');
    const input = searchSlot.querySelector<HTMLInputElement>('.event-search');
    input?.focus();
  }

  function closeEventModal(): void {
    eventModalEl.classList.add('is-hidden');
  }

  // ----- 대화형 -----
  let chatResult: ParseResult | null = null;
  const CHAT_EXAMPLE =
    '지난 한 주 동안, 찜 메모를 누른 사람 중 공고완독을 하지 않은 사람들이 발생시킨 조회수';

  function renderChatShell(): void {
    chatSlotEl.innerHTML = renderChatShellHtml();
    renderChatResult();
  }

  function renderChatResult(): void {
    const resultEl = chatSlotEl.querySelector<HTMLElement>('.chat-result');
    if (resultEl) resultEl.innerHTML = renderChatResultHtml(chatResult, currentProperty());
  }

  function handleChatParse(): void {
    const input = chatSlotEl.querySelector<HTMLTextAreaElement>('.chat-input');
    if (!input) return;
    chatResult = parseQuery(input.value, currentProperty());
    renderChatResult();
  }

  // 대화형 해석 결과를 셀렉형과 동일한 state로 변환하고 SQL을 생성한다(집계 전용).
  function applyChatToState(): void {
    if (!chatResult || chatResult.status !== 'parsed') return;
    const r = chatResult;
    if (r.target.resolved === null || r.segments.some((s) => s.choice.resolved === null)) return;

    const range = presetRange(r.period.days);
    state.mode = 'aggregate';
    state.datePreset = [7, 14, 30].includes(r.period.days) ? (r.period.days as 7 | 14 | 30) : null;
    state.dateFrom = range.from;
    state.dateTo = range.to;
    state.selectedEvents[state.property] = new Set([r.target.resolved]);
    state.segments[state.property] = r.segments.map((s) => ({
      event: s.choice.resolved as string,
      did: s.did,
    }));
    state.dimensions[state.property] = [{ kind: 'event_date' }];
    state.metrics[state.property] = new Set([r.metric]);
    state.filters[state.property] = [];

    // 셀렉형 컨트롤도 새 상태를 반영(사용자가 셀렉형으로 넘어가 이어서 다듬을 수 있게).
    void range;
    renderDateRange();
    syncModeVisibility();
    renderList();
    renderSelectedEvents();
    syncComposeProgressive();
    renderSegments();
    renderDims();
    renderMetrics();
    renderFilters();
    renderPreview();
    handleGenerateSql();
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

  // 기간 컨트롤: 프리셋 pill(7/14/30) + "직접" — 직접일 때만 날짜 범위 입력이 펼쳐진다.
  function renderDateRange(): void {
    const custom = state.datePreset === null;
    const pills = PRESETS.map(
      (p) => `
        <button type="button" class="date-pill${state.datePreset === p.days ? ' is-selected' : ''}"
          data-days="${p.days}">${p.label}</button>
      `,
    ).join('');
    const customPill = `
      <button type="button" class="date-pill${custom ? ' is-selected' : ''}" data-custom="1">직접 선택</button>
    `;
    const inputs = custom
      ? `
        <div class="date-inputs">
          <input type="date" class="date-from" value="${escapeHtml(state.dateFrom)}" aria-label="시작일" />
          <span class="date-sep">~</span>
          <input type="date" class="date-to" value="${escapeHtml(state.dateTo)}" aria-label="종료일" />
        </div>
      `
      : '';
    dateRangeSlotEl.innerHTML = `<div class="date-pills">${pills}${customPill}</div>${inputs}`;
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
    chatResult = null;
    dataFromLabelEl.textContent = currentProperty().label;
    modalPropLabelEl.textContent = currentProperty().label;
    syncTabs();
    renderSearch();
    renderList();
    renderSelectedEvents();
    syncComposeProgressive();
    renderMetrics();
    renderSegments();
    renderChatShell();
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

  // 이벤트 모달 열기/닫기
  dictOpenBtn.addEventListener('click', openEventModal);
  selectedEventsSlotEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('.ev-add-btn')) {
      openEventModal();
      return;
    }
    const removeBtn = target.closest<HTMLButtonElement>('.ev-chip-x');
    if (removeBtn) {
      const name = removeBtn.dataset.removeEvent;
      if (name) toggleEvent(name);
    }
  });

  eventModalEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('.event-modal-backdrop') ||
      target.closest('.event-modal-close') ||
      target.closest('.event-modal-done')
    ) {
      closeEventModal();
    }
  });

  chatSlotEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('.chat-parse-btn')) {
      handleChatParse();
      return;
    }
    if (target.closest('.chat-example-btn')) {
      const input = chatSlotEl.querySelector<HTMLTextAreaElement>('.chat-input');
      if (input) {
        input.value = CHAT_EXAMPLE;
        handleChatParse();
      }
      return;
    }
    if (target.closest('.chat-generate-btn')) {
      applyChatToState();
    }
  });

  chatSlotEl.addEventListener('change', (e) => {
    const sel = (e.target as HTMLElement).closest<HTMLSelectElement>('.chat-choice');
    if (!sel || !chatResult || chatResult.status !== 'parsed') return;
    if (sel.dataset.role === 'target') {
      chatResult.target.resolved = sel.value;
    } else if (sel.dataset.role === 'segment') {
      const seg = chatResult.segments[Number(sel.dataset.segIndex)];
      if (seg) seg.choice.resolved = sel.value;
    }
    renderChatResult();
  });

  chatSlotEl.addEventListener('keydown', (e) => {
    const ke = e as KeyboardEvent;
    if (
      ke.key === 'Enter' &&
      !ke.shiftKey &&
      (e.target as HTMLElement).classList.contains('chat-input')
    ) {
      e.preventDefault();
      handleChatParse();
    }
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

  dateRangeSlotEl.addEventListener('click', (e) => {
    const pill = (e.target as HTMLElement).closest<HTMLButtonElement>('.date-pill');
    if (!pill) return;
    if (pill.dataset.custom) {
      // "직접 선택" — 프리셋 해제하고 현재 범위를 그대로 둔 채 날짜 입력을 펼친다.
      state.datePreset = null;
      renderDateRange();
      onSelectionChanged();
      return;
    }
    const days = Number(pill.dataset.days) as 7 | 14 | 30;
    const range = presetRange(days);
    state.datePreset = days;
    state.dateFrom = range.from;
    state.dateTo = range.to;
    renderDateRange();
    onSelectionChanged();
  });

  dateRangeSlotEl.addEventListener('change', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('date-from')) {
      state.dateFrom = (target as HTMLInputElement).value;
      onSelectionChanged();
    } else if (target.classList.contains('date-to')) {
      state.dateTo = (target as HTMLInputElement).value;
      onSelectionChanged();
    }
  });

  function toggleEvent(name: string): void {
    const selected = state.selectedEvents[state.property];
    if (selected.has(name)) selected.delete(name);
    else selected.add(name);
    renderList();
    renderSelectedEvents();
    syncComposeProgressive();
    refreshAfterSelectionChange();
    onSelectionChanged();
  }

  listEl.addEventListener('click', (e) => {
    // ⓘ 사전(details)은 선택 토글에서 제외한다.
    if ((e.target as HTMLElement).closest('.event-dict')) return;
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.event-row');
    if (!btn) return;
    const name = btn.dataset.event;
    if (name) toggleEvent(name);
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

  renderDateRange();
  renderSearch();
  renderList();
  renderSelectedEvents();
  renderSegments();
  renderChatShell();
  renderDims();
  renderColumns();
  renderMetrics();
  renderFilters();
  renderPreview();
  renderSql();
  syncModeVisibility();
  syncComposeProgressive();
  syncInputMode();
}

function shellHtml(catalog: Catalog): string {
  const properties = catalog.properties;
  const propertyKeys = Object.keys(properties) as PropertyKey[];

  return `
    <div class="workbench">
      <header class="top-bar">
        <span class="wb-brand">BQ 쿼리 빌더</span>
        <div class="input-mode-seg" role="tablist" aria-label="카테고리">
          <button type="button" class="input-mode-btn${state.inputMode === 'chat' ? ' is-active' : ''}"
            role="tab" aria-selected="${state.inputMode === 'chat'}" data-input-mode="chat">${messageIcon}<span>대화형</span></button>
          <button type="button" class="input-mode-btn${state.inputMode === 'select' ? ' is-active' : ''}"
            role="tab" aria-selected="${state.inputMode === 'select'}" data-input-mode="select">${slidersIcon}<span>셀렉형</span></button>
        </div>
        <div class="top-right">
          <span class="data-label">찾을 데이터</span>
          <nav class="property-tabs" role="tablist" aria-label="찾을 데이터">
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
          <button type="button" class="dict-open-btn">${bookIcon}<span>이벤트 사전</span></button>
        </div>
      </header>

      <div class="wb-body2">
        <section class="wb-compose">
          <div class="input-panel-chat is-hidden">
            <div class="chat-slot"></div>
          </div>

          <div class="input-panel-select">
            <p class="compose-head">이 문장을 채우면 SQL이 됩니다</p>

            <p class="compose-from"><b class="data-from-label">${escapeHtml(properties[state.property].label)}</b> 데이터에서,</p>

            <div class="compose-line">
              <span class="compose-lead">기간</span>
              <div class="date-range-slot"></div>
            </div>

            <div class="compose-line">
              <span class="compose-lead">이벤트</span>
              <div class="selected-events-slot"></div>
            </div>

            <div class="compose-rest">
              <div class="compose-line">
                <span class="compose-lead">조건 <span class="lead-sub">(선택)</span></span>
                <div class="filter-slot"></div>
              </div>

              <div class="compose-line">
                <div class="output-head">
                  <span class="compose-lead">어떻게 볼지</span>
                  <div class="mode-toggle" role="tablist" aria-label="모드">
                    <button type="button" class="mode-btn${state.mode === 'aggregate' ? ' is-active' : ''}"
                      role="tab" aria-selected="${state.mode === 'aggregate'}" data-mode="aggregate">집계</button>
                    <button type="button" class="mode-btn${state.mode === 'detail' ? ' is-active' : ''}"
                      role="tab" aria-selected="${state.mode === 'detail'}" data-mode="detail">상세</button>
                  </div>
                </div>
                <div class="dim-section${state.mode === 'detail' ? ' is-hidden' : ''}">
                  <h3 class="sub-title">행 (그룹)</h3>
                  <div class="dim-groups"></div>
                </div>
                <div class="metric-section${state.mode === 'detail' ? ' is-hidden' : ''}">
                  <h3 class="sub-title">값 (지표)</h3>
                  <div class="chip-group metric-group"></div>
                </div>
                <div class="column-section${state.mode === 'aggregate' ? ' is-hidden' : ''}">
                  <h3 class="sub-title">포함할 컬럼</h3>
                  <div class="column-groups"></div>
                </div>
              </div>

              <div class="compose-line">
                <span class="compose-lead">사람 조건 <span class="lead-sub">(고급·선택)</span></span>
                <div class="segment-slot"></div>
              </div>
            </div>
          </div>
        </section>

        <section class="wb-output">
          <div class="panel preview-section">
            <h2 class="panel-title">구조 미리보기</h2>
            <div class="preview-slot"></div>
          </div>
          <div class="panel sql-section">
            <h2 class="panel-title">SQL</h2>
            <div class="sql-slot"></div>
          </div>
        </section>
      </div>

      <div class="event-modal is-hidden" role="dialog" aria-modal="true" aria-label="이벤트 고르기">
        <div class="event-modal-backdrop"></div>
        <div class="event-modal-card">
          <div class="event-modal-head">
            <span class="event-modal-title">${bookIcon}<span>이벤트 고르기 · <b class="modal-prop-label">${escapeHtml(properties[state.property].label)}</b></span></span>
            <button type="button" class="event-modal-close" aria-label="닫기">✕</button>
          </div>
          <div class="event-search-slot"></div>
          <div class="event-list"></div>
          <div class="event-modal-foot">
            <button type="button" class="event-modal-done">완료</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
