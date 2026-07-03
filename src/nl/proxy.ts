// v6: 대화형 Gemini SQL 생성 프록시 클라이언트.
// 자연어 질문 + 선택 프로퍼티의 트림 스키마를 GAS 웹앱에 보내 SQL 텍스트를 받는다.
// ⚠️ BigQuery 실행은 하지 않는다 — 반환된 SQL은 사람이 BQ 콘솔에서 실행한다.

import { ACCESS_KEY, PROXY_URL } from '../config';
import type { CatalogProperty } from '../data/catalog-types';

export interface TrimmedSchema {
  events: Array<{ name: string; params: Array<{ key: string; type: string }> }>;
}

export interface ProxyHistoryItem {
  question: string;
  sql: string;
}

export interface ProxyBudget {
  spentKrw: number;
  capKrw: number;
}

export type ProxyResult =
  | {
      ok: true;
      sql: string;
      explanation: string;
      corrected: boolean;
      cached?: boolean;
      budget?: ProxyBudget;
    }
  | { ok: false; error: string; sql?: string; budgetExceeded?: boolean; budget?: ProxyBudget };

// 선택 프로퍼티 1개만 트림(이벤트명·파람키·타입). cnt 등 불요 필드 제거 → 프롬프트 경량화.
export function trimSchema(property: CatalogProperty): TrimmedSchema {
  return {
    events: property.events.map((ev) => ({
      name: ev.name,
      params: ev.params.map((p) => ({ key: p.key, type: p.type })),
    })),
  };
}

export interface CallProxyArgs {
  question: string;
  property: CatalogProperty;
  history?: ProxyHistoryItem[];
}

export async function callProxy(args: CallProxyArgs): Promise<ProxyResult> {
  if (!PROXY_URL) {
    return { ok: false, error: 'AI 프록시가 아직 배포되지 않았습니다(PROXY_URL 미설정).' };
  }
  const payload = {
    accessKey: ACCESS_KEY,
    question: args.question,
    property: { datasetId: args.property.datasetId, label: args.property.label },
    schema: trimSchema(args.property),
    history: (args.history ?? []).slice(-3),
  };

  let res: Response;
  try {
    // text/plain 으로 보내 CORS preflight 를 피한다(GAS 웹앱 패턴).
    res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, error: 'AI 프록시에 연결하지 못했습니다(네트워크).' };
  }

  if (!res.ok) {
    return { ok: false, error: `AI 프록시 오류(${res.status}).` };
  }

  let data: ProxyResult;
  try {
    data = (await res.json()) as ProxyResult;
  } catch {
    return { ok: false, error: 'AI 프록시 응답을 해석하지 못했습니다.' };
  }
  return data;
}
