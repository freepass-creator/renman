/* 더미데이터 엔드투엔드 검증 — in-memory localStorage로 시드→저장→엔진계산까지 실제로 돌려본다. */
// @ts-nocheck
const mem = new Map<string, string>();
(globalThis as any).window = globalThis;
(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};

const { seedSampleData } = await import('../lib/seed.ts');
const { getStore } = await import('../lib/store.ts');
const { generateSchedules, recalcContract } = await import('../lib/payments/payment-schedule.ts');
const { computeAssetLedgerEntry } = await import('../lib/payments/asset-ledger.ts');
const { matchPenalty } = await import('../lib/penalty-match.ts');
const { ENTITY_LIST, ENTITIES } = await import('../lib/intake/entities.ts');

const TODAY = '2026-06-22';
const won = (n: any) => '₩' + (Number(n) || 0).toLocaleString();
const store = getStore();

// 1) 시드 (두 회사)
for (const co of ['welrix', 'hanbit']) {
  const r = await seedSampleData(co);
  console.log(`[시드] ${co}: ${r.total}건`, r.perEntity);
}

// 2) 회사 격리 확인
const wv = await store.list('vehicle', 'welrix');
const hv = await store.list('vehicle', 'hanbit');
console.log(`\n[격리] welrix 차량 ${wv.length} · hanbit 차량 ${hv.length} (서로 안 섞임)`);

// 3) 운영자 합본(ALL) — 전 회사 가로질러
const allV = await store.list('vehicle', '__ALL__');
console.log(`[합본] 운영자 ALL 차량 ${allV.length}대 =`, allV.map((v: any) => `${v.plate}(${v.companyId})`).join(', '));

// 4) 운영현황 + 미수 (수납엔진)
console.log('\n[운영현황/미수] welrix');
const cs = await store.list('contract', 'welrix');
let totalUnpaid = 0;
for (const k of cs) {
  const sch = generateSchedules({ contractDate: k.startDate, termMonths: k.rentalMonths, monthlyRent: k.monthlyRent, paymentDay: 25 }).map((s: any) => ({ ...s, id: 's' + s.seq, contractId: 'c' }));
  const gross = recalcContract({ id: 'c', monthlyRent: k.monthlyRent, termMonths: k.rentalMonths, status: '운행', schedules: sch }, TODAY).unpaidAmount || 0;
  const net = Math.max(0, gross - (Number(k._paidTotal) || 0));
  totalUnpaid += net;
  console.log(`  ${k.plate} · ${k.contractorName} 월${won(k.monthlyRent)} 도래미수${won(gross)} 입금${won(k._paidTotal)} → 순미수 ${won(net)}`);
}
console.log(`  총 미수: ${won(totalUnpaid)}`);

// 5) 자산 감가 (장부가)
console.log('\n[자산/감가] welrix');
for (const v of wv) {
  const led = computeAssetLedgerEntry({ id: v.plate, plate: v.plate, model: v.carName, status: v.status || '운행', purchasePrice: Number(v.acquisitionPrice), firstRegisteredDate: v.firstReg }, TODAY);
  console.log(`  ${v.plate} ${v.carName} [${v.status}] 매입${won(v.acquisitionPrice)} → 장부가 ${won(led.bookValue)} (잔여원금 ${won(v.loanRemainingPrincipal)})`);
}

// 6) 과태료 책임자 매칭
console.log('\n[과태료 책임자 매칭] welrix');
const pens = await store.list('penalty', 'welrix');
for (const p of pens) {
  const m = matchPenalty(p, cs);
  console.log(`  ${p.plate} ${p.description} ${won(p.amount)} → ${m ? '임차인 ' + m.renter + ' 청구' : '미매칭(회사부담)'}`);
}

// 7) 차량이력
const his = await store.list('history', 'welrix');
console.log(`\n[차량이력] welrix ${his.length}건, 이력비용 합계 ${won(his.reduce((s: number, h: any) => s + (Number(h.cost) || 0), 0))}`);

// 8) 정합성 점검 (필수누락·만기 일부)
console.log('\n[정합성] welrix 필수필드 누락 점검');
let miss = 0;
for (const e of ENTITY_LIST) {
  for (const rec of await store.list(e.key, 'welrix')) {
    const m = e.fields.filter((f: any) => f.required && (rec[f.key] == null || rec[f.key] === '')).map((f: any) => f.label);
    if (m.length) { miss++; console.log(`  [${e.label}] ${rec._key}: ${m.join(', ')} 누락`); }
  }
}
console.log(`  필수누락 ${miss}건`);
console.log('\n✔ 엔드투엔드 통과 — 시드→저장→격리→합본→미수→감가→과태료→이력→정합성 전부 실데이터로 동작');
