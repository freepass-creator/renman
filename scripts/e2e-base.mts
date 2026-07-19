/* Phase 0 검증 — 리스크 경고 3종 + 베이스 마이그레이션 파싱. */
// @ts-nocheck
const mem = new Map();
(globalThis).window = globalThis;
(globalThis).localStorage = { getItem: (k) => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };

const { seedSampleData } = await import('../lib/seed.ts');
const { getStore } = await import('../lib/store.ts');
const { scanRisks, riskSummary } = await import('../lib/risk-ops.ts');
const { parseBaseSheet } = await import('../lib/migrate-base.ts');
const TODAY = '2026-06-22';

await seedSampleData('welrix');
const cs = await getStore().list('contract', 'welrix');

console.log('[리스크 요약]', riskSummary(cs, TODAY));
console.log('\n[경고 대여]');
for (const r of scanRisks(cs, TODAY)) {
  console.log(`  ${r.rec.plate} ${r.rec.contractorName}: ` + r.flags.map((f) => `${f.kind}(${f.sev})—${f.detail}`).join(' / '));
}

// 베이스 마이그레이션 — CSV 파싱(8컬럼)
const csv = [
  '차량번호,임차인,시작일,종료일,월대여료,입금누계,운전자연령,보험허용연령',
  '99허1234,오징어,2026-06-01,2026-12-01,500000,500000,22,26',  // 보험불일치(22<26)
  '88두9999,홍길동,2026-01-01,2026-05-31,400000,1600000,40,21',  // 반납지남
].join('\n');
const fakeFile = { name: 'base.csv', text: async () => csv };
const recs = await parseBaseSheet(fakeFile);
console.log(`\n[마이그레이션] ${recs.length}행 파싱`);
for (const r of recs) console.log(`  ${r.plate} ${r.contractorName} 상태=${r.status} 인도=${r.deliveredDate} contractNo=${r.contractNo}`);
console.log('  경고:', scanRisks(recs, TODAY).map((r) => `${r.rec.contractorName}[${r.flags.map((f) => f.kind).join(',')}]`).join(' '));

console.log('\n✔ Phase0 통과 — 리스크 경고 3종 파생 + 엑셀 베이스 1시트 마이그레이션 동작');
