/* ===== 검증: 최근 30일 실제 수집 이벤트·파라미터 인벤토리 ===== */
/* 고방 = analytics_274122040 / U사장님 = analytics_279311003 로 바꿔서 각 1회 실행 */
/* 실행 후 "결과 저장 → JSON(로컬 파일)" 로 저장해 전달 */
SELECT
  event_name,
  ep.key AS param_key,
  COUNT(*) AS cnt,
  COUNTIF(ep.value.string_value IS NOT NULL) AS string_cnt,
  COUNTIF(ep.value.int_value IS NOT NULL) AS int_cnt,
  COUNTIF(ep.value.double_value IS NOT NULL) AS double_cnt
FROM `gobang-bigquery.analytics_274122040.events_*`,
  UNNEST(event_params) AS ep
WHERE _TABLE_SUFFIX BETWEEN
  FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 30 DAY))
  AND FORMAT_DATE('%Y%m%d', CURRENT_DATE('Asia/Seoul'))
GROUP BY event_name, param_key
ORDER BY event_name, cnt DESC;
