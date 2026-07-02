// 숫자·날짜 축약 유틸. 프레임워크 없는 순수 함수만 둔다.

export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  const units: Array<[number, string]> = [
    [1_000_000, 'M'],
    [1_000, 'K'],
  ];
  for (const [threshold, suffix] of units) {
    if (n >= threshold) {
      const value = (n / threshold).toFixed(1);
      const trimmed = value.endsWith('.0') ? value.slice(0, -2) : value;
      return `${trimmed}${suffix}`;
    }
  }
  return String(n);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// days=7 → 오늘 포함 최근 7일 (오늘-6 ~ 오늘)
export function presetRange(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - (days - 1));
  return { from: toDateInputValue(from), to: toDateInputValue(to) };
}
