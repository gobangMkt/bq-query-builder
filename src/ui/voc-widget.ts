// VoC 위젯 — 상단 바에 '의견 보내기' 버튼 + 모달 + 제출 토스트를 심는다.
// self-contained: mountVocWidget(root) 한 번 호출하면 버튼·모달·배선이 모두 붙는다.

import { submitVoc, VOC_CATEGORIES } from '../voc/voc';
import { alertTriangleIcon, checkIcon, messageIcon } from './icons';
import { escapeHtml } from '../utils/html';

export function mountVocWidget(root: HTMLElement): void {
  const topBar = root.querySelector<HTMLElement>('.top-bar');
  if (!topBar) return;

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'voc-open-btn';
  openBtn.innerHTML = `${messageIcon}<span>의견 보내기</span>`;
  topBar.appendChild(openBtn);

  const modal = document.createElement('div');
  modal.className = 'voc-modal is-hidden';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', '의견 보내기');
  modal.innerHTML = modalHtml();
  root.appendChild(modal);

  const messageEl = modal.querySelector<HTMLTextAreaElement>('.voc-message')!;
  const categoryEl = modal.querySelector<HTMLSelectElement>('.voc-category')!;
  const phoneEl = modal.querySelector<HTMLInputElement>('.voc-phone')!;
  const submitBtn = modal.querySelector<HTMLButtonElement>('.voc-submit')!;
  const form = modal.querySelector<HTMLFormElement>('.voc-form')!;

  const open = (): void => {
    modal.classList.remove('is-hidden');
    messageEl.focus();
  };
  const close = (): void => {
    modal.classList.add('is-hidden');
  };

  openBtn.addEventListener('click', open);
  modal.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('.voc-backdrop') || t.closest('.voc-close') || t.closest('.voc-cancel')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('is-hidden')) close();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = messageEl.value.trim();
    if (!message) {
      messageEl.focus();
      return;
    }

    const original = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="voc-spinner" aria-hidden="true"></span><span>보내는 중…</span>`;
    try {
      const res = await submitVoc({
        message,
        category: categoryEl.value,
        phone: phoneEl.value.trim(),
      });
      if (res && res.ok) {
        messageEl.value = '';
        phoneEl.value = '';
        close();
        toast('접수되었습니다. 감사합니다!', true);
      } else {
        toast('잠시 후 다시 시도해주세요.', false);
      }
    } catch {
      toast('잠시 후 다시 시도해주세요.', false);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = original;
    }
  });
}

function modalHtml(): string {
  const options = VOC_CATEGORIES.map(
    (c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`,
  ).join('');
  return `
    <div class="voc-backdrop"></div>
    <div class="voc-card">
      <div class="voc-head">
        <span class="voc-title">${messageIcon}<span>의견 보내기</span></span>
        <button type="button" class="voc-close" aria-label="닫기">✕</button>
      </div>
      <form class="voc-form">
        <label class="voc-field">
          <span class="voc-flabel">무엇을 알려주시겠어요?</span>
          <textarea class="voc-message" rows="4"
            placeholder="불편한 점, 오류, 개선 아이디어를 자유롭게 적어주세요." required></textarea>
        </label>
        <label class="voc-field">
          <span class="voc-flabel">분류</span>
          <select class="voc-category">${options}</select>
        </label>
        <label class="voc-field">
          <span class="voc-flabel">연락처 <span class="voc-optional">(선택 · 답변이 필요할 때만)</span></span>
          <input type="text" class="voc-phone" placeholder="010-0000-0000" />
        </label>
        <div class="voc-actions">
          <button type="button" class="voc-cancel">취소</button>
          <button type="submit" class="voc-submit">보내기</button>
        </div>
      </form>
    </div>
  `;
}

function toast(message: string, ok: boolean): void {
  const el = document.createElement('div');
  el.className = `voc-toast ${ok ? 'is-ok' : 'is-error'}`;
  el.innerHTML = `${ok ? checkIcon : alertTriangleIcon}<span>${escapeHtml(message)}</span>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-shown'));
  setTimeout(() => {
    el.classList.remove('is-shown');
    setTimeout(() => el.remove(), 300);
  }, 3000);
}
