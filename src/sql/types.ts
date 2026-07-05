// S2: SQL 생성 엔진 — 선택 상태 타입 정의. UI 상태를 그대로 옮겨 담는 순수 데이터 타입.

export type PropertyKey = 'gobang' | 'uceo';

export interface DateRange {
  start: string; // 'YYYY-MM-DD'
  end: string; // 'YYYY-MM-DD'
}

export type MetricType = 'event_count' | 'unique_users' | 'unique_sessions';

// 비율 지표: 분자/분모 이벤트의 발생 건수 비(SAFE_DIVIDE). 두 이벤트 모두 선택 이벤트 안에 있어야 한다.
export type RatioFormat = 'percent' | 'decimal';

export interface RatioMetric {
  numeratorEvent: string;
  denominatorEvent: string;
  format: RatioFormat;
  decimals: number; // 표시 소수점 자리(0~4)
}

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

// v2: "사람 조건" — 조회 기간 안에서 특정 이벤트를 했다(did=true)/안 했다(did=false)로 유저를 거른다.
// 여러 조건은 AND로 결합된다. 판정 기간은 조회 기간과 동일하다.
export interface SegmentCondition {
  event: string;
  did: boolean;
}

export interface AggregateSelection {
  propertyKey: PropertyKey;
  dateRange: DateRange | null;
  events: string[];
  dimensions: DimensionSelection[];
  metrics: MetricType[];
  // 비율 지표(선택). 있으면 SAFE_DIVIDE 컬럼을 추가로 낸다. metrics가 비어 있어도 ratio만으로 생성 가능.
  ratio?: RatioMetric | null;
  filters: FilterCondition[];
  segments?: SegmentCondition[];
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
  segments?: SegmentCondition[];
}
