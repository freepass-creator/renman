/* 정합성 대사(탐색) — 계약 예상청구 ↔ 실제입금(운영계좌 3년) 매칭 현실 실측. */
const XLSX = require('xlsx');
const DIR = 'C:/Users/admin/Documents/카카오톡 받은 파일/';
const TODAY = new Date('2026-07-11'); const MS_M = 2629800000;
const num = v => { const n = Number(String(v).replace(/[,\s₩원]/g, '')); return isFinite(n) ? n : 0; };
const ser = v => { const n = Number(v); if (!n || n < 20000 || n > 60000) return ''; const d = XLSX.SSF.parse_date_code(n); if (!d) return ''; const p = x => String(x).padStart(2, '0'); return `${d.y}-${p(d.m)}-${p(d.d)}`; };
const norm = s => String(s || '').replace(/\s/g, '');

// ── 입금 로드 (3년) ──
const deposits = [];
for (const yr of ['2024', '2025', '2026']) {
  const rows = XLSX.utils.sheet_to_json(XLSX.readFile(DIR + yr + '년 스위치플랜_381868 운영계좌.xlsx').Sheets['sheet'], { header: 1, defval: '' });
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]; const inAmt = num(r[4]); if (inAmt <= 0) continue;
    const dt = String(r[2] || '').slice(0, 10).replace(/\./g, '-');
    deposits.push({ date: dt, amount: inAmt, memo: norm(r[6]), raw: String(r[6] || '').trim() });
  }
}
const depTotal = deposits.reduce((s, d) => s + d.amount, 0);

// ── 계약 로드 (지우지마세요 첫 블록=현재) ──
const Z = XLSX.utils.sheet_to_json(XLSX.readFile(DIR + '[스위치플랜] 사업현황 (7).xlsx').Sheets['지우지마세요'], { header: 1, defval: '' });
const contracts = [];
for (let i = 1; i < Z.length; i++) {
  const r = Z[i]; const plate = String(r[1] || '').trim(); if (!/\d/.test(plate)) continue;
  const name = String(r[6] || '').trim(); const start = ser(r[7]); if (!name || !start) continue;
  const end = ser(r[8]); const back = ser(r[9]); const rent = num(r[10]);
  contracts.push({ plate, plate4: plate.replace(/\D/g, '').slice(-4), name: norm(name), rawName: name, start, end, back, rent, status: back ? '종료' : '운행' });
}

// ── 매칭: 입금 memo에 고객명 or plate4 포함 ──
let matchedAmt = 0, matchedCnt = 0;
const perC = new Map(contracts.map(c => [c, 0]));
for (const d of deposits) {
  let hit = null;
  for (const c of contracts) {
    if (c.name.length >= 2 && d.memo.includes(c.name)) { hit = c; break; }
    if (c.plate4.length === 4 && d.memo.includes(c.plate4)) { hit = c; break; }
  }
  if (hit) { matchedAmt += d.amount; matchedCnt++; perC.set(hit, perC.get(hit) + d.amount); }
}

// ── 계약별 예상 vs 실제 ──
const rows = contracts.map(c => {
  const months = c.end ? Math.max(1, Math.round((new Date(c.end) - new Date(c.start)) / MS_M)) : 12;
  const elapsed = Math.max(0, Math.min(months, Math.round(((c.back ? new Date(c.back) : TODAY) - new Date(c.start)) / MS_M)));
  const expected = c.rent * elapsed; const received = perC.get(c);
  return { c, expected, received, gap: expected - received };
});
const 미수 = rows.filter(r => r.gap > r.c.rent * 0.5).sort((a, b) => b.gap - a.gap);
const 과납 = rows.filter(r => r.received - r.expected > r.c.rent * 0.5);
const 무입금 = rows.filter(r => r.received === 0);

console.log('입금 총건', deposits.length, '/ 합계', (depTotal / 1e8).toFixed(1) + '억');
console.log('계약 총건', contracts.length, '(운행', contracts.filter(c => c.status === '운행').length + ')');
console.log('매칭 입금', matchedCnt, '건 (' + Math.round(matchedCnt / deposits.length * 100) + '%) /', (matchedAmt / 1e8).toFixed(1) + '억 (' + Math.round(matchedAmt / depTotal * 100) + '%)');
console.log('미매칭 입금', deposits.length - matchedCnt, '건 /', ((depTotal - matchedAmt) / 1e8).toFixed(1) + '억 → 미확인입금 후보');
console.log('---');
console.log('계약 중 입금 0원:', 무입금.length, '/ 미수의심(gap>0.5월):', 미수.length, '/ 과납:', 과납.length);
console.log('\n[미수 의심 TOP10] plate 고객 | 예상 vs 입금 = gap');
미수.slice(0, 10).forEach(r => console.log(` ${r.c.plate} ${r.c.rawName} | ${(r.expected/1e4).toFixed(0)}만 vs ${(r.received/1e4).toFixed(0)}만 = ${(r.gap/1e4).toFixed(0)}만`));
console.log('\n[미매칭 입금 샘플15] (계약과 못 붙은 입금 내용)');
deposits.filter(d => { for (const c of contracts) { if (c.name.length>=2 && d.memo.includes(c.name)) return false; if (c.plate4.length===4 && d.memo.includes(c.plate4)) return false; } return true; })
  .slice(0, 15).forEach(d => console.log(` ${d.date} ${(d.amount/1e4).toFixed(0)}만 | ${d.raw}`));
