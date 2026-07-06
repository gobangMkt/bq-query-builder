import type { PropertyKey } from '../config';

export interface HandoffInput {
  propertyKey: PropertyKey;
  propertyLabel: string;
  datasetId: string;
  notionUrl: string;
  startDate: string;
  endDate: string;
  bqResult: string;
}

// Claude 세션에 붙여넣을 카탈로그 동기화 요청 텍스트를 조립한다.
export function buildHandoffText(input: HandoffInput): string {
  const { propertyKey, propertyLabel, datasetId, notionUrl, startDate, endDate, bqResult } = input;
  return [
    '카탈로그 동기화 요청.',
    '- property: ' + propertyLabel + ' (' + datasetId + ')',
    '- 노션 택소노미: ' + notionUrl,
    '- 기간: ' + startDate + ' ~ ' + endDate,
    '- 아래는 BQ 실측 인벤토리 결과:',
    bqResult,
    '',
    '지시: 노션 택소노미(위 URL, 보관 제외)를 읽어 data/taxonomy-' + propertyKey + '.json 갱신 +',
    '이 실측으로 data/inventory-' + propertyKey + '.json 갱신 → npm run build:catalog →',
    'diff 요약을 보여주고 커밋·push 해줘.',
  ].join('\n');
}
