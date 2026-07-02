import type { Catalog } from './data/catalog-types';
import { presetRange } from './utils/format';
// sql/types.ts는 S2 엔진의 선택상태 타입 정의(읽기 전용 참조). S4 상태를 이 타입에 맞춰
// 이름 짓고 구조화해두면 S5에서 AggregateSelection으로 옮기는 변환이 단순해진다.
import type { DimensionSelection, FilterCondition, MetricType } from './sql/types';

export type PropertyKey = keyof Catalog['properties'];
export type DatePreset = 7 | 14 | 30 | null;

export interface AppState {
  property: PropertyKey;
  datePreset: DatePreset;
  dateFrom: string;
  dateTo: string;
  searchQuery: string;
  selectedEvents: Record<PropertyKey, Set<string>>;
  dimensions: Record<PropertyKey, DimensionSelection[]>;
  metrics: Record<PropertyKey, Set<MetricType>>;
  filters: Record<PropertyKey, FilterCondition[]>;
}

const initialRange = presetRange(7);

export const state: AppState = {
  property: 'gobang',
  datePreset: 7,
  dateFrom: initialRange.from,
  dateTo: initialRange.to,
  searchQuery: '',
  selectedEvents: {
    gobang: new Set(),
    uceo: new Set(),
  },
  dimensions: {
    gobang: [{ kind: 'event_date' }],
    uceo: [{ kind: 'event_date' }],
  },
  metrics: {
    gobang: new Set(['event_count']),
    uceo: new Set(['event_count']),
  },
  filters: {
    gobang: [],
    uceo: [],
  },
};
