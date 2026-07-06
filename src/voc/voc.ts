// VoC SDK — 전용 VoC GAS로 사용자 의견을 전송한다.
// project 태그로 중앙 VoC 시트에서 서비스를 구분한다(이 서비스 = bq-query-builder).
// 수집은 익명(토큰 불필요). 처리·라우팅은 VoC 관제센터가 담당하며 이 앱은 submitVoc만 호출한다.

const VOC_GAS =
  'https://script.google.com/macros/s/AKfycbxu24IH7mD_DE4S5tB_Aebhtz-psa-qUlHmAtRVKlfh9tpprwSGE8Z1KFTL_XuC2sonLA/exec';

export const VOC_PROJECT = 'bq-query-builder';

export const VOC_CATEGORIES = [
  '오류·안됨',
  '불편·개선',
  '새 기능 제안',
  '이용 문의',
  '기타',
] as const;
export type VocCategory = (typeof VOC_CATEGORIES)[number];

export interface VocInput {
  message: string;
  category?: string;
  phone?: string;
}

export interface VocResult {
  ok: boolean;
  id?: string;
  deduped?: boolean;
  error?: string;
}

export async function submitVoc({ message, category, phone }: VocInput): Promise<VocResult> {
  // text/plain 으로 보내 CORS preflight 를 피한다(GAS 웹앱 패턴).
  const res = await fetch(VOC_GAS, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'submitVoc',
      project: VOC_PROJECT,
      message,
      category: category || '기타',
      channel: 'app',
      phone: phone || '',
    }),
  });
  return res.json() as Promise<VocResult>;
}
