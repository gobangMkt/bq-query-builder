// 숫자·날짜 축약 유틸. 프레임워크 없는 순수 함수만 둔다.

function formatUnit(value: number, suffix: string): string {
  const rounded = value.toFixed(1);
  const trimmed = rounded.endsWith('.0') ? rounded.slice(0, -2) : rounded;
  return `${trimmed}${suffix}`;
}

export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  // K 단위로 표시하면 소수 1자리 반올림에서 1000.0K가 되는 경계값(예: 999,950)이 있다.
  // 그 경우엔 M 단위로 승격해서 표시한다.
  if (n < 1_000_000) {
    const kRounded = Number((n / 1_000).toFixed(1));
    if (kRounded < 1000) return formatUnit(n / 1_000, 'K');
  }
  return formatUnit(n / 1_000_000, 'M');
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
