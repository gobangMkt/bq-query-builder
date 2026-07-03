# BQ 쿼리 빌더

## 개요
SQL/BigQuery를 모르는 구성원(UX팀 등)이 행·열·필터를 클릭으로 골라 **BigQuery SQL 텍스트**를 만드는 정적 웹 도구.
도구는 SQL 생성까지만 하고, 실행은 항상 사람이 BQ 콘솔에서 직접 한다 — 서버 0·LLM 0·API 0·자격증명 0.

## 코어
- **레이아웃(워크벤치)**: 좌측 입력 · 우측 고정(sticky) 구조 미리보기+SQL. 좌측을 바꾸면 우측이 즉시 반응.
- **입력 2모드**:
  - **대화형**: 문장을 쓰면 규칙 기반 파서가 "기간 + 사람 조건 + 대상/지표"로 해석해 칩으로 보여줌. 애매하면 노란 되물음 칩(후보 선택), 확정되면 SQL 생성. LLM 없음.
  - **셀렉형**: 프로퍼티 → 기간 → 이벤트 → 사람 조건 → 집계(차원/지표) 또는 상세(Wide 컬럼) → 필터. 두 모드는 상태를 공유.
- **사람 조건(세그먼트)**: 조회 기간 내에 특정 이벤트를 "했다/안 했다"로 유저를 거른다 → `seg_users` CTE(`HAVING COUNTIF`). "A 한 사람 중 B 안 한 사람" 류를 지원.
- **원리**: 실측 인벤토리(`data/inventory-*.json`, 사용자가 BQ에서 30일 검증쿼리 실행) + 노션 텍소노미(`data/taxonomy-*.json`)를 빌드 시 병합해 `src/data/catalog.json` 생성 → 규칙 템플릿이 노션 "[지침] SQL 작성" 서식대로 SQL 생성. 대화형 유의어는 `src/nl/dictionary.ts`.
- **스택**: Vite + vanilla TypeScript (런타임 의존성 0), vitest 84 + Python Playwright E2E 17
- **비용 가드**: 기간 미선택 시 생성 불가(`_TABLE_SUFFIX` 항상 포함), 90일 초과 경고, 상세 모드 기본 LIMIT 1000
- **대상 데이터**: `gobang-bigquery.analytics_274122040`(고방 raw) / `analytics_279311003`(U사장님 raw)
- **접근**: 진입 시 비밀번호 게이트 (`src/config.ts`의 `ACCESS_KEY` — 클라이언트 검증이라 완전 보안 아님, 외부인 차단용)

## 대화형이 지원하는/안 하는 것
| 지원 | 안 됨(이유 + 대안 안내) |
|---|---|
| 기간(지난 한 주/한 달/N일) | 순서 조건(A 하고 나서 B) → 발생 여부로 바꾸기 |
| 사람 조건 여러 개(했다/안 했다) | 기간 비교/증감 → 기간별로 각각 생성 |
| 대상 이벤트 + 지표(이벤트수/사용자수/세션수) | 리텐션·코호트 → 미지원 |
| 애매하면 되물음 칩으로 후보 선택 | 프로퍼티 교차(고방+U사장님) → 하나씩 |

## 실행·배포
- 로컬: `npm install` → `npm run dev` (포트 3095) 또는 루트의 `시작 3095.bat`
- 테스트: `npm test` / E2E: 서버 띄운 뒤 `python tests/e2e.py`
- 빌드: `npm run build` (build:catalog → tsc → vite build → dist/)
- 배포: master push 시 GitHub Actions가 Pages로 자동 배포 (`.github/workflows/deploy.yml`)

### 카탈로그 갱신 (GTM 이벤트 추가/변경 시)
1. `docs/verify-query.sql`을 BQ 콘솔에서 실행 (고방·U사장님 각 1회, 데이터셋 ID만 교체)
2. 결과를 JSON으로 저장해 `data/inventory-*.json` 교체
3. 텍소노미 변경분은 `data/taxonomy-*.json`에 반영
4. `npm run build:catalog` → 커밋·push → 자동 재배포

## 배포링크
- 프로덕션: https://gobangmkt.github.io/bq-query-builder/
- GitHub: https://github.com/gobangMkt/bq-query-builder
