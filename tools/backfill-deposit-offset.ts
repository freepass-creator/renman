/**
 * 레거시 depositSettledDate 백필 — 기본 dry-run(목록만).
 *
 *   npx tsx tools/backfill-deposit-offset.ts
 *   npx tsx tools/backfill-deposit-offset.ts --company=switchplan
 *
 * ★ --apply 는 사장님 승인 + PITR 백업 확인 후에만.
 *   지금은 dry-run 결과만 보고. 금액 = min(보증금, 그 시점 대여료 net).
 */
import { resolve } from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { hasDepositOffsetPayment } from '../lib/contracts/deposit-offset';
import { buildDepositSettlement, rentUnpaidOnly } from '../lib/deposit';
import { computeContractView } from '../lib/contract-ops';

const ROOT = resolve(__dirname, '..');
const SERVICE_KEY = resolve(ROOT, 'renman-dd0a2-firebase-adminsdk-fbsvc-c489c146ce.json');
const APPLY = process.argv.includes('--apply');
const TODAY = new Date().toISOString().slice(0, 10);
const companyArg = process.argv.find((a) => a.startsWith('--company='));
const COMPANY_FILTER = companyArg ? companyArg.slice('--company='.length) : '';

type Rec = Record<string, unknown>;

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? Math.round(x) : 0;
}

async function main() {
  if (APPLY) {
    console.error('⛔ --apply 차단: 사장님 승인 + PITR 확인 후에만 코드를 열어 실행하세요. 지금은 dry-run만.');
    process.exit(2);
  }

  if (!getApps().length) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sa = require(SERVICE_KEY);
    initializeApp({ credential: cert(sa) });
  }
  const db = getFirestore();

  const snap = await db.collectionGroup('contract').get();
  const rows: Array<{
    companyId: string;
    docId: string;
    plate: string;
    deposit: number;
    net: number;
    offsetAmt: number;
    settledDate: string;
  }> = [];

  for (const doc of snap.docs) {
    const companyId = doc.ref.parent.parent?.id || '';
    if (COMPANY_FILTER && companyId !== COMPANY_FILTER) continue;
    const rec = { ...doc.data(), _key: doc.id, _docId: doc.id, companyId } as Rec;
    if (!rec.depositSettledDate) continue;
    if (hasDepositOffsetPayment(rec as never)) continue;

    const deposit = n(rec.deposit);
    const net = rentUnpaidOnly(rec as never, TODAY);
    const bundle = buildDepositSettlement(rec as never, String(rec.depositSettledDate || TODAY));
    const offsetAmt = bundle.payments.reduce((s, p) => s + n(p.amount), 0);
    if (offsetAmt <= 0 && bundle.charges.length === 0) continue;

    rows.push({
      companyId,
      docId: doc.id,
      plate: String(rec.plate || ''),
      deposit,
      net: computeContractView(rec as never, TODAY).net,
      offsetAmt: offsetAmt || Math.min(deposit, net),
      settledDate: String(rec.depositSettledDate),
    });
  }

  console.log(`\n=== 보증금충당 백필 dry-run (${TODAY}) ===`);
  console.log(`대상: depositSettledDate 있음 · 충당 entry 없음 · ${rows.length}건`);
  console.log('company\tdocId\tplate\tdeposit\tnet\twouldOffset\tsettledDate');
  let sumDep = 0, sumNet = 0, sumOff = 0;
  for (const r of rows) {
    console.log(`${r.companyId}\t${r.docId}\t${r.plate}\t${r.deposit}\t${r.net}\t${r.offsetAmt}\t${r.settledDate}`);
    sumDep += r.deposit;
    sumNet += r.net;
    sumOff += r.offsetAmt;
  }
  console.log(`--- 합계 deposit=${sumDep} net=${sumNet} wouldOffset=${sumOff}`);
  console.log('적용하려면 승인 후 스크립트에 --apply 경로를 구현·개방할 것. 현재는 출력만.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
