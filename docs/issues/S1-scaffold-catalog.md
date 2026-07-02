# S1 [독립] 스캐폴드 + 카탈로그 빌드

## What to build
Vite + vanilla TypeScript 프로젝트 스캐폴드와, 실측 인벤토리(`data/inventory-*-20260702.json`) +
텍소노미(`data/taxonomy-*.json`)를 병합해 `src/data/catalog.json`을 생성하는 빌드 스크립트.

카탈로그 구조: 프로퍼티(gobang/uceo) → 이벤트(실측에 존재하는 것만) → 파라미터.
- 이벤트: name, label(텍소노미, 없으면 name), description, funnel, 최근30일 발생수(실측)
- 파라미터: key, 설명(텍소노미, 없으면 생략), 타입(실측 string/int/double 카운트로 판정 — 최다 타입 채택, int+double 혼재 시 numeric), 발생수
- 프로퍼티 메타: datasetId(고방 274122040 / U사장님 279311003), 표시명

## Acceptance criteria
- [ ] `npm run build:catalog` 실행 시 catalog.json 생성
- [ ] 고방 31개·U사장님 13개 이벤트가 정확히 포함 (인벤토리 밖 이벤트 없음)
- [ ] `inquiry`에 label "문의", `inquiry_method` 설명 포함 (텍소노미 병합 검증)
- [ ] 타입 판정: `percent_scrolled`=int, `page_title`=string, `price_month_max`(고방)=numeric
- [ ] vitest 테스트로 위 기준 검증, `npm test` 통과
- [ ] `npm run build` 시 정적 산출물(dist/) 생성 성공

## Blocked by
None - can start immediately
