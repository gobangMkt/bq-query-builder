// DimensionSelection(판별 유니온)을 배열에서 토글/비교하기 위한 문자열 키.
// sql/types.ts의 DimensionSelection과 1:1 대응한다 (해당 파일은 읽기 전용 참조).

import type { DimensionSelection, TrafficSourceField } from '../sql/types';

export function dimensionKey(dim: DimensionSelection): string {
  switch (dim.kind) {
    case 'event_date':
      return 'event_date';
    case 'event_name':
      return 'event_name';
    case 'traffic_source':
      return `traffic_source:${dim.field}`;
    case 'branch_type':
      return 'branch_type';
    case 'param':
      return `param:${dim.key}`;
  }
}

/** dimensionKey()의 역함수. 칩 클릭 시 data-dim-key 문자열을 다시 DimensionSelection으로 되돌린다. */
export function parseDimensionKey(key: string): DimensionSelection {
  if (key === 'event_date') return { kind: 'event_date' };
  if (key === 'event_name') return { kind: 'event_name' };
  if (key === 'branch_type') return { kind: 'branch_type' };
  if (key.startsWith('traffic_source:')) {
    const field = key.slice('traffic_source:'.length) as TrafficSourceField;
    return { kind: 'traffic_source', field };
  }
  if (key.startsWith('param:')) {
    return { kind: 'param', key: key.slice('param:'.length) };
  }
  throw new Error(`알 수 없는 차원 키: ${key}`);
}
