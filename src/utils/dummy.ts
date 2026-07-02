// 구조 미리보기용 더미값 생성. 실데이터 조회 없이 타입에 맞는 짧은 예시값만 만든다.
// 순수 함수만 둔다 (DOM/브라우저 API 금지, Date.now()는 예외적으로 "최근 날짜" 표시에만 사용).

import type { CatalogProperty } from '../data/catalog-types';
import type { DimensionSelection, MetricType } from '../sql/types';
import { findParamType } from './params';
import { toDateInputValue } from './format';

export type PreviewValueKind = 'date' | 'string' | 'numeric';

export interface PreviewColumn {
  name: string;
  kind: PreviewValueKind;
}

const METRIC_COLUMN_NAME: Record<MetricType, string> = {
  event_count: 'event_count',
  unique_users: 'unique_users',
  unique_sessions: 'unique_sessions',
};

export const PREVIEW_ROW_COUNT = 3;

function dimensionColumn(property: CatalogProperty, dim: DimensionSelection): PreviewColumn {
  switch (dim.kind) {
    case 'event_date':
      return { name: 'event_date', kind: 'date' };
    case 'event_name':
      return { name: 'event_name', kind: 'string' };
    case 'traffic_source':
      return { name: `traffic_source_${dim.field}`, kind: 'string' };
    case 'branch_type':
      return { name: 'branch_type_grouped', kind: 'string' };
    case 'param': {
      const type = findParamType(property, dim.key);
      const kind: PreviewValueKind = type === 'int' || type === 'numeric' ? 'numeric' : 'string';
      return { name: dim.key, kind };
    }
  }
}

export function computePreviewColumns(
  property: CatalogProperty,
  dimensions: DimensionSelection[],
  metrics: MetricType[],
): PreviewColumn[] {
  return [
    ...dimensions.map((d) => dimensionColumn(property, d)),
    ...metrics.map((m) => ({ name: METRIC_COLUMN_NAME[m], kind: 'numeric' as const })),
  ];
}

function recentDateStrings(count: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(toDateInputValue(d));
  }
  return out;
}

/** 컬럼별 더미값 3행. 열마다 값이 살짝 달라지도록 columnIndex로 오프셋을 준다. */
export function computePreviewRows(columns: PreviewColumn[]): string[][] {
  const dateValues = recentDateStrings(PREVIEW_ROW_COUNT);
  let numericColumnIndex = 0;

  const columnValues = columns.map((col) => {
    if (col.kind === 'date') return dateValues;
    if (col.kind === 'string') {
      return Array.from({ length: PREVIEW_ROW_COUNT }, (_, i) => `(예시${i + 1})`);
    }
    const offset = numericColumnIndex * 7;
    numericColumnIndex += 1;
    const base = [128, 47, 12];
    return base.map((v) => String(v + offset));
  });

  const rows: string[][] = [];
  for (let r = 0; r < PREVIEW_ROW_COUNT; r++) {
    rows.push(columnValues.map((values) => values[r]));
  }
  return rows;
}
