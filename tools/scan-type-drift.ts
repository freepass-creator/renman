/**
 * 실데이터 타입 어긋남 스캔 — **읽기 전용**. 쓰기·삭제 없음.
 *
 *   npx tsx tools/scan-type-drift.ts
 *   npx tsx tools/scan-type-drift.ts --company=switchplan
 *   npx tsx tools/scan-type-drift.ts --entity=contract
 *   npx tsx tools/scan-type-drift.ts --out=tmp/type-drift.json
 *
 * ## 무엇을 보나
 *   엔티티 정의(lib/intake/entities)가 `type: 'number' | 'date'` 라고 한 칸에
 *   **실제로 무엇이 들어 있는지**를 센다.
 *
 *   2026-08-07 확인: 엑셀 임포트가 SheetJS 를 raw:false 로 읽어 「1,234,000」 같은
 *   «서식 그대로» 문자열을 저장하고 있었다. 하위 계산은 전부 `Number(v) || 0` 이라
 *   **콤마가 낀 금액이 조용히 0** 이 된다. 임포트 경로는 고쳤지만(lib/intake/coerce)
 *   **이미 저장된 값은 안 고쳐진다** — 그게 얼마나 있는지 세는 도구다.
 *
 * ## 출력 원칙
 *   값을 그대로 찍지 않는다. 표본은 숫자를 `#` 로 가린 «모양»만 낸다(1,234,000 → #,###,###).
 *   PII·금액 원문이 로그·터미널에 남지 않게.
 */
import fs from 'node:fs';
import { resolve } from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { ENTITIES } from '../lib/intake/entities';
import { coerceNumber, coerceDate } from '../lib/intake/coerce';

const ROOT = resolve(__dirname, '..');
const SERVICE_KEY = resolve(ROOT, 'renman-dd0a2-firebase-adminsdk-fbsvc-c489c146ce.json');

function arg(name: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
}
const COMPANY = arg('company');
const ONLY_ENTITY = arg('entity');
const OUT = arg('out');

/** 값의 «모양»만 남긴다 — 숫자는 #, 한글·영문은 길이만. 원문 유출 방지. */
function shape(v: unknown): string {
  const s = String(v);
  if (s.length > 40) return `(${s.length}자)`;
  return s.replace(/\d/g, '#');
}

type FieldStat = {
  entity: string;
  field: string;
  label: string;
  declared: 'number' | 'date';
  filled: number;          // 값이 있는 문서 수
  ok: number;              // 선언한 타입 그대로
  asString: number;        // 문자열로 저장됨(숫자 칸인데 string 등)
  silentZero: number;      // ★Number(v) 가 NaN → 하위에서 0 으로 삼켜지는 값
  unparsable: number;      // 정규화로도 못 읽는 값(사람이 봐야 함)
  shapes: Map<string, number>;
};

async function main() {
  if (!getApps().length) {
    const raw = (process.env.FIREBASE_ADMIN_KEY || '').trim();
    if (raw) {
      initializeApp({ credential: cert(JSON.parse(raw)) });
    } else if (fs.existsSync(SERVICE_KEY)) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      initializeApp({ credential: cert(require(SERVICE_KEY)) });
    } else {
      throw new Error('FIREBASE_ADMIN_KEY 또는 서비스계정 키 파일이 필요합니다(읽기 전용).');
    }
  }
  const db = getFirestore();

  const stats: FieldStat[] = [];
  const entityKeys = Object.keys(ENTITIES).filter((k) => !ONLY_ENTITY || k === ONLY_ENTITY);
  let scannedDocs = 0;

  for (const entityKey of entityKeys) {
    const entity = ENTITIES[entityKey];
    const typed = entity.fields.filter((f) => f.type === 'number' || f.type === 'date');
    if (!typed.length) continue;

    let snap;
    try {
      snap = await db.collection(entityKey).get();
    } catch (e) {
      console.log(`  (건너뜀) ${entityKey}: ${(e as Error).message}`);
      continue;
    }
    if (snap.empty) continue;

    const byField = new Map<string, FieldStat>();
    for (const f of typed) {
      byField.set(f.key, {
        entity: entityKey, field: f.key, label: f.label,
        declared: f.type as 'number' | 'date',
        filled: 0, ok: 0, asString: 0, silentZero: 0, unparsable: 0, shapes: new Map(),
      });
    }

    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.deletedAt) continue;                       // 소프트삭제 제외
      const companyId = String(data.companyId || (doc.id.includes('__') ? doc.id.slice(0, doc.id.indexOf('__')) : ''));
      if (COMPANY && companyId !== COMPANY) continue;
      scannedDocs += 1;

      for (const f of typed) {
        const v = data[f.key];
        if (v === undefined || v === null || v === '') continue;
        const st = byField.get(f.key)!;
        st.filled += 1;

        if (f.type === 'number') {
          if (typeof v === 'number') { st.ok += 1; continue; }
          st.asString += 1;
          // 하위 계산은 Number(v) || 0 — NaN 이면 조용히 0이 된다.
          if (!Number.isFinite(Number(v))) {
            if (coerceNumber(v) !== null) st.silentZero += 1;
            else st.unparsable += 1;
          }
          st.shapes.set(shape(v), (st.shapes.get(shape(v)) || 0) + 1);
        } else {
          const s = String(v);
          if (/^\d{4}-\d{2}-\d{2}/.test(s)) { st.ok += 1; continue; }
          st.asString += 1;
          if (coerceDate(v) !== null) st.silentZero += 1;   // 날짜는 «고칠 수 있음» 의미
          else st.unparsable += 1;
          st.shapes.set(shape(v), (st.shapes.get(shape(v)) || 0) + 1);
        }
      }
    }
    for (const st of byField.values()) if (st.filled) stats.push(st);
  }

  const bad = stats.filter((s) => s.asString > 0);
  console.log(`\n스캔 문서 ${scannedDocs}건 · 타입 선언 칸 ${stats.length}개${COMPANY ? ` · 회사=${COMPANY}` : ''}\n`);

  if (!bad.length) {
    console.log('✅ 선언한 타입과 다른 값 없음 — 저장된 데이터는 깨끗하다.');
  } else {
    console.log('칸'.padEnd(38) + '값있음'.padStart(8) + '문자열'.padStart(8) + '0으로삼킴'.padStart(11) + '못읽음'.padStart(8) + '  모양');
    console.log('-'.repeat(96));
    for (const s of bad.sort((a, b) => b.silentZero - a.silentZero || b.asString - a.asString)) {
      const top = [...s.shapes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, n]) => `${k}×${n}`).join(' ');
      console.log(
        `${s.entity}.${s.field}(${s.label})`.slice(0, 37).padEnd(38)
        + String(s.filled).padStart(8) + String(s.asString).padStart(8)
        + String(s.silentZero).padStart(11) + String(s.unparsable).padStart(8) + '  ' + top,
      );
    }
    const zero = bad.reduce((n, s) => n + s.silentZero, 0);
    console.log(`\n★ 하위 계산에서 조용히 0이 되는 값 ${zero}건 — 있으면 백필이 필요하다.`);
  }

  if (OUT) {
    const json = stats.map((s) => ({ ...s, shapes: Object.fromEntries(s.shapes) }));
    fs.mkdirSync(resolve(ROOT, OUT, '..'), { recursive: true });
    fs.writeFileSync(resolve(ROOT, OUT), JSON.stringify(json, null, 2), 'utf8');
    console.log(`\n→ ${OUT}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
