import { describe, it, expect } from 'vitest';
import { sampleValuesFor } from './sample-values';

describe('sampleValuesFor', () => {
  it('택소노미 enum을 본뜬 실데이터형 값을 반환한다', () => {
    expect(sampleValuesFor('inquiry_method')).toEqual(['전화', '카톡', '문자']);
    expect(sampleValuesFor('ad_grade')).toEqual(['signature', 'prime', 'basic']);
    expect(sampleValuesFor('select_ad_grade')).toEqual(['unlimited', 'premium', 'basic']);
  });

  it('지표 alias는 현실적인 집계 숫자를 반환한다', () => {
    expect(sampleValuesFor('이벤트수')).toEqual(['1284', '356', '92']);
    expect(sampleValuesFor('고유사용자수')?.[0]).toBe('418');
  });

  it('정확 매칭이 없으면 이름 패턴으로 폴백한다', () => {
    expect(sampleValuesFor('some_id')).toEqual(['id_10432', 'id_20871', 'id_33150']);
    expect(sampleValuesFor('is_new_user')).toEqual(['true', 'false', 'true']);
  });

  it('알 수 없는 컬럼은 null (타입 폴백은 호출부 담당)', () => {
    expect(sampleValuesFor('totally_unknown_xyz')).toBeNull();
  });
});
