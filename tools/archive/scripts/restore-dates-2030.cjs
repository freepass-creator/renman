/**
 * 동결 JSON: 삭제됐던 1930 날짜를 scrub 로그(was) 기준으로 2030으로 복원.
 * 이후부터는 파서/어댑터가 1930→2030 자동 해석.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'lib', 'migrate', 'switchplan-data.json');
const SCRUB = path.join(__dirname, 'scrub-bad-dates.result.json');

function to2030(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  let y = Number(m[1]);
  if (y >= 1930 && y <= 1939) y += 100;
  if (y < 2000 || y > 2045) return null;
  return `${y}-${m[2]}-${m[3]}`;
}

const scrub = JSON.parse(fs.readFileSync(SCRUB, 'utf8'));
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));

// samples may be truncated — also try to restore from git if available via remaining was list
const restores = scrub.samples || [];
let applied = 0;
const miss = [];

for (const s of restores) {
  const fixed = to2030(s.was);
  if (!fixed) continue;
  const [kind, key] = String(s.path).split(':');
  if (kind === 'contract') {
    const [plate, name] = key.split('|');
    const c = (data.contracts || []).find((x) => String(x.plate) === plate && String(x.contractorName || '') === (name || ''));
    if (!c) { miss.push(s); continue; }
    c[s.field] = fixed;
    applied += 1;
  } else if (kind === 'vehicle') {
    const v = (data.vehicles || []).find((x) => String(x.plate) === key);
    if (!v) { miss.push(s); continue; }
    v[s.field] = fixed;
    applied += 1;
  } else if (kind === 'insurance') {
    const i = (data.insurance || []).find((x) => String(x.plate) === key);
    if (!i) { miss.push(s); continue; }
    i[s.field] = fixed;
    applied += 1;
  }
}

// 파일에 남은 193x가 있으면 전부 +100
function walkRemap(obj, keys, n) {
  for (const k of keys) {
    if (obj[k] == null) continue;
    const fixed = to2030(obj[k]);
    if (fixed && fixed !== String(obj[k]).slice(0, 10)) {
      obj[k] = fixed;
      n.n += 1;
    } else if (fixed && /^\d{4}/.test(String(obj[k])) && Number(String(obj[k]).slice(0, 4)) >= 1930 && Number(String(obj[k]).slice(0, 4)) <= 1939) {
      obj[k] = fixed;
      n.n += 1;
    }
  }
}
const extra = { n: 0 };
for (const c of data.contracts || []) walkRemap(c, ['startDate', 'endDate', 'contractDate', 'deliveredDate', 'returnScheduledDate', 'returnedDate'], extra);
for (const v of data.vehicles || []) walkRemap(v, ['firstReg', 'inspectionTo', 'acquisitionDate', 'saleDate', 'loanStartDate'], extra);
for (const i of data.insurance || []) walkRemap(i, ['startDate', 'endDate'], extra);

fs.writeFileSync(FILE, JSON.stringify(data), 'utf8');
console.log(JSON.stringify({ ok: true, restoredFromScrub: applied, remappedInPlace: extra.n, miss: miss.length, sample: restores.slice(0, 3).map((s) => ({ ...s, now: to2030(s.was) })) }, null, 2));
