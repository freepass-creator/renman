import { describe, expect, it } from 'vitest';
import {
  correctRentalAtom,
  createRentalAtom,
  projectLatestFacts,
  subjectTimeline,
} from '@/lib/reborn/rental-atom';

const evidence = [{ sourceId: 'contract.pdf', sourceType: 'document' as const, locator: 'p.1' }];

describe('Rental Manager vNext atom kernel', () => {
  it('creates the same atom for the same evidence and business fact', () => {
    const input = {
      tenantId: 'team-jpk',
      companyId: 'switchplan',
      kind: 'contract.terms' as const,
      subject: { type: 'contract' as const, id: 'contract-1' },
      logicalKey: 'monthlyRent',
      occurredAt: '2026-08-15T00:00:00.000Z',
      recordedAt: '2026-08-15T01:00:00.000Z',
      source: 'document' as const,
      confidence: 0.98,
      evidence,
      payload: { monthlyRent: 800_000 },
    };
    expect(createRentalAtom(input).atomId).toBe(createRentalAtom(input).atomId);
  });

  it('keeps the original and projects the correction as the current fact', () => {
    const original = createRentalAtom({
      tenantId: 'team-jpk',
      companyId: 'switchplan',
      kind: 'contract.terms',
      subject: { type: 'contract', id: 'contract-1' },
      logicalKey: 'driverMinimumAge',
      occurredAt: '2026-08-15T00:00:00.000Z',
      recordedAt: '2026-08-15T01:00:00.000Z',
      source: 'document',
      confidence: 0.9,
      evidence,
      payload: { age: 21 },
    });
    const corrected = correctRentalAtom(original, { age: 26 }, {
      reason: '계약서 원본 재확인',
      evidence: [{ ...evidence[0], locator: 'p.2' }],
      recordedAt: '2026-08-15T02:00:00.000Z',
    });

    const facts = projectLatestFacts([original, corrected]);
    expect(facts.size).toBe(1);
    expect([...facts.values()][0].payload).toEqual({ age: 26 });
    expect(subjectTimeline([corrected, original], original.subject)).toEqual([original, corrected]);
  });

  it('requires evidence for extracted employee-provided data', () => {
    expect(() => createRentalAtom({
      tenantId: 'team-jpk',
      companyId: 'prime',
      kind: 'cash.transaction',
      subject: { type: 'cash_transaction', id: 'tx-1' },
      logicalKey: 'transaction',
      occurredAt: '2026-08-15T00:00:00.000Z',
      source: 'bank_file',
      confidence: 1,
      evidence: [],
      payload: { amount: 500_000 },
    })).toThrow(/requires evidence/);
  });
});
