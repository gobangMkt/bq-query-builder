# S6 [의존: S5] 상세(Wide) 모드

## What to build
모드 토글(집계[기본]/상세) 추가. 상세 모드는 지침의 Wide 평면 추출 그대로:

- 이벤트 1행씩, 기본 컬럼(event_date, event_time, event_name, user_pseudo_id, user_id,
  traffic_source 계열) + 선택한 event_params 개별 컬럼
- GROUP BY 없음, 지표 선택 UI 대신 "포함할 컬럼" 선택으로 전환
- 미리보기·필터·비용가드는 집계 모드와 동일하게 동작
- SQL 엔진에 wide 모드 분기 추가 (스냅샷 테스트 포함)
- 대량 행 주의 문구: 상세 모드는 행 수가 클 수 있음 → LIMIT 옵션(기본 1000, 해제 가능)

## Acceptance criteria
- [ ] 모드 토글 시 UI가 차원/지표 ↔ 컬럼 선택으로 전환
- [ ] 상세 모드 SQL 스냅샷 테스트 통과 (Wide 추출, LIMIT 포함)
- [ ] 집계 모드 기존 동작 회귀 없음 (기존 테스트 전부 통과)
- [ ] 콘솔 에러 0

## Blocked by
- S5
