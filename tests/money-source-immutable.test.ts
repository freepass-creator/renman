/**
 * 자금 원자 불변 — update 경계 (순위 5, rules `moneySourceImmutable`).
 *
 * create-only(P0-2)가 «덮어쓰기»를 막았다면 이건 «고쳐쓰기»를 막는다.
 * 클라 가드와 firestore.rules 가 **같은 목록**을 봐야 한다 — 갈라지면 클라는 통과시키고
 * 서버가 PERMISSION_DENIED 를 내는 «원인 모를 저장 실패»가 된다. 그 동기화를 여기서 못박는다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MONEY_SOURCE_FIELDS, isImportedMoneyRecord, changedMoneySourceFields, assertMoneySourceUnchanged,
} from '@/lib/finance/immutable-money';

const rules = readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8');
const store = readFileSync(join(process.cwd(), 'lib', 'store.ts'), 'utf8');

const imported = () => ({
  txKey: '신한6616|2026-05-10|390000|||고객175|대여료', _key: '신한6616|2026-05-10|390000',
  account: '신한 6616', txDate: '2026-05-10', amount: 390_000, withdraw: 0, balance: 12_000_000,
  counterparty: '고객175', jeokyo: 'BZ뱅크', memo: '대여료 86버1166', category: '대여료수입',
});
const manual = () => { const r = imported() as Record<string, unknown>; delete r.txKey; return r; };

describe('수집 거래 판별', () => {
  it('txKey 가 있으면 파일·마이그레이션에서 온 것', () => {
    expect(isImportedMoneyRecord(imported())).toBe(true);
  });
  it('손입력 단건(txKey 없음)은 수집 거래가 아니다 — 오타 정정 허용', () => {
    expect(isImportedMoneyRecord(manual())).toBe(false);
    expect(isImportedMoneyRecord(null)).toBe(false);
  });
});

describe('바뀐 원자 필드 판정', () => {
  it('금액·일자·상대는 원자', () => {
    expect(changedMoneySourceFields(imported(), { amount: 400_000 })).toEqual(['amount']);
    expect(changedMoneySourceFields(imported(), { txDate: '2026-05-11' })).toEqual(['txDate']);
    expect(changedMoneySourceFields(imported(), { counterparty: '다른사람' })).toEqual(['counterparty']);
  });

  it('앱이 붙이는 값은 원자가 아니다 — 매칭·계정과목·정산·메모·수단', () => {
    expect(changedMoneySourceFields(imported(), {
      category: 'CMS집금', subject: 'CMS집금', matchedContractId: 'ctr_1', matchedKind: 'receivable',
      settlementId: 'cms_1', settlementRole: 'deposit', memo: 'CMS집금 정산(수동)', method: 'CMS', note: '확인함',
    })).toEqual([]);
  });

  it('같은 값 재전송은 수정이 아니다', () => {
    expect(changedMoneySourceFields(imported(), { amount: 390_000, txDate: '2026-05-10' })).toEqual([]);
  });

  it('여러 개가 한꺼번에 바뀌면 전부 잡는다', () => {
    expect(changedMoneySourceFields(imported(), { amount: 1, balance: 2 })).toEqual(['amount', 'balance']);
  });
});

describe('클라 가드', () => {
  it('★수집 거래의 금액 수정은 사유와 함께 거부', () => {
    expect(() => assertMoneySourceUnchanged('bank_tx', imported(), { amount: 999 }))
      .toThrow(/원자 항목\(amount\)은 고칠 수 없습니다/);
  });

  it('손입력 단건은 금액을 고칠 수 있다 — 사람이 친 값이다', () => {
    expect(() => assertMoneySourceUnchanged('bank_tx', manual(), { amount: 999 })).not.toThrow();
  });

  it('자금 아닌 엔티티는 대상이 아니다', () => {
    expect(() => assertMoneySourceUnchanged('vehicle', { txKey: 'x', amount: 1 }, { amount: 2 })).not.toThrow();
  });

  it('매칭·정산 수정은 그대로 통과 — 이게 막히면 수납 업무가 멈춘다', () => {
    expect(() => assertMoneySourceUnchanged('bank_tx', imported(), {
      matchedContractId: 'ctr_1', matchedScheduleSeq: 3, category: '대여료수입',
    })).not.toThrow();
  });

  it('★txKey 를 지우고 고치는 2단계 우회 차단 — txKey 자체가 원자다', () => {
    expect(() => assertMoneySourceUnchanged('bank_tx', imported(), { txKey: null })).toThrow();
  });

  it('store.update 가 이 가드를 통과한다', () => {
    expect(store).toContain('assertMoneySourceUnchanged(entityKey,');
  });
});

describe('firestore.rules ↔ 클라 목록 동기화', () => {
  it('rules 에 moneySourceImmutable 이 있고 update 에 걸려 있다', () => {
    expect(rules).toContain('function moneySourceImmutable(coll)');
    expect(rules).toContain('&& moneySourceImmutable(coll);');
  });

  it('★불변 목록이 양쪽에서 같다 — 갈라지면 「원인 모를 저장 실패」가 된다', () => {
    const block = rules.slice(rules.indexOf('function moneySourceImmutable(coll)'));
    const listed = [...block.slice(0, block.indexOf(']')).matchAll(/'([A-Za-z_][A-Za-z_0-9]*)'/g)].map((m) => m[1]);
    for (const field of MONEY_SOURCE_FIELDS) {
      expect(listed, `rules 에 ${field} 없음`).toContain(field);
    }
    // 규칙에만 있는 필드도 없어야 한다(클라가 통과시키는 구멍)
    const extra = listed.filter((k) => !['coll', 'txKey'].includes(k) && !(MONEY_SOURCE_FIELDS as readonly string[]).includes(k));
    expect(extra).toEqual([]);
  });

  it('손입력 단건은 규칙에서도 예외', () => {
    expect(rules).toContain("!('txKey' in resource.data)");
  });

  it('memo 는 의도적으로 제외 — 앱이 정산 라벨을 쓴다', () => {
    expect(MONEY_SOURCE_FIELDS).not.toContain('memo');
    expect(rules).toMatch(/`memo` 는 일부러 제외/);
  });
});
