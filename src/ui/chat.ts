// 대화형 입력 UI 렌더링. 파서 결과를 해석 칩으로 보여준다. 상태 변경/배선은 builder.ts.

import type { CatalogProperty } from '../data/catalog-types';
import type { MetricType } from '../sql/types';
import type { EventChoice, ParseResult } from '../nl/parse';
import { escapeHtml } from '../utils/html';
import { alertTriangleIcon, arrowRightIcon, checkIcon } from './icons';

const METRIC_LABEL: Record<MetricType, string> = {
  event_count: '이벤트수',
  unique_users: '고유사용자수',
  unique_sessions: '고유세션수',
};

const EXAMPLE =
  '지난 한 주 동안, 찜 메모를 누른 사람 중 공고완독을 하지 않은 사람들이 발생시킨 조회수';

export function renderChatShellHtml(): string {
  return `
    <div class="chat">
      <label class="chat-label" for="chat-input">무엇이 궁금하세요?</label>
      <div class="chat-input-row">
        <textarea id="chat-input" class="chat-input" rows="3"
          placeholder="예: ${escapeHtml(EXAMPLE)}"></textarea>
        <button type="button" class="chat-parse-btn">${arrowRightIcon}<span>해석</span></button>
      </div>
      <button type="button" class="chat-example-btn">예시 문장 넣기</button>
      <div class="chat-result"></div>
    </div>
  `;
}

function eventLabel(property: CatalogProperty, name: string): string {
  const ev = property.events.find((e) => e.name === name);
  return ev && ev.label && ev.label !== name ? `${ev.label} · ${name}` : name;
}

function choiceControlHtml(
  property: CatalogProperty,
  choice: EventChoice,
  role: string,
  dataAttr: string,
): string {
  if (choice.resolved) {
    return `<span class="chat-chip is-confirmed">${checkIcon}<span>${escapeHtml(
      eventLabel(property, choice.resolved),
    )}</span></span>`;
  }
  const options = choice.candidates
    .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(eventLabel(property, c))}</option>`)
    .join('');
  return `
    <span class="chat-chip is-question">
      <span class="chat-chip-term">${escapeHtml(choice.term)}?</span>
      <select class="chat-choice" data-role="${role}" ${dataAttr}>
        <option value="" selected disabled>어떤 이벤트인가요</option>
        ${options}
      </select>
    </span>
  `;
}

export function renderChatResultHtml(result: ParseResult | null, property: CatalogProperty): string {
  if (!result) return '';

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

  const periodChip = `<span class="chat-chip is-confirmed">${checkIcon}<span>기간: ${escapeHtml(
    result.period.label,
  )}</span></span>`;

  const segChips = result.segments
    .map((seg, i) => {
      const didLabel = seg.did ? '한 사람' : '안 한 사람';
      const control = choiceControlHtml(property, seg.choice, 'segment', `data-seg-index="${i}"`);
      return `<div class="chat-chip-row"><span class="chat-chip-prefix">${escapeHtml(
        didLabel,
      )}:</span>${control}</div>`;
    })
    .join('');

  const targetControl = choiceControlHtml(property, result.target, 'target', '');
  const targetChip = `<div class="chat-chip-row"><span class="chat-chip-prefix">집계 대상 (${escapeHtml(
    METRIC_LABEL[result.metric],
  )}):</span>${targetControl}</div>`;

  const allResolved =
    result.target.resolved !== null && result.segments.every((s) => s.choice.resolved !== null);

  return `
    <div class="chat-interp">
      <p class="chat-interp-title">이렇게 이해했어요 — 노란 칩을 골라주세요</p>
      <div class="chat-chip-row">${periodChip}</div>
      ${segChips}
      ${targetChip}
      <button type="button" class="chat-generate-btn"${allResolved ? '' : ' disabled'}>이대로 SQL 생성</button>
      ${
        allResolved
          ? ''
          : '<p class="chat-generate-hint">노란 칩을 모두 확정하면 생성할 수 있어요.</p>'
      }
    </div>
  `;
}
