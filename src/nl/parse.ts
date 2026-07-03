// 규칙 기반 한국어 파서. LLM 없음. 문장 → 해석(기간 + 사람조건 0..n + 대상/지표) 또는 거절.
// 자유 문장 전부가 아니라 "기간 + 사람조건 + 대상/지표" 문형 + 카탈로그 사전 범위만 다룬다.
// 해석 결과를 칩으로 보여주고 확인받는 것이 UX의 핵심이며, 애매하면 되물음(needsChoice)으로 남긴다.

import type { CatalogProperty } from '../data/catalog-types';
import type { MetricType } from '../sql/types';
import { buildDictionary, type TermEntry } from './dictionary';

export interface EventChoice {
  term: string; // 사용자가 쓴 용어
  candidates: string[]; // 이벤트명 후보(문맥순 정렬)
  resolved: string | null; // 확정된 이벤트(null = 되물음 필요)
}

export interface ParsedSegment {
  did: boolean; // true=했다, false=안 했다
  choice: EventChoice;
}

export interface ParsedQuery {
  status: 'parsed';
  period: { days: number; label: string };
  segments: ParsedSegment[];
  target: EventChoice;
  metric: MetricType;
}

export interface RejectedQuery {
  status: 'rejected';
  reason: string;
  suggestion: string;
}

export interface UnparsedQuery {
  status: 'unparsed';
  hint: string;
}

export type ParseResult = ParsedQuery | RejectedQuery | UnparsedQuery;

// ----- 거절 규칙(감지 시 이유 + 대안) -----
const REJECTIONS: Array<{ test: RegExp; reason: string; suggestion: string }> = [
  {
    test: /(하고\s*나서|한\s*뒤|한\s*후|이후에|다음에|했다가|하고서)/,
    reason: '행동의 "순서" 조건(A 하고 나서 B)은 지원하지 않습니다.',
    suggestion: '"A를 한 사람 중 B를 한/안 한 사람"처럼 발생 여부 조건으로 바꿔보세요.',
  },
  {
    test: /(대비|증감|전주|저번\s*주와|지난주\s*대비|비교해|증가율|감소율|이전\s*기간)/,
    reason: '두 기간을 자동으로 비교하는 기능은 지원하지 않습니다.',
    suggestion: '기간을 하나씩 골라 각각 SQL을 만들어 콘솔에서 비교하세요.',
  },
  {
    test: /(리텐션|잔존|코호트|재방문율|\d+\s*주\s*차|n주차)/,
    reason: '리텐션·코호트 분석은 지원하지 않습니다.',
    suggestion: '셀렉형에서 세그먼트(사람 조건)로 근사해보거나 콘솔에서 직접 작성하세요.',
  },
  {
    test: /(고방).*(u\s*사장님|유사장님|u-?ceo)|(u\s*사장님|유사장님|u-?ceo).*(고방)/i,
    reason: '두 프로퍼티(고방·U사장님)를 한 번에 교차 조회할 수 없습니다.',
    suggestion: '상단 탭에서 한 프로퍼티를 고르고 각각 만들어보세요.',
  },
];

// ----- 기간 -----
function parsePeriod(text: string): { days: number; label: string } | null {
  if (/(지난|저번|최근|이번)?\s*(한\s*주|일\s*주일|1\s*주일|7\s*일|이번\s*주|저번\s*주|지난\s*주)/.test(text)) {
    return { days: 7, label: '최근 7일' };
  }
  if (/(2\s*주|14\s*일|이\s*주일)/.test(text)) return { days: 14, label: '최근 14일' };
  if (/(지난|저번|최근|이번)?\s*(한\s*달|1\s*달|30\s*일|한달|지난\s*달|저번\s*달)/.test(text)) {
    return { days: 30, label: '최근 30일' };
  }
  const nDays = text.match(/(\d+)\s*일/);
  if (nDays) {
    const n = Number(nDays[1]);
    if (n > 0 && n <= 365) return { days: n, label: `최근 ${n}일` };
  }
  return null;
}

// ----- 지표 -----
function parseMetric(text: string): MetricType {
  if (/(세션\s*수|세션수|세션)/.test(text)) return 'unique_sessions';
  if (/(사용자\s*수|사용자수|유저\s*수|이용자\s*수|몇\s*명|인원|명수)/.test(text)) return 'unique_users';
  return 'event_count';
}

function findTermIn(window: string, dict: TermEntry[]): TermEntry | null {
  // 긴 용어 우선(dict는 정렬됨). window에 등장하는 첫 항목.
  for (const entry of dict) {
    if (window.includes(entry.term)) return entry;
  }
  return null;
}

// 문맥으로 후보를 재정렬한다. 문맥이 결정적일 때만 단일로 좁혀 확정한다.
function rankCandidates(candidates: string[], text: string): { ranked: string[]; decisive: boolean } {
  if (candidates.length <= 1) return { ranked: candidates, decisive: candidates.length === 1 };
  const hasNotice = /(공고|청년)/.test(text);
  const hasBranch = /(지점|매물)/.test(text);
  const hasPage = /(페이지뷰|페이지\s*뷰)/.test(text);
  const score = (ev: string): number => {
    if (hasNotice && !hasBranch && ev.startsWith('youth')) return 2;
    if (hasBranch && !hasNotice && ev === 'branch_view') return 2;
    if (hasPage && ev === 'page_view') return 2;
    return 0;
  };
  const ranked = [...candidates].sort((a, b) => score(b) - score(a));
  const decisive = ranked.length > 0 && score(ranked[0]) === 2;
  return { ranked, decisive };
}

function makeChoice(term: string, candidates: string[], text: string): EventChoice {
  const { ranked, decisive } = rankCandidates(candidates, text);
  return { term, candidates: ranked, resolved: decisive ? ranked[0] : null };
}

interface SegmentHit {
  start: number;
  end: number;
  did: boolean;
  entry: TermEntry;
}

// "…사람/유저" 앞을 훑어 사람 조건을 뽑는다.
function extractSegments(text: string, dict: TermEntry[]): SegmentHit[] {
  const hits: SegmentHit[] = [];
  const re = /(사람들|사람|유저|이용자)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const winStart = Math.max(0, m.index - 20);
    const win = text.slice(winStart, m.index);
    const neg = /(하지\s*않|안\s*한|안\s*누|안\s*본|않은|안한)/.test(win);
    const pos = /(누른|본|한|남긴|제출한|클릭한|검색한|누름)/.test(win);
    if (!neg && !pos) continue;
    const entry = findTermIn(win, dict);
    if (!entry) continue;
    const termIdx = winStart + win.lastIndexOf(entry.term);
    hits.push({ start: termIdx, end: m.index + m[0].length, did: !neg, entry });
  }
  return hits;
}

export function parseQuery(text: string, property: CatalogProperty): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { status: 'unparsed', hint: '질문을 입력하세요.' };

  for (const r of REJECTIONS) {
    if (r.test.test(trimmed)) return { status: 'rejected', reason: r.reason, suggestion: r.suggestion };
  }

  const period = parsePeriod(trimmed);
  const dict = buildDictionary(property);

  const segHits = extractSegments(trimmed, dict);
  const segments: ParsedSegment[] = segHits.map((h) => ({
    did: h.did,
    choice: makeChoice(h.entry.term, h.entry.candidates, trimmed),
  }));

  // 세그먼트로 소비된 구간을 제거한 나머지에서 대상(지표 이벤트)을 찾는다.
  let remainder = trimmed;
  for (const h of [...segHits].sort((a, b) => b.start - a.start)) {
    remainder = remainder.slice(0, h.start) + ' ' + remainder.slice(h.end);
  }
  const targetEntry = findTermIn(remainder, dict);

  if (!targetEntry) {
    return {
      status: 'unparsed',
      hint: '무엇을 집계할지 이해하지 못했어요. 예: "지난 한 주 동안 지점 조회수" 또는 "찜한 사람의 문의수"처럼 대상을 넣어보세요.',
    };
  }

  const target = makeChoice(targetEntry.term, targetEntry.candidates, remainder);
  const metric = parseMetric(trimmed);

  return {
    status: 'parsed',
    period: period ?? { days: 7, label: '최근 7일' },
    segments,
    target,
    metric,
  };
}
