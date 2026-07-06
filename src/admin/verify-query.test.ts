import { describe, expect, it } from 'vitest';
import { buildVerifyQuery, toSuffix } from './verify-query';

describe('toSuffix', () => {
  it('YYYY-MM-DD 의 하이픈을 제거해 YYYYMMDD 로 만든다', () => {
    expect(toSuffix('2026-07-06')).toBe('20260706');
  });
});

describe('buildVerifyQuery', () => {
  const sql = buildVerifyQuery('analytics_274122040', '2026-06-06', '2026-07-06');

  it('대상 데이터셋의 events_* 와일드카드를 FROM 에 넣는다', () => {
    expect(sql).toContain('`gobang-bigquery.analytics_274122040.events_*`');
  });

  it('기간을 _TABLE_SUFFIX BETWEEN 로 고정한다', () => {
    expect(sql).toContain("_TABLE_SUFFIX BETWEEN '20260606' AND '20260706'");
  });

  it('event_name·param_key 인벤토리 컬럼을 SELECT 한다', () => {
    expect(sql).toContain('event_name');
    expect(sql).toContain('ep.key AS param_key');
    expect(sql).toContain('COUNT(*) AS cnt');
  });

  it('읽기 전용이다(SELECT 포함·쓰기 키워드 없음)', () => {
    expect(sql).toContain('SELECT');
    expect(/\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|MERGE|TRUNCATE)\b/i.test(sql)).toBe(false);
  });
});
