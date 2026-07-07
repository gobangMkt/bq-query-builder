// 미리보기 표본값 — 전 서비스 이벤트/파라미터를 커버하는 최소 대표 데이터.
// 값은 노션 텍소노미의 실제 enum·형식(data/taxonomy-*.json)을 본떠 손으로 큐레이션한다.
// 실제 BQ 조회 결과는 아니지만(자격증명 0 설계), 컬럼별로 실데이터와 같은 형태를 보여준다.
// 순수 데이터/함수만 둔다 (DOM/네트워크 금지).

// 컬럼명(파라미터 key·고정 컬럼) → 대표 표본값 배열. 3행 미만이면 순환 사용.
const SAMPLE_VALUES: Record<string, string[]> = {
  // ── 공통 고정 컬럼 ──────────────────────────────
  event_name: ['branch_view', 'inquiry', 'page_view'],
  event_time: ['14:23:11', '09:05:47', '21:38:02'],
  user_pseudo_id: ['1837465920.1719284410', '9042185503.1718003921', '4471028846.1720551188'],
  user_id: ['', 'u_84213', ''],
  traffic_source_source: ['google', 'naver', '(direct)'],
  traffic_source_medium: ['organic', 'cpc', '(none)'],
  traffic_source_campaign: ['(organic)', 'brand_search', '(not set)'],
  branch_type_grouped: ['고시원', '원룸', '오피스텔'],
  session_engaged: ['1', '1', '0'],
  engagement_time_msec: ['12840', '3560', '920'],

  // ── 지표(generate.ts METRIC_EXPR alias) ─────────
  이벤트수: ['1284', '356', '92'],
  고유사용자수: ['418', '132', '47'],
  고유세션수: ['503', '161', '58'],

  // ── 고방(gobang) 파라미터 ──────────────────────
  search_source: ['map', 'feed', 'community'],
  search_query: ['원룸', '청년주택', '고시원'],
  search_term: ['원룸', '청년주택', '고시원'],
  quicksearch_type: ['gosi', 'youth', 'mate'],
  branch_id: ['b_10432', 'b_20871', 'b_33150'],
  branch_type: ['고시원', '원룸', '오피스텔'],
  branch_name: ['관악 그린빌', '신림 하우스', '봉천 리버뷰'],
  location_station: ['서울대입구역', '신림역', '봉천역'],
  location_city: ['서울', '경기', '부산'],
  location_district: ['관악구', '동작구', '수원시'],
  location_university: ['서울대학교', '숭실대학교', '중앙대학교'],
  price_deposit_max: ['10000000', '5000000', '3000000'],
  price_deposit_min: ['1000000', '500000', '300000'],
  price_month_max: ['550000', '450000', '350000'],
  price_month_min: ['350000', '300000', '250000'],
  has_discount: ['true', 'false', 'true'],
  review_count: ['27', '12', '3'],
  is_favorited: ['true', 'false', 'false'],
  is_guaranteez: ['true', 'false', 'true'],
  is_foreigner: ['false', 'false', 'true'],
  is_schedule: ['true', 'false', 'true'],
  is_recommend: ['true', 'false', 'true'],
  is_city_alarm: ['true', 'false', 'true'],
  ad_grade: ['signature', 'prime', 'basic'],
  inquiry_method: ['전화', '카톡', '문자'],
  notices_id: ['n_2024031', 'n_2024078', 'n_2024102'],
  notices_type: ['전세임대', '행복주택', '국민임대'],
  schedule_action: ['on', 'off', 'on'],
  city_alarm_action: ['on', 'off', 'on'],
  percent_scrolled: ['75', '80', '90'],
  contents_type: ['시리즈', '서비스', '일반'],
  contents_tag: ['혼잘혜택', '혼잘주거', '혼잘팁'],
  prev_page: ['notices', 'recommend_all', 'recommendlist_all'],
  ad_banner_id: ['ad_1021', 'ad_2044', 'ad_3088'],
  ad_banner_service_area: ['youth', 'main', 'community'],
  ad_banner_position: ['main_top', 'notice_list', 'community_list'],
  ad_banner_type: ['banner_image', 'infeed_image', 'infeed_video'],
  ad_banner_link_url: [
    'https://gobang.co.kr/event/2026summer',
    'https://gobang.co.kr/notices/2024078',
    'https://gobang.co.kr/place/33150',
  ],
  ad_is_expanded: ['true', 'false', 'false'],
  link_url: ['https://naver.com', 'https://youtube.com/watch', 'https://apply.lh.or.kr'],
  link_domain: ['naver.com', 'youtube.com', 'apply.lh.or.kr'],
  outbound: ['true', 'true', 'false'],

  // ── U사장님(uceo) 파라미터 ──────────────────────
  select_ad_grade: ['unlimited', 'premium', 'basic'],
  select_ad_type: ['3개월', '6개월(5%할인)', '12개월(10%할인)'],
  select_pay_type: ['card', 'cash', 'card'],
  product_price: ['590000', '330000', '150000'],
  form_destination: ['/regist', '/ads', '/ad-plus/join'],
  first_field_name: ['phone', 'branch_name', 'email'],
};

// 정확한 컬럼명 매칭이 없을 때 쓰는 이름 패턴 폴백. 순서대로 첫 매칭 사용.
const PATTERN_FALLBACKS: Array<{ test: RegExp; values: string[] }> = [
  { test: /(^is_|_is_|^has_|^outbound$)/i, values: ['true', 'false', 'true'] },
  { test: /(_id$|^id$)/i, values: ['id_10432', 'id_20871', 'id_33150'] },
  { test: /(url|link)$/i, values: ['https://gobang.co.kr/', 'https://naver.com', 'https://youtube.com'] },
  { test: /(price|amount|_cnt$|count|_msec$)/i, values: ['1284', '356', '92'] },
  { test: /(type|grade|source|method|action|status)$/i, values: ['type_a', 'type_b', 'type_c'] },
];

/** 컬럼명에 대응하는 표본값 배열을 반환. 알 수 없으면 null (타입 기반 폴백은 호출부 담당). */
export function sampleValuesFor(columnName: string): string[] | null {
  const exact = SAMPLE_VALUES[columnName];
  if (exact) return exact;
  for (const { test, values } of PATTERN_FALLBACKS) {
    if (test.test(columnName)) return values;
  }
  return null;
}
