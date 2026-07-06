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
