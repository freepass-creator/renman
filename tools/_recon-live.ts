/**
 * 임시 대사 — 실 xlsx(사업현황+자금일보)를 앱 파서 그대로 돌려 보유차량·미수·입금 확인.
 *   npx --yes tsx tools/_recon-live.ts <사업현황.xlsx> <자금일보.xlsx>
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSwitchplanWorkbook, buildSwitchplanPackFromBuffer } from '../lib/migrate/switchplan-parse';
import { parseSwitchplanJbo } from '../lib/migrate/switchplan-jbo-parse';
import { computeContractView } from '../lib/contract-ops';

const TODAY = '2026-07-22';
const won = (n: number) => n.toLocaleString('ko-KR') + '원';

const bizPath = process.argv[2];
const jboPath = process.argv[3];
const toAb = (p: string) => { const b = readFileSync(resolve(p)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };

const bizAb = toAb(bizPath);
const jboAb = toAb(jboPath);

// asOf = 자금일보 최신 거래일 (pack.ts loadLivePack 과 동일 규칙)
const jbo = parseSwitchplanJbo(jboAb);
const asOf = jbo.totals.dateTo || TODAY;

const parsed = parseSwitchplanWorkbook(bizAb, asOf);
const pack = buildSwitchplanPackFromBuffer(bizAb, asOf);

console.log('════════ 기준 ════════');
console.log(`오늘(net계산)  ${TODAY}`);
console.log(`asOf(자금컷오프) ${asOf}`);

console.log('\n════════ 보유차량 / 자산 ════════');
console.log(`현보유(채권시트 plate)  ${parsed.totals.activeCount}대   ← "지금 보유차량"`);
console.log(`자산 전체(등록 차량)     ${parsed.totals.vehicleCount}대`);
const byStatus: Record<string, number> = {};
for (const v of pack.vehicle) { const s = String(v.status || '(무)'); byStatus[s] = (byStatus[s] || 0) + 1; }
console.log(`차량 status 분포:`, byStatus);
console.log(`운행중 계약  ${parsed.totals.countCurrent}건 · 반납(종료) 계약  ${parsed.totals.countReturned}건`);

console.log('\n════════ 미수(net) 대사 ════════');
// 시트 실미수(carry) 합
const carrySheet = parsed.totals.carryCurrent + parsed.totals.carryReturned;
// 앱이 실제 계산하는 net 합 (computeContractView, 오늘 기준)
let netApp = 0, netCur = 0, netRet = 0;
for (const c of pack.contract) {
  const v = computeContractView(c as never, TODAY);
  netApp += v.net;
  if (String(c.status || '') === '반납' || String(c._kind || '') === 'returned') netRet += v.net; else netCur += v.net;
}
console.log(`시트 실미수(carry) 합    운행 ${won(parsed.totals.carryCurrent)} + 반납 ${won(parsed.totals.carryReturned)} = ${won(carrySheet)}`);
console.log(`앱 계산 순미수(net) 합   운행 ${won(netCur)} + 반납 ${won(netRet)} = ${won(netApp)}`);
const diff = netApp - carrySheet;
console.log(`차이(앱 net − 시트 carry) = ${won(diff)}  → ${Math.abs(diff) <= parsed.totals.countCurrent + parsed.totals.countReturned ? '✅ 일치(반올림 오차 내)' : '⚠ 불일치 — 확인 필요'}`);

console.log('\n════════ 입금/출금 (자금일보 계좌내역) ════════');
console.log(`총 거래 ${jbo.totals.count}건 · 기간 ${jbo.totals.dateFrom} ~ ${jbo.totals.dateTo}`);
console.log(`총 입금 ${won(jbo.totals.deposit)} · 총 출금 ${won(jbo.totals.withdraw)}`);
console.log(`  ├ 계좌간이동(자금이동) 입금 ${won(jbo.totals.sweepDeposit)} · 출금 ${won(jbo.totals.sweepWithdraw)}  (매출 아님)`);
console.log(`  └ 실입금(sweep제외) ${won(jbo.totals.realDeposit)} · 실출금 ${won(jbo.totals.realWithdraw)}`);
console.log('계좌별:');
for (const a of jbo.byAccount) console.log(`  ${a.account}: ${a.count}건 · 입금 ${won(a.deposit)} · 출금 ${won(a.withdraw)}`);
console.log('계정과목 상위:');
for (const s of jbo.bySubject.slice(0, 8)) console.log(`  ${s.subject}: 입금 ${won(s.deposit)} · 출금 ${won(s.withdraw)} (${s.count}건)`);

console.log('\n════════ 미수 유실 진단 (계약별 carry vs net) ════════');
type Row = { plate: string; kind: string; carry: number; net: number; loss: number; hasPay: boolean };
const rows: Row[] = [];
for (const c of pack.contract) {
  const carry = Math.max(0, Number((c as Record<string, unknown>)._carryUnpaid) || 0);
  const v = computeContractView(c as never, TODAY);
  const kind = String(c.status || '') === '반납' ? '반납' : '운행';
  rows.push({ plate: String(c.plate || ''), kind, carry, net: v.net, loss: carry - v.net, hasPay: Array.isArray((c as Record<string, unknown>)._payments) });
}
const lossRows = rows.filter((r) => Math.abs(r.loss) >= 1000).sort((a, b) => b.loss - a.loss);
const totLoss = rows.reduce((s, r) => s + r.loss, 0);
const lossCur = rows.filter(r => r.kind === '운행').reduce((s, r) => s + r.loss, 0);
const lossRet = rows.filter(r => r.kind === '반납').reduce((s, r) => s + r.loss, 0);
console.log(`유실 총액 ${won(totLoss)}  (운행 ${won(lossCur)} · 반납 ${won(lossRet)})`);
console.log(`미수 손실난 계약 ${lossRows.filter(r=>r.loss>0).length}건 / 전체 ${rows.length}건`);
console.log(`그중 _payments(실납부이력) 보유 = ${lossRows.filter(r=>r.loss>0&&r.hasPay).length}건`);
console.log('상위 유실 계약(carry→net · Σ_payments · Σ_discounts):');
const sumArr = (a: unknown, f: string) => Array.isArray(a) ? (a as Array<Record<string, unknown>>).reduce((s, x) => s + (Number(x[f]) || 0), 0) : 0;
for (const r of lossRows.slice(0, 12)) {
  const c = pack.contract.find((x) => String(x.plate || '') === r.plate) as Record<string, unknown> | undefined;
  const sp = sumArr(c?._payments, 'amount');
  const sd = sumArr(c?._discounts, 'amount');
  const hyp = Math.max(0, r.carry - sp); // 가설: net ≈ carry − Σpayments (이중차감)
  console.log(`  [${r.kind}] ${r.plate}  carry ${won(r.carry)} → net ${won(r.net)}  유실 ${won(r.loss)} · Σpay ${won(sp)} · Σdisc ${won(sd)} · 가설(carry−Σpay)=${won(hyp)} ${Math.abs(hyp - r.net) <= 2000 ? '✔일치' : '✘'}`);
}

if (parsed.warnings.length) { console.log('\n파서 경고:', parsed.warnings.slice(0, 10)); }
