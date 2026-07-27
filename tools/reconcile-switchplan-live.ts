/**
 * 스위치플랜 원본 대사/마이그레이션.
 *
 * 기본은 읽기 전용(dry-run):
 *   npx tsx tools/reconcile-switchplan-live.ts
 * 실제 반영:
 *   npx tsx tools/reconcile-switchplan-live.ts --apply
 *
 * 원칙:
 * - 사업현황의 carry 미수는 과거 수납이 이미 반영된 스냅샷이다.
 * - 과거 계좌/CMS 내역은 수납 원자와 계약 연결 근거로만 적재한다.
 * - 과거 내역을 contract._payments에 넣지 않는다(미수 이중 차감 방지).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { parseSwitchplanWorkbook } from '../lib/migrate/switchplan-parse';
import { parseSwitchplanJbo } from '../lib/migrate/switchplan-jbo-parse';
import { normPlate } from '../lib/plate';
import { buildSettlementPatches, findCmsMatchCandidates } from '../lib/payments/cms-matching';
import type { BankTransaction } from '../lib/payments/types';

type Rec = Record<string, unknown>;
type Match = { contract?: Rec; confidence: 'high' | 'medium' | 'none'; basis: string };

const ROOT = resolve(__dirname, '..');
const KAKAO = 'C:/Users/user/Documents/카카오톡 받은 파일';
const BIZ = `${KAKAO}/[스위치플랜] 사업현황.xlsx`;
const JBO = `${KAKAO}/26년_스위치플랜_자금일보.xlsx`;
const CMS_FILES = [
  'G:/다른 컴퓨터/내 컴퓨터/Documents/카카오톡 받은 파일/정산일_회원상세_결제내역_2024년.xlsx',
  'G:/다른 컴퓨터/내 컴퓨터/Documents/카카오톡 받은 파일/정산일_회원상세_결제내역_2025년.xlsx',
  'G:/다른 컴퓨터/내 컴퓨터/Documents/카카오톡 받은 파일/정산일_회원상세_결제내역_2026년.xlsx',
];
const SERVICE_KEY = resolve(ROOT, 'renman-dd0a2-firebase-adminsdk-fbsvc-c489c146ce.json');
const APPLY = process.argv.includes('--apply');
const COMPANY = 'switchplan';
const AS_OF = '2026-07-22';

function ab(path: string): ArrayBuffer {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}
function s(v: unknown): string { return String(v ?? '').trim(); }
function n(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : 0;
  const out = Number(s(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(out) ? Math.round(out) : 0;
}
function compact(v: unknown): string {
  return s(v).normalize('NFKC').replace(/[\s()[\]{}.,·_\-/]/g, '').toLowerCase();
}
function sha(parts: unknown[]): string {
  return createHash('sha1').update(parts.map(s).join('|')).digest('hex').slice(0, 20);
}
function prune(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(prune);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Rec)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, prune(v)]),
    );
  }
  return value;
}
function ymd(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const d = v.getFullYear() < 1990 ? new Date(v.getFullYear() + 100, v.getMonth(), v.getDate()) : v;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const m = s(v).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
}
function plateFrom(...values: unknown[]): string {
  const text = values.map(s).join(' ');
  const m = text.match(/\d{2,3}\s*[가-힣]\s*\d{4}/);
  return m ? normPlate(m[0]) : '';
}
function inContractPeriod(c: Rec, date: string): boolean {
  const start = s(c.startDate || c.contractDate).slice(0, 10);
  const end = s(c.returnedDate || c.endDate || c.returnScheduledDate).slice(0, 10);
  if (start && date && date < start) return false;
  if (end && date && date > end) return false;
  return true;
}
function pickContract(contracts: Rec[], rec: Rec): Match {
  const date = s(rec.txDate).slice(0, 10);
  const plate = normPlate(s(rec.plate)) || plateFrom(rec.counterparty, rec.memo, rec.renter);
  const name = compact(rec.renter || rec.counterparty);
  let candidates = plate ? contracts.filter((c) => normPlate(s(c.plate)) === plate) : [];
  if (candidates.length) {
    const dated = candidates.filter((c) => inContractPeriod(c, date));
    if (dated.length === 1) return { contract: dated[0], confidence: 'high', basis: '차량번호+계약기간' };
    if (candidates.length === 1) return { contract: candidates[0], confidence: 'high', basis: '차량번호 유일' };
    candidates = dated.length ? dated : candidates;
  }
  if (name) {
    const named = contracts.filter((c) => {
      const cn = compact(c.contractorName);
      return cn && (name === cn || name.includes(cn) || cn.includes(name));
    });
    const dated = named.filter((c) => inContractPeriod(c, date));
    if (dated.length === 1) return { contract: dated[0], confidence: 'high', basis: '계약자명+계약기간' };
    if (named.length === 1) return { contract: named[0], confidence: 'medium', basis: '계약자명 유일' };
  }
  return { confidence: 'none', basis: plate ? '동일 차량 복수계약/기간 불명' : '계약 식별자 없음' };
}
function matchSourceContract(source: Rec, dbContracts: Rec[]): Rec | undefined {
  const plate = normPlate(s(source.plate));
  const pool = dbContracts.filter((c) => normPlate(s(c.plate)) === plate);
  if (pool.length <= 1) return pool[0];
  const sourceName = compact(source.contractorName);
  const sourceStart = s(source.startDate || source.contractDate).slice(0, 10);
  const sourceEnded = ['반납', '종료', '해지', '완료'].includes(s(source.status)) || !!s(source.returnedDate);
  const scored = pool.map((c) => {
    let score = 0;
    if (sourceName && compact(c.contractorName) === sourceName) score += 4;
    if (sourceStart && s(c.startDate || c.contractDate).slice(0, 10) === sourceStart) score += 4;
    const ended = ['반납', '종료', '해지', '완료'].includes(s(c.status)) || !!s(c.returnedDate);
    if (ended === sourceEnded) score += 2;
    return { c, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.score > scored[1]?.score ? scored[0].c : undefined;
}

function parseCms(): Rec[] {
  const out = new Map<string, Rec>();
  for (const path of CMS_FILES) {
    const wb = XLSX.readFile(path, { cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Rec>(sheet, { defval: '' });
    for (const row of rows) {
      const customer = s(row['회원명'] || row['고객명'] || row['납부자'] || row['납부자명']);
      const amount = n(row['수납금액'] || row['청구금액']);
      const status = s(row['수납상태'] || row['결제상태'] || row['납부상태']);
      const date = ymd(row['결제일'] || row['청구/납부일자'] || row['결제일(납부기간)'] || row['정산일'] || row['확정일']);
      if (!customer || amount <= 0 || !date || /미납|연체|미수|취소|정지|보류|실패/.test(status)) continue;
      const account = s(row['회원번호'] || row['고객번호']);
      const memo = [
        s(row['상품'] || row['상품명']),
        s(row['청구월'] || row['최초청구월']),
        s(row['결제수단'] || row['결제방식']),
      ].filter(Boolean).join(' / ');
      const txKey = `btx_cms_${sha([date, customer, amount, account, memo])}`;
      out.set(txKey, {
        txKey, _key: txKey, companyId: COMPANY, txDate: date, amount,
        withdraw: 0, counterparty: customer, memo, method: 'CMS', source: 'CMS',
        account, category: 'CMS수납', sourceOrigin: path,
      });
    }
  }
  return [...out.values()];
}

function fingerprint(r: Rec): string {
  return [
    s(r.account), s(r.txDate).slice(0, 10), n(r.amount), n(r.withdraw),
    compact(r.counterparty), compact(r.memo), compact(r.category || r.subject),
    normPlate(s(r.plate)), compact(r.renter),
  ].join('|');
}

async function main() {
  const parsed = parseSwitchplanWorkbook(ab(BIZ), AS_OF);
  const jbo = parseSwitchplanJbo(ab(JBO)).bank_tx.map((r, i) => ({
    ...r, companyId: COMPANY, sourceOrigin: JBO, sourceRow: i + 1,
  })) as Rec[];
  const cms = parseCms();

  const key = JSON.parse(readFileSync(SERVICE_KEY, 'utf8'));
  const app = getApps()[0] || initializeApp({ credential: cert(key) });
  const db = getFirestore(app);
  const readCompany = async (collectionName: string) => {
    const snap = await db.collection(collectionName).where('companyId', '==', COMPANY).get();
    const rows = snap.docs.map((d) => ({ ...d.data(), _docId: d.id })) as Rec[];
    return rows.filter((r) => !r.deletedAt);
  };
  const [contracts, existingBank] = await Promise.all([readCompany('contract'), readCompany('bank_tx')]);

  const existingByFp = new Map<string, Rec[]>();
  for (const r of existingBank) {
    const fp = fingerprint(r);
    const arr = existingByFp.get(fp) || [];
    arr.push(r);
    existingByFp.set(fp, arr);
  }

  const matchedExisting = new Set<string>();
  const existingByKey = new Map<string, Rec>();
  for (const r of existingBank) {
    for (const key of [s(r._key || r.txKey), s(r.sourceTxKey)]) if (key) existingByKey.set(key, r);
  }
  const newJbo: Rec[] = [];
  const updates: Array<{ docId: string; patch: Rec }> = [];
  const matchStats = { high: 0, medium: 0, none: 0 };
  const consumeExisting = (src: Rec): Rec | undefined => {
    const pool = existingByFp.get(fingerprint(src)) || [];
    return pool.find((r) => !matchedExisting.has(s(r._docId)));
  };
  for (const src of jbo) {
    const sourceTxKey = `btx_jbo_${sha([fingerprint(src), src.sourceRow])}`;
    const existing = existingByKey.get(sourceTxKey) || consumeExisting(src);
    const match = pickContract(contracts, src);
    matchStats[match.confidence]++;
    const contractId = s(match.contract?._key || match.contract?.contractNo);
    const patch: Rec = {
      sourceOrigin: JBO,
      sourceTxKey,
      reconciliationStatus: match.confidence === 'none' ? '검토필요' : '매칭완료',
      reconciliationBasis: match.basis,
      matchConfidence: match.confidence,
      reconciledAt: new Date().toISOString(),
      dataAlert: match.confidence === 'none' && n(src.amount) > 0 && s(src.category) === '대여료'
        ? '수납 계약매칭 필요' : null,
    };
    if (contractId) {
      patch.matchedContractId = contractId;
      patch.contractNo = s(match.contract?.contractNo);
      patch.plate = s(match.contract?.plate);
    }
    if (existing) {
      matchedExisting.add(s(existing._docId));
      updates.push({ docId: s(existing._docId), patch });
    } else {
      newJbo.push({ ...src, ...patch, txKey: sourceTxKey, _key: sourceTxKey });
    }
  }

  const existingKeys = new Set(existingBank.map((r) => s(r._key || r.txKey)));
  const newCms: Rec[] = cms.filter((r) => !existingKeys.has(s(r._key))).map((r): Rec => {
    const match = pickContract(contracts, r);
    matchStats[match.confidence]++;
    return {
      ...r,
      matchedContractId: s(match.contract?._key || match.contract?.contractNo) || undefined,
      contractNo: s(match.contract?.contractNo) || undefined,
      plate: s(match.contract?.plate) || plateFrom(r.counterparty, r.memo) || undefined,
      matchConfidence: match.confidence,
      reconciliationStatus: match.confidence === 'none' ? '검토필요' : '매칭완료',
      reconciliationBasis: match.basis,
      dataAlert: match.confidence === 'none' ? '자동이체 계약매칭 필요' : null,
      reconciledAt: new Date().toISOString(),
    };
  });

  const sourcePlates = new Set(parsed.contracts.map((c) => normPlate(s(c.plate))).filter(Boolean));
  const dbPlates = new Set(contracts.map((c) => normPlate(s(c.plate))).filter(Boolean));
  const sourceOnly = [...sourcePlates].filter((p) => !dbPlates.has(p));
  const dbOnly = [...dbPlates].filter((p) => !sourcePlates.has(p));
  const isEnded = (c: Rec) => ['반납', '종료', '해지', '완료'].includes(s(c.status)) || !!s(c.returnedDate);
  const dbActiveContracts = contracts.filter((c) => !isEnded(c));
  const dbEndedContracts = contracts.filter(isEnded);
  const carryOf = (rows: Rec[]) => rows.reduce((sum, c) => sum + Math.max(0, n(c._carryUnpaid ?? c._carry)), 0);
  const paymentOf = (rows: Rec[]) => rows.reduce((sum, c) => sum + (Array.isArray(c._payments)
    ? (c._payments as Rec[]).reduce((s0, p) => s0 + Math.max(0, n(p.amount)), 0) : 0), 0);
  const contractRecon: Array<{ docId: string; patch: Rec }> = [];
  let contractCarryMismatch = 0;
  let contractStatusMismatch = 0;
  let historicalPaymentArchives = 0;
  for (const source of parsed.contracts) {
    const target = matchSourceContract(source, contracts);
    if (!target?._docId) continue;
    const sourceCarry = Math.max(0, n(source._carryUnpaid ?? source._carry));
    const dbCarry = Math.max(0, n(target._carryUnpaid ?? target._carry));
    const sourceEnded = isEnded(source);
    const dbEnded = isEnded(target);
    const alerts: string[] = [];
    if (sourceCarry !== dbCarry) {
      contractCarryMismatch++;
      alerts.push(`사업현황 미수 차이 ${Math.abs(sourceCarry - dbCarry).toLocaleString('ko-KR')}원`);
    }
    if (sourceEnded !== dbEnded) {
      contractStatusMismatch++;
      alerts.push(`사업현황 계약상태 확인`);
    }
    const oldPayments = Array.isArray(target._payments) ? target._payments as Rec[] : [];
    const archivedPayments = Array.isArray(target._historicalPayments) ? target._historicalPayments as Rec[] : [];
    if (oldPayments.length) historicalPaymentArchives++;
    contractRecon.push({
      docId: s(target._docId),
      patch: {
        sourceCarryUnpaid: sourceCarry,
        reconciliationDelta: sourceCarry - dbCarry,
        reconciliationStatus: alerts.length ? '검토필요' : '원본 대사완료',
        dataAlert: alerts.length ? alerts.join(' · ') : null,
        sourceOrigin: BIZ,
        reconciledAt: new Date().toISOString(),
        ...(oldPayments.length ? {
          _historicalPayments: [...archivedPayments, ...oldPayments],
          _payments: [],
          historicalPaymentsArchivedAt: new Date().toISOString(),
          historicalPaymentsArchiveReason: '사업현황 carry에 이미 반영된 개시 전 수납 — 이중차감 방지',
        } : {}),
      },
    });
  }

  console.log(JSON.stringify({
    mode: APPLY ? 'APPLY' : 'DRY-RUN',
    source: {
      assets: parsed.totals.vehicleCount,
      held: parsed.disposedPlates.length ? parsed.totals.vehicleCount - parsed.disposedPlates.length : parsed.totals.activeCount,
      contracts: parsed.contracts.length,
      carryUnpaid: parsed.totals.carryCurrent + parsed.totals.carryReturned,
      jbo: jbo.length,
      cms: cms.length,
    },
    firestore: {
      contracts: contracts.length,
      activeContracts: dbActiveContracts.length,
      endedContracts: dbEndedContracts.length,
      activeCarryUnpaid: carryOf(dbActiveContracts),
      endedResidualClaim: carryOf(dbEndedContracts),
      activeAppPayments: paymentOf(dbActiveContracts),
      endedAppPayments: paymentOf(dbEndedContracts),
      bankTx: existingBank.length,
    },
    migration: { newJbo: newJbo.length, updateJbo: updates.length, newCms: newCms.length, matchStats },
    alerts: {
      sourceOnlyContracts: sourceOnly,
      dbOnlyContracts: dbOnly,
      contractCarryMismatch,
      contractStatusMismatch,
      historicalPaymentArchives,
      unmatchedSourceContractRows: parsed.contracts.length - contractRecon.length,
    },
  }, null, 2));

  if (!APPLY) return;

  const writes: Array<{ ref: FirebaseFirestore.DocumentReference; data: Rec; merge: boolean }> = [];
  for (const u of updates) writes.push({ ref: db.collection('bank_tx').doc(u.docId), data: u.patch, merge: true });
  for (const u of contractRecon) writes.push({ ref: db.collection('contract').doc(u.docId), data: u.patch, merge: true });
  for (const r of [...newJbo, ...newCms]) {
    const docId = `${COMPANY}__${s(r._key).replace(/[%/]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
    writes.push({ ref: db.collection('bank_tx').doc(docId), data: r, merge: false });
  }
  for (let i = 0; i < writes.length; i += 450) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + 450)) {
      const data = prune(w.data) as Rec;
      w.merge ? batch.set(w.ref, data, { merge: true }) : batch.create(w.ref, data);
    }
    await batch.commit();
  }
  console.log(`APPLIED ${writes.length} writes`);

  // 통장 CMS집금 1건 ↔ 자동이체 성공명세 N건. 고·중신뢰만 자동 연결한다.
  const bankAfter = await readCompany('bank_tx');
  const byKey = new Map(bankAfter.map((r) => [s(r._key || r.txKey), r]));
  const candidates = findCmsMatchCandidates(bankAfter.map((r) => ({
    id: s(r._key || r.txKey),
    txDate: s(r.txDate),
    amount: n(r.amount),
    withdraw: n(r.withdraw),
    counterparty: s(r.counterparty),
    memo: s(r.memo),
    source: s(r.source || r.method),
    method: s(r.method),
    companyCode: s(r.companyId),
    matchedContractId: s(r.matchedContractId) || undefined,
    settlementId: s(r.settlementId) || undefined,
    category: s(r.category),
  } as BankTransaction))).filter((c) => c.confidence === 'high' || c.confidence === 'medium');
  const settleWrites: Array<{ ref: FirebaseFirestore.DocumentReference; data: Rec }> = [];
  for (const candidate of candidates) {
    for (const p of buildSettlementPatches(candidate)) {
      const rec = byKey.get(p.id);
      if (!rec?.['_docId']) continue;
      settleWrites.push({
        ref: db.collection('bank_tx').doc(s(rec._docId)),
        data: { ...p.patch, reconciledAt: new Date().toISOString() },
      });
    }
  }
  for (let i = 0; i < settleWrites.length; i += 450) {
    const batch = db.batch();
    for (const w of settleWrites.slice(i, i + 450)) batch.set(w.ref, w.data, { merge: true });
    await batch.commit();
  }
  console.log(`CMS SETTLEMENTS ${candidates.length}, PATCHES ${settleWrites.length}`);

  // 이 도구의 재시도 중 같은 원천행이 둘 이상 생긴 경우만 복구 가능한 소프트삭제.
  const bankFinal = await readCompany('bank_tx');
  const bySourceKey = new Map<string, Rec[]>();
  for (const r of bankFinal) {
    const key = s(r.sourceTxKey);
    if (!key) continue;
    const arr = bySourceKey.get(key) || [];
    arr.push(r);
    bySourceKey.set(key, arr);
  }
  const duplicateDocs: Rec[] = [];
  for (const [sourceKey, rows] of bySourceKey) {
    if (rows.length <= 1) continue;
    const keep = rows.find((r) => s(r._key || r.txKey) === sourceKey) || rows[0];
    duplicateDocs.push(...rows.filter((r) => r._docId !== keep._docId));
  }
  // 초기 재시도에서 만들어졌지만 sourceTxKey를 받기 전 중단된 JBO 복제본.
  // 현재 2,836개 원천행은 모두 sourceTxKey로 대표되므로 이 도구가 만든 무키 복제본만 정리한다.
  for (const r of bankFinal) {
    if (s(r.sourceOrigin) === JBO && !s(r.sourceTxKey) && !duplicateDocs.some((d) => d._docId === r._docId)) {
      duplicateDocs.push(r);
    }
  }
  for (let i = 0; i < duplicateDocs.length; i += 450) {
    const batch = db.batch();
    for (const r of duplicateDocs.slice(i, i + 450)) {
      batch.set(db.collection('bank_tx').doc(s(r._docId)), {
        deletedAt: new Date().toISOString(),
        deletedBy: 'system:switchplan-reconcile',
        deletedReason: '원천 거래키 중복 — 마이그레이션 재시도 정리',
      }, { merge: true });
    }
    await batch.commit();
  }
  console.log(`SOFT-DELETED DUPLICATE SOURCE ROWS ${duplicateDocs.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
