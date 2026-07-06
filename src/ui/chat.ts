// 대화형 입력 UI 렌더링.
// v6: 자연어 질문 → GAS 프록시(Gemini)로 SQL 생성. 결과는 ChatView 상태로 렌더한다.
// 프록시 실패 시 기존 규칙파서(parseQuery) 해석 칩으로 폴백. 상태 변경/배선은 builder.ts.

import type { CatalogProperty } from '../data/catalog-types';
import type { MetricType } from '../sql/types';
import type { EventChoice, ParseResult } from '../nl/parse';
import type { ProxyBudget } from '../nl/proxy';
import { escapeHtml } from '../utils/html';
import { highlightSql } from './sql-output';
import { alertTriangleIcon, arrowRightIcon, checkIcon, copyIcon } from './icons';

const METRIC_LABEL: Record<MetricType, string> = {
  event_count: '이벤트수',
  unique_users: '고유사용자수',
  unique_sessions: '고유세션수',
};

const EXAMPLE = '지난 한 주 동안 배너 종류별 클릭율(CTR)을 날짜순으로';

// 프록시가 돌려준 답변 한 건. confirm(구조 확인) → sql(노출)로 kind만 바뀌며 그대로 유지된다.
export interface ChatAnswer {
  explanation: string;
  sql: string;
  corrected: boolean;
  cached: boolean;
  // 최종 SELECT에서 추출한 결과 컬럼명(구조 미리보기용). 추정 실패 시 빈 배열.
  columns: string[];
}

// 대화형 결과 상태. builder.ts가 이 값을 만들어 renderChatResultHtml에 넘긴다.
// confirm: SQL은 받아뒀지만 숨긴 채 구조 미리보기 확인을 먼저 요청하는 단계.
export type ChatView =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | ({ kind: 'confirm' } & ChatAnswer)
  | ({ kind: 'sql' } & ChatAnswer)
  | { kind: 'fallback'; result: ParseResult; notice: string }
  | { kind: 'error'; message: string; budgetExceeded: boolean };

export function renderChatShellHtml(): string {
  return `
    <div class="chat">
      <div class="chat-budget-slot"></div>
      <label class="chat-label" for="chat-input">무엇이 궁금하세요?</label>
      <div class="chat-input-wrap">
        <div class="chat-input-row">
          <textarea id="chat-input" class="chat-input" rows="3"
            placeholder="예: ${escapeHtml(EXAMPLE)}"></textarea>
          <button type="button" class="chat-parse-btn">${arrowRightIcon}<span>해석하기</span></button>
        </div>
        <div class="chat-mention is-hidden" role="listbox" aria-label="이벤트 추천"></div>
      </div>
      <p class="chat-hint"><b>@</b>를 입력하면 이벤트를 골라 넣을 수 있어요. 만든 SQL은 BQ 콘솔에서 실행하세요.</p>
      <button type="button" class="chat-example-btn">예시 문장 넣기</button>
      <div class="chat-result"></div>
    </div>
  `;
}

// 대화형 상단 AI 사용량 바. 이번 달 누적 사용액 / 한도(₩900)를 진행바로 상시 표시한다.
// budget 미조회(null) 시엔 빈 문자열 — 자리만 두고 도착하면 채운다.
export function renderChatBudgetHtml(budget: ProxyBudget | null): string {
  if (!budget) return '';
  const cap = budget.capKrw > 0 ? budget.capKrw : 1;
  const spent = Math.max(0, budget.spentKrw);
  const pct = Math.min(100, Math.round((spent / cap) * 100));
  const level = pct >= 90 ? 'is-high' : pct >= 70 ? 'is-mid' : '';
  return `
    <div class="chat-budget-bar ${level}" role="group" aria-label="이번 달 AI 사용량">
      <div class="chat-budget-head">
        <span class="chat-budget-title">이번 달 AI 사용</span>
        <span class="chat-budget-amount">₩${spent.toLocaleString('ko-KR')} <span class="chat-budget-cap">/ ₩${budget.capKrw.toLocaleString('ko-KR')}</span></span>
      </div>
      <div class="chat-budget-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
        <div class="chat-budget-fill" style="width: ${pct}%"></div>
      </div>
    </div>
  `;
}

// @멘션 드롭다운 항목 렌더. 이벤트 라벨 + 이벤트명.
export function renderMentionItemsHtml(
  items: Array<{ name: string; label: string }>,
  activeIndex: number,
): string {
  if (items.length === 0) {
    return `<div class="chat-mention-empty">일치하는 이벤트가 없어요</div>`;
  }
  return items
    .map(
      (it, i) => `
        <button type="button" class="chat-mention-item${i === activeIndex ? ' is-active' : ''}"
          role="option" aria-selected="${i === activeIndex}" data-mention-name="${escapeHtml(it.name)}">
          <span class="chat-mention-label">${escapeHtml(it.label)}</span>
          <span class="chat-mention-name">${escapeHtml(it.name)}</span>
        </button>
      `,
    )
    .join('');
}

// ===== 결과 렌더 =====
export function renderChatResultHtml(view: ChatView, property: CatalogProperty): string {
  switch (view.kind) {
    case 'idle':
      return '';
    case 'loading':
      return `
        <div class="chat-loading">
          <span class="chat-spinner" aria-hidden="true"></span>
          <span>AI가 SQL을 작성 중…</span>
        </div>`;
    case 'confirm':
      return renderConfirmHtml(view);
    case 'sql':
      return renderSqlAnswerHtml(view);
    case 'error':
      return `
        <div class="chat-reject${view.budgetExceeded ? ' is-budget' : ''}">
          <p class="chat-reject-reason">${alertTriangleIcon}<span>${escapeHtml(view.message)}</span></p>
        </div>`;
    case 'fallback':
      return `
        <div class="chat-fallback-note">${alertTriangleIcon}<span>${escapeHtml(
          view.notice,
        )} 규칙 해석으로 대신 처리했어요.</span></div>
        ${renderParseInterpHtml(view.result, property)}`;
  }
}

// 확인 단계 — SQL은 감춘 채 해석·결과 컬럼만 보여주고, 맞을 때만 SQL을 노출한다.
function renderConfirmHtml(view: Extract<ChatView, { kind: 'confirm' }>): string {
  const correctedBadge = view.corrected
    ? `<span class="chat-answer-badge">자동 보정됨</span>`
    : '';
  const cachedBadge = view.cached ? `<span class="chat-answer-badge">캐시</span>` : '';
  const colChips =
    view.columns.length > 0
      ? `<div class="chat-confirm-cols">${view.columns
          .map((c) => `<span class="chat-answer-badge">${escapeHtml(c)}</span>`)
          .join('')}</div>`
      : '';
  const note =
    view.columns.length > 0
      ? '예상 결과 구조를 우측 <b>구조 미리보기</b>에서 확인하세요.'
      : '결과 컬럼을 추정하지 못했어요. 맞다면 아래 버튼으로 SQL을 확인해 주세요.';

  return `
    <div class="chat-answer chat-confirm">
      <p class="chat-answer-explain">${checkIcon}<span>${escapeHtml(view.explanation)}</span>${correctedBadge}${cachedBadge}</p>
      <p class="chat-confirm-note">${note}</p>
      ${colChips}
      <button type="button" class="chat-confirm-btn">맞아요, 이대로</button>
      <p class="chat-generate-hint">다르면 질문을 고쳐 다시 물어보세요.</p>
    </div>
  `;
}

// 확인 후 — SQL 본문은 우측 SQL 패널에 있으므로 여기는 안내만 남긴다.
function renderSqlAnswerHtml(view: Extract<ChatView, { kind: 'sql' }>): string {
  const correctedBadge = view.corrected
    ? `<span class="chat-answer-badge">자동 보정됨</span>`
    : '';
  const cachedBadge = view.cached ? `<span class="chat-answer-badge">캐시</span>` : '';

  return `
    <div class="chat-answer">
      <p class="chat-answer-explain">${checkIcon}<span>${escapeHtml(view.explanation)}</span>${correctedBadge}${cachedBadge}</p>
      <p class="chat-confirm-note">SQL이 우측 <b>SQL 패널</b>에 표시됐어요. 복사해서 BQ 콘솔에서 실행하세요.</p>
    </div>
  `;
}

// 우측 SQL 패널의 대화형 모드 렌더. 확인 전엔 안내, 확인 후엔 SQL 본문+복사.
export function renderChatSqlPanelHtml(view: ChatView): string {
  if (view.kind === 'sql') {
    return `
      <div class="sql-output">
        <div class="sql-code-wrap">
          <pre class="sql-code"><code>${highlightSql(view.sql)}</code></pre>
          <button type="button" class="chat-sql-copy-btn">${copyIcon}<span>복사</span></button>
        </div>
        <p class="sql-copy-hint">BQ 콘솔에 붙여넣어 실행하세요.</p>
      </div>
    `;
  }
  const hint =
    view.kind === 'confirm'
      ? '구조가 맞으면 좌측 "맞아요, 이대로"를 누르세요 — SQL이 여기에 표시됩니다.'
      : view.kind === 'loading'
        ? 'AI가 질문을 해석하는 중…'
        : '질문을 해석한 뒤 확인하면 여기에 SQL이 표시됩니다.';
  return `<p class="sql-chat-hint">${escapeHtml(hint)}</p>`;
}

// ===== 폴백: 규칙파서 해석 칩(기존 UX) =====
function eventLabel(property: CatalogProperty, name: string): string {
  const ev = property.events.find((e) => e.name === name);
  return ev && ev.label && ev.label !== name ? `${ev.label} · ${name}` : name;
}

function choiceValueHtml(
  property: CatalogProperty,
  choice: EventChoice,
  role: string,
  dataAttr: string,
): string {
  if (choice.resolved) {
    return `<span class="interp-value is-confirmed">${checkIcon}<span>${escapeHtml(
      eventLabel(property, choice.resolved),
    )}</span></span>`;
  }
  const options = choice.candidates
    .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(eventLabel(property, c))}</option>`)
    .join('');
  return `
    <span class="interp-value is-pending">
      <select class="chat-choice" data-role="${role}" ${dataAttr} aria-label="${escapeHtml(choice.term)} 이벤트 선택">
        <option value="" selected disabled>“${escapeHtml(choice.term)}” — 어떤 이벤트?</option>
        ${options}
      </select>
    </span>
  `;
}

function interpRowHtml(label: string, valueHtml: string): string {
  return `
    <div class="interp-row">
      <dt class="interp-label">${escapeHtml(label)}</dt>
      <dd class="interp-dd">${valueHtml}</dd>
    </div>
  `;
}

function renderParseInterpHtml(result: ParseResult, property: CatalogProperty): string {
  if (result.status === 'rejected') {
    return `
      <div class="chat-reject">
        <p class="chat-reject-reason">${alertTriangleIcon}<span>${escapeHtml(result.reason)}</span></p>
        <p class="chat-reject-suggestion">${escapeHtml(result.suggestion)}</p>
      </div>
    `;
  }

  if (result.status === 'unparsed') {
    return `<div class="chat-reject"><p class="chat-reject-reason">${alertTriangleIcon}<span>${escapeHtml(
      result.hint,
    )}</span></p></div>`;
  }

  const periodRow = interpRowHtml(
    '기간',
    `<span class="interp-value is-confirmed">${checkIcon}<span>${escapeHtml(result.period.label)}</span></span>`,
  );

  const segRows = result.segments
    .map((seg, i) => {
      const label = seg.did ? '한 사람' : '안 한 사람';
      const value = choiceValueHtml(property, seg.choice, 'segment', `data-seg-index="${i}"`);
      return interpRowHtml(label, value);
    })
    .join('');

  const targetRow = interpRowHtml(
    `집계 대상 · ${METRIC_LABEL[result.metric]}`,
    choiceValueHtml(property, result.target, 'target', ''),
  );

  const allResolved =
    result.target.resolved !== null && result.segments.every((s) => s.choice.resolved !== null);
  const pendingCount =
    (result.target.resolved === null ? 1 : 0) +
    result.segments.filter((s) => s.choice.resolved === null).length;

  const title = allResolved
    ? '이렇게 이해했어요'
    : `이렇게 이해했어요 — 확인할 항목 ${pendingCount}개`;

  return `
    <div class="chat-interp">
      <p class="chat-interp-title">${escapeHtml(title)}</p>
      <dl class="interp-list">
        ${periodRow}
        ${segRows}
        ${targetRow}
      </dl>
      <button type="button" class="chat-generate-btn"${allResolved ? '' : ' disabled'}>이대로 SQL 생성</button>
      ${
        allResolved
          ? ''
          : '<p class="chat-generate-hint">표시된 항목을 모두 고르면 생성할 수 있어요.</p>'
      }
    </div>
  `;
}
