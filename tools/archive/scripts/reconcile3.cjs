/* 채권장부 결제기록 ↔ 계좌 실입금 대사 (카드/CMS 채널 분리) */
const XLSX = require('xlsx');
const DIR = 'C:/Users/admin/Documents/카카오톡 받은 파일/';
const num = v => { const n = Number(String(v).replace(/[,\s₩원]/g, '')); return isFinite(n) ? n : 0; };
const ser = v => { const n = Number(v); if (!n || n < 20000 || n > 60000) return null; const d = XLSX.SSF.parse_date_code(n); return d ? new Date(d.y, d.m - 1, d.d) : null; };
const 억 = n => (n / 1e8).toFixed(2) + '억';
const wb = XLSX.readFile(DIR + '[스위치플랜] 사업현황 (7).xlsx');

// ── 장부 결제기록 추출 (반납 시트: col9=차량, col2=코드명, 결제블록 col12 step5 [청구,결제,결제일자,수단,미납]) ──
const R = XLSX.utils.sheet_to_json(wb.Sheets['반납'], { header: 1, defval: '' });
const ledgerPays = []; // {plate,name,amount,date,수단}
const 미수잔액 = {};
const 청구결제 = []; // {plate,name,청구,결제,미수}
for (let i = 1; i < R.length; i++) {
  const r = R[i]; const plate = String(r[9] || '').trim(); if (!/\d/.test(plate)) continue;
  const name = String(r[2] || '').trim();
  let lastMi = null, 청구합 = 0, 결제합 = 0;
  for (let b = 12; b + 4 < r.length; b += 5) {
    const 청구 = num(r[b]); const pay = num(r[b + 1]); const dt = ser(r[b + 2]); const 수단 = String(r[b + 3] || '').trim(); const mi = r[b + 4];
    청구합 += 청구; 결제합 += pay;
    if (String(mi).trim() !== '') lastMi = num(mi);
    if (pay > 0 && dt) ledgerPays.push({ plate, name, amount: pay, date: dt, 수단: 수단 || '입금' });
  }
  if (lastMi != null) 미수잔액[plate] = lastMi;
  청구결제.push({ plate, name, 청구: 청구합, 결제: 결제합, 미수: 청구합 - 결제합 });
}
const byMeans = {}; ledgerPays.forEach(p => byMeans[p.수단] = (byMeans[p.수단] || 0) + 1);

// ── 계좌 실입금 ──
const bank = [];
for (const yr of ['2024', '2025', '2026']) {
  const rows = XLSX.utils.sheet_to_json(XLSX.readFile(DIR + yr + '년 스위치플랜_381868 운영계좌.xlsx').Sheets['sheet'], { header: 1, defval: '' });
  for (let i = 1; i < rows.length; i++) { const a = num(rows[i][4]); if (a <= 0) continue; const dt = String(rows[i][2] || '').slice(0, 10).split('.'); if (dt.length < 3) continue; bank.push({ date: new Date(+dt[0], +dt[1] - 1, +dt[2]), amount: a, used: false, memo: String(rows[i][6] || '').trim() }); }
}
bank.sort((a, b) => a.date - b.date);

// ── 매칭: 장부 '입금' 결제 → 계좌 (금액 동일, 날짜 ±7일, greedy 1:1) ──
const 대상 = ledgerPays.filter(p => /입금|자동이체|CMS/i.test(p.수단));
const 카드 = ledgerPays.filter(p => /카드/.test(p.수단));
let matched = 0, matchedAmt = 0; const unmatched = [];
const WIN = 7 * 86400000;
for (const p of 대상) {
  const hit = bank.find(d => !d.used && d.amount === p.amount && Math.abs(d.date - p.date) <= WIN);
  if (hit) { hit.used = true; matched++; matchedAmt += p.amount; }
  else unmatched.push(p);
}
const 장부합 = 대상.reduce((s, p) => s + p.amount, 0);
const 계좌미사용 = bank.filter(d => !d.used);

console.log('── 채권장부 결제기록 ↔ 계좌 대사 ──');
console.log('장부 결제기록:', ledgerPays.length, '건 | 수단:', JSON.stringify(byMeans));
console.log('계좌 입금:', bank.length, '건 /', 억(bank.reduce((s, d) => s + d.amount, 0)));
console.log('');
console.log(`[대사 대상=장부 '입금'류] ${대상.length}건 / ${억(장부합)}`);
console.log(` ✓ 계좌 대응입금 확인: ${matched}건 (${Math.round(matched / 대상.length * 100)}%) / ${억(matchedAmt)}`);
console.log(` ✗ 장부엔 입금인데 계좌 없음: ${unmatched.length}건 / ${억(장부합 - matchedAmt)} → 미입금·기록오류 의심`);
console.log(`[카드 결제분] ${카드.length}건 — 계좌 아닌 카드사 정산 경유(정상적으로 계좌 대사 제외)`);
console.log(`[계좌엔 있으나 장부 매칭 안 됨] ${계좌미사용.length}건 — 내부이체·보험·딜러·미기재 수납 등`);
console.log('\n[장부입금인데 계좌없음 TOP10]');
unmatched.sort((a, b) => b.amount - a.amount).slice(0, 10).forEach(p => console.log(` ${p.date.toISOString().slice(0, 10)} ${p.plate} ${p.name} ${(p.amount / 1e4).toFixed(0)}만`));
const 총미수 = Object.values(미수잔액).reduce((s, v) => s + v, 0);
console.log('\n채권 장부 미수잔액 합계(반납시트 최신 미납):', 억(총미수), '/', Object.values(미수잔액).filter(v => v > 0).length, '건');

// ── 채널 무관 채권 내부 미수 (Σ청구 - Σ결제) ──
const 미수리스트 = 청구결제.filter(c => c.미수 > 10000).sort((a, b) => b.미수 - a.미수);
const 미수총 = 미수리스트.reduce((s, c) => s + c.미수, 0);
const 과납리스트 = 청구결제.filter(c => c.미수 < -10000);
console.log('\n── 채권 내부 미수 (Σ청구-Σ결제, 채널무관) ──');
console.log(`총 청구 ${억(청구결제.reduce((s,c)=>s+c.청구,0))} / 총 결제 ${억(청구결제.reduce((s,c)=>s+c.결제,0))}`);
console.log(`미수 계약 ${미수리스트.length}건 / 합계 ${억(미수총)} · 과납(선납) ${과납리스트.length}건`);
console.log('[미수 TOP10]');
미수리스트.slice(0, 10).forEach(c => console.log(` ${c.plate} ${c.name} : 청구 ${(c.청구/1e4).toFixed(0)}만 - 결제 ${(c.결제/1e4).toFixed(0)}만 = 미수 ${(c.미수/1e4).toFixed(0)}만`));
