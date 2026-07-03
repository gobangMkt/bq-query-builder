// AI가 생성한 SQL의 최종 SELECT 컬럼명을 추출한다 — 구조 미리보기(확인 단계)용.
// 완전한 SQL 파서가 아니라 이 도구가 만드는 형태(CTE + 최종 SELECT, 별칭 사용)를 겨냥한
// 베스트에포트 추출기. 추정 불가하면 빈 배열을 반환하고 미리보기는 안내 문구로 대체된다.

// 각 문자 위치가 "코드 영역(문자열/백틱 밖)"인지와 괄호 깊이를 기록한다.
function buildMask(src: string): { code: boolean[]; depth: number[] } {
  const code: boolean[] = new Array(src.length).fill(false);
  const depth: number[] = new Array(src.length).fill(0);
  let d = 0;
  let mode: 'code' | 'sq' | 'dq' | 'bt' = 'code';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (mode === 'code') {
      if (ch === "'") mode = 'sq';
      else if (ch === '"') mode = 'dq';
      else if (ch === '`') mode = 'bt';
      else if (ch === '(') d += 1;
      else if (ch === ')') d = Math.max(0, d - 1);
      code[i] = mode === 'code';
    } else {
      if ((mode === 'sq' && ch === "'") || (mode === 'dq' && ch === '"') || (mode === 'bt' && ch === '`')) {
        mode = 'code';
      }
      code[i] = false;
    }
    depth[i] = d;
  }
  return { code, depth };
}

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

// depth 0·코드 영역에 있는 keyword의 시작 인덱스 목록.
function topLevelKeywordIndexes(
  src: string,
  mask: { code: boolean[]; depth: number[] },
  keyword: string,
): number[] {
  const out: number[] = [];
  const re = new RegExp(`\\b${keyword}\\b`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const i = m.index;
    if (mask.code[i] && mask.depth[i] === 0) out.push(i);
  }
  return out;
}

// depth 0 콤마 기준으로 SELECT 리스트를 항목별로 나눈다.
function splitTopLevel(src: string, mask: { code: boolean[]; depth: number[] }, from: number, to: number): string[] {
  const parts: string[] = [];
  let start = from;
  for (let i = from; i < to; i++) {
    if (src[i] === ',' && mask.code[i] && mask.depth[i] === 0) {
      parts.push(src.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(src.slice(start, to));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

function columnNameOf(item: string): string | null {
  // `expr AS alias` — 마지막 AS 별칭 우선.
  const asMatch = /\s+AS\s+`?([A-Za-z_][\w]*)`?\s*$/i.exec(item);
  if (asMatch) return asMatch[1];
  // 단순 컬럼 참조(점 표기·백틱 허용) — 마지막 세그먼트가 컬럼명.
  const bare = item.replace(/`/g, '');
  if (/^[A-Za-z_][\w.]*$/.test(bare)) {
    const segs = bare.split('.');
    return segs[segs.length - 1];
  }
  return null;
}

export function extractSelectColumns(sql: string): string[] {
  const src = stripComments(sql);
  const mask = buildMask(src);

  const selects = topLevelKeywordIndexes(src, mask, 'SELECT');
  if (selects.length === 0) return [];
  const selectAt = selects[selects.length - 1];
  const listStart = selectAt + 'SELECT'.length;

  const froms = topLevelKeywordIndexes(src, mask, 'FROM').filter((i) => i > listStart);
  const listEnd = froms.length > 0 ? froms[0] : src.length;

  const distinct = /^\s*DISTINCT\b/i.exec(src.slice(listStart, listEnd));
  const offset = distinct ? distinct[0].length : 0;

  const items = splitTopLevel(src, mask, listStart + offset, listEnd);

  const names: string[] = [];
  for (const item of items) {
    // `*` / `t.*` 는 컬럼을 확정할 수 없음 → 전체 포기.
    if (item === '*' || /\.\*$/.test(item.replace(/`/g, ''))) return [];
    const name = columnNameOf(item);
    if (name === null) return [];
    names.push(name);
  }
  return names;
}
