import { ADMIN_KEY, ADMIN_STORAGE_KEY, NOTION_TAXONOMY_URLS } from '../config';
import type { PropertyKey } from '../config';
import type { Catalog } from '../data/catalog-types';
import { buildVerifyQuery } from '../admin/verify-query';
import { buildHandoffText } from '../admin/handoff';
import { lockIcon, alertCircleIcon, copyIcon, checkIcon, arrowRightIcon } from './icons';

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

// 핸드오프를 활성화하기 전 관리자가 밟아야 하는 프로세스 단계.
const CHECK_STEPS: Array<{ id: string; label: string }> = [
  { id: 'range', label: '프로퍼티와 기간을 정했다' },
  { id: 'run', label: '검증쿼리를 복사해 BQ 콘솔에서 실행했다' },
  { id: 'paste', label: '실행 결과를 아래에 붙여넣었다' },
];

export function renderAdminPanel(root: HTMLElement, catalog: Catalog): void {
  const today = new Date();
  const toIso = (d: Date): string => d.toISOString().slice(0, 10);
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const propOptions = PROPERTY_KEYS.map(
    (k) => `<option value="${k}">${catalog.properties[k].label} (${catalog.properties[k].datasetId})</option>`,
  ).join('');

  const checkItems = CHECK_STEPS.map(
    (s, i) => `
      <li class="admin-check-item">
        <label>
          <input type="checkbox" class="admin-check" data-step="${s.id}" />
          <span><b>${i + 1}.</b> ${s.label}</span>
        </label>
      </li>`,
  ).join('');

  root.innerHTML = `
    <div class="workbench admin-wb">
      <header class="top-bar">
        <span class="wb-brand">BQ 쿼리 빌더</span>
        <span class="admin-badge">관리자</span>
        <div class="top-bar-actions">
          <button type="button" class="dict-open-btn admin-back-btn">← 빌더로</button>
        </div>
      </header>

      <div class="admin-main">
        <p class="admin-lead">노션 택소노미 + BQ 실측을 Claude 세션에 넘길 텍스트를 만듭니다. 실제 반영은 빌드·배포 경유.</p>

        <section class="panel">
          <h2 class="panel-title">1. 프로퍼티 &amp; 기간</h2>
          <p class="panel-sub">
            <b>프로퍼티</b> = 어느 서비스 데이터를 동기화할지. 고르면 해당 BQ 데이터셋·노션 택소노미 URL이 자동 지정됩니다.
            <b>기간</b> = 아래 검증쿼리가 스캔할 날짜 범위(기본 최근 30일). <code>events_YYYYMMDD</code> 파티션 중 이 범위만 조회합니다.
          </p>
          <div class="admin-row">
            <select class="admin-prop">${propOptions}</select>
            <div class="date-inputs">
              <input type="date" class="admin-start" value="${toIso(monthAgo)}" aria-label="시작일" />
              <span class="date-sep">~</span>
              <input type="date" class="admin-end" value="${toIso(today)}" aria-label="종료일" />
            </div>
          </div>
          <p class="admin-notion">노션 택소노미: <a class="admin-notion-link" href="#" target="_blank" rel="noreferrer"></a></p>
        </section>

        <section class="panel">
          <h2 class="panel-title">2. BQ 검증쿼리</h2>
          <p class="panel-sub">
            선택한 기간에 <b>실제로 수집된 모든 이벤트·파라미터를 전수 집계</b>합니다(특정 이벤트만 거르지 않음).
            노션 택소노미(설계)와 실측을 대조하기 위한 인벤토리 조사용.
            컬럼: <code>event_name</code>(이벤트명) · <code>param_key</code>(파라미터) · <code>cnt</code>(등장 횟수) · <code>string/int/double_cnt</code>(값 타입 분포).
            복사해 BQ 콘솔에서 실행하세요 — 이 도구는 BQ를 실행하지 않습니다.
          </p>
          <textarea class="admin-query" rows="10" readonly></textarea>
          <div class="admin-actions">
            <button type="button" class="dict-open-btn admin-copy-query">${copyIcon}<span>검증쿼리 복사</span></button>
          </div>
        </section>

        <section class="panel">
          <h2 class="panel-title">3. 결과 붙여넣기 → 핸드오프</h2>
          <p class="panel-sub">아래 순서를 모두 체크하고 결과를 붙여넣어야 핸드오프가 활성화됩니다.</p>
          <ul class="admin-checklist">${checkItems}</ul>
          <textarea class="admin-result" rows="8" placeholder="BQ 실행 결과(JSON/NDJSON)를 붙여넣으세요"></textarea>
          <div class="admin-actions">
            <button type="button" class="dict-open-btn admin-copy-handoff" disabled>${arrowRightIcon}<span>Claude 핸드오프 텍스트 복사</span></button>
            <span class="admin-hint"></span>
          </div>
        </section>
      </div>
    </div>
  `;

  const backBtn = root.querySelector<HTMLButtonElement>('.admin-back-btn')!;
  const propSel = root.querySelector<HTMLSelectElement>('.admin-prop')!;
  const notionLink = root.querySelector<HTMLAnchorElement>('.admin-notion-link')!;
  const startInput = root.querySelector<HTMLInputElement>('.admin-start')!;
  const endInput = root.querySelector<HTMLInputElement>('.admin-end')!;
  const queryArea = root.querySelector<HTMLTextAreaElement>('.admin-query')!;
  const copyQueryBtn = root.querySelector<HTMLButtonElement>('.admin-copy-query')!;
  const resultArea = root.querySelector<HTMLTextAreaElement>('.admin-result')!;
  const copyHandoffBtn = root.querySelector<HTMLButtonElement>('.admin-copy-handoff')!;
  const hintEl = root.querySelector<HTMLElement>('.admin-hint')!;
  const checkboxes = [...root.querySelectorAll<HTMLInputElement>('.admin-check')];

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

  // 프로세스 게이트: 체크 3개 모두 + 결과 붙여넣음 → 핸드오프 활성.
  const refreshHandoffState = (): void => {
    const allChecked = checkboxes.every((c) => c.checked);
    const hasResult = resultArea.value.trim().length > 0;
    const ready = allChecked && hasResult;
    copyHandoffBtn.disabled = !ready;
    if (ready) {
      hintEl.textContent = '';
    } else if (!allChecked) {
      hintEl.textContent = '위 단계를 모두 체크하세요.';
    } else {
      hintEl.textContent = 'BQ 결과를 붙여넣으세요.';
    }
  };

  // 복사 버튼: 앱 공통 패턴대로 잠깐 체크 아이콘으로 피드백.
  const flashCopied = (btn: HTMLButtonElement): void => {
    const original = btn.innerHTML;
    btn.innerHTML = `${checkIcon}<span>복사됨</span>`;
    btn.classList.add('is-copied');
    setTimeout(() => {
      btn.innerHTML = original;
      btn.classList.remove('is-copied');
    }, 2000);
  };

  backBtn.addEventListener('click', () => {
    location.hash = '';
  });

  propSel.addEventListener('change', refreshQuery);
  startInput.addEventListener('change', refreshQuery);
  endInput.addEventListener('change', refreshQuery);
  resultArea.addEventListener('input', refreshHandoffState);
  checkboxes.forEach((c) => c.addEventListener('change', refreshHandoffState));

  copyQueryBtn.addEventListener('click', () => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(queryArea.value).then(() => flashCopied(copyQueryBtn));
  });

  copyHandoffBtn.addEventListener('click', () => {
    if (copyHandoffBtn.disabled || !navigator.clipboard) return;
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
    navigator.clipboard.writeText(text).then(() => flashCopied(copyHandoffBtn));
  });

  refreshQuery();
  refreshHandoffState();
}
