// 도움말 허브 — 상단 바 '도움말' 버튼 + 모달(좌측 탭: 이용 방법 / BQ에서 실행하기 / 바로가기).
// self-contained: mountHelpWidget(root) 한 번 호출로 버튼·모달·배선이 모두 붙는다.

import { escapeHtml } from '../utils/html';
import { externalLinkIcon, helpCircleIcon } from './icons';
import {
  HELP_LINKS,
  HELP_TABS,
  RUN_CAUTION,
  RUN_STEPS,
  USAGE_INTRO,
  USAGE_ITEMS,
} from '../help/help-content';

export function mountHelpWidget(root: HTMLElement): void {
  // 상단 우측 그룹 맨 앞에 둔다 → [도움말][이벤트 사전][의견 보내기] 순서 고정.
  const actions =
    root.querySelector<HTMLElement>('.top-bar-actions') ??
    root.querySelector<HTMLElement>('.top-bar');
  if (!actions) return;

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'help-open-btn';
  openBtn.innerHTML = `${helpCircleIcon}<span>도움말</span>`;
  actions.insertBefore(openBtn, actions.firstChild);

  const modal = document.createElement('div');
  modal.className = 'help-modal is-hidden';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', '도움말');
  modal.innerHTML = modalHtml();
  root.appendChild(modal);

  let activeTab = HELP_TABS[0].id;
  const panel = modal.querySelector<HTMLElement>('.help-panel')!;
  const renderPanel = (): void => {
    panel.innerHTML = tabContentHtml(activeTab);
  };
  renderPanel();

  const open = (): void => {
    modal.classList.remove('is-hidden');
  };
  const close = (): void => {
    modal.classList.add('is-hidden');
  };

  openBtn.addEventListener('click', open);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('is-hidden')) close();
  });
  modal.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('.help-backdrop') || t.closest('.help-close')) {
      close();
      return;
    }
    const tabBtn = t.closest<HTMLButtonElement>('.help-tab');
    if (tabBtn && tabBtn.dataset.tab) {
      activeTab = tabBtn.dataset.tab;
      modal.querySelectorAll<HTMLButtonElement>('.help-tab').forEach((b) => {
        const on = b.dataset.tab === activeTab;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', String(on));
      });
      renderPanel();
    }
  });
}

function modalHtml(): string {
  const tabs = HELP_TABS.map(
    (t, i) => `
      <button type="button" class="help-tab${i === 0 ? ' is-active' : ''}"
        role="tab" aria-selected="${i === 0}" data-tab="${escapeHtml(t.id)}">${escapeHtml(t.label)}</button>`,
  ).join('');

  return `
    <div class="help-backdrop"></div>
    <div class="help-card">
      <div class="help-head">
        <span class="help-title">${helpCircleIcon}<span>도움말</span></span>
        <button type="button" class="help-close" aria-label="닫기">✕</button>
      </div>
      <div class="help-body">
        <nav class="help-tabs" role="tablist" aria-label="도움말 항목">${tabs}</nav>
        <div class="help-panel" role="tabpanel"></div>
      </div>
    </div>
  `;
}

function tabContentHtml(id: string): string {
  if (id === 'usage') return usageHtml();
  if (id === 'run') return runHtml();
  if (id === 'links') return linksHtml();
  return '';
}

function usageHtml(): string {
  const items = USAGE_ITEMS.map(
    (it) => `
      <li class="help-usage-item">
        <span class="help-usage-name">${escapeHtml(it.name)}</span>
        <span class="help-usage-desc">${escapeHtml(it.desc)}</span>
      </li>`,
  ).join('');
  return `
    <p class="help-intro">${USAGE_INTRO}</p>
    <ul class="help-usage-list">${items}</ul>
  `;
}

function runHtml(): string {
  const steps = RUN_STEPS.map(
    (s, i) => `
      <li class="help-step">
        <span class="help-step-num">${i + 1}</span>
        <div class="help-step-body">
          <span class="help-step-title">${escapeHtml(s.title)}</span>
          <span class="help-step-desc">${escapeHtml(s.desc)}</span>
          ${
            s.image
              ? `<img class="help-step-img" src="${escapeHtml(s.image)}" alt="${escapeHtml(s.imageAlt ?? s.title)}" />`
              : ''
          }
        </div>
      </li>`,
  ).join('');
  const bqLink = HELP_LINKS[0];
  return `
    <ol class="help-steps">${steps}</ol>
    <a class="help-cta" href="${escapeHtml(bqLink.href)}" target="_blank" rel="noopener noreferrer">
      ${externalLinkIcon}<span>BigQuery 콘솔 열기</span>
    </a>
    <p class="help-caution">⚠️ ${escapeHtml(RUN_CAUTION)}</p>
  `;
}

function linksHtml(): string {
  const links = HELP_LINKS.map(
    (l) => `
      <a class="help-link" href="${escapeHtml(l.href)}" target="_blank" rel="noopener noreferrer">
        ${externalLinkIcon}
        <span class="help-link-text">
          <span class="help-link-label">${escapeHtml(l.label)}</span>
          ${l.note ? `<span class="help-link-note">${escapeHtml(l.note)}</span>` : ''}
        </span>
      </a>`,
  ).join('');
  return `<div class="help-links">${links}</div>`;
}
