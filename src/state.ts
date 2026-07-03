import type { Catalog } from './data/catalog-types';
import { presetRange } from './utils/format';
// sql/types.ts는 S2 엔진의 선택상태 타입 정의(읽기 전용 참조). S4 상태를 이 타입에 맞춰
// 이름 짓고 구조화해두면 S5에서 AggregateSelection으로 옮기는 변환이 단순해진다.
import type {
  AppMode,
  DimensionSelection,
  FilterCondition,
  MetricType,
  SegmentCondition,
} from './sql/types';

export type PropertyKey = keyof Catalog['properties'];
export type DatePreset = 7 | 14 | 30 | null;

// v2: 좌측 입력 방식. 대화형(문장→해석 칩) / 셀렉형(직접 조립). 우측 미리보기·SQL은 공통.
export type InputMode = 'chat' | 'select';

// S5: 생성된 SQL 표시 상태. 선택이 바뀌면 stale=true로 표시(재생성 유도), 엔진 예외는 error로 담는다.
export type SqlOutputState =
  | { status: 'ok'; code: string; stale: boolean }
  | { status: 'error'; message: string };

// S6: 상세(Wide) 모드 LIMIT 기본값. 켜져 있으면 이 값을, 꺼져 있으면 LIMIT 없이 생성한다.
export const DETAIL_LIMIT_VALUE = 1000;

export interface AppState {
  property: PropertyKey;
  inputMode: InputMode;
  mode: AppMode;
  datePreset: DatePreset;
  dateFrom: string;
  dateTo: string;
  searchQuery: string;
  selectedEvents: Record<PropertyKey, Set<string>>;
  dimensions: Record<PropertyKey, DimensionSelection[]>;
  metrics: Record<PropertyKey, Set<MetricType>>;
  // 상세 모드에서 "포함할 컬럼"으로 고른 event_params 키(기본 컬럼은 항상 포함되므로 담지 않는다).
  detailColumns: Record<PropertyKey, Set<string>>;
  detailLimitEnabled: Record<PropertyKey, boolean>;
  filters: Record<PropertyKey, FilterCondition[]>;
  // v2: 사람 조건(세그먼트) — 했다/안 했다로 유저 필터.
  segments: Record<PropertyKey, SegmentCondition[]>;
  sql: Record<PropertyKey, SqlOutputState | null>;
}

const initialRange = presetRange(7);

export const state: AppState = {
  property: 'gobang',
  inputMode: 'chat',
  mode: 'aggregate',
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
  detailColumns: {
    gobang: new Set(),
    uceo: new Set(),
  },
  detailLimitEnabled: {
    gobang: true,
    uceo: true,
  },
  filters: {
    gobang: [],
    uceo: [],
  },
  segments: {
    gobang: [],
    uceo: [],
  },
  sql: {
    gobang: null,
    uceo: null,
  },
};
