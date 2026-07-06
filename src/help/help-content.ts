// 도움말 허브 콘텐츠 데이터 — 문구·링크·(향후) 스크린샷 경로를 여기 모아 수정하기 쉽게 분리한다.
// UI(help-widget.ts)는 이 데이터를 렌더만 한다.

export const BQ_CONSOLE_URL =
  'https://console.cloud.google.com/bigquery?authuser=4&project=gobang-bigquery&supportedpurview=project';

export interface HelpStep {
  title: string;
  desc: string;
  // 스크린샷은 나중에 채운다. 값이 있으면 위젯이 <img>를 렌더한다(없으면 텍스트만).
  image?: string;
  imageAlt?: string;
}

export interface HelpLink {
  label: string;
  href: string;
  note?: string;
}

export interface HelpTab {
  id: string;
  label: string;
}

export const HELP_TABS: HelpTab[] = [
  { id: 'usage', label: '이용 방법' },
  { id: 'run', label: 'BQ에서 실행하기' },
  { id: 'links', label: '바로가기' },
];

// ① 이용 방법
export const USAGE_INTRO =
  '이 도구는 SQL을 몰라도 BigQuery 쿼리를 <b>만들어 줍니다</b>. 만든 SQL을 직접 실행하지는 않고, 복사해서 BigQuery 콘솔에 붙여 실행합니다.';

export interface UsageItem {
  name: string;
  desc: string;
}

export const USAGE_ITEMS: UsageItem[] = [
  {
    name: '대화형',
    desc: '자연어로 질문하면 AI가 SQL을 만들어 줍니다. 결과 구조를 확인한 뒤 SQL을 복사하세요.',
  },
  {
    name: '셀렉형',
    desc: '데이터·기간·이벤트·지표를 클릭으로 조립하면 SQL이 만들어집니다. 서버·비용이 들지 않습니다.',
  },
  {
    name: '이벤트 사전 (상단 버튼)',
    desc: '어떤 이벤트가 있고 각 이벤트에서 어떤 파라미터를 뽑을 수 있는지 검색·조회합니다.',
  },
];

// ② BQ에서 실행하기
export const RUN_STEPS: HelpStep[] = [
  { title: 'SQL 복사', desc: '빌더 우측 SQL 패널의 [복사] 버튼을 누릅니다.' },
  { title: 'BigQuery 콘솔 열기', desc: '아래 “BigQuery 콘솔 열기”를 눌러 새 탭에서 엽니다.' },
  { title: '쿼리 편집기에 붙여넣기', desc: '쿼리 편집기 칸을 클릭하고 Ctrl+V로 붙여넣습니다.' },
  { title: '실행', desc: '상단 [▶ 실행]을 누릅니다.' },
  {
    title: '결과 확인',
    desc: '하단 “결과” 탭에서 표를 확인하고, 필요하면 “결과 저장”으로 CSV를 내려받습니다.',
  },
];

export const RUN_CAUTION =
  '실행 전 기간(_TABLE_SUFFIX)과 예상 스캔량을 확인하세요. 스캔량이 곧 비용입니다.';

// ③ 바로가기
export const HELP_LINKS: HelpLink[] = [
  {
    label: 'BigQuery 콘솔 (gobang-bigquery)',
    href: BQ_CONSOLE_URL,
    note: '만든 SQL을 여기에 붙여 실행합니다.',
  },
];
