# S2 [의존: S1] SQL 생성 엔진 — 집계 모드

## What to build
선택 상태 객체(프로퍼티, 기간, 이벤트[], 차원[], 지표[], 필터[])를 받아 BigQuery Standard SQL
문자열을 반환하는 순수 함수 모듈 `src/sql/`. UI 없음, 테스트로 검증.

노션 "[지침] SQL 작성 (1)" 규칙 구현 (스펙 §5):
- `WITH base AS (...) SELECT ... FROM base` 골격
- base: `PARSE_DATE('%Y%m%d', event_date) AS event_date`, event_timestamp,
  `TIMESTAMP_MICROS(event_timestamp) AS event_time`, event_name, user_pseudo_id, user_id,
  traffic_source 계열, 선택된 event_params의 UNNEST 서브쿼리 컬럼
- 파라미터 타입별 추출: string → `value.string_value`, numeric → `COALESCE(value.int_value, SAFE_CAST(value.double_value AS INT64))`
- `_TABLE_SUFFIX BETWEEN '시작' AND '끝'` 항상 포함. 기간 없으면 throw (SQL 생성 거부)
- `branch_type` 차원 선택 시 `CASE WHEN branch_type IN ('원룸텔','고시원') THEN '고시원·원룸텔' ELSE branch_type END AS branch_type_grouped` 자동 포함
- 주석: `/* ===== Title ===== */` 형식. 상단 `/* ===== Assumptions ===== */`에 기간·이벤트·필터 요약 + "실행 전 예상 스캔량 확인" 안내
- 집계: GROUP BY 선택 차원, 지표 = 이벤트수 `COUNT(*)`, 고유사용자수 `COUNT(DISTINCT user_pseudo_id)`, 고유세션수 `COUNT(DISTINCT CONCAT(user_pseudo_id, CAST(ga_session_id AS STRING)))`
- 필터 연산자: `=`, `!=`, `IN`, `CONTAINS`(LIKE '%x%')
- 차원 종류: event_date(일자), event_name, 유입소스(traffic_source.source/medium/campaign), 임의 event_param

## Acceptance criteria
- [ ] 스냅샷 테스트: "고방/최근7일/inquiry/차원=event_date,inquiry_method/지표=이벤트수,고유사용자수" → 기대 SQL 일치
- [ ] 기간 미지정 시 명시적 에러 throw
- [ ] branch_type 차원 시 CASE WHEN 포함
- [ ] numeric 파라미터에 COALESCE+SAFE_CAST 패턴 사용
- [ ] 생성 SQL에 SELECT * 미포함, 주석 서식 `/* ===== ===== */`만 사용
- [ ] `npm test` 통과

## Blocked by
- S1 (catalog.json의 파라미터 타입 정보 사용)
