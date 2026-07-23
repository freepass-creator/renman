/**
 * 계약 상태 머신 — 허용 전이 SSOT 검증. (평가 P1: 허용 전이 강제)
 *   대기→운행(deliver) · 운행→반납(return)/해지(terminate)/운행(extend) · 종료(반납·해지·채권)=전이 없음
 */
import { describe, it, expect } from 'vitest';
import { canTransition, nextStatus, canSetStatus } from '@/lib/domain/status';

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

describe('canSetStatus — 직접 status 쓰기 백스톱(SM-1: 종료 계약 부활 차단)', () => {
  it('종료 계약을 운행/대기로 되살리기 → 금지', () => {
    for (const ended of ['반납', '해지', '채권']) {
      expect(canSetStatus(ended, '운행')).toBe(false); // 부활
      expect(canSetStatus(ended, '대기')).toBe(false); // 좀비
    }
  });
  it('전진 전이·채권화·인도 → 허용', () => {
    expect(canSetStatus('대기', '운행')).toBe(true);
    expect(canSetStatus('운행', '반납')).toBe(true);
    expect(canSetStatus('운행', '해지')).toBe(true);
    expect(canSetStatus('운행', '채권')).toBe(true); // 채권화(정상 업무) 는 막지 않음
  });
  it('no-op·최초 설정·미설정 → 허용(정상 저장 무영향)', () => {
    expect(canSetStatus('해지', '해지')).toBe(true);  // 종료 계약 다른 필드 수정(status 동일)
    expect(canSetStatus('', '운행')).toBe(true);       // 최초 설정
    expect(canSetStatus('운행', '')).toBe(true);       // status 미포함/클리어
    expect(canSetStatus(undefined, undefined)).toBe(true);
  });
});
