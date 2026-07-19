/**
 * 동결 switchplan-data.json 의 1930·1932 등 오염 날짜 필드 제거 (읽기 후 재저장).
 * 원천 xlsx는 그대로 — 파서 normDateStr 이 라이브에서 동일 차단.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'lib', 'migrate', 'switchplan-data.json');
const MIN = 2000;
const MAX = 2045;

function bad(iso) {
  if (!iso || typeof iso !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return false;
  const y = Number(iso.slice(0, 4));
  return y < MIN || y > MAX;
}

function scrub(obj, keys, stats, pathHint) {
  for (const k of keys) {
    if (obj[k] != null && bad(String(obj[k]))) {
      stats.push({ path: pathHint, field: k, was: String(obj[k]).slice(0, 10) });
      delete obj[k];
    }
  }
}

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const stats = [];

for (const c of data.contracts || []) {
  scrub(c, ['startDate', 'endDate', 'contractDate', 'deliveredDate', 'returnScheduledDate', 'returnedDate'], stats, `contract:${c.plate}|${c.contractorName}`);
}
for (const v of data.vehicles || []) {
  scrub(v, ['firstReg', 'inspectionTo', 'acquisitionDate', 'saleDate', 'loanStartDate'], stats, `vehicle:${v.plate}`);
}
for (const i of data.insurance || []) {
  scrub(i, ['startDate', 'endDate'], stats, `insurance:${i.plate}`);
}

fs.writeFileSync(FILE, JSON.stringify(data), 'utf8');
const out = path.join(__dirname, 'scrub-bad-dates.result.json');
fs.writeFileSync(out, JSON.stringify({ removed: stats.length, samples: stats.slice(0, 40), byField: stats.reduce((m, s) => { m[s.field] = (m[s.field] || 0) + 1; return m; }, {}) }, null, 2));
console.log(JSON.stringify({ ok: true, removed: stats.length, byField: stats.reduce((m, s) => { m[s.field] = (m[s.field] || 0) + 1; return m; }, {}), out }, null, 2));
