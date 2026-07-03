// S3 게이트 상수. 정적 사이트 한계로 완전한 보안이 아니라 외부인 차단용이다.
export const ACCESS_KEY = 'gobang';
export const AUTH_STORAGE_KEY = 'bqb_auth';

// v6: 대화형 Gemini SQL 생성 프록시(GAS 웹앱). 프록시가 GEMINI_API_KEY를 보관하며,
// 이 URL은 공개돼도 무방(게이트는 프록시의 ACCESS_KEY가 담당).
export const PROXY_URL =
  'https://script.google.com/macros/s/AKfycbxbV10P_aFCY5fQAEn4nz0XGeiNs4pB2SrSA92NFkS2RAPNO0FT3NIOiXIOV0mJI5sGLw/exec';
