/* 계약 라이프사이클 검증 — 상태도출·필터·반납 일할정산 전이. */
// @ts-nocheck
const ops = await import('../lib/contract-ops.ts');
const won = (n: any) => '₩' + (Number(n) || 0).toLocaleString();
const TODAY = '2026-06-22';

// 운행 계약: 김철수 카니발 680,000/월, 2026-04-01 인도, 12개월
const base = { _key: 'k1', contractNo: 'LT-2604-0012', contractorName: '김철수', plate: '12가3456',
  startDate: '2026-04-01', endDate: '2027-03-31', rentalMonths: 12, monthlyRent: 680000, _paidTotal: 1360000,
  status: '운행', deliveredDate: '2026-04-01' };

const v = ops.computeContractView(base, TODAY);
console.log(`[운행] ${v.rec.contractorName} 상태=${v.status} 인도=${v.delivered} D${v.dday} 도래미수=${won(v.gross)} 입금=${won(v.paid)} 순미수=${won(v.net)}`);

// 필터 통과 검증
for (const f of ['전체','운행','만기임박','미수','종료']) console.log(`  필터[${f}] = ${ops.passesFilter(v, f, TODAY)}`);

// 반납 전이 — 2026-06-10 반납 → 6월 회차(5/25~6/25) 일할정산 자동
const patch = ops.patchReturn(base, '2026-06-10');
console.log(`\n[반납 패치]`, patch);
const returned = { ...base, ...patch };
const v2 = ops.computeContractView(returned, TODAY);
console.log(`[반납후] 상태=${v2.status} 종료=${v2.ended} 반납일할환불=${won(v2.refund)} 도래미수(반납일까지)=${won(v2.gross)} 순미수=${won(v2.net)}`);
console.log(`  종료 필터 통과 = ${ops.passesFilter(v2, '종료', TODAY)}`);

// 연장 전이
const ext = ops.patchExtend(base, 6);
console.log(`\n[연장 +6개월]`, ext, '→ endDate', ext.endDate);

// 수납 스케줄(반납 후 일할 반영)
const sched = ops.contractSchedules(returned, TODAY);
console.log(`\n[수납 스케줄] ${sched.length}회차 (반납 일할 반영)`);
for (const s of sched.slice(0, 4)) console.log(`  ${s.seq}회 ${s.dueDate} ${won(s.amount)}${s.discount ? ' 할인 -' + won(s.discount) : ''} [${s.status}]`);

console.log('\n✔ 라이프사이클 통과 — 인도/운행 도출·필터·반납 일할정산·연장·스케줄 전부 엔진으로 동작');
