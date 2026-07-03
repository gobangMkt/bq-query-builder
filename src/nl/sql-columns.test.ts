import { describe, expect, it } from 'vitest';
import { extractSelectColumns } from './sql-columns';

describe('extractSelectColumns', () => {
  it('단순 SELECT의 별칭을 추출한다', () => {
    const sql = `SELECT event_date, COUNT(*) AS event_count FROM t GROUP BY event_date`;
    expect(extractSelectColumns(sql)).toEqual(['event_date', 'event_count']);
  });

  it('CTE가 있어도 최종 SELECT의 컬럼만 본다', () => {
    const sql = `
      WITH seg_users AS (
        SELECT user_pseudo_id, COUNT(*) AS cnt
        FROM \`p.d.events_*\`
        WHERE _TABLE_SUFFIX BETWEEN '20250101' AND '20250107'
        GROUP BY user_pseudo_id
      )
      SELECT
        PARSE_DATE('%Y%m%d', event_date) AS event_date,
        COUNT(DISTINCT user_pseudo_id) AS unique_users
      FROM base
      GROUP BY event_date
      ORDER BY event_date
    `;
    expect(extractSelectColumns(sql)).toEqual(['event_date', 'unique_users']);
  });

  it('함수 인자 안의 콤마는 항목 구분으로 세지 않는다', () => {
    const sql = `SELECT SAFE_DIVIDE(SUM(clicks), SUM(views)) AS ctr, IF(a, 'x,y', 'z') AS flag FROM t`;
    expect(extractSelectColumns(sql)).toEqual(['ctr', 'flag']);
  });

  it('점 표기·백틱 컬럼은 마지막 세그먼트를 쓴다', () => {
    const sql = 'SELECT t.event_name, `event_date` FROM t';
    expect(extractSelectColumns(sql)).toEqual(['event_name', 'event_date']);
  });

  it('DISTINCT 키워드를 건너뛴다', () => {
    const sql = `SELECT DISTINCT event_name FROM t`;
    expect(extractSelectColumns(sql)).toEqual(['event_name']);
  });

  it('SELECT * 는 추정 불가로 빈 배열', () => {
    expect(extractSelectColumns('SELECT * FROM t')).toEqual([]);
    expect(extractSelectColumns('SELECT t.* FROM t')).toEqual([]);
  });

  it('별칭 없는 표현식이 있으면 빈 배열(부분 추정 금지)', () => {
    expect(extractSelectColumns('SELECT COUNT(*) FROM t')).toEqual([]);
  });

  it('주석과 문자열 안의 키워드를 무시한다', () => {
    const sql = `
      -- SELECT 주석, FROM 주석
      SELECT event_name, 'from here' AS label
      FROM t
    `;
    expect(extractSelectColumns(sql)).toEqual(['event_name', 'label']);
  });

  it('SQL이 아니면 빈 배열', () => {
    expect(extractSelectColumns('이건 SQL이 아님')).toEqual([]);
  });
});
