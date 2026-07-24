/**
 * 운영시트 인라인 경고(lib/sheet-warnings) — 순수 rowWarnings 경계값 검증.
 *   보험/검사 D-7·D-30 티어, 연체 회수단계, 면허, 무계약 운행, held 게이트.
 */
import { describe, it, expect } from 'vitest';
import { rowWarnings, rowSeverity, type RowWarnCtx } from '@/lib/sheet-warnings';

const TODAY = '2026-07-24';
const ctx = (over: Partial<RowWarnCtx> = {}): RowWarnCtx => ({
  held: true, active: false, contractRec: null, veh: null, util: '휴차', customer: '',
  dday: null, rent: 0, overdueDays: 0, insEnd: '', inspectionTo: '', today: TODAY, ...over,
});
const codes = (c: RowWarnCtx) => rowWarnings(c).map((w) => w.code);
const find = (c: RowWarnCtx, code: string) => rowWarnings(c).find((w) => w.code === code);

describe('rowWarnings — 보유 게이트', () => {
  it('held=false → 경고 없음(매각·고아)', () => {
    expect(rowWarnings(ctx({ held: false, insEnd: '2026-01-01', overdueDays: 100 }))).toEqual([]);
  });
});

describe('rowWarnings — 보험(조인 insEnd 정본)', () => {
  it('만료 → 무보험 high', () => { expect(find(ctx({ insEnd: '2026-07-01' }), 'ins_expired')?.sev).toBe('high'); });
  it('D-7(경계) → 보험 임박 high', () => { expect(find(ctx({ insEnd: '2026-07-31' }), 'ins_soon')?.sev).toBe('high'); });
  it('D-8 → 보험 임박 med', () => { expect(find(ctx({ insEnd: '2026-08-01' }), 'ins_soon')?.sev).toBe('med'); });
  it('D-30(경계) → 보험 임박 med', () => { expect(find(ctx({ insEnd: '2026-08-23' }), 'ins_soon')?.sev).toBe('med'); });
  it('D-31 → 경고 없음', () => { expect(codes(ctx({ insEnd: '2026-08-24' }))).not.toContain('ins_soon'); });
  it('insEnd 없음 + 운행 → 미확인 med', () => { expect(find(ctx({ insEnd: '', active: true, contractRec: { contractorLicenseNo: 'X' } }), 'ins_missing')?.sev).toBe('med'); });
  it('insEnd 없음 + 비운행 → 경고 없음(노이즈 억제)', () => { expect(codes(ctx({ insEnd: '', active: false }))).not.toContain('ins_missing'); });
});

describe('rowWarnings — 검사(veh.inspectionTo)', () => {
  it('만료 → high', () => { expect(find(ctx({ inspectionTo: '2026-07-01' }), 'inspection_expired')?.sev).toBe('high'); });
  it('D-7 → 임박 high', () => { expect(find(ctx({ inspectionTo: '2026-07-31' }), 'inspection_soon')?.sev).toBe('high'); });
  it('D-30 → 임박 med', () => { expect(find(ctx({ inspectionTo: '2026-08-23' }), 'inspection_soon')?.sev).toBe('med'); });
});

describe('rowWarnings — 미수 회수단계', () => {
  it('연체 0 → 없음', () => { expect(codes(ctx({ overdueDays: 0 }))).not.toContain('collection'); });
  it('연체 1(경고) → med', () => { expect(find(ctx({ overdueDays: 1 }), 'collection')?.sev).toBe('med'); });
  it('연체 3(시동제어) → high', () => { expect(find(ctx({ overdueDays: 3 }), 'collection')?.sev).toBe('high'); });
  it('연체 30(채권화) → high · 라벨', () => {
    const w = find(ctx({ overdueDays: 30 }), 'collection');
    expect(w?.sev).toBe('high'); expect(w?.label).toBe('미수·채권화');
  });
});

describe('rowWarnings — 계약 기반(운행일 때만)', () => {
  const run = (over: Partial<RowWarnCtx>) => ctx({ active: true, contractRec: { contractorLicenseNo: 'DL-1' }, customer: '홍길동', util: '운행', rent: 500000, ...over });
  it('반납 지남(dday<0) → high', () => { expect(find(run({ dday: -3 }), 'return_overdue')?.sev).toBe('high'); });
  it('대여료 0 → med', () => { expect(find(run({ rent: 0 }), 'rent_zero')?.sev).toBe('med'); });
  it('면허 미확인 → high', () => { expect(find(run({ contractRec: {} }), 'no_license')?.sev).toBe('high'); });
  it('비운행이면 계약기반 경고 없음', () => {
    expect(codes(ctx({ active: false, dday: -5, rent: 0 }))).not.toContain('return_overdue');
  });
});

describe('rowWarnings — 무계약 운행 정합', () => {
  it('util 운행 + 계약자 없음 + 비활성 → no_contract med', () => {
    expect(find(ctx({ util: '운행', customer: '', active: false }), 'no_contract')?.sev).toBe('med');
  });
});

describe('rowSeverity', () => {
  it('high 포함 → high · med만 → med · 없음 → null', () => {
    expect(rowSeverity([{ code: 'a', label: '', sev: 'med' }, { code: 'b', label: '', sev: 'high' }])).toBe('high');
    expect(rowSeverity([{ code: 'a', label: '', sev: 'med' }])).toBe('med');
    expect(rowSeverity([])).toBeNull();
  });
});
