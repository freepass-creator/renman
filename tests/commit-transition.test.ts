/**
 * 전이 오케스트레이터(lib/contracts/commit-transition) — 순수 planTransition 검증.
 *   저장 executor(runTransition)는 store 부수효과라 여기서 다루지 않음(vi.mock 금지).
 *   보장: (1) histKey 멱등·형식, (2) 전이 가드(중복 인도/반납 차단), (3) 미수 중립(patch가 patchDeliver/patchReturn 직접호출과 deep-equal).
 */
import { describe, it, expect } from 'vitest';
import { planTransition } from '@/lib/contracts/commit-transition';
import { patchDeliver, patchReturn } from '@/lib/contract-ops';
import type { EntityRecord } from '@/lib/intake/entities';

const base = (over: EntityRecord = {}): EntityRecord => ({
  _key: 'C-100', plate: '12가3456', contractorName: '홍길동', startDate: '2026-01-01', ...over,
});
const inp = (over: Partial<Parameters<typeof planTransition>[0]> = {}) => ({
  action: 'deliver' as const, contract: base(), date: '2026-07-24',
  extra: { fuelOut: '만탱크', mileageOut: 43120 } as EntityRecord,
  actor: '김실무', sessionCompanyId: 'jpk', target: 'jpk', ...over,
});

describe('planTransition — histKey 멱등·형식', () => {
  it('동일 입력 2회 → histKey 동일(결정적)', () => {
    expect(planTransition(inp()).histKey).toBe(planTransition(inp()).histKey);
  });
  it('인도 histKey = `{contractNo}|인도|{date}` (contractNo=_key 우선)', () => {
    expect(planTransition(inp()).histKey).toBe('C-100|인도|2026-07-24');
  });
  it('반납 histKey = `{contractNo}|반납|{date}`', () => {
    const p = planTransition(inp({ action: 'return', extra: { fuelIn: '3/4' } }));
    expect(p.histKey).toBe('C-100|반납|2026-07-24');
  });
  it('_key/contractNo 없으면 plate 로 histKey 구성', () => {
    const p = planTransition(inp({ contract: { plate: '99하9999' } }));
    expect(p.histKey).toBe('99하9999|인도|2026-07-24');
  });
  it('활동기록 필드 — category·_kind·companyId(target)·author·customer', () => {
    const a = planTransition(inp()).activity;
    expect(a.category).toBe('인도');
    expect(a._kind).toBe('activity');
    expect(a.companyId).toBe('jpk');
    expect(a.author).toBe('김실무');
    expect(a.customer).toBe('홍길동');
    expect(a.contractNo).toBe('C-100');
    expect(a.histKey).toBe('C-100|인도|2026-07-24');
  });
});

describe('planTransition — 전이 가드(중복 차단)', () => {
  it('인도: fresh 없음/대기 → 진행 · 이미인도(deliveredDate)·종료상태 → 차단', () => {
    const g = planTransition(inp()).guard;
    expect(g(null)).toBe(true);
    expect(g({ status: '대기' })).toBe(true);
    expect(g({ deliveredDate: '2026-07-20' })).toBe(false);
    for (const s of ['운행', '반납', '해지', '채권']) expect(g({ status: s })).toBe(false);
  });
  it('반납: fresh 없음/운행 → 진행 · 이미반납(returnedDate)·종료상태 → 차단', () => {
    const g = planTransition(inp({ action: 'return', extra: { fuelIn: '1/2' } })).guard;
    expect(g(null)).toBe(true);
    expect(g({ status: '운행' })).toBe(true);
    expect(g({ returnedDate: '2026-07-20' })).toBe(false);
    for (const s of ['반납', '해지', '채권']) expect(g({ status: s })).toBe(false);
  });
});

describe('planTransition — 미수 중립(patch가 patches SSOT 직접호출과 deep-equal)', () => {
  it('deliver transitionPatch === patchDeliver(contract, date, extra)', () => {
    const c = base(); const date = '2026-07-24'; const extra: EntityRecord = { fuelOut: '만탱크', mileageOut: 43120 };
    expect(planTransition(inp({ contract: c, date, extra })).transitionPatch).toEqual(patchDeliver(c, date, extra));
  });
  it('return transitionPatch === patchReturn(contract, date, extra)', () => {
    const c = base({ status: '운행', deliveredDate: '2026-01-05' });
    const date = '2026-07-24'; const extra: EntityRecord = { fuelIn: '3/4', returnMileage: 47250, returnSettleNote: '스크래치' };
    expect(planTransition(inp({ action: 'return', contract: c, date, extra })).transitionPatch).toEqual(patchReturn(c, date, extra));
  });
});
