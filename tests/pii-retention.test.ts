/**
 * 개인정보 보존기간 — 「보존기간 = 계약기간」(사장님 확정 2026-08-09).
 * 여기서 못 박는 것: 계약 중엔 보존 · 종료하면 파기 · **미수가 남으면 보류** ·
 * 파기는 필드만(레코드 유지) · 파기값은 빈값과 구분된다.
 */
import { describe, expect, it } from 'vitest';
import {
  CONTRACT_PII_FIELDS, PII_DISPOSED_AT, PII_TOMBSTONE,
  contractEndedOn, hasOutstanding, isDisposed, piiDisposalPatch, piiRetention,
} from '@/lib/pii-retention';

const TODAY = '2026-08-09';
const base = () => ({
  contractorName: '홍길동',
  contractorPhone: '010-1234-5678',
  plate: '12가3456',
  monthlyRent: 500000,
});

describe('보존 판정', () => {
  it('계약기간 중이면 보존한다', () => {
    const v = piiRetention({ ...base(), endDate: '2027-01-31' }, TODAY);
    expect(v.state).toBe('보존');
  });

  it('종료일이 없으면 기간을 못 재므로 보존한다', () => {
    expect(piiRetention(base(), TODAY).state).toBe('보존');
  });

  it('계약이 끝나고 미수가 없으면 파기 대상이다', () => {
    const v = piiRetention({ ...base(), endDate: '2026-03-31' }, TODAY);
    expect(v.state).toBe('파기대상');
  });

  it('★미수가 남으면 파기하지 않는다 — 지우면 회수를 못 한다', () => {
    const v = piiRetention({ ...base(), endDate: '2026-03-31', _carryUnpaid: 1_200_000 }, TODAY);
    expect(v.state).toBe('보류');
    expect(v.reason).toContain('미수');
  });

  it('net 으로 들어온 미수도 보류로 잡는다', () => {
    expect(piiRetention({ ...base(), endDate: '2026-03-31', net: 50_000 }, TODAY).state).toBe('보류');
    expect(hasOutstanding({ net: 0, _carryUnpaid: 0 })).toBe(false);
  });

  it('실제 반납일이 약정 종료일보다 우선한다', () => {
    // 약정은 내년까지지만 이미 반납했다 → 계약기간은 끝났다.
    const c = { ...base(), endDate: '2027-06-30', returnedDate: '2026-05-02' };
    expect(contractEndedOn(c)).toBe('2026-05-02');
    expect(piiRetention(c, TODAY).state).toBe('파기대상');
  });

  it('이미 파기한 계약은 다시 대상이 되지 않는다', () => {
    const v = piiRetention({ ...base(), endDate: '2026-03-31', [PII_DISPOSED_AT]: '2026-08-01' }, TODAY);
    expect(v.state).toBe('파기완료');
  });
});

describe('파기 패치', () => {
  it('개인정보 필드만 덮고 거래 정보는 건드리지 않는다', () => {
    const c = { ...base(), endDate: '2026-03-31', contractorAddress: '서울시 …' };
    const p = piiDisposalPatch(c, TODAY);
    expect(p.contractorName).toBe(PII_TOMBSTONE);
    expect(p.contractorPhone).toBe(PII_TOMBSTONE);
    expect(p.contractorAddress).toBe(PII_TOMBSTONE);
    expect(p[PII_DISPOSED_AT]).toBe(TODAY);
    // 계약 레코드의 근거는 남는다 — 미수·손익·세무가 여기 붙는다.
    expect(p.plate).toBeUndefined();
    expect(p.monthlyRent).toBeUndefined();
    expect(p.endDate).toBeUndefined();
  });

  it('원래 비어 있던 칸은 표식을 만들지 않는다', () => {
    const p = piiDisposalPatch({ contractorName: '홍길동', contractorPhone: '' }, TODAY);
    expect(p.contractorName).toBe(PII_TOMBSTONE);
    expect('contractorPhone' in p).toBe(false);
  });

  it('파기값은 빈값과 구분된다 — 화면이 「없음」과 헷갈리지 않게', () => {
    expect(isDisposed(PII_TOMBSTONE)).toBe(true);
    expect(isDisposed('')).toBe(false);
    expect(isDisposed('홍길동')).toBe(false);
  });

  it('파기 대상 필드 목록에 이름·연락처가 들어 있다', () => {
    expect(CONTRACT_PII_FIELDS).toContain('contractorName');
    expect(CONTRACT_PII_FIELDS).toContain('contractorPhone');
  });
});
