# 마트 소스(고방 마트) 지원 — 설계

배경: VoC(`voc_1783996309765_426443714`) — "애널리틱스 로우 데이터 기반으로만 쿼리가 만들어지는 것 같은데, 마트 테이블에서도 추출 가능하도록 쿼리가 만들어지면 좋겠어요."

## 1. 범위

- 이번 스코프는 **`gobang_mart.Gobang_events` 테이블 1개만** 지원한다. `ad_banner_daily`·`branch_secret_mapping`·`foreigner_inquiry_daily`·U사장님 마트는 범위 밖(추후 확장 시 동일 패턴 재사용).
- `Gobang_events`는 GA4 raw(`analytics_274122040`)를 **매일 새벽 스케줄쿼리로 재조합**한 파생 테이블 — 새 데이터가 아니라 "같은 데이터를 더 쉽고 싸게 조회하는 경로". `event_date` 파티션 컬럼, 49개 컬럼 모두 평평(flat)하게 존재(`UNNEST` 불필요). 어제 데이터까지만 있고(전일 배치), 오늘 실시간 데이터는 raw에만 있음.
- 대화형(자연어) 모드·세그먼트(사람 조건)·비율지표·관리자 핸드오프(#admin) 패널은 이번 스코프 밖 — 셀렉형(집계/상세 모드)만 지원. 관리자 패널은 raw 2개 프로퍼티만 다루던 그대로 유지(마트는 노션 텍소노미 동기화 대상이 아님).
- `branch_type` 병합 규칙(원룸텔·고시원 통합)은 컬럼명이 raw와 동일해 엔진 로직을 그대로 타므로 마트에도 자동 적용됨(추가 작업 없음).

## 2. UI

- 기존 "찾을 데이터" 탭(고방/U사장님)에 세 번째 탭 **"고방 마트"** 추가. 기존 "고방" 라벨은 **"고방 원본"** 으로 변경해 대칭을 맞춘다(U사장님은 마트가 없으므로 그대로).
- 탭은 `catalog.properties`에서 동적으로 생성되므로(`Object.keys`), 카탈로그에 3번째 프로퍼티를 추가하는 것만으로 탭 UI가 자동 반영된다 — 탭 컴포넌트 자체 변경 없음.
- 이벤트 선택·차원·필터·지표·상세(Wide) 모드 UI는 모두 `CatalogProperty` 기반 범용 로직(`unionParamsForEvents` 등)이라 마트 전용 UI 코드가 필요 없다.

## 3. 카탈로그 데이터

> **개정(2026-07-16): 실측 재수집으로 전환.** 최초엔 "원본 이벤트 목록·건수 복사 + 전 이벤트에 40컬럼 동일 부여"로 단순화했으나, 원본과 사전상 구분이 안 되고 건수가 틀린 문제가 확인돼(원본은 GA4 raw, 마트는 별도 flat 테이블) 아래처럼 **마트 테이블 실측 인벤토리 기반**으로 바꿨다.

- 마트의 이벤트 목록·건수는 **마트 테이블(`Gobang_events`) 실측**으로 뽑는다(원본 복사 금지). 인벤토리 쿼리 = `event_name`별 `COUNT(*)` + 40개 컬럼 각각의 `COUNTIF(col IS NOT NULL)` (최근 90일). → 원본에 없는 파생 이벤트(`churn_branchview_7d`·`appstream_new_join`·`feed_subscribe` 등)와 실제 건수가 그대로 반영됨.
- 각 이벤트의 `params`는 **그 이벤트에서 실제 값이 채워지는(non-null > 0) 컬럼만** 부여한다(예: `page_view`엔 지점/가격 컬럼 없음, `branch_view`엔 있음, `search`엔 `search_query`). param `cnt` = 실측 non-null 개수.
- label/description/funnel은 이름이 겹치는 원본 이벤트가 있으면 재사용(일관된 한글 표기), 없으면 이벤트명으로 폴백.
- 컬럼 타입: `data/mart-schema-gobang-events.json`의 `{key, type, description}`를 그대로 사용(`INT64`→`int`, 그 외→`string`).
- 신규 데이터 파일: `data/mart-schema-gobang-events.json`(스키마) + `data/inventory-mart-gobang-YYYYMMDD.json`(실측 인벤토리, BQ 콘솔 실행 결과 — Claude가 직접 실행하지 않음).
- `scripts/build-catalog.mjs`: `parseMartInventory` + `buildMartPropertyEvents(inventoryRows, martColumns, rawEvents)`. `PROPERTY_META.gobang_mart`에 `group/variant`(UI 그룹핑) 포함.

## 4. 타입

- `src/data/catalog-types.ts`: `Catalog.properties`에 `gobang_mart: CatalogProperty` 추가. `CatalogProperty`에 `tableId?: string` 추가(있으면 "단일 물리 테이블"=마트, 없으면 "`events_*` 와일드카드"=raw 판별 플래그로 사용).
- `src/sql/types.ts`, `src/state.ts`: `PropertyKey`에 `'gobang_mart'` 추가(`state.ts`는 `keyof Catalog['properties']`라 자동 반영, `sql/types.ts`는 리터럴 유니온 수동 추가).
- `src/config.ts`의 `PropertyKey`(노션 텍소노미 URL 전용)는 **변경하지 않음** — 마트는 텍소노미 동기화 대상이 아니므로 raw 2개로 유지.

## 5. SQL 엔진 (`src/sql/generate.ts`)

기존 로직 중 소스별로 달라지는 지점은 **base CTE의 FROM절+날짜필터**, **파라미터 컬럼 추출 표현식** 두 곳뿐. 나머지(WHERE·GROUP BY·지표·필터·세그먼트)는 100% 재사용.

- `buildBaseCteBody`: `property.tableId` 존재 여부로 분기.
  - raw: `` FROM `{project}.{dataset}.events_*` `` + `` _TABLE_SUFFIX BETWEEN 'YYYYMMDD' AND 'YYYYMMDD' ``
  - mart: `` FROM `{project}.{dataset}.{tableId}` `` + `` event_date BETWEEN DATE('YYYY-MM-DD') AND DATE('YYYY-MM-DD') `` (와일드카드 없음, 파티션 컬럼 직접 필터 — 비용 최소화)
- `paramColumnExpr`: raw는 기존 `UNNEST(event_params)` 서브쿼리 그대로, mart는 컬럼명 그대로 반환(이미 평평하므로 추출 불필요).
- base 고정 컬럼 목록도 소스별로 분기하되, **출력 별칭은 raw와 동일하게 맞춰**(`traffic_source_source`/`traffic_source_medium`/`traffic_source_campaign` 등) 이후 파이프라인(차원·필터·상세모드 고정 컬럼)이 무수정으로 동작하게 한다.
  - mart 원본 컬럼명 → 별칭 매핑: `traffic_source→traffic_source_source`, `traffic_medium→traffic_source_medium`, `traffic_name→traffic_source_campaign`. 나머지(event_date/event_timestamp/event_time/event_name/user_pseudo_id/user_id)는 이름이 같아 별칭 불필요.
- `findParamType`은 무수정(모든 이벤트가 전체 파라미터를 갖고 있어 첫 이벤트에서 항상 찾아짐).

## 6. 비용 가드

- 기존 "기간 미선택 시 생성 불가", "90일 초과 경고" 그대로 마트에도 적용(재사용 로직).
- Assumptions 주석에 소스 종류를 표시해 raw/mart 구분이 SQL 상단 주석만 봐도 보이게 한다(예: `/* 소스: 고방 마트 (event_date 파티션 직접 필터, UNNEST 없음) */`).

## 7. 테스트

- `scripts/build-catalog.test.ts`: `buildMartPropertyEvents`가 raw 이벤트 메타 재사용 + 40개 컬럼 전 이벤트 부여를 검증.
- `src/sql/generate.test.ts`: mart 소스로 `generateAggregateSql`/`generateWideSql` 호출 시 FROM절이 와일드카드가 아닌 단일 테이블인지, 날짜 필터가 `event_date BETWEEN DATE(...)` 형태인지, 파라미터 컬럼이 UNNEST 없이 그대로 참조되는지 스냅샷 검증. 기존 raw 테스트는 회귀 없이 그대로 통과해야 함(93개 그린 유지).

## 8. YAGNI(이번 범위 제외, 추후 확장 시 재검토)

- `ad_banner_daily`·`branch_secret_mapping`·`foreigner_inquiry_daily`·U사장님 마트
- 대화형(자연어) 모드의 마트 지원, 세그먼트(사람 조건), 비율 지표 — 마트 소스에서도 타입상 지원 가능하지만 이번엔 셀렉형 집계/상세 모드만 확인
- 마트 실측 샘플값 미리보기(비용 발생 쿼리라 별도 요청 시에만)
