# 관리자 핸드오프 패널 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 소유자 전용(비번) `#admin` 패널을 추가해, 노션 택소노미 URL·BQ 검증쿼리·BQ 실측 결과를 모아 Claude 세션에 넘길 "핸드오프 텍스트"를 원클릭 복사하게 한다.

**Architecture:** 순수 함수(검증쿼리 생성·핸드오프 조립) 2개를 TDD로 먼저 만들고, 기존 `gate.ts` 패턴을 따른 관리자 게이트+패널 UI를 붙인 뒤 `main.ts`에서 `#admin` 해시 라우팅으로 연결한다. 브라우저는 텍스트 패키징만 하고, 실제 동기화(노션 읽기·병합·JSON갱신·빌드·배포)는 Claude 세션이 담당한다.

**Tech Stack:** Vite + vanilla TypeScript(런타임 의존성 0), vitest, sessionStorage 게이트.

## Global Constraints

- 들여쓰기 2칸(스페이스), 세미콜론 필수, 따옴표 싱글/백틱, 줄 100자 내 권장. (`my-claude-project/CLAUDE.md`)
- 런타임 의존성 0 — 새 npm 패키지 추가 금지.
- 브라우저에서 노션 API·BQ 직접 호출 금지, diff·JSON 생성 금지 (스펙 §2 비목표).
- 테스트: 콜로케이트 `*.test.ts`, `import { describe, expect, it } from 'vitest'`, 실행 `npm test`(= `vitest run`).
- 프로퍼티 키는 `'gobang' | 'uceo'` 2종. 데이터셋: gobang=`analytics_274122040`, uceo=`analytics_279311003`.
- 노션 URL(상수, 스펙 §6.4):
  - gobang: `https://app.notion.com/p/GTM-1-39138269954380d1a050e73b48616eed`
  - uceo: `https://app.notion.com/p/U-GTM-1-3913826995438057b59ed6bbbfdb2266`

---

### Task 1: 관리자 상수 추가 (config.ts)

**Files:**
- Modify: `src/config.ts`

**Interfaces:**
- Consumes: (없음)
- Produces:
  - `export const ADMIN_KEY: string`
  - `export const ADMIN_STORAGE_KEY: string` (= `'bqb_admin'`)
  - `export type PropertyKey = 'gobang' | 'uceo'`
  - `export const NOTION_TAXONOMY_URLS: Record<PropertyKey, string>`

- [ ] **Step 1: 상수 추가**

`src/config.ts` 끝에 append:

```typescript
// 관리자 핸드오프 패널(#admin) 전용. 팀 게이트(ACCESS_KEY)와 별개.
// 정적 사이트 한계상 클라이언트 검증(외부인 차단용). 소유자가 값 변경 가능.
export const ADMIN_KEY = 'gobang-admin';
export const ADMIN_STORAGE_KEY = 'bqb_admin';

export type PropertyKey = 'gobang' | 'uceo';

// 프로퍼티별 노션 GTM 택소노미 페이지 URL(동기화 출처).
export const NOTION_TAXONOMY_URLS: Record<PropertyKey, string> = {
  gobang: 'https://app.notion.com/p/GTM-1-39138269954380d1a050e73b48616eed',
  uceo: 'https://app.notion.com/p/U-GTM-1-3913826995438057b59ed6bbbfdb2266',
};
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: PASS (에러 없음)

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat(admin): 관리자 패널 상수(ADMIN_KEY·노션 URL) 추가"
```

---

### Task 2: 검증쿼리 생성기 (순수 함수)

**Files:**
- Create: `src/admin/verify-query.ts`
- Test: `src/admin/verify-query.test.ts`

**Interfaces:**
- Consumes: (없음)
- Produces:
  - `export function toSuffix(isoDate: string): string` — `'2026-07-06'` → `'20260706'`
  - `export function buildVerifyQuery(datasetId: string, startDate: string, endDate: string): string` — `startDate`/`endDate`는 `'YYYY-MM-DD'`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/admin/verify-query.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { buildVerifyQuery, toSuffix } from './verify-query';

describe('toSuffix', () => {
  it('YYYY-MM-DD 의 하이픈을 제거해 YYYYMMDD 로 만든다', () => {
    expect(toSuffix('2026-07-06')).toBe('20260706');
  });
});

describe('buildVerifyQuery', () => {
  const sql = buildVerifyQuery('analytics_274122040', '2026-06-06', '2026-07-06');

  it('대상 데이터셋의 events_* 와일드카드를 FROM 에 넣는다', () => {
    expect(sql).toContain('`gobang-bigquery.analytics_274122040.events_*`');
  });

  it('기간을 _TABLE_SUFFIX BETWEEN 로 고정한다', () => {
    expect(sql).toContain("_TABLE_SUFFIX BETWEEN '20260606' AND '20260706'");
  });

  it('event_name·param_key 인벤토리 컬럼을 SELECT 한다', () => {
    expect(sql).toContain('event_name');
    expect(sql).toContain('ep.key AS param_key');
    expect(sql).toContain('COUNT(*) AS cnt');
  });

  it('읽기 전용(SELECT 시작)이다', () => {
    expect(sql.trim().startsWith('SELECT')).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/admin/verify-query.test.ts`
Expected: FAIL ("Cannot find module './verify-query'")

- [ ] **Step 3: 최소 구현**

`src/admin/verify-query.ts`:

```typescript
// BQ 실측 인벤토리 검증쿼리 생성. docs/verify-query.sql 기반, 데이터셋·기간을 치환한다.
// 이 도구는 BQ를 실행하지 않는다 — 생성된 텍스트는 사람이 콘솔에서 실행한다.

const PROJECT_ID = 'gobang-bigquery';

export function toSuffix(isoDate: string): string {
  return isoDate.replace(/-/g, '');
}

export function buildVerifyQuery(datasetId: string, startDate: string, endDate: string): string {
  const start = toSuffix(startDate);
  const end = toSuffix(endDate);
  return [
    '/* ===== 검증: 기간 내 실제 수집 이벤트·파라미터 인벤토리 ===== */',
    '/* 결과를 저장(JSON/NDJSON)해 관리자 패널에 붙여넣으세요 */',
    'SELECT',
    '  event_name,',
    '  ep.key AS param_key,',
    '  COUNT(*) AS cnt,',
    '  COUNTIF(ep.value.string_value IS NOT NULL) AS string_cnt,',
    '  COUNTIF(ep.value.int_value IS NOT NULL) AS int_cnt,',
    '  COUNTIF(ep.value.double_value IS NOT NULL) AS double_cnt',
    'FROM `' + PROJECT_ID + '.' + datasetId + '.events_*`,',
    '  UNNEST(event_params) AS ep',
    "WHERE _TABLE_SUFFIX BETWEEN '" + start + "' AND '" + end + "'",
    'GROUP BY event_name, param_key',
    'ORDER BY event_name, cnt DESC;',
  ].join('\n');
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/admin/verify-query.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/admin/verify-query.ts src/admin/verify-query.test.ts
git commit -m "feat(admin): BQ 검증쿼리 생성기 추가"
```

---

### Task 3: 핸드오프 텍스트 조립기 (순수 함수)

**Files:**
- Create: `src/admin/handoff.ts`
- Test: `src/admin/handoff.test.ts`

**Interfaces:**
- Consumes: `PropertyKey` (config)
- Produces:
  - `export interface HandoffInput { propertyKey: PropertyKey; propertyLabel: string; datasetId: string; notionUrl: string; startDate: string; endDate: string; bqResult: string; }`
  - `export function buildHandoffText(input: HandoffInput): string`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/admin/handoff.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { buildHandoffText } from './handoff';

const base = {
  propertyKey: 'gobang' as const,
  propertyLabel: '고방',
  datasetId: 'analytics_274122040',
  notionUrl: 'https://app.notion.com/p/GTM-1-xxx',
  startDate: '2026-06-06',
  endDate: '2026-07-06',
  bqResult: '[{"event_name":"page_view","param_key":"page_location","cnt":100}]',
};

describe('buildHandoffText', () => {
  it('프로퍼티·데이터셋·노션URL·기간을 포함한다', () => {
    const text = buildHandoffText(base);
    expect(text).toContain('고방 (analytics_274122040)');
    expect(text).toContain('https://app.notion.com/p/GTM-1-xxx');
    expect(text).toContain('2026-06-06 ~ 2026-07-06');
  });

  it('붙여넣은 BQ 결과 원문을 그대로 담는다', () => {
    const text = buildHandoffText(base);
    expect(text).toContain(base.bqResult);
  });

  it('대상 JSON 파일명을 프로퍼티 키로 지정한 지시문을 넣는다', () => {
    const text = buildHandoffText(base);
    expect(text).toContain('data/taxonomy-gobang.json');
    expect(text).toContain('data/inventory-gobang.json');
    expect(text).toContain('npm run build:catalog');
  });

  it('보관 제외 지시를 포함한다', () => {
    expect(buildHandoffText(base)).toContain('보관 제외');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/admin/handoff.test.ts`
Expected: FAIL ("Cannot find module './handoff'")

- [ ] **Step 3: 최소 구현**

`src/admin/handoff.ts`:

```typescript
import type { PropertyKey } from '../config';

export interface HandoffInput {
  propertyKey: PropertyKey;
  propertyLabel: string;
  datasetId: string;
  notionUrl: string;
  startDate: string;
  endDate: string;
  bqResult: string;
}

// Claude 세션에 붙여넣을 카탈로그 동기화 요청 텍스트를 조립한다.
export function buildHandoffText(input: HandoffInput): string {
  const { propertyKey, propertyLabel, datasetId, notionUrl, startDate, endDate, bqResult } = input;
  return [
    '카탈로그 동기화 요청.',
    '- property: ' + propertyLabel + ' (' + datasetId + ')',
    '- 노션 택소노미: ' + notionUrl,
    '- 기간: ' + startDate + ' ~ ' + endDate,
    '- 아래는 BQ 실측 인벤토리 결과:',
    bqResult,
    '',
    '지시: 노션 택소노미(위 URL, 보관 제외)를 읽어 data/taxonomy-' + propertyKey + '.json 갱신 +',
    '이 실측으로 data/inventory-' + propertyKey + '.json 갱신 → npm run build:catalog →',
    'diff 요약을 보여주고 커밋·push 해줘.',
  ].join('\n');
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/admin/handoff.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/admin/handoff.ts src/admin/handoff.test.ts
git commit -m "feat(admin): Claude 핸드오프 텍스트 조립기 추가"
```

---

### Task 4: 관리자 게이트 + 패널 UI

**Files:**
- Create: `src/ui/admin.ts`
- Modify: `src/styles/main.css` (관리자 패널 스타일 append)

**Interfaces:**
- Consumes: `ADMIN_KEY`, `ADMIN_STORAGE_KEY`, `PropertyKey`, `NOTION_TAXONOMY_URLS` (config); `Catalog` (data/catalog-types); `buildVerifyQuery` (admin/verify-query); `buildHandoffText` (admin/handoff); `lockIcon`, `alertCircleIcon` (ui/icons)
- Produces:
  - `export function renderAdminGate(root: HTMLElement, onSuccess: () => void): void`
  - `export function renderAdminPanel(root: HTMLElement, catalog: Catalog): void`

- [ ] **Step 1: 관리자 게이트 구현**

`src/ui/admin.ts` 생성 (게이트 부분):

```typescript
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
```

- [ ] **Step 2: 관리자 패널 구현**

같은 파일 `src/ui/admin.ts`에 append:

```typescript
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
            (k) => `<option value="${k}">${catalog.properties[k].label} (${catalog.properties[k].datasetId})</option>`,
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
```

- [ ] **Step 3: 스타일 추가**

`src/styles/main.css` 끝에 append (기존 뉴트럴 미니멀 톤 유지, pill·과한 라운딩 배제):

```css
/* ===== 관리자 패널 ===== */
.admin-screen {
  max-width: 860px;
  margin: 0 auto;
  padding: 32px 20px 64px;
}
.admin-head h1 {
  font-size: 20px;
  font-weight: 600;
}
.admin-sub {
  color: var(--muted, #6b7280);
  font-size: 13px;
  margin-top: 4px;
}
.admin-step {
  margin-top: 28px;
  border-top: 1px solid var(--border, #e5e7eb);
  padding-top: 16px;
}
.admin-step h2 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 10px;
}
.admin-step select,
.admin-step textarea,
.admin-step input[type='date'] {
  font: inherit;
  padding: 8px 10px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 6px;
  background: var(--surface, #fff);
  color: inherit;
}
.admin-step textarea {
  width: 100%;
  margin-top: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.admin-dates {
  display: flex;
  gap: 16px;
  align-items: center;
}
.admin-notion {
  font-size: 12px;
  margin-top: 8px;
  word-break: break-all;
}
.admin-step button {
  margin-top: 10px;
  padding: 8px 14px;
  font: inherit;
  cursor: pointer;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 6px;
  background: var(--surface, #fff);
}
.admin-step button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.admin-copy-query-ok,
.admin-copy-handoff-ok {
  margin-left: 8px;
  font-size: 12px;
  color: #16a34a;
}
```

- [ ] **Step 4: 타입체크**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/admin.ts src/styles/main.css
git commit -m "feat(admin): 관리자 게이트+핸드오프 패널 UI 추가"
```

---

### Task 5: `#admin` 해시 라우팅 (main.ts)

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `renderAdminGate`, `renderAdminPanel` (ui/admin); `ADMIN_STORAGE_KEY` (config)
- Produces: (없음 — 진입점)

- [ ] **Step 1: 라우팅 로직 교체**

`src/main.ts` 전체를 아래로 교체:

```typescript
import catalogJson from './data/catalog.json';
import type { Catalog } from './data/catalog-types';
import { AUTH_STORAGE_KEY, ADMIN_STORAGE_KEY } from './config';
import { renderGate } from './ui/gate';
import { renderBuilder } from './ui/builder';
import { renderAdminGate, renderAdminPanel } from './ui/admin';

// JSON 리터럴 타입 추론(ParamType 등 유니온)이 정적 import와 완전히 맞지 않아 단언한다.
// 실제 값 검증은 scripts/build-catalog.test.ts(S1 소유)에서 담당.
const catalog = catalogJson as unknown as Catalog;

const root = document.querySelector<HTMLDivElement>('#app');

function startAdmin(el: HTMLDivElement): void {
  if (sessionStorage.getItem(ADMIN_STORAGE_KEY) === '1') {
    renderAdminPanel(el, catalog);
  } else {
    renderAdminGate(el, () => renderAdminPanel(el, catalog));
  }
}

function startMain(el: HTMLDivElement): void {
  if (sessionStorage.getItem(AUTH_STORAGE_KEY) === '1') {
    renderBuilder(el, catalog);
  } else {
    renderGate(el, () => renderBuilder(el, catalog));
  }
}

function start(): void {
  if (!root) return;
  if (location.hash === '#admin') {
    startAdmin(root);
  } else {
    startMain(root);
  }
}

window.addEventListener('hashchange', start);
start();
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: PASS

- [ ] **Step 3: 전체 테스트**

Run: `npm test`
Expected: PASS (기존 테스트 + 신규 verify-query 5 + handoff 4)

- [ ] **Step 4: 수동 확인 (dev 서버)**

Run: `npm run dev` (포트 3095)
확인:
- `http://localhost:3095/#admin` → 관리자 게이트 표시 → `gobang-admin` 입력 → 패널.
- 프로퍼티 바꾸면 노션 링크·검증쿼리의 데이터셋이 바뀜.
- 날짜 바꾸면 쿼리의 `_TABLE_SUFFIX` 가 바뀜.
- 결과 비면 핸드오프 버튼 비활성, 붙여넣으면 활성.
- `http://localhost:3095/`(해시 없음) → 기존 팀 게이트 정상.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "feat(admin): #admin 해시 라우팅 연결"
```

---

### Task 6: 빌드 검증 + README 갱신

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: (없음)
- Produces: (없음)

- [ ] **Step 1: 프로덕션 빌드 통과 확인**

Run: `npm run build`
Expected: PASS (build:catalog → tsc → vite build, dist/ 생성)

- [ ] **Step 2: README 에 관리자 패널 항목 추가**

`README.md` 의 "코어" 섹션 마지막 불릿 뒤에 append:

```markdown
- **관리자 핸드오프 패널(`#admin`)**: 소유자 전용(비번 `ADMIN_KEY`, 팀 게이트와 별개). 프로퍼티 선택 → 노션 택소노미 URL 확인 → BQ 검증쿼리 생성·복사 → BQ 결과 붙여넣기 → **[Claude 핸드오프 텍스트 복사]**. 실제 동기화(노션 MCP 읽기·병합·JSON갱신·빌드·배포)는 Claude 세션이 수행. 브라우저는 텍스트 패키징만.
```

그리고 "카탈로그 갱신" 섹션 첫 줄 앞에 append:

```markdown
> 관리자는 `#admin` 패널에서 검증쿼리 생성 → 결과 붙여넣기 → 핸드오프 텍스트를 복사해 Claude 세션에 넘기면 아래 1~4를 Claude가 대신 수행한다.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(admin): README 에 관리자 핸드오프 패널 안내 추가"
```

---

## Self-Review

**Spec coverage:**
- §6.1 진입·인증 → Task 1(상수)+Task 4(게이트)+Task 5(라우팅) ✅
- §6.2 3단계 구성 → Task 4 패널 ✅
- §6.3 핸드오프 포맷 → Task 3 ✅
- §6.4 상수 → Task 1 ✅
- §7 컴포넌트 경계 → verify-query.ts / handoff.ts / ui/admin.ts / config.ts / main.ts 대응 ✅
- §8 테스트 → Task 2·3 단위 테스트, Task 5 게이트 수동확인 ✅
- §2 비목표(브라우저 내 노션/BQ 호출·diff·JSON생성 없음) → 계획 어디에도 없음 ✅
- §9 리스크(노션 throttle·U사장님 중첩구조)는 Claude 동기화 절차 소관 — 패널 구현 범위 밖(스펙 명시) ✅

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함, TBD 없음. `ADMIN_KEY='gobang-admin'`은 실제 기본값(소유자 변경 가능, Task 1 주석 명시).

**Type consistency:** `PropertyKey`(config)를 handoff·admin이 일관 사용. `buildVerifyQuery(datasetId, startDate, endDate)` / `buildHandoffText(HandoffInput)` 시그니처가 Task 4 호출부와 일치. `catalog.properties[key].{datasetId,label}`는 catalog-types 구조와 일치. `renderAdminGate`/`renderAdminPanel` 시그니처가 main.ts 호출부와 일치.
