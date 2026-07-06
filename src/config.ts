// S3 게이트 상수. 정적 사이트 한계로 완전한 보안이 아니라 외부인 차단용이다.
export const ACCESS_KEY = 'gobang';
export const AUTH_STORAGE_KEY = 'bqb_auth';

// v6: 대화형 Gemini SQL 생성 프록시(GAS 웹앱). 프록시가 GEMINI_API_KEY를 보관하며,
// 이 URL은 공개돼도 무방(게이트는 프록시의 ACCESS_KEY가 담당).
export const PROXY_URL =
  'https://script.google.com/macros/s/AKfycbxbV10P_aFCY5fQAEn4nz0XGeiNs4pB2SrSA92NFkS2RAPNO0FT3NIOiXIOV0mJI5sGLw/exec';

// 관리자 핸드오프 패널(#admin) 전용. 팀 게이트(ACCESS_KEY)와 별개.
// 정적 사이트 한계상 클라이언트 검증(외부인 차단용). 소유자가 값 변경 가능.
export const ADMIN_KEY = 'gobang-admin';
export const ADMIN_STORAGE_KEY = 'bqb_admin';

export type PropertyKey = 'gobang' | 'uceo';

// 프로퍼티별 노션 GTM 택소노미 페이지 URL(동기화 출처).
export const NOTION_TAXONOMY_URLS: Record<PropertyKey, string> = {
  gobang: 'https://app.notion.com/p/GTM-1-39138269954380d1a050e73b48616eed',
  uceo: 'https://app.notion.com/p/U-GTM-1-3913826995438057b59ed6bbbfdb2266',
};
