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
}

export interface Catalog {
  projectId: string;
  generatedAt: string;
  properties: {
    gobang: CatalogProperty;
    uceo: CatalogProperty;
  };
}
