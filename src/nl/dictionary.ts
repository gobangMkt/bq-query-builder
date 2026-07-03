// 대화형 파서용 용어 사전. 카탈로그(이벤트 라벨·이름) + 수동 유의어를 합쳐,
// 한국어 용어 → 이벤트명 후보 목록으로 매핑한다. 프로퍼티에 실재하는 이벤트만 남긴다.

import type { CatalogProperty } from '../data/catalog-types';

export interface TermEntry {
  term: string;
  candidates: string[];
}

// 수동 유의어. 후보가 여러 개면 대화형에서 되물음(사용자 선택) 대상이 된다.
const SYNONYMS: Record<string, string[]> = {
  '찜 메모': ['zzim_memo_place', 'zzim_memo_zzimlist'],
  메모: ['zzim_memo_place', 'zzim_memo_zzimlist'],
  찜: ['zzim_branch', 'zzim_list', 'zzim_thumbnail'],
  공고완독: ['read_complete_notices'],
  '공고 완독': ['read_complete_notices'],
  완독: ['read_complete', 'read_complete_notices'],
  문의: ['inquiry'],
  '지점 조회': ['branch_view'],
  지점조회: ['branch_view'],
  '매물 조회': ['branch_view'],
  '공고 조회': ['youth_notices'],
  공고조회: ['youth_notices'],
  페이지뷰: ['page_view'],
  '페이지 뷰': ['page_view'],
  조회수: ['branch_view', 'youth_notices', 'page_view'],
  조회: ['branch_view', 'youth_notices', 'page_view'],
  검색: ['search', 'quicksearch'],
  퀵서치: ['quicksearch'],
  가입: ['appstream_new_join'],
  결제: ['ad_pay_complete'],
  '결제 완료': ['ad_pay_complete'],
  등록: ['regist_complete'],
  '등록 완료': ['regist_complete'],
};

/** 프로퍼티의 실제 이벤트 집합으로 후보를 거른 용어 사전(긴 용어 우선 정렬) */
export function buildDictionary(property: CatalogProperty): TermEntry[] {
  const validEvents = new Set(property.events.map((e) => e.name));
  const byTerm = new Map<string, string[]>();

  const addEntry = (term: string, candidates: string[]) => {
    const valid = candidates.filter((c) => validEvents.has(c));
    if (valid.length === 0) return;
    const existing = byTerm.get(term);
    if (existing) {
      for (const c of valid) if (!existing.includes(c)) existing.push(c);
    } else {
      byTerm.set(term, [...valid]);
    }
  };

  // 카탈로그 이벤트: 라벨·이름 자체를 용어로 (단일 후보)
  for (const event of property.events) {
    addEntry(event.name, [event.name]);
    if (event.label && event.label !== event.name) addEntry(event.label, [event.name]);
  }
  // 수동 유의어(있으면 후보 병합)
  for (const [term, candidates] of Object.entries(SYNONYMS)) addEntry(term, candidates);

  return [...byTerm.entries()]
    .map(([term, candidates]) => ({ term, candidates }))
    .sort((a, b) => b.term.length - a.term.length);
}
