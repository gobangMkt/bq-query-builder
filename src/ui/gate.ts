import { ACCESS_KEY, AUTH_STORAGE_KEY } from '../config';
import { lockIcon, alertCircleIcon } from './icons';

export function renderGate(root: HTMLElement, onSuccess: () => void): void {
  root.innerHTML = `
    <div class="gate-screen">
      <form class="gate-card" novalidate>
        <div class="gate-icon">${lockIcon}</div>
        <h1 class="gate-title">BQ 쿼리 빌더</h1>
        <p class="gate-desc">비밀번호를 입력하세요.</p>
        <input class="gate-input" type="password" autocomplete="off" placeholder="비밀번호" />
        <button class="gate-submit" type="submit">입장</button>
        <p class="gate-error" hidden></p>
      </form>
    </div>
  `;

  const form = root.querySelector<HTMLFormElement>('.gate-card')!;
  const input = root.querySelector<HTMLInputElement>('.gate-input')!;
  const error = root.querySelector<HTMLParagraphElement>('.gate-error')!;

  input.focus();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value === ACCESS_KEY) {
      sessionStorage.setItem(AUTH_STORAGE_KEY, '1');
      onSuccess();
      return;
    }
    error.innerHTML = `${alertCircleIcon}<span>비밀번호가 일치하지 않습니다.</span>`;
    error.hidden = false;
    input.value = '';
    input.focus();
  });
}
