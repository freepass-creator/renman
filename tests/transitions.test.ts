/**
 * 계약 상태 머신 — 허용 전이 SSOT 검증. (평가 P1: 허용 전이 강제)
 *   대기→운행(deliver) · 운행→반납(return)/해지(terminate)/운행(extend) · 종료(반납·해지·채권)=전이 없음
 */
import { describe, it, expect } from 'vitest';
import { canTransition, nextStatus } from '@/lib/domain/status';

describe('canTransition — 허용 전이만 통과', () => {
  it('대기 → deliver → 운행', () => {
    expect(canTransition('대기', 'deliver')).toBe(true);
    expect(nextStatus('대기', 'deliver')).toBe('운행');
  });
  it('운행 → return/terminate/extend 허용', () => {
    expect(canTransition('운행', 'return')).toBe(true);
    expect(canTransition('운행', 'terminate')).toBe(true);
    expect(canTransition('운행', 'extend')).toBe(true);
    expect(nextStatus('운행', 'return')).toBe('반납');
    expect(nextStatus('운행', 'terminate')).toBe('해지');
  });
  it('이미 운행인데 다시 deliver → 금지', () => {
    expect(canTransition('운행', 'deliver')).toBe(false);
  });
  it('종료 계약(반납·해지·채권) 재인도·재전이 금지', () => {
    for (const s of ['반납', '해지', '채권']) {
      expect(canTransition(s, 'deliver')).toBe(false);
      expect(canTransition(s, 'return')).toBe(false);
      expect(canTransition(s, 'terminate')).toBe(false);
      expect(canTransition(s, 'extend')).toBe(false);
    }
  });
  it('대기 계약은 반납/해지 불가(인도 전)', () => {
    expect(canTransition('대기', 'return')).toBe(false);
    expect(canTransition('대기', 'terminate')).toBe(false);
  });
  it('알 수 없는 상태 → 모든 전이 금지', () => {
    expect(canTransition('', 'deliver')).toBe(false);
    expect(canTransition('이상한상태', 'return')).toBe(false);
  });
});
