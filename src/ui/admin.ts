import { ADMIN_KEY, ADMIN_STORAGE_KEY, NOTION_TAXONOMY_URLS } from '../config';
import type { PropertyKey } from '../config';
import type { Catalog } from '../data/catalog-types';
import { buildVerifyQuery } from '../admin/verify-query';
import { buildHandoffText } from '../admin/handoff';
import { lockIcon, alertCircleIcon } from './icons';

export function renderAdminGate(root: HTMLElement, onSuccess: () => void): void {
  root.innerHTML = `
    <div class="gate-screen">
      <form class="gate-card" novalidate>
        <div class="gate-icon">${lockIcon}</div>
        <h1 class="gate-title">관리자</h1>
        <p class="gate-desc">관리자 비밀번호를 입력하세요.</p>
        <input class="gate-input" type="password" autocomplete="off" placeholder="관리자 비밀번호" />
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
    if (input.value === ADMIN_KEY) {
      sessionStorage.setItem(ADMIN_STORAGE_KEY, '1');
      onSuccess();
      return;
    }
    error.innerHTML = `${alertCircleIcon}<span>비밀번호가 일치하지 않습니다.</span>`;
    error.hidden = false;
    input.value = '';
    input.focus();
  });
}

const PROPERTY_KEYS: PropertyKey[] = ['gobang', 'uceo'];

export function renderAdminPanel(root: HTMLElement, catalog: Catalog): void {
  const today = new Date();
  const toIso = (d: Date): string => d.toISOString().slice(0, 10);
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  root.innerHTML = `
    <div class="admin-screen">
      <header class="admin-head">
        <h1>관리자 · 카탈로그 동기화 핸드오프</h1>
        <p class="admin-sub">노션 택소노미 + BQ 실측을 Claude 세션에 넘길 텍스트를 만듭니다. 실제 반영은 배포 경유.</p>
      </header>

      <section class="admin-step">
        <h2>1. 프로퍼티</h2>
        <select class="admin-prop">
          ${PROPERTY_KEYS.map(
            (k) =>
              `<option value="${k}">${catalog.properties[k].label} (${catalog.properties[k].datasetId})</option>`,
          ).join('')}
        </select>
        <p class="admin-notion">노션 택소노미: <a class="admin-notion-link" href="#" target="_blank" rel="noreferrer"></a></p>
      </section>

      <section class="admin-step">
        <h2>2. BQ 검증쿼리</h2>
        <div class="admin-dates">
          <label>시작 <input type="date" class="admin-start" value="${toIso(monthAgo)}" /></label>
          <label>끝 <input type="date" class="admin-end" value="${toIso(today)}" /></label>
        </div>
        <textarea class="admin-query" rows="10" readonly></textarea>
        <button class="admin-copy-query" type="button">검증쿼리 복사</button>
        <span class="admin-copy-query-ok" hidden>복사됨</span>
      </section>

      <section class="admin-step">
        <h2>3. 결과 붙여넣기 → 핸드오프</h2>
        <textarea class="admin-result" rows="8" placeholder="BQ 실행 결과(JSON/NDJSON)를 붙여넣으세요"></textarea>
        <button class="admin-copy-handoff" type="button" disabled>Claude 핸드오프 텍스트 복사</button>
        <span class="admin-copy-handoff-ok" hidden>복사됨</span>
      </section>
    </div>
  `;

  const propSel = root.querySelector<HTMLSelectElement>('.admin-prop')!;
  const notionLink = root.querySelector<HTMLAnchorElement>('.admin-notion-link')!;
  const startInput = root.querySelector<HTMLInputElement>('.admin-start')!;
  const endInput = root.querySelector<HTMLInputElement>('.admin-end')!;
  const queryArea = root.querySelector<HTMLTextAreaElement>('.admin-query')!;
  const copyQueryBtn = root.querySelector<HTMLButtonElement>('.admin-copy-query')!;
  const copyQueryOk = root.querySelector<HTMLSpanElement>('.admin-copy-query-ok')!;
  const resultArea = root.querySelector<HTMLTextAreaElement>('.admin-result')!;
  const copyHandoffBtn = root.querySelector<HTMLButtonElement>('.admin-copy-handoff')!;
  const copyHandoffOk = root.querySelector<HTMLSpanElement>('.admin-copy-handoff-ok')!;

  const currentKey = (): PropertyKey => propSel.value as PropertyKey;

  const refreshQuery = (): void => {
    const key = currentKey();
    notionLink.textContent = NOTION_TAXONOMY_URLS[key];
    notionLink.href = NOTION_TAXONOMY_URLS[key];
    queryArea.value = buildVerifyQuery(
      catalog.properties[key].datasetId,
      startInput.value,
      endInput.value,
    );
  };

  const refreshHandoffState = (): void => {
    copyHandoffBtn.disabled = resultArea.value.trim().length === 0;
  };

  const flash = (el: HTMLElement): void => {
    el.hidden = false;
    setTimeout(() => {
      el.hidden = true;
    }, 1500);
  };

  propSel.addEventListener('change', refreshQuery);
  startInput.addEventListener('change', refreshQuery);
  endInput.addEventListener('change', refreshQuery);
  resultArea.addEventListener('input', refreshHandoffState);

  copyQueryBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(queryArea.value).then(() => flash(copyQueryOk));
  });

  copyHandoffBtn.addEventListener('click', () => {
    const key = currentKey();
    const text = buildHandoffText({
      propertyKey: key,
      propertyLabel: catalog.properties[key].label,
      datasetId: catalog.properties[key].datasetId,
      notionUrl: NOTION_TAXONOMY_URLS[key],
      startDate: startInput.value,
      endDate: endInput.value,
      bqResult: resultArea.value.trim(),
    });
    navigator.clipboard.writeText(text).then(() => flash(copyHandoffOk));
  });

  refreshQuery();
  refreshHandoffState();
}
