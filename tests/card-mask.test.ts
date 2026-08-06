import { describe, it, expect } from 'vitest';
import { cardMaskMatches } from '@/lib/company-master';

/**
 * 카드 마스킹 비교 — 틀리면 «남의 회사 카드 지출»이 우리 손익에 붙는다.
 * 실파일 표기: 신한 `9410-64**-****-9` (끝 4자리를 안 준다).
 */
describe('cardMaskMatches', () => {
  it('가려진 자리는 무엇이든 통과 — 같은 카드로 본다', () => {
    expect(cardMaskMatches('9410-64**-****-9', '9410-6412-3456-9')).toBe(true);
    expect(cardMaskMatches('9410-64**-****-9', '9410-64**-****-9')).toBe(true);
  });

  it('구분자(하이픈·공백)는 무시한다 — 카드사마다 표기가 다르다', () => {
    expect(cardMaskMatches('9410 64** **** 9', '9410-64**-****-9')).toBe(true);
  });

  it('보이는 자리가 다르면 불일치', () => {
    expect(cardMaskMatches('9410-64**-****-9', '9410-64**-****-7')).toBe(false);
    expect(cardMaskMatches('9410-64**-****-9', '5310-64**-****-9')).toBe(false);
  });

  it('자릿수가 다르면 불일치 — 애매하면 안 붙인다', () => {
    expect(cardMaskMatches('9410-64**-****-9', '9410-6412-3456-789')).toBe(false);
  });

  it('빈 값은 절대 매칭되지 않는다 — 안 채운 카드가 전부를 빨아들이면 안 된다', () => {
    expect(cardMaskMatches('', '9410-64**-****-9')).toBe(false);
    expect(cardMaskMatches('9410-64**-****-9', '')).toBe(false);
    expect(cardMaskMatches('', '')).toBe(false);
    expect(cardMaskMatches('****-****-****-*', '9410-6412-3456-7')).toBe(true); // 전부 가려지면 자릿수만 맞으면 통과 — 그래서 위 빈값 차단이 중요
  });
});
