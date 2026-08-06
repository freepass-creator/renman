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

import { toLedgerSubject, SUBJECT_ALIAS } from '@/lib/finance/account-categories';
import { isLedgerSubject, kindOfLabel } from '@/lib/payments/ledger-subjects';

/**
 * 실무 표기 → 앱 정규 과목. 이 다리가 없으면 업로드가 «선택지에 없는 값»을 심는다.
 * (앱 정규 SSOT = lib/payments/ledger-subjects.ts)
 */
describe('SUBJECT_ALIAS — 파일의 말 → 앱의 말', () => {
  it('별칭이 가리키는 값은 전부 앱 정규 과목에 실재한다', () => {
    for (const [raw, mapped] of Object.entries(SUBJECT_ALIAS)) {
      expect(isLedgerSubject(mapped), `${raw} → ${mapped} 가 LEDGER_SUBJECTS 에 없다`).toBe(true);
    }
  });

  it('★자금이동은 계좌간이체로 옮겨지고 «이체»로 잡힌다 — 손익에서 빠져야 한다', () => {
    expect(toLedgerSubject('자금이동')).toBe('계좌간이체');
    expect(kindOfLabel('계좌간이체')).toBe('이체');
  });

  it('대여료는 대여료수입(수입)으로', () => {
    expect(toLedgerSubject('대여료')).toBe('대여료수입');
    expect(kindOfLabel('대여료수입')).toBe('수입');
  });

  it('할부금은 할부원금상환(이체) — 원금은 손익이 아니다', () => {
    expect(toLedgerSubject('할부금')).toBe('할부원금상환');
    expect(kindOfLabel('할부원금상환')).toBe('이체');
  });

  it('대응이 없으면 원문 그대로 — 억지로 «기타»에 몰지 않는다', () => {
    expect(toLedgerSubject('차입금')).toBe('차입금');
    expect(toLedgerSubject('출자금')).toBe('출자금');
    expect(toLedgerSubject('')).toBe('');
  });
});
