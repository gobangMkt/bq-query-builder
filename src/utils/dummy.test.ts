import { describe, it, expect } from 'vitest';
import { computePreviewRows, PREVIEW_ROW_COUNT, type PreviewColumn } from './dummy';

describe('computePreviewRows', () => {
  it('표본값이 있는 컬럼은 실데이터형 값을 채운다', () => {
    const cols: PreviewColumn[] = [
      { name: 'inquiry_method', kind: 'string' },
      { name: '이벤트수', kind: 'numeric' },
    ];
    const rows = computePreviewRows(cols);
    expect(rows).toHaveLength(PREVIEW_ROW_COUNT);
    expect(rows[0]).toEqual(['전화', '1284']);
    expect(rows[1]).toEqual(['카톡', '356']);
    expect(rows.map((r) => r[0])).not.toContain('(예시1)');
  });

  it('표본값이 없는 string 컬럼은 예시 폴백을 쓴다', () => {
    const rows = computePreviewRows([{ name: 'unknown_col_xyz', kind: 'string' }]);
    expect(rows[0][0]).toBe('(예시1)');
  });

  it('date 컬럼은 최근 날짜 폴백을 유지한다', () => {
    const rows = computePreviewRows([{ name: 'event_date', kind: 'date' }]);
    expect(rows[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
