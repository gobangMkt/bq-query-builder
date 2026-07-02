# V2 [독립] 세그먼트 엔진 + 셀렉형 "사람 조건" UI

## What to build
스펙 §2. `segments: {event, did}[]` 상태 확장, seg_users CTE(HAVING COUNTIF) SQL 생성, 셀렉형에 "사람 조건" 섹션(이벤트 선택 + 했다/안했다 토글). 집계·상세 양쪽 지원.

## Acceptance criteria
- [ ] 스냅샷 테스트: did만 / notDid만 / 혼합 / 세그먼트 0개(기존 SQL 불변 회귀)
- [ ] base CTE가 대상+세그먼트 이벤트를 한 번에 스캔(_TABLE_SUFFIX 동일)
- [ ] Assumptions 주석에 사람 조건·판정기간 명시
- [ ] 미리보기 컬럼에는 영향 없음(사람 필터), npm test 전체 통과

## Blocked by
None (V1과 파일 겹침 주의 — 직렬 진행 권장)
