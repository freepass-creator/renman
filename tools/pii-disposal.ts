/**
 * 개인정보 보존기간 파기 — 기본은 **모의실행(dry-run)**. 실제 파기는 `--apply` 필요.
 *
 *   npx tsx tools/pii-disposal.ts                # 무엇이 대상인지만 본다(쓰기 없음)
 *   npx tsx tools/pii-disposal.ts --company=switchplan
 *   npx tsx tools/pii-disposal.ts --apply        # 실제 파기(되돌릴 수 없음)
 *
 * 규칙은 lib/pii-retention 하나만 본다 — 여기서 판정을 다시 만들지 않는다.
 * 파기는 개인정보 «필드»만 표식으로 덮는다. 계약 레코드는 미수·손익·세무 근거라 남긴다.
 * ★미수가 남은 계약은 파기하지 않는다(회수 불가가 된다).
 */
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';
import { resolve } from 'node:path';
import {
  PII_DISPOSED_AT,
  contractEndedOn,
  piiDisposalPatch,
  piiRetention,
} from '../lib/pii-retention';

const ROOT = resolve(__dirname, '..');
const KEY = resolve(ROOT, 'renman-dd0a2-firebase-adminsdk-fbsvc-c489c146ce.json');

function arg(name: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
}
const COMPANY = arg('company');
const APPLY = process.argv.includes('--apply');
const TODAY = arg('today') || new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);

async function main() {
  if (!getApps().length) {
    const raw = (process.env.FIREBASE_ADMIN_KEY || '').trim();
    if (raw) initializeApp({ credential: cert(JSON.parse(raw)) });
    else if (fs.existsSync(KEY)) initializeApp({ credential: cert(JSON.parse(fs.readFileSync(KEY, 'utf8'))) });
    else throw new Error('FIREBASE_ADMIN_KEY 또는 서비스계정 키가 필요합니다.');
  }
  const db = getFirestore();
  const snap = await db.collection('contract').get();

  const tally = { 보존: 0, 보류: 0, 파기대상: 0, 파기완료: 0 };
  const targets: Array<{ id: string; end: string; fields: string[] }> = [];

  for (const doc of snap.docs) {
    const c = doc.data();
    if (COMPANY && String(c.companyId || '') !== COMPANY) continue;
    const v = piiRetention(c, TODAY);
    tally[v.state] += 1;
    if (v.state !== '파기대상') continue;
    const patch = piiDisposalPatch(c, TODAY);
    const fields = Object.keys(patch).filter((k) => k !== PII_DISPOSED_AT);
    if (!fields.length) continue;                 // 지울 개인정보가 이미 없음
    targets.push({ id: doc.id, end: contractEndedOn(c), fields });
  }

  console.log(`\n기준일 ${TODAY}${COMPANY ? ` · 회사=${COMPANY}` : ''} · 계약 ${snap.size}건`);
  console.log(`  보존 ${tally.보존} · 보류(미수) ${tally.보류} · 파기대상 ${tally.파기대상} · 파기완료 ${tally.파기완료}`);

  if (!targets.length) { console.log('\n파기할 것이 없습니다.'); return; }

  console.log(`\n=== 파기 대상 ${targets.length}건 ===`);
  for (const t of targets) console.log(`  ${t.end}  ${t.id}  → ${t.fields.join(', ')}`);

  if (!APPLY) {
    console.log('\n※ 모의실행입니다. 실제 파기하려면 --apply');
    return;
  }

  let done = 0;
  for (const t of targets) {
    const ref = db.collection('contract').doc(t.id);
    const cur = await ref.get();
    if (!cur.exists) continue;
    await ref.set(piiDisposalPatch(cur.data() as Record<string, unknown>, TODAY), { merge: true });
    done += 1;
  }
  console.log(`\n파기 완료 ${done}건 — 개인정보 필드만 표식으로 덮었습니다(계약 레코드는 유지).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
