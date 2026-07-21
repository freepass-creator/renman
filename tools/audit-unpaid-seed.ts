/**
 * 미수 씨앗 대사 — carry 계약에 앱수납 1건 넣은 뒤 net이 기댓값과 맞는지.
 *   npx --yes tsx tools/audit-unpaid-seed.ts
 */
import { computeContractView } from '../lib/contract-ops';

const TODAY = '2026-07-21';

type Case = { name: string; rec: Record<string, unknown>; expectNet: number };

const cases: Case[] = [
  {
    name: '씨앗·무납부 = carry 그대로',
    rec: {
      _key: 'c1', monthlyRent: 500_000, rentalMonths: 12,
      startDate: '2025-01-01', endDate: '2026-01-01', status: '운행', deliveredDate: '2025-01-01',
      _carryUnpaid: 1_200_000, _paidTotal: 0, paymentDay: 25, paymentTiming: '선불',
    },
    expectNet: 1_200_000,
  },
  {
    name: '씨앗·앱수납 50만 → carry−50만',
    rec: {
      _key: 'c2', monthlyRent: 500_000, rentalMonths: 12,
      startDate: '2025-01-01', endDate: '2026-01-01', status: '운행', deliveredDate: '2025-01-01',
      _carryUnpaid: 1_200_000, _paidTotal: 0, paymentDay: 25, paymentTiming: '선불',
      _payments: [{ seq: 1, date: '2026-07-01', amount: 500_000, source: '계좌' }],
    },
    expectNet: 700_000,
  },
  {
    name: '일반·스케줄만 (carry 없음)',
    rec: {
      _key: 'c3', monthlyRent: 400_000, rentalMonths: 6,
      startDate: '2026-01-01', endDate: '2026-07-01', status: '운행', deliveredDate: '2026-01-01',
      paymentDay: 25, paymentTiming: '선불',
    },
    expectNet: -1, // 동적: 도래분 — 스크립트가 출력만
  },
];

let fail = 0;
for (const c of cases) {
  const v = computeContractView(c.rec as never, TODAY);
  const ok = c.expectNet < 0 || v.net === c.expectNet;
  if (!ok) fail++;
  console.log(`${ok ? 'OK' : 'FAIL'} ${c.name}  net=${v.net} gross=${v.gross} paid=${v.paid} count=${v.count}` +
    (c.expectNet >= 0 ? `  expect=${c.expectNet}` : ''));
}
process.exit(fail ? 1 : 0);
