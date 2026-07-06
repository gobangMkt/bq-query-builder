import type { Catalog } from '../data/catalog-types';
import { generateAggregateSql, generateWideSql } from '../sql/generate';
import type { AppMode, DimensionSelection, FilterOperator, MetricType, RatioFormat } from '../sql/types';
import { DETAIL_LIMIT_VALUE, RATIO_DECIMALS_MAX, state } from '../state';
import type { InputMode, PropertyKey } from '../state';
import { renderColumnsHtml } from './columns';
import { dimensionKey, parseDimensionKey } from '../utils/dimension-key';
import { presetRange } from '../utils/format';
import { escapeHtml } from '../utils/html';
import { unionParamsForEvents } from '../utils/params';
import { renderDimensionsHtml } from './dimensions';
import {
  filterEvents,
  funnelKey,
  renderEventDetailHtml,
  renderEventListHtml,
  renderSearchHtml,
} from './events-list';
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
import { renderMetricsHtml, renderRatioHtml, type RatioEventOption } from './metrics';
import { renderAiPreviewHtml, renderPreviewHtml, renderWidePreviewHtml } from './preview';
import { defaultSegmentFor, renderSegmentsHtml } from './segments';
import {
  renderChatBudgetHtml,
  renderChatResultHtml,
  renderChatShellHtml,
  renderChatSqlPanelHtml,
  renderMentionItemsHtml,
  type ChatView,
} from './chat';
import { parseQuery, type ParseResult } from '../nl/parse';
import { callProxy, fetchBudget, type ProxyBudget, type ProxyHistoryItem } from '../nl/proxy';
import { extractSelectColumns } from '../nl/sql-columns';
import { buildSelectionFromState, buildWideSelectionFromState, renderSqlSectionHtml } from './sql-output';

const PRESETS: Array<{ days: number; label: string }> = [
  { days: 7, label: '7일' },
  { days: 30, label: '30일' },
  { days: 90, label: '90일' },
];

// 완성 문장(미리보기 상단)용 라벨.
const METRIC_SENTENCE_LABEL: Record<MetricType, string> = {
  event_count: '이벤트수',
  unique_users: '고유사용자수',
  unique_sessions: '고유세션수',
};

function dimensionSentenceLabel(dim: DimensionSelection): string {
  switch (dim.kind) {
    case 'event_date':
      return '날짜';
    case 'event_name':
      return '이벤트명';
    case 'traffic_source':
      return `유입 ${dim.field}`;
    case 'branch_type':
      return '지점유형';
    case 'param':
      return dim.key;
  }
}

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
  const ratioSlotEl = root.querySelector<HTMLElement>('.ratio-slot')!;
  const columnGroupsEl = root.querySelector<HTMLElement>('.column-groups')!;
  const dimSectionEl = root.querySelector<HTMLElement>('.dim-section')!;
  const metricSectionEl = root.querySelector<HTMLElement>('.metric-section')!;
  const columnSectionEl = root.querySelector<HTMLElement>('.column-section')!;
  const filterSlotEl = root.querySelector<HTMLElement>('.filter-slot')!;
  const previewSlotEl = root.querySelector<HTMLElement>('.preview-slot')!;
  const previewSentenceSlotEl = root.querySelector<HTMLElement>('.preview-sentence-slot')!;
  const dateLeadEl = root.querySelector<HTMLElement>('.compose-lead[data-lead="date"]')!;
  const eventLeadEl = root.querySelector<HTMLElement>('.compose-lead[data-lead="event"]')!;
  const sqlSlotEl = root.querySelector<HTMLElement>('.sql-slot')!;
  const composeRestEl = root.querySelector<HTMLElement>('.compose-rest')!;
  const selectedEventsSlotEl = root.querySelector<HTMLElement>('.selected-events-slot')!;
  const eventModalEl = root.querySelector<HTMLElement>('.event-modal')!;
  const eventDetailSlotEl = root.querySelector<HTMLElement>('.event-detail-slot')!;
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

  // 모달 우측 상세 pane에 표시 중인 이벤트(호버/클릭으로 갱신). null이면 빈 상태.
  let detailEventName: string | null = null;

  function renderList(): void {
    listEl.innerHTML = renderEventListHtml(currentProperty());
  }

  function renderEventDetail(): void {
    eventDetailSlotEl.innerHTML = renderEventDetailHtml(currentProperty(), detailEventName);
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

  function ratioEventOptions(): RatioEventOption[] {
    return currentEventNames().map((name) => ({ name, label: eventSentenceLabel(name) }));
  }

  function renderRatio(): void {
    ratioSlotEl.innerHTML = renderRatioHtml(ratioEventOptions(), state.ratio[state.property]);
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
    renderEventDetail();
    const input = searchSlot.querySelector<HTMLInputElement>('.event-search');
    input?.focus();
  }

  function closeEventModal(): void {
    eventModalEl.classList.add('is-hidden');
  }

  // ----- 대화형 -----
  // 폴백(규칙파서) 결과. 프록시 실패 시에만 채워진다.
  let chatResult: ParseResult | null = null;
  // 대화형 결과 뷰(로딩/SQL/폴백/에러). 기본 idle.
  let chatView: ChatView = { kind: 'idle' };
  // S4: 후속 질문 맥락(직전 질문·SQL). 프로퍼티 전환 시 비운다.
  const chatHistory: ProxyHistoryItem[] = [];
  const CHAT_EXAMPLE = '지난 한 주 동안 배너 종류별 클릭율(CTR)을 날짜순으로';
  // 이번 달 AI 사용액/한도(대화형 상단 상시 표시). 초기 GET + 매 응답마다 갱신. 미조회면 null.
  let chatBudget: ProxyBudget | null = null;

  // ----- 대화형 @멘션 -----
  type MentionItem = { name: string; label: string };
  let mentionItems: MentionItem[] = [];
  let mentionActive = 0;
  let mentionStart = -1; // textarea value 안 '@'의 위치. -1이면 닫힘.

  function chatInputEl(): HTMLTextAreaElement | null {
    return chatSlotEl.querySelector<HTMLTextAreaElement>('.chat-input');
  }

  function mentionEl(): HTMLElement | null {
    return chatSlotEl.querySelector<HTMLElement>('.chat-mention');
  }

  function closeMention(): void {
    mentionStart = -1;
    mentionItems = [];
    mentionActive = 0;
    const el = mentionEl();
    if (el) el.classList.add('is-hidden');
  }

  function renderMention(): void {
    const el = mentionEl();
    if (!el) return;
    el.innerHTML = renderMentionItemsHtml(mentionItems, mentionActive);
    el.classList.remove('is-hidden');
  }

  // 캐럿 앞에서 공백/줄바꿈 없는 '@토큰'을 찾아 드롭다운을 갱신한다.
  function updateMention(): void {
    const input = chatInputEl();
    if (!input) return closeMention();
    const caret = input.selectionStart ?? input.value.length;
    const before = input.value.slice(0, caret);
    const at = before.lastIndexOf('@');
    if (at === -1 || /[\s\n]/.test(before.slice(at + 1))) return closeMention();

    const query = before.slice(at + 1).toLowerCase();
    const events = currentProperty().events;
    const matched = events.filter(
      (ev) => ev.label.toLowerCase().includes(query) || ev.name.toLowerCase().includes(query),
    );
    mentionItems = matched.slice(0, 8).map((ev) => ({ name: ev.name, label: ev.label }));
    mentionStart = at;
    mentionActive = 0;
    renderMention();
  }

  // 선택한 이벤트의 라벨을 '@토큰' 자리에 끼워넣는다(파서 사전이 라벨→이벤트로 해석).
  function insertMention(name: string): void {
    const input = chatInputEl();
    if (!input || mentionStart < 0) return;
    const ev = currentProperty().events.find((e) => e.name === name);
    if (!ev) return;
    const caret = input.selectionStart ?? input.value.length;
    const insert = `${ev.label} `;
    input.value = input.value.slice(0, mentionStart) + insert + input.value.slice(caret);
    const pos = mentionStart + insert.length;
    closeMention();
    input.focus();
    input.setSelectionRange(pos, pos);
  }

  function renderChatShell(): void {
    chatSlotEl.innerHTML = renderChatShellHtml();
    closeMention();
    renderChatBudget();
    renderChatResult();
  }

  function renderChatBudget(): void {
    const slot = chatSlotEl.querySelector<HTMLElement>('.chat-budget-slot');
    if (slot) slot.innerHTML = renderChatBudgetHtml(chatBudget);
  }

  function renderChatResult(): void {
    const resultEl = chatSlotEl.querySelector<HTMLElement>('.chat-result');
    if (resultEl) resultEl.innerHTML = renderChatResultHtml(chatView, currentProperty());
  }

  // 대화형: 질문 → GAS 프록시(Gemini)로 SQL 생성. 실패 시 규칙파서 폴백.
  async function handleChatParse(): Promise<void> {
    const input = chatSlotEl.querySelector<HTMLTextAreaElement>('.chat-input');
    if (!input) return;
    const question = input.value.trim();
    if (!question) return;

    chatView = { kind: 'loading' };
    chatResult = null;
    renderChatResult();
    renderPreview();
    renderSql();

    const res = await callProxy({ question, property: currentProperty(), history: chatHistory });
    // 성공·실패·예산초과 어느 경우든 budget이 실려오면 상단 사용량 바를 갱신한다.
    if (res.budget) {
      chatBudget = res.budget;
      renderChatBudget();
    }
    if (res.ok) {
      // SQL은 받아두되 바로 노출하지 않는다 — 구조 미리보기 확인 후 버튼으로 공개(추가 호출 없음).
      chatView = {
        kind: 'confirm',
        explanation: res.explanation,
        sql: res.sql,
        corrected: res.corrected,
        cached: Boolean(res.cached),
        columns: extractSelectColumns(res.sql),
      };
      chatHistory.push({ question, sql: res.sql });
    } else if (res.budgetExceeded) {
      chatView = { kind: 'error', message: res.error, budgetExceeded: true };
    } else {
      // 프록시 실패/미배포 → 규칙파서로 폴백(해석 칩 UX).
      chatResult = parseQuery(question, currentProperty());
      chatView = { kind: 'fallback', result: chatResult, notice: res.error };
    }
    renderChatResult();
    renderPreview();
    renderSql();
  }

  function handleChatCopy(btn: HTMLButtonElement): void {
    if (chatView.kind !== 'sql' || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(chatView.sql)
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
        // 클립보드 실패는 조용히 무시.
      });
  }

  // 대화형 해석 결과를 셀렉형과 동일한 state로 변환하고 SQL을 생성한다(집계 전용).
  function applyChatToState(): void {
    if (!chatResult || chatResult.status !== 'parsed') return;
    const r = chatResult;
    if (r.target.resolved === null || r.segments.some((s) => s.choice.resolved === null)) return;

    const range = presetRange(r.period.days);
    state.mode = 'aggregate';
    // 해석된 기간이 프리셋 버튼(7/30/90)과 같으면 해당 버튼이 강조된다.
    state.datePreset = PRESETS.some((p) => p.days === r.period.days) ? r.period.days : null;
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

  function eventSentenceLabel(name: string): string {
    const ev = currentProperty().events.find((e) => e.name === name);
    return ev && ev.label && ev.label !== name ? ev.label : name;
  }

  // 셀렉형 선택 상태를 자연어 한 문장으로 조립한다 — 미리보기 상단에 항상 표시.
  function composeStateSentence(): string {
    const parts: string[] = [`<b>${escapeHtml(currentProperty().label)}</b> 데이터에서,`];

    if (state.datePreset) {
      parts.push(`최근 <b>${state.datePreset}일</b> 동안,`);
    } else if (state.dateFrom && state.dateTo) {
      parts.push(`<b>${escapeHtml(state.dateFrom)} ~ ${escapeHtml(state.dateTo)}</b> 동안,`);
    } else {
      parts.push(`<span class="sentence-pending">기간을 정하고,</span>`);
    }

    const names = currentEventNames();
    if (names.length > 0) {
      parts.push(`<b>${escapeHtml(names.map(eventSentenceLabel).join('·'))}</b> 이벤트를,`);
    } else {
      parts.push(`<span class="sentence-pending">이벤트를 골라,</span>`);
    }

    const filterCount = state.filters[state.property].length;
    if (filterCount > 0) parts.push(`조건 <b>${filterCount}개</b>로 거른 것만,`);

    if (state.mode === 'detail') {
      const limitNote = state.detailLimitEnabled[state.property]
        ? ` (최대 ${DETAIL_LIMIT_VALUE}행)`
        : '';
      parts.push(`상세 행 그대로 본다${limitNote}.`);
    } else {
      const dims = state.dimensions[state.property].map(dimensionSentenceLabel);
      const mets = [...state.metrics[state.property]].map((m) => METRIC_SENTENCE_LABEL[m]);
      if (dims.length > 0) parts.push(`<b>${escapeHtml(dims.join('·'))}</b>별로 묶어`);

      const valuePhrases = [...mets];
      const ratio = state.ratio[state.property];
      if (ratio.enabled && ratio.numeratorEvent && ratio.denominatorEvent) {
        const fmt =
          ratio.format === 'percent' ? '%' : `소수 ${ratio.decimals}자리`;
        valuePhrases.push(
          `${eventSentenceLabel(ratio.numeratorEvent)} ÷ ${eventSentenceLabel(ratio.denominatorEvent)} 비율(${fmt})`,
        );
      }
      parts.push(
        valuePhrases.length > 0
          ? `<b>${escapeHtml(valuePhrases.join('·'))}</b>를 본다.`
          : `<span class="sentence-pending">지표를 골라 본다.</span>`,
      );
    }

    const segs = state.segments[state.property];
    if (segs.length > 0) {
      const segText = segs
        .map((s) => `${eventSentenceLabel(s.event)} ${s.did ? '한' : '안 한'}`)
        .join('·');
      parts.push(`(단, <b>${escapeHtml(segText)}</b> 사람만)`);
    }

    return parts.join(' ');
  }

  function renderSentence(): void {
    renderComposeLeads();
    // 대화형: AI 해석 문장을, 셀렉형: 선택 상태로 조립한 문장을 표시.
    if (state.inputMode === 'chat' && chatView.kind !== 'fallback') {
      previewSentenceSlotEl.innerHTML =
        chatView.kind === 'confirm' || chatView.kind === 'sql'
          ? `<p class="preview-sentence">“${escapeHtml(chatView.explanation)}”</p>`
          : '';
      return;
    }
    previewSentenceSlotEl.innerHTML = `<p class="preview-sentence">${composeStateSentence()}</p>`;
  }

  // B: 셀렉형 좌측 섹션 라벨을 선택값에 반응형으로 갱신한다 (예: "기간 동안," → "「7일」 기간 동안,").
  function renderComposeLeads(): void {
    let dateLead: string;
    if (state.datePreset) dateLead = `<b>최근 ${state.datePreset}일</b> 기간 동안,`;
    else if (state.dateFrom && state.dateTo)
      dateLead = `<b>${escapeHtml(state.dateFrom)} ~ ${escapeHtml(state.dateTo)}</b> 기간 동안,`;
    else dateLead = '기간 동안,';
    dateLeadEl.innerHTML = dateLead;

    const names = currentEventNames();
    eventLeadEl.innerHTML =
      names.length > 0
        ? `<b>${escapeHtml(names.map(eventSentenceLabel).join('·'))}</b> 이벤트를,`
        : '이벤트를,';
  }

  function renderPreview(): void {
    renderSentence();
    // 대화형 AI 결과가 있으면 그 SQL의 결과 컬럼으로 미리보기를 대체한다(확인 단계 포함).
    if (state.inputMode === 'chat' && (chatView.kind === 'confirm' || chatView.kind === 'sql')) {
      previewSlotEl.innerHTML = renderAiPreviewHtml(chatView.columns);
      return;
    }
    previewSlotEl.innerHTML =
      state.mode === 'detail'
        ? renderWidePreviewHtml(currentProperty(), [...state.detailColumns[state.property]])
        : renderPreviewHtml(currentProperty(), state.dimensions[state.property], [...state.metrics[state.property]]);
  }

  function renderSql(): void {
    // 대화형 모드에선 SQL 패널이 대화 결과를 표시한다(SQL은 항상 우측 한 곳).
    // 폴백(규칙파서) 경로만 셀렉형과 동일하게 state 기반 섹션을 쓴다.
    if (state.inputMode === 'chat' && chatView.kind !== 'fallback') {
      sqlSlotEl.innerHTML = renderChatSqlPanelHtml(chatView);
      return;
    }
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
    renderSentence();
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

    // 비율 분자/분모가 더 이상 선택 이벤트에 없으면 비운다.
    const selectedSet = new Set(eventNames);
    const ratio = state.ratio[state.property];
    if (ratio.numeratorEvent && !selectedSet.has(ratio.numeratorEvent)) ratio.numeratorEvent = null;
    if (ratio.denominatorEvent && !selectedSet.has(ratio.denominatorEvent)) ratio.denominatorEvent = null;
  }

  function refreshAfterSelectionChange(): void {
    pruneStaleSelections();
    renderDims();
    renderColumns();
    renderRatio();
    renderFilters();
    renderPreview();
  }

  // 기간 컨트롤: 시작/끝 날짜 입력을 상시 노출하고, 7/30/90 퀵셋으로 범위를 채운다.
  // 프리셋을 누르면 해당 범위로 채워지고, 사용자가 날짜를 직접 고치면 어떤 프리셋도 활성화되지 않는다.
  function renderDateRange(): void {
    const presets = PRESETS.map(
      (p) => `
        <button type="button" class="date-preset${state.datePreset === p.days ? ' is-selected' : ''}"
          data-days="${p.days}">${p.label}</button>
      `,
    ).join('');
    dateRangeSlotEl.innerHTML = `
      <div class="date-control">
        <div class="date-inputs">
          <input type="date" class="date-from" value="${escapeHtml(state.dateFrom)}" aria-label="시작일" />
          <span class="date-sep">~</span>
          <input type="date" class="date-to" value="${escapeHtml(state.dateTo)}" aria-label="종료일" />
        </div>
        <div class="date-presets" role="group" aria-label="빠른 기간 선택">
          <span class="date-presets-label">최근</span>
          ${presets}
        </div>
      </div>
    `;
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
    chatView = { kind: 'idle' };
    chatHistory.length = 0;
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
    // 대화형 AI 미리보기·SQL 패널 ↔ 셀렉형 상태 기반 렌더 전환.
    renderPreview();
    renderSql();
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
    const mentionBtn = target.closest<HTMLButtonElement>('.chat-mention-item');
    if (mentionBtn) {
      const name = mentionBtn.dataset.mentionName;
      if (name) insertMention(name);
      return;
    }
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
    if (target.closest('.chat-confirm-btn')) {
      // 구조가 맞다고 확인 → 받아둔 SQL을 우측 SQL 패널에 노출(프록시 재호출 없음).
      if (chatView.kind === 'confirm') {
        chatView = { ...chatView, kind: 'sql' };
        renderChatResult();
        renderSql();
      }
      return;
    }
    if (target.closest('.chat-generate-btn')) {
      applyChatToState();
    }
  });

  chatSlotEl.addEventListener('input', (e) => {
    if ((e.target as HTMLElement).classList.contains('chat-input')) updateMention();
  });

  // 드롭다운 바깥 클릭 시 닫기(멘션 항목/입력창 제외)
  document.addEventListener('click', (e) => {
    if (mentionStart < 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('.chat-mention') || t.closest('.chat-input')) return;
    closeMention();
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
    if (!(e.target as HTMLElement).classList.contains('chat-input')) return;

    // 멘션 드롭다운이 열려 있으면 방향키/Enter/Tab/Esc를 드롭다운 조작에 쓴다.
    if (mentionStart >= 0 && mentionItems.length > 0) {
      const len = mentionItems.length;
      if (ke.key === 'ArrowDown') {
        e.preventDefault();
        mentionActive = (mentionActive + 1) % len;
        renderMention();
        return;
      }
      if (ke.key === 'ArrowUp') {
        e.preventDefault();
        mentionActive = (mentionActive - 1 + len) % len;
        renderMention();
        return;
      }
      if (ke.key === 'Enter' || ke.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionItems[mentionActive].name);
        return;
      }
      if (ke.key === 'Escape') {
        e.preventDefault();
        closeMention();
        return;
      }
    }

    if (ke.key === 'Enter' && !ke.shiftKey) {
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
    const preset = (e.target as HTMLElement).closest<HTMLButtonElement>('.date-preset');
    if (!preset) return;
    const days = Number(preset.dataset.days);
    const range = presetRange(days);
    state.datePreset = days;
    state.dateFrom = range.from;
    state.dateTo = range.to;
    renderDateRange();
    onSelectionChanged();
  });

  dateRangeSlotEl.addEventListener('change', (e) => {
    const target = e.target as HTMLElement;
    // 날짜를 직접 고치면 프리셋 강조를 해제한다.
    if (target.classList.contains('date-from')) {
      state.dateFrom = (target as HTMLInputElement).value;
      state.datePreset = null;
      renderDateRange();
      onSelectionChanged();
    } else if (target.classList.contains('date-to')) {
      state.dateTo = (target as HTMLInputElement).value;
      state.datePreset = null;
      renderDateRange();
      onSelectionChanged();
    }
  });

  function toggleEvent(name: string): void {
    const selected = state.selectedEvents[state.property];
    if (selected.has(name)) selected.delete(name);
    else selected.add(name);
    renderList();
    renderEventDetail();
    renderSelectedEvents();
    syncComposeProgressive();
    refreshAfterSelectionChange();
    onSelectionChanged();
  }

  // 검색결과·퍼널 그룹 단위 일괄 추가/빼기. 여러 이벤트를 한 번에 처리하고 렌더는 1회만.
  function bulkToggleEvents(names: string[], add: boolean): void {
    if (names.length === 0) return;
    const selected = state.selectedEvents[state.property];
    for (const name of names) {
      if (add) selected.add(name);
      else selected.delete(name);
    }
    renderList();
    renderEventDetail();
    renderSelectedEvents();
    syncComposeProgressive();
    refreshAfterSelectionChange();
    onSelectionChanged();
  }

  // 리스트에서 이벤트를 클릭하면 선택 토글 + 우측 상세 pane 갱신. 일괄 버튼은 그보다 먼저 가로챈다.
  listEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const bulkBtn = target.closest<HTMLButtonElement>('[data-bulk-scope]');
    if (bulkBtn) {
      const add = bulkBtn.dataset.bulkAction === 'add';
      const filtered = filterEvents(currentProperty(), state.searchQuery.trim());
      const names =
        bulkBtn.dataset.bulkScope === 'group'
          ? filtered.filter((ev) => funnelKey(ev) === bulkBtn.dataset.bulkKey).map((ev) => ev.name)
          : filtered.map((ev) => ev.name);
      bulkToggleEvents(names, add);
      return;
    }
    const btn = target.closest<HTMLButtonElement>('.event-row');
    if (!btn) return;
    const name = btn.dataset.event;
    if (!name) return;
    detailEventName = name;
    toggleEvent(name);
  });

  // 호버 시 선택 없이 상세만 미리 보여준다.
  listEl.addEventListener('mouseover', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.event-row');
    if (!btn) return;
    const name = btn.dataset.event;
    if (!name || name === detailEventName) return;
    detailEventName = name;
    renderEventDetail();
  });

  // 상세 pane의 추가/빼기 버튼.
  eventDetailSlotEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.event-detail-toggle');
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

  // 비율 지표: 켜기 토글 / 분자·분모 select / 표시형식·소수점 변경.
  function commitRatioChange(rerenderBlock: boolean): void {
    if (rerenderBlock) renderRatio();
    renderPreview();
    onSelectionChanged();
  }

  ratioSlotEl.addEventListener('change', (e) => {
    const target = e.target as HTMLElement;
    const ratio = state.ratio[state.property];
    if (target.classList.contains('ratio-enable')) {
      ratio.enabled = (target as HTMLInputElement).checked;
      // 켤 때 분자·분모가 비어 있으면 선택 이벤트 앞 2개로 기본 채움.
      if (ratio.enabled) {
        const names = currentEventNames();
        if (!ratio.numeratorEvent && names[0]) ratio.numeratorEvent = names[0];
        if (!ratio.denominatorEvent && names[1]) ratio.denominatorEvent = names[1] ?? null;
      }
      commitRatioChange(true);
      return;
    }
    if (target.classList.contains('ratio-num')) {
      ratio.numeratorEvent = (target as HTMLSelectElement).value || null;
      commitRatioChange(false);
      return;
    }
    if (target.classList.contains('ratio-den')) {
      ratio.denominatorEvent = (target as HTMLSelectElement).value || null;
      commitRatioChange(false);
      return;
    }
    if (target.classList.contains('ratio-decimals')) {
      const v = Number((target as HTMLSelectElement).value);
      ratio.decimals = Number.isFinite(v) ? Math.max(0, Math.min(RATIO_DECIMALS_MAX, v)) : 0;
      commitRatioChange(false);
      return;
    }
  });

  ratioSlotEl.addEventListener('click', (e) => {
    const fmtBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('.ratio-fmt-btn');
    if (!fmtBtn) return;
    state.ratio[state.property].format = fmtBtn.dataset.fmt as RatioFormat;
    commitRatioChange(true);
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
    const chatCopyBtn = target.closest<HTMLButtonElement>('.chat-sql-copy-btn');
    if (chatCopyBtn) {
      handleChatCopy(chatCopyBtn);
      return;
    }
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

  // ----- 좌/우 패널 크기 조절 -----
  const bodyEl = root.querySelector<HTMLElement>('.wb-body2')!;
  const composeEl = root.querySelector<HTMLElement>('.wb-compose')!;
  const resizerEl = root.querySelector<HTMLElement>('.wb-resizer')!;
  const COMPOSE_MIN = 360;
  const COMPOSE_STORE_KEY = 'bq-compose-width';

  function composeMax(): number {
    // 우측 미리보기에 최소 420px는 남긴다.
    return Math.max(COMPOSE_MIN, bodyEl.clientWidth - 420);
  }

  function applyComposeWidth(px: number): void {
    const w = Math.round(Math.min(composeMax(), Math.max(COMPOSE_MIN, px)));
    composeEl.style.width = `${w}px`;
    try {
      localStorage.setItem(COMPOSE_STORE_KEY, String(w));
    } catch {
      // 저장 실패는 무시(프라이빗 모드 등)
    }
  }

  // 데스크톱 2열일 때만 적용(좁은 화면은 세로 스택 → 폭 조절 무의미).
  function isSplitLayout(): boolean {
    return window.matchMedia('(min-width: 1025px)').matches;
  }

  function restoreComposeWidth(): void {
    if (!isSplitLayout()) {
      composeEl.style.width = '';
      return;
    }
    let saved = NaN;
    try {
      saved = Number(localStorage.getItem(COMPOSE_STORE_KEY));
    } catch {
      saved = NaN;
    }
    if (Number.isFinite(saved) && saved > 0) applyComposeWidth(saved);
  }

  let dragging = false;
  resizerEl.addEventListener('pointerdown', (e) => {
    if (!isSplitLayout()) return;
    dragging = true;
    resizerEl.setPointerCapture(e.pointerId);
    resizerEl.classList.add('is-dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  resizerEl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    applyComposeWidth(e.clientX - bodyEl.getBoundingClientRect().left);
  });
  const endDrag = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    try {
      resizerEl.releasePointerCapture(e.pointerId);
    } catch {
      // capture가 이미 해제된 경우 무시
    }
    resizerEl.classList.remove('is-dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };
  resizerEl.addEventListener('pointerup', endDrag);
  resizerEl.addEventListener('pointercancel', endDrag);

  resizerEl.addEventListener('keydown', (e) => {
    if (!isSplitLayout()) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = e.key === 'ArrowLeft' ? -24 : 24;
    applyComposeWidth(composeEl.getBoundingClientRect().width + step);
  });

  window.addEventListener('resize', restoreComposeWidth);
  restoreComposeWidth();

  renderDateRange();
  renderSearch();
  renderList();
  renderSelectedEvents();
  renderSegments();
  renderChatShell();
  renderDims();
  renderColumns();
  renderMetrics();
  renderRatio();
  renderFilters();
  renderPreview();
  renderSql();
  syncModeVisibility();
  syncComposeProgressive();
  syncInputMode();

  // 대화형 상단 사용량 바 초기값: 질문 없이 현재 이번 달 사용액을 GET으로 조회한다.
  void fetchBudget().then((budget) => {
    if (budget) {
      chatBudget = budget;
      renderChatBudget();
    }
  });
}

function shellHtml(catalog: Catalog): string {
  const properties = catalog.properties;
  const propertyKeys = Object.keys(properties) as PropertyKey[];

  return `
    <div class="workbench">
      <header class="top-bar">
        <span class="wb-brand">BQ 쿼리 빌더</span>
        <button type="button" class="dict-open-btn">${bookIcon}<span>이벤트 사전</span></button>
      </header>

      <div class="wb-body2">
        <section class="wb-compose">
          <div class="input-mode-seg" role="tablist" aria-label="입력 방식">
            <button type="button" class="input-mode-btn${state.inputMode === 'chat' ? ' is-active' : ''}"
              role="tab" aria-selected="${state.inputMode === 'chat'}" data-input-mode="chat">${messageIcon}<span>대화형</span></button>
            <button type="button" class="input-mode-btn${state.inputMode === 'select' ? ' is-active' : ''}"
              role="tab" aria-selected="${state.inputMode === 'select'}" data-input-mode="select">${slidersIcon}<span>셀렉형</span></button>
          </div>

          <div class="property-group">
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
          </div>

          <div class="input-panel-chat is-hidden">
            <div class="chat-slot"></div>
          </div>

          <div class="input-panel-select">
            <p class="compose-head">이 문장을 채우면 SQL이 됩니다</p>

            <p class="compose-from"><b class="data-from-label">${escapeHtml(properties[state.property].label)}</b> 데이터에서,</p>

            <div class="compose-line">
              <span class="compose-lead" data-lead="date">기간 동안,</span>
              <div class="date-range-slot"></div>
            </div>

            <div class="compose-line">
              <span class="compose-lead" data-lead="event">이벤트를,</span>
              <div class="selected-events-slot"></div>
            </div>

            <div class="compose-rest">
              <div class="compose-line">
                <span class="compose-lead">조건인 것만 골라, <span class="lead-sub">(선택)</span></span>
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
                  <h3 class="sub-title">~별로 묶어 <span class="lead-sub">(행)</span></h3>
                  <div class="dim-groups"></div>
                </div>
                <div class="metric-section${state.mode === 'detail' ? ' is-hidden' : ''}">
                  <h3 class="sub-title">~을 본다 <span class="lead-sub">(값)</span></h3>
                  <div class="chip-group metric-group"></div>
                  <div class="ratio-slot"></div>
                </div>
                <div class="column-section${state.mode === 'aggregate' ? ' is-hidden' : ''}">
                  <h3 class="sub-title">포함할 컬럼</h3>
                  <div class="column-groups"></div>
                </div>
              </div>

              <div class="compose-line">
                <span class="compose-lead">단, ~한 사람만 <span class="lead-sub">(고급·선택)</span></span>
                <div class="segment-slot"></div>
              </div>
            </div>
          </div>
        </section>

        <div class="wb-resizer" role="separator" aria-orientation="vertical"
          aria-label="패널 크기 조절" tabindex="0"><span class="wb-resizer-grip"></span></div>

        <section class="wb-output">
          <div class="panel preview-section">
            <h2 class="panel-title">구조 미리보기</h2>
            <div class="preview-sentence-slot"></div>
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
          <div class="event-modal-body">
            <div class="event-modal-list-pane">
              <div class="event-search-slot"></div>
              <div class="event-list"></div>
            </div>
            <div class="event-modal-detail-pane">
              <div class="event-detail-slot"></div>
            </div>
          </div>
          <div class="event-modal-foot">
            <button type="button" class="event-modal-done">완료</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
