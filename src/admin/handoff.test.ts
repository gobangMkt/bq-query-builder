import { describe, expect, it } from 'vitest';
import { buildHandoffText } from './handoff';

const base = {
  propertyKey: 'gobang' as const,
  propertyLabel: '고방',
  datasetId: 'analytics_274122040',
  notionUrl: 'https://app.notion.com/p/GTM-1-xxx',
  startDate: '2026-06-06',
  endDate: '2026-07-06',
  bqResult: '[{"event_name":"page_view","param_key":"page_location","cnt":100}]',
};

describe('buildHandoffText', () => {
  it('프로퍼티·데이터셋·노션URL·기간을 포함한다', () => {
    const text = buildHandoffText(base);
    expect(text).toContain('고방 (analytics_274122040)');
    expect(text).toContain('https://app.notion.com/p/GTM-1-xxx');
    expect(text).toContain('2026-06-06 ~ 2026-07-06');
  });

  it('붙여넣은 BQ 결과 원문을 그대로 담는다', () => {
    const text = buildHandoffText(base);
    expect(text).toContain(base.bqResult);
  });

  it('대상 JSON 파일명을 프로퍼티 키로 지정한 지시문을 넣는다', () => {
    const text = buildHandoffText(base);
    expect(text).toContain('data/taxonomy-gobang.json');
    expect(text).toContain('data/inventory-gobang.json');
    expect(text).toContain('npm run build:catalog');
  });

  it('보관 제외 지시를 포함한다', () => {
    expect(buildHandoffText(base)).toContain('보관 제외');
  });
});
