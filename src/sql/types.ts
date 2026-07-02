// S2: SQL 생성 엔진 — 선택 상태 타입 정의. UI 상태를 그대로 옮겨 담는 순수 데이터 타입.

export type PropertyKey = 'gobang' | 'uceo';

export interface DateRange {
  start: string; // 'YYYY-MM-DD'
  end: string; // 'YYYY-MM-DD'
}

export type MetricType = 'event_count' | 'unique_users' | 'unique_sessions';

export type TrafficSourceField = 'source' | 'medium' | 'campaign';

export type DimensionSelection =
  | { kind: 'event_date' }
  | { kind: 'event_name' }
  | { kind: 'traffic_source'; field: TrafficSourceField }
  | { kind: 'branch_type' }
  | { kind: 'param'; key: string };

export type FilterOperator = '=' | '!=' | 'IN' | 'CONTAINS';

export interface FilterCondition {
  // base 컬럼명(event_name/user_pseudo_id/user_id/traffic_source_source 등) 또는 event_param 키
  field: string;
  operator: FilterOperator;
  // IN만 배열, 나머지는 단일 값
  value: string | number | (string | number)[];
}

export interface AggregateSelection {
  propertyKey: PropertyKey;
  dateRange: DateRange | null;
  events: string[];
  dimensions: DimensionSelection[];
  metrics: MetricType[];
  filters: FilterCondition[];
}

// S6: 모드 토글(집계/상세). 상세 모드는 지표·차원 대신 "포함할 컬럼"(event_params 개별 키) 선택.
export type AppMode = 'aggregate' | 'detail';

export interface WideSelection {
  propertyKey: PropertyKey;
  dateRange: DateRange | null;
  events: string[];
  // 기본 컬럼(event_date/event_time/event_name/user_pseudo_id/user_id/traffic_source 계열)은
  // 항상 포함되므로 여기 담지 않는다. 여기엔 선택된 event_params 키만 순서대로 담는다.
  columns: string[];
  filters: FilterCondition[];
  // null이면 LIMIT 미적용(전체 반환).
  limit: number | null;
}
