# BQ 쿼리 빌더

## 개요
SQL/BigQuery를 모르는 구성원(UX팀 등)이 행·열·필터를 클릭으로 골라 **BigQuery SQL 텍스트**를 만드는 정적 웹 도구.
도구는 SQL 생성까지만 하고, 실행은 항상 사람이 BQ 콘솔에서 직접 한다 — 서버 0·LLM 0·API 0·자격증명 0.

## 코어
- **기능**: 프로퍼티(고방/U사장님) → 기간 → 이벤트 → 집계(차원/지표) 또는 상세(Wide 컬럼) → 필터 → 구조 미리보기(더미값) → SQL 생성·복사
- **원리**: 실측 인벤토리(`data/inventory-*.json`, 사용자가 BQ에서 30일 검증쿼리 실행) + 노션 텍소노미(`data/taxonomy-*.json`)를 빌드 시 병합해 `src/data/catalog.json` 생성 → 규칙 기반 템플릿이 노션 "[지침] SQL 작성" 서식대로 SQL 생성
- **스택**: Vite + vanilla TypeScript (런타임 의존성 0), vitest 59 tests + Python Playwright E2E 13
- **비용 가드**: 기간 미선택 시 생성 불가(`_TABLE_SUFFIX` 항상 포함), 90일 초과 경고, 상세 모드 기본 LIMIT 1000
- **대상 데이터**: `gobang-bigquery.analytics_274122040`(고방 raw) / `analytics_279311003`(U사장님 raw)
- **접근**: 진입 시 비밀번호 게이트 (`src/config.ts`의 `ACCESS_KEY` — 클라이언트 검증이라 완전 보안 아님, 외부인 차단용)

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
