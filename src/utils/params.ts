// 선택된 이벤트들이 실제로 가진 event_param의 합집합을 계산한다.
// SQL 엔진(src/sql/generate.ts)은 존재하지 않는 파라미터를 관대하게 통과시키지 않지만(throw),
// UI 단계에서 애초에 후보를 "선택된 이벤트가 가진 것"으로만 좁혀 잘못된 선택을 막는다.

import type { CatalogProperty, ParamType } from '../data/catalog-types';

export interface ParamCandidate {
  key: string;
  type: ParamType;
  description?: string;
  /** 이 파라미터를 가진, 현재 선택된 이벤트명 목록 (선택 순서 보존) */
  events: string[];
}

export function unionParamsForEvents(
  property: CatalogProperty,
  eventNames: string[],
): ParamCandidate[] {
  const map = new Map<string, ParamCandidate>();

  for (const eventName of eventNames) {
    const event = property.events.find((e) => e.name === eventName);
    if (!event) continue;
    for (const param of event.params) {
      const existing = map.get(param.key);
      if (existing) {
        existing.events.push(eventName);
        if (!existing.description && param.description) existing.description = param.description;
      } else {
        map.set(param.key, {
          key: param.key,
          type: param.type,
          description: param.description,
          events: [eventName],
        });
      }
    }
  }

  return [...map.values()];
}

/** 파라미터 카탈로그 타입 조회. property 내 어떤 이벤트에서도 못 찾으면 undefined. */
export function findParamType(property: CatalogProperty, key: string): ParamType | undefined {
  for (const event of property.events) {
    const param = event.params.find((p) => p.key === key);
    if (param) return param.type;
  }
  return undefined;
}
