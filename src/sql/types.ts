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
