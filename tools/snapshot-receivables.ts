/**
 * 미수·과오납·보증금정산 대기 스냅샷 — 오픈/백필 전후 대사 SSOT.
 *
 *   npx tsx tools/snapshot-receivables.ts
 *   npx tsx tools/snapshot-receivables.ts --company=switchplan
 *   npx tsx tools/snapshot-receivables.ts --out=tmp/recv-snapshot.json
 *
 * Firestore contracts collectionGroup 읽기 전용. 쓰기 없음.
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolve } from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { computeContractView } from '../lib/contract-ops';
import { depositView } from '../lib/deposit';
import { hasDepositOffsetPayment } from '../lib/contracts/deposit-offset';
import { selectReceivables } from '../lib/snapshot/selectors';
import type { EntityRecord } from '../lib/intake/entities';

const ROOT = resolve(__dirname, '..');
const SERVICE_KEY = resolve(ROOT, 'renman-dd0a2-firebase-adminsdk-fbsvc-c489c146ce.json');
const TODAY = new Date().toISOString().slice(0, 10);
const companyArg = process.argv.find((a) => a.startsWith('--company='));
const COMPANY_FILTER = companyArg ? companyArg.slice('--company='.length) : '';
const outArg = process.argv.find((a) => a.startsWith('--out='));
const OUT = outArg ? outArg.slice('--out='.length) : '';

type Row = {
  companyId: string;
  docId: string;
  plate: string;
  status: string;
  net: number;
  paid: number;
  overpay: number;
  deposit: number;
  depositSettledDate: string;
  pendingRefund: boolean;
  legacySettledNoOffset: boolean;
  hasCharges: boolean;
};

async function main() {
  if (!getApps().length) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sa = require(SERVICE_KEY);
    initializeApp({ credential: cert(sa) });
  }
  const db = getFirestore();
  const snap = await db.collectionGroup('contract').get();

  const byCompany = new Map<string, EntityRecord[]>();
  const detail: Row[] = [];

  for (const doc of snap.docs) {
    // flat 컬렉션 `contract/{companyId}__{key}` — companyId는 필드(또는 docId prefix)
    const data = doc.data();
    const fromId = doc.id.includes('__') ? doc.id.slice(0, doc.id.indexOf('__')) : '';
    const companyId = String(data.companyId || fromId || '');
    if (COMPANY_FILTER && companyId !== COMPANY_FILTER) continue;
    const rec = { ...data, _key: doc.id, companyId } as EntityRecord;
    const list = byCompany.get(companyId) || [];
    list.push(rec);
    byCompany.set(companyId, list);

    const v = computeContractView(rec, TODAY);
    const d = depositView(rec, TODAY);
    detail.push({
      companyId,
      docId: doc.id,
      plate: String(rec.plate || ''),
      status: String(v.status || ''),
      net: v.net,
      paid: v.paid,
      overpay: v.overpay,
      deposit: Number(rec.deposit) || 0,
      depositSettledDate: String(rec.depositSettledDate || ''),
      pendingRefund: d.pendingRefund,
      legacySettledNoOffset: !!rec.depositSettledDate && !hasDepositOffsetPayment(rec),
      hasCharges: Array.isArray(rec._charges) && (rec._charges as unknown[]).length > 0,
    });
  }

  const companies: Record<string, ReturnType<typeof selectReceivables> & {
    pendingRefundCount: number;
    legacySettledNoOffsetCount: number;
    contractCount: number;
  }> = {};

  for (const [companyId, contracts] of byCompany) {
    const recv = selectReceivables(contracts, TODAY);
    const rows = detail.filter((r) => r.companyId === companyId);
    companies[companyId] = {
      ...recv,
      contractCount: contracts.length,
      pendingRefundCount: rows.filter((r) => r.pendingRefund).length,
      legacySettledNoOffsetCount: rows.filter((r) => r.legacySettledNoOffset).length,
    };
  }

  const all = [...byCompany.values()].flat();
  const total = selectReceivables(all, TODAY);
  const report = {
    asOf: TODAY,
    generatedAt: new Date().toISOString(),
    filter: COMPANY_FILTER || null,
    total: {
      ...total,
      contractCount: all.length,
      pendingRefundCount: detail.filter((r) => r.pendingRefund).length,
      legacySettledNoOffsetCount: detail.filter((r) => r.legacySettledNoOffset).length,
    },
    companies,
    // 대사용 상위 미수·과오납만 (전체 dump는 --out)
    topUnpaid: detail.filter((r) => r.net > 0).sort((a, b) => b.net - a.net).slice(0, 30),
    topOverpay: detail.filter((r) => r.overpay > 0).sort((a, b) => b.overpay - a.overpay).slice(0, 20),
    legacySettled: detail.filter((r) => r.legacySettledNoOffset),
  };

  console.log(`\n=== 미수 스냅샷 ${TODAY} ===`);
  console.log(`계약 ${report.total.contractCount} · 미수총액 ${report.total.total.toLocaleString('ko-KR')} · 과오납 ${report.total.overpayTotal.toLocaleString('ko-KR')}`);
  console.log(`미수계약 ${report.total.unpaidCount} · 보증금미정산 ${report.total.pendingRefundCount} · 레거시(날짜만) ${report.total.legacySettledNoOffsetCount}`);
  console.log('\n법인별:');
  for (const [id, c] of Object.entries(companies)) {
    console.log(
      `  ${id}: 계약${c.contractCount} 미수 ${c.total.toLocaleString('ko-KR')} (${c.unpaidCount}건) · 과오납 ${c.overpayTotal.toLocaleString('ko-KR')} · 미정산보증 ${c.pendingRefundCount} · 레거시 ${c.legacySettledNoOffsetCount}`,
    );
  }
  if (report.legacySettled.length) {
    console.log('\n레거시 depositSettledDate만 (백필 후보):');
    for (const r of report.legacySettled.slice(0, 20)) {
      console.log(`  ${r.companyId} ${r.plate || r.docId} net=${r.net} deposit=${r.deposit} settled=${r.depositSettledDate}`);
    }
  }

  if (OUT) {
    const full = { ...report, allRows: detail };
    const abs = path.isAbsolute(OUT) ? OUT : path.join(ROOT, OUT);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(full, null, 2), 'utf8');
    console.log(`\n저장: ${abs}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
