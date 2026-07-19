// 숫자 → 한글 금액 (영수증·증명서 발급용). v5 lib/format/korean 이식.
//   numberToKorean(500000) → '오십만' / fmtKMoneyHangul(500000) → '금 오십만원정'
const DIGITS_KR = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
const PLACE_KR = ['', '십', '백', '천'];
const UNIT_KR = ['', '만', '억', '조', '경'];

export function numberToKorean(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '영';
  if (n < 0) return '-' + numberToKorean(-n);
  let result = '';
  let unitIdx = 0;
  let v = Math.floor(n);
  while (v > 0) {
    const chunk = v % 10000;
    if (chunk > 0) {
      let chunkStr = '';
      let c = chunk;
      let p = 0;
      while (c > 0) {
        const d = c % 10;
        if (d > 0) chunkStr = DIGITS_KR[d] + PLACE_KR[p] + chunkStr;
        c = Math.floor(c / 10);
        p += 1;
      }
      result = chunkStr + UNIT_KR[unitIdx] + result;
    }
    v = Math.floor(v / 10000);
    unitIdx += 1;
  }
  return result;
}

/** 영수증 표준 한글 금액 (예: '금 오십만원정'). */
export function fmtKMoneyHangul(n: number, prefix = '금 ', suffix = '원정'): string {
  return `${prefix}${numberToKorean(n)}${suffix}`;
}
