# BQ 쿼리 빌더 — 설계 스펙

작성일: 2026-07-02 · 상태: 사용자 리뷰 대기

## 1. 개요

SQL/BigQuery를 모르는 구성원(UX팀 등)이 브라우저에서 행·열·필터를 클릭으로 선택하면,
결과 구조를 미리보기(컬럼헤더+더미값)로 확인하고 **BigQuery Standard SQL 텍스트**를 생성해주는 도구.

**절대 원칙**
- 도구의 역할은 SQL **텍스트 생성까지**. 실행·추출·결과 확인은 항상 사람이 BQ 콘솔에서 직접 한다.
- 서버 0 · LLM 0 · API 0 · 자격증명 0. 어떤 경로로도 BQ에 접속하지 않는다 → 비용 사고 원천 불가.
- 순수 정적 웹앱으로 GitHub Pages에 배포. 누구나 URL로 상시 접속.

## 2. 데이터 지형 (2026-07-02 확정)

| 구분 | 데이터셋 | 내용 |
|---|---|---|
| 고방 raw | `gobang-bigquery.analytics_274122040.events_*` | GA4 표준 export |
| U사장님 raw | `gobang-bigquery.analytics_279311003.events_*` | GA4 표준 export |
| 제외 | `analytics_291975575`(위스테이), `gobang_mart`·`uceo_mart` 등 mart | v1 범위 밖 |

- 신규 GTM 데이터는 raw에만 있으므로 생성기는 raw만 대상으로 한다.
- GA4 export 테이블 구조는 전 세계 공통 표준 → 코드에 내장(별도 스키마 조회 불필요).

## 3. 메뉴 데이터 (실측 검증 완료)

이벤트/파라미터 메뉴의 원천은 **텍소노미(계획)가 아니라 실측 인벤토리(사실)**로 한다.

- 검증 방법: 최근 30일 `event_name × param_key × 타입분포` 집계 쿼리를 **사용자가 BQ 콘솔에서 직접 실행**,
  결과 JSON을 전달받음 (`data/inventory-gobang-20260702.json`, `data/inventory-uceo-20260702.json`).
- 결과: 고방 **31개** 이벤트, U사장님 **13개** 이벤트. 파라미터별 값 타입(string/int/double) 실측 확보.
- 텍소노미(노션 2종)와 대조 결과:
  - 텍소노미에 없지만 실제 쌓이는 것: GA4 자동수집(`session_start`, `first_visit`, `user_engagement`,
    `scroll`, `click`, `form_start` 등) + 시스템 생성(`churn_branchview_7d`, `appstream_new_join`) → **메뉴에 포함**
  - 텍소노미에 있지만 안 쌓이는 것: 보관·개발요청·대기 상태 이벤트(`signup_complete`, `ai_summary_*`,
    `ad_youth_*`, `room_request_*` 등) → **메뉴에서 제외**
- 텍소노미의 역할: 실측 이벤트에 **한국어 설명·퍼널 분류·파라미터 의미**를 병합해 메뉴 라벨을 풍부하게 함.
  - 고방: 노션 DB `collection://a9338269-9543-83c1-b362-07ccd99331b4` (50행)
  - U사장님: v2.0 내 DB `collection://ec738269-9543-8396-85c1-070d574bcc2c` (10행)
- 빌드 산출물: 위 실측+텍소노미를 병합한 `src/data/catalog.json` (프로퍼티→이벤트→파라미터 트리).

## 4. UI 플로우

한 화면 위저드형 빌더:

1. **프로퍼티** — 고방 / U사장님 탭
2. **모드** — 집계(기본) / 상세
3. **기간** — 필수. 기본 최근 7일. 90일 초과 선택 시 경고. 미선택 시 SQL 생성 버튼 비활성.
4. **이벤트 선택** — 검색 가능 목록. 각 항목에 한국어 설명(텍소노미)·최근 30일 발생량(실측) 표시.
5. **열 구성**
   - 집계 모드: 행(차원) = 날짜·이벤트명·유입소스·branch_type·임의 param / 열(지표) = 이벤트수·고유사용자수(`user_pseudo_id`)·고유세션수
   - 상세 모드: 기본 컬럼(event_date, event_time, event_name, user_pseudo_id, user_id, traffic_source 계열) + 선택한 event_params 개별 컬럼(Wide)
6. **필터** — param/기본컬럼에 대한 조건(=, !=, IN, 포함) 추가
7. **미리보기** — 결과 구조를 컬럼헤더 + 더미값 3행 표로 표시 (실데이터 아님)
8. **SQL 출력** — 코드블록 + 복사 버튼 + "BQ 콘솔에 붙여넣기" 안내

## 5. SQL 생성 규칙 ([지침] SQL 작성 매핑)

노션 "[지침] SQL 작성 (1)"을 템플릿 엔진 규칙으로 구현:

- 골격: `WITH base AS (...) SELECT ... FROM base`
- `base`에 기본 포함: `event_date`(PARSE_DATE), `event_timestamp`, `event_time`(TIMESTAMP_MICROS),
  `event_name`, `user_pseudo_id`, `user_id`, traffic_source 계열
- `event_params` Wide 추출: 선택된 키마다 UNNEST 서브쿼리 컬럼, 타입은 실측 인벤토리 기반으로
  `string_value` / `COALESCE(value.int_value, CAST(value.double_value AS INT64))` 자동 선택
- 수치형 정제: COALESCE + SAFE_CAST 패턴
- `branch_type` 파라미터 선택 시: `CASE WHEN branch_type IN ('원룸텔','고시원') THEN '고시원·원룸텔' ELSE branch_type END AS branch_type_grouped` 자동 포함
- `_TABLE_SUFFIX BETWEEN 'YYYYMMDD' AND 'YYYYMMDD'` 항상 포함(기간 필수와 연동)
- 주석: `/* ===== Title ===== */` 형식만. 상단에 `/* ===== Assumptions ===== */`(기간·필터·선택 기준 명시)
- 집계 모드: 파생 CTE에서 GROUP BY 차원 + COUNT(*) / COUNT(DISTINCT user_pseudo_id) 등

## 6. 비용 가드

- 기간 미선택 → SQL 생성 불가 (전체 스캔 방지)
- 기본 7일, 90일 초과 시 경고 배지
- 생성 SQL 상단 주석에 "실행 전 BQ 에디터의 예상 스캔량을 확인하라" 안내
- U-report 2026-06-24 비용사고(13,440쿼리·100만원) 재발 방지가 이 섹션의 존재 이유

## 7. 스택·배포

- Vite + vanilla TypeScript (프레임워크 없음), 산출물 = 정적 HTML/JS/CSS
- 위치: `프로젝트/for_Release/bq-query-builder` (독립 git repo)
- 배포: GitHub Pages (repo: gobangMkt/bq-query-builder 예정)
- UI 디자인은 파이프라인 2단계(디자인 게이트)에서 별도 확정

## 8. 데이터 갱신 절차

GTM 이벤트 추가/변경 시:
1. `docs/verify-query.sql`의 검증 쿼리를 사용자가 BQ 콘솔에서 재실행 (고방·U사장님 각 1회)
2. 결과 JSON을 전달 → 카탈로그 재생성(`data/` 갱신 → `catalog.json` 재빌드) → 재배포
3. 런타임 API 없음 — 갱신은 항상 이 수동 파이프라인으로만

## 9. v1 제외 (YAGNI)

- mart 테이블 지원, 테이블 간 조인 빌더
- 자연어 입력(LLM), 쿼리 저장/공유, 실데이터 미리보기(=쿼리 실행이라 원칙 위배)

## 10. 테스트

- SQL 생성기 단위 테스트: 선택 조합 → 기대 SQL 스냅샷 (기간 미선택 시 생성 거부 포함)
- 카탈로그 빌드 스크립트 테스트: 인벤토리 JSON + 텍소노미 병합 결과 검증
- E2E(Playwright): 빌더 조작 → 미리보기 → SQL 복사 흐름
