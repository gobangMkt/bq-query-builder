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

export interface HelpTab {
  id: string;
  label: string;
}

export const HELP_TABS: HelpTab[] = [
  { id: 'usage', label: '이용 방법' },
  { id: 'run', label: 'BQ에서 실행하기' },
];

// ── ① 이용 방법 ──────────────────────────────────────────
export const USAGE_INTRO =
  '이 도구는 SQL을 몰라도 BigQuery 쿼리를 <b>만들어 줍니다</b>. 직접 실행하지는 않고, 만든 SQL을 복사해 BigQuery 콘솔에 붙여 실행합니다. 만드는 방법은 <b>대화형</b>과 <b>셀렉형</b> 두 가지입니다.';

export interface UsageItem {
  name: string;
  desc: string;
  // 예시 문구/입력 (있으면 위젯이 인용 박스로 렌더)
  example?: string;
}

export const USAGE_ITEMS: UsageItem[] = [
  {
    name: '① 대화형 — 자연어로 질문',
    desc: '상단 "대화형"에서 원하는 걸 문장으로 적고 [해석하기]를 누르면 AI가 SQL을 만듭니다. 먼저 결과 구조를 보여주고, [맞아요, 이대로]를 눌러야 SQL이 우측에 나옵니다. @를 입력하면 이벤트 이름을 골라 넣을 수 있어요.',
    example: '지난 한 주 동안 배너 종류별 클릭율(CTR)을 날짜순으로',
  },
  {
    name: '② 셀렉형 — 클릭으로 조립',
    desc: '"셀렉형"에서 문장 빈칸을 채우듯 고릅니다: 데이터 → 기간 → 이벤트 → (조건) → 행으로 묶을 기준 → 볼 값(지표). 서버·AI를 안 타서 비용이 0이고, 고른 대로 SQL이 즉시 만들어집니다.',
    example: '고방 · 최근 7일 · ad_banner_view · 날짜별로 묶어 · 이벤트수',
  },
  {
    name: '③ 이벤트 사전 (상단 버튼)',
    desc: '어떤 이벤트가 있고 각 이벤트에서 어떤 파라미터를 뽑을 수 있는지 검색·조회합니다. 검색창에 키워드를 넣으면 "검색결과 N개 모두 추가"로 한 번에 선택할 수 있어요.',
    example: 'ad_banner 검색 → [검색결과 3개 모두 추가]',
  },
  {
    name: '④ 비율 계산 (CTR 등)',
    desc: '셀렉형 "볼 값(값)"에서 비율 계산을 켜면 분자÷분모를 구합니다. 분자·분모 이벤트를 고르면 각 건수와 비율(%)이 함께 나옵니다. 예: 클릭 ÷ 조회 = 클릭률.',
    example: 'ad_banner_click ÷ ad_banner_view → 비율(%)',
  },
  {
    name: '⑤ AI 사용량 바 (대화형 상단)',
    desc: '대화형은 AI를 쓰므로 비용이 듭니다. 상단 바에 이번 달 사용액과 한도(₩1,500)를 표시하고, 한도에 도달하면 자동으로 막힙니다. 같은 질문은 캐시돼 재호출되지 않아요. 셀렉형은 비용이 전혀 없습니다.',
  },
  {
    name: '⑥ 의견 보내기 (상단 버튼)',
    desc: '오류·불편·개선 아이디어를 보냅니다. 내용과 분류만 고르면 접수됩니다(익명, 연락처 불필요).',
  },
];

// ── ② BQ에서 실행하기 ────────────────────────────────────
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
