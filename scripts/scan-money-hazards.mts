/**
 * 오픈 전 위험 패턴 정적 스캔 — 있으면 FAIL.
 *
 *   npm run open:scan
 *
 * 금지:
 *   · 저장 회사 임의 폴백 COMPANIES[0] / 'switchplan' (도구·시드·데모 예외)
 *   · category/subject = 지급수수료 로 집금 덮어쓰기 (테스트 예외)
 *   · _payments: [] 전량 비우기 (reconcile keep 분기 없는 경우)
 *   · legacyDepositOffsetNet 부활
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const SKIP_DIR = new Set(['node_modules', '.next', 'tools/archive', '.git']);

type Hit = { file: string; line: number; rule: string; text: string };

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === 'archive' && path.basename(dir) === 'tools') continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

function rel(p: string) {
  return path.relative(root, p).replace(/\\/g, '/');
}

function isExempt(file: string, rule: string): boolean {
  const f = rel(file);
  if (f.startsWith('tests/')) return true;
  if (rule === 'company-fallback') {
    return (
      f === 'lib/scope.ts' // 경고 주석
      || f === 'lib/companies.ts'
      || f === 'lib/seed-demo.ts'
      || f === 'lib/migrate/pack.ts'
      || f === 'components/MigrateDataButton.tsx'
      || f === 'app/dev/data/page.tsx'
      || f.startsWith('tools/reconcile-')
      || f.startsWith('tools/backfill-')
      || f.startsWith('tools/rebuild-')
      || f.startsWith('tools/mask-')
      || f.startsWith('tools/audit-')
      || f.startsWith('tools/snapshot-')
    );
  }
  if (rule === 'fee-overwrite') {
    return f.includes('cms-settle-subject'); // 버그 재현 대조
  }
  if (rule === 'wipe-payments') {
    // reconcile는 toKeep 보존 후 부분 wipe — 허용. 전량 [] 만 금지.
    return false;
  }
  return false;
}

const rules: Array<{ id: string; re: RegExp; note: string }> = [
  {
    id: 'company-fallback',
    re: /COMPANIES\s*\[\s*0\s*\]|companyId\s*\|\|\s*['"]switchplan['"]|sessionCompanyId\s*\|\|\s*['"]switchplan['"]/,
    note: '저장 회사 임의 폴백(회사격리)',
  },
  {
    id: 'fee-overwrite',
    re: /(?:category|subject)\s*:\s*['"]지급수수료['"]/,
    note: '집금 과목을 지급수수료로 덮기',
  },
  {
    id: 'wipe-payments',
    re: /_payments\s*:\s*\[\s*\]/,
    note: '_payments 전량 비우기(충당 소멸 위험)',
  },
  {
    id: 'legacy-view-net',
    re: /legacyDepositOffsetNet\s*\(/,
    note: 'view-time 미수 차감 부활',
  },
];

const hits: Hit[] = [];
const files = walk(root).filter((f) => {
  const r = rel(f);
  return r.startsWith('app/') || r.startsWith('lib/') || r.startsWith('components/') || r.startsWith('tools/');
});

for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((text, i) => {
    for (const rule of rules) {
      if (!rule.re.test(text)) continue;
      if (isExempt(file, rule.id)) continue;
      // ledger-create: 단일회사만 COMPANIES[0] — 허용(합본 아님)
      if (rule.id === 'company-fallback' && rel(file) === 'components/ui/ledger-create-panel.tsx'
        && /COMPANIES\.length\s*===\s*1/.test(lines.slice(Math.max(0, i - 2), i + 1).join('\n'))) {
        continue;
      }
      // reconcile keep 분기: _payments: toKeep 는 OK. 순수 [] 만 잡힘.
      hits.push({ file: rel(file), line: i + 1, rule: rule.id, text: text.trim().slice(0, 120) });
    }
  });
}

console.log(`스캔 파일 ${files.length} · 규칙 ${rules.length}`);
if (!hits.length) {
  console.log('✔ open:scan — 위험 패턴 0건');
  process.exit(0);
}

console.error('✖ open:scan — 위험 패턴 발견:');
for (const h of hits) {
  console.error(`  [${h.rule}] ${h.file}:${h.line}  ${h.text}`);
}
process.exit(1);
