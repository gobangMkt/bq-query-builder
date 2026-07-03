import { describe, expect, it } from 'vitest';
import { parseQuery, type ParsedQuery } from './parse';
import type { CatalogProperty } from '../data/catalog-types';

const property: CatalogProperty = {
  datasetId: 'analytics_111',
  label: '고방',
  events: [
    { name: 'branch_view', label: '지점 조회', cnt: 1, params: [] },
    { name: 'youth_notices', label: '공고 상세 조회', cnt: 1, params: [] },
    { name: 'page_view', label: '페이지뷰', cnt: 1, params: [] },
    { name: 'inquiry', label: '문의', cnt: 1, params: [] },
    { name: 'zzim_memo_place', label: '찜 메모 (토스트)', cnt: 1, params: [] },
    { name: 'zzim_memo_zzimlist', label: '찜 메모 (찜 목록)', cnt: 1, params: [] },
    { name: 'read_complete_notices', label: '공고 완독', cnt: 1, params: [] },
  ],
};

function parsed(text: string): ParsedQuery {
  const r = parseQuery(text, property);
  if (r.status !== 'parsed') throw new Error(`expected parsed, got ${r.status}`);
  return r;
}

describe('parseQuery — 예시 문장', () => {
  const example = '지난 한 주 동안, 찜 메모를 누른 사람 중 공고완독을 하지 않은 사람들이 발생시킨 조회수를 보고싶어';

  it('기간 7일로 해석한다', () => {
    expect(parsed(example).period.days).toBe(7);
  });

  it('사람 조건 2개(찜메모 했다 / 공고완독 안했다)를 뽑는다', () => {
    const r = parsed(example);
    expect(r.segments).toHaveLength(2);
    const memo = r.segments.find((s) => s.choice.term === '찜 메모');
    const read = r.segments.find((s) => s.choice.term === '공고완독');
    expect(memo?.did).toBe(true);
    expect(read?.did).toBe(false);
  });

  it('찜 메모는 후보 2개라 되물음(resolved=null)', () => {
    const memo = parsed(example).segments.find((s) => s.choice.term === '찜 메모');
    expect(memo?.choice.candidates).toEqual(['zzim_memo_place', 'zzim_memo_zzimlist']);
    expect(memo?.choice.resolved).toBeNull();
  });

  it('공고완독은 단일 후보라 확정', () => {
    const read = parsed(example).segments.find((s) => s.choice.term === '공고완독');
    expect(read?.choice.resolved).toBe('read_complete_notices');
  });

  it('대상 조회수는 후보 여러 개라 되물음이고 event_count 지표', () => {
    const r = parsed(example);
    expect(r.target.term).toBe('조회수');
    expect(r.target.resolved).toBeNull();
    expect(r.target.candidates.length).toBeGreaterThan(1);
    expect(r.metric).toBe('event_count');
  });
});

describe('parseQuery — 기간', () => {
  it('한 달 → 30일', () => expect(parsed('최근 한 달 문의수').period.days).toBe(30));
  it('2주 → 14일', () => expect(parsed('2주 지점 조회수').period.days).toBe(14));
  it('N일 패턴 → N', () => expect(parsed('최근 5일 문의수').period.days).toBe(5));
  it('기간 없으면 기본 7일', () => expect(parsed('문의수').period.days).toBe(7));
});

describe('parseQuery — 지표', () => {
  it('사용자 수 → unique_users', () => expect(parsed('지난 주 문의 사용자 수').metric).toBe('unique_users'));
  it('세션 → unique_sessions', () => expect(parsed('지난 주 지점 조회 세션수').metric).toBe('unique_sessions'));
  it('그 외 → event_count', () => expect(parsed('지난 주 문의수').metric).toBe('event_count'));
});

describe('parseQuery — 문맥 해석', () => {
  it('"지점 조회수"는 branch_view로 확정', () => {
    expect(parsed('지난 주 지점 조회수').target.resolved).toBe('branch_view');
  });
  it('"공고 조회수"는 youth_notices로 확정', () => {
    expect(parsed('지난 주 공고 조회수').target.resolved).toBe('youth_notices');
  });
});

describe('parseQuery — 거절', () => {
  it('순서 조건(하고 나서)', () => {
    expect(parseQuery('찜하고 나서 문의한 사람', property).status).toBe('rejected');
  });
  it('기간 비교(대비)', () => {
    expect(parseQuery('지난 주 대비 문의수 증감', property).status).toBe('rejected');
  });
  it('리텐션', () => {
    expect(parseQuery('가입자 리텐션 보고싶어', property).status).toBe('rejected');
  });
  it('프로퍼티 교차', () => {
    expect(parseQuery('고방이랑 U사장님 문의수 비교', property).status).toBe('rejected');
  });
});

describe('parseQuery — 인식 실패', () => {
  it('대상 이벤트가 없으면 unparsed', () => {
    expect(parseQuery('지난 주 동안 뭔가 알려줘', property).status).toBe('unparsed');
  });
  it('빈 입력은 unparsed', () => {
    expect(parseQuery('   ', property).status).toBe('unparsed');
  });
});
