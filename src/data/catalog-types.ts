// catalog.json 구조 타입 정의. build-catalog.mjs가 생성하는 산출물과 1:1로 맞춘다.

export type ParamType = 'string' | 'int' | 'numeric';

export interface CatalogParam {
  key: string;
  description?: string;
  type: ParamType;
  cnt: number;
}

export interface CatalogEvent {
  name: string;
  label: string;
  description?: string;
  funnel?: string;
  cnt: number;
  params: CatalogParam[];
}

export interface CatalogProperty {
  datasetId: string;
  label: string;
  events: CatalogEvent[];
  // 있으면 마트류: 단일 물리 테이블(datasetId.tableId)을 event_date로 직접 필터.
  // 없으면 raw GA4 export: `datasetId.events_*` 와일드카드 + _TABLE_SUFFIX.
  tableId?: string;
  // UI 그룹핑: 같은 group끼리 상위 탭 하나로 묶고, group에 2개 이상이면 variant를 2차 세그먼트로 노출.
  group?: string;
  variant?: string;
}

export interface Catalog {
  projectId: string;
  generatedAt: string;
  properties: {
    gobang: CatalogProperty;
    uceo: CatalogProperty;
    gobang_mart: CatalogProperty;
  };
}
