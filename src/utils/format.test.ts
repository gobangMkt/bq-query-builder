import { describe, expect, it } from 'vitest';
import { formatCount, presetRange, toDateInputValue } from './format';

describe('formatCount', () => {
  it('1000 미만은 그대로 문자열로 반환한다', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
  });

  it('1000 이상은 K 단위로 축약한다', () => {
    expect(formatCount(1000)).toBe('1K');
    expect(formatCount(1500)).toBe('1.5K');
    expect(formatCount(999499)).toBe('999.5K');
    expect(formatCount(999949)).toBe('999.9K');
  });

  it('K 단위 반올림이 1000.0K로 넘어가는 경계값은 M 단위로 승격한다', () => {
    // 999,950 이상은 (n/1000).toFixed(1)이 '1000.0'이 되어버리는 경계 버그였다.
    expect(formatCount(999950)).toBe('1M');
    expect(formatCount(999999)).toBe('1M');
  });

  it('1,000,000 이상은 M 단위로 축약한다', () => {
    expect(formatCount(1_000_000)).toBe('1M');
    expect(formatCount(1_234_567)).toBe('1.2M');
    expect(formatCount(1_050_000)).toBe('1.1M');
  });
});

describe('toDateInputValue', () => {
  it('YYYY-MM-DD 형식으로 변환한다', () => {
    expect(toDateInputValue(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('presetRange', () => {
  it('오늘 포함 최근 N일 범위를 반환한다', () => {
    const range = presetRange(7);
    const from = new Date(range.from);
    const to = new Date(range.to);
    const diffDays = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(6);
  });
});
