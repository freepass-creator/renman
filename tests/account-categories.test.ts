import { describe, it, expect } from 'vitest';
import {
  ACCOUNT_CATEGORIES, accountCategory, countsToPnl, isUnderClassified,
} from '@/lib/finance/account-categories';

/**
 * 계정과목은 실무 자금일보에서 뽑은 것이다(1,793건 · 45종).
 * 이름을 바꾸거나 성격을 잘못 잡으면 **손익이 조용히 틀어진다** — 그래서 핀으로 박는다.
 */
describe('계정과목 SSOT', () => {
  it('실무에서 가장 많이 쓰는 과목이 빠지지 않았다', () => {
    for (const n of ['대여료', '자금이동', '이체수수료', '보험료', '할부금', '차량관리비']) {
      expect(accountCategory(n), `${n} 누락`).toBeTruthy();
    }
  });

  it('★자금이동은 손익에서 빠진다 — 계좌 간 이동이라 입출금이 쌍으로 잡힌다', () => {
    expect(countsToPnl('자금이동')).toBe(false);
  });

  it('차입·보증금·차량구매는 손익이 아니다', () => {
    for (const n of ['차입금', '차입금 상환', '보증금', '보증금 반환', '차량구매비', '할부금']) {
      expect(countsToPnl(n), `${n} 은 비손익이어야 한다`).toBe(false);
    }
  });

  it('대여료는 손익에 들어간다', () => {
    expect(countsToPnl('대여료')).toBe(true);
  });

  it('모르는 과목은 손익에 넣지 않는다 — 조용히 부풀리는 것보다 빠지는 게 낫다', () => {
    expect(countsToPnl('듣도보도못한과목')).toBe(false);
    expect(countsToPnl('')).toBe(false);
    expect(countsToPnl(undefined)).toBe(false);
  });

  it('대여료인데 차량·임차인이 비면 «분류 미완»', () => {
    expect(isUnderClassified({ category: '대여료', plate: '120라5445', tenant: '백민정' })).toBe(false);
    expect(isUnderClassified({ category: '대여료', plate: '120라5445' })).toBe(true);
    expect(isUnderClassified({ category: '대여료', tenant: '백민정' })).toBe(true);
  });

  it('과목 자체를 모르면 미완이다', () => {
    expect(isUnderClassified({ category: '' })).toBe(true);
  });

  it('이체수수료는 차량이 없어도 완결이다', () => {
    expect(isUnderClassified({ category: '이체수수료' })).toBe(false);
  });

  it('과목 이름이 중복되지 않는다', () => {
    const names = ACCOUNT_CATEGORIES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
