/* 정합성 대사 2 — ①계약↔채권 대여료 일치 ②입금 3년 분류(정체) ③채권추심 확정미수 */
const XLSX = require('xlsx');
const DIR = 'C:/Users/admin/Documents/카카오톡 받은 파일/';
const num = v => { const n = Number(String(v).replace(/[,\s₩원]/g, '')); return isFinite(n) ? n : 0; };
const norm = s => String(s || '').replace(/\s/g, '');
const 억 = n => (n / 1e8).toFixed(2) + '억';
const wb = XLSX.readFile(DIR + '[스위치플랜] 사업현황 (7).xlsx');

// ── ① 계약 대여료 vs 채권 대여료 (plate 기준) ──
const Z = XLSX.utils.sheet_to_json(wb.Sheets['지우지마세요'], { header: 1, defval: '' });
const rentZ = {}; // plate → 대여료 (현재계약)
for (let i = 1; i < Z.length; i++) { const p = String(Z[i][1] || '').trim(); if (!/\d/.test(p)) continue; const name = String(Z[i][6] || '').trim(); if (name && !rentZ[p]) rentZ[p] = num(Z[i][10]); }
const CB = XLSX.utils.sheet_to_json(wb.Sheets['채권'], { header: 1, defval: '' });
const rentC = {}; // plate → 대여료 (채권장부)
for (let i = 2; i < CB.length; i++) { const p = String(CB[i][9] || '').trim(); if (!/\d/.test(p)) continue; const rent = num(CB[i][4]); if (rent > 0) rentC[p] = rent; }
let ok = 0, mismatch = [];
for (const p of Object.keys(rentZ)) {
  if (!rentZ[p]) continue;
  if (rentC[p] == null) { mismatch.push([p, rentZ[p], '(채권없음)']); continue; }
  if (rentZ[p] === rentC[p]) ok++; else mismatch.push([p, rentZ[p], rentC[p]]);
}
console.log('── ① 계약 대여료 ↔ 채권 대여료 대사 ──');
console.log(`일치 ${ok} / 불일치·누락 ${mismatch.length}`);
mismatch.slice(0, 8).forEach(m => console.log(` ${m[0]}: 계약 ${(num(m[1])/1e4)||0}만 vs 채권 ${m[2]==='(채권없음)'?m[2]:(num(m[2])/1e4)+'만'}`));

// ── ② 입금 3년 분류 ──
const deposits = [];
for (const yr of ['2024', '2025', '2026']) {
  const rows = XLSX.utils.sheet_to_json(XLSX.readFile(DIR + yr + '년 스위치플랜_381868 운영계좌.xlsx').Sheets['sheet'], { header: 1, defval: '' });
  for (let i = 1; i < rows.length; i++) { const a = num(rows[i][4]); if (a > 0) deposits.push({ amount: a, memo: norm(rows[i][6]), raw: String(rows[i][6] || '') }); }
}
const contracts = Object.keys(rentZ).map(p => ({ plate4: p.replace(/\D/g, '').slice(-4) }));
const names = [];
for (let i = 1; i < Z.length; i++) { const n = norm(Z[i][6]); if (n.length >= 2) names.push(n); }
const buckets = { 내부이체: 0, 보험: 0, 딜러매입: 0, 대출CMS: 0, 운영비: 0, 손님대여료: 0, 기타: 0 };
const cnt = { 내부이체: 0, 보험: 0, 딜러매입: 0, 대출CMS: 0, 운영비: 0, 손님대여료: 0, 기타: 0 };
const 기타샘플 = [];
for (const d of deposits) {
  const m = d.memo; let b;
  if (/제이피케이|jpk|jpkas|오토정산|정산/i.test(m)) b = '내부이체';
  else if (/메리츠|손보|손해|화재|해상|공제|보험|DB손|KB손/i.test(m)) b = '보험';
  else if (/모터스|모터|자동차|오토모빌|리버|삼천리|올바른|황금|카오토/i.test(m)) b = '딜러매입';
  else if (/약정|캐피탈|리스|할부|카드|대출/i.test(m)) b = '대출CMS';
  else if (/관리비|주유|탁송|과태료|통행|정비|수리/i.test(m)) b = '운영비';
  else if (names.some(n => m.includes(n)) || contracts.some(c => c.plate4.length === 4 && m.includes(c.plate4))) b = '손님대여료';
  else { b = '기타'; if (기타샘플.length < 12) 기타샘플.push(`${(d.amount/1e4).toFixed(0)}만 ${d.raw.trim()}`); }
  buckets[b] += d.amount; cnt[b]++;
}
const total = deposits.reduce((s, d) => s + d.amount, 0);
console.log('\n── ② 입금 3년 정체 분류 (총 ' + 억(total) + ' / ' + deposits.length + '건) ──');
for (const b of Object.keys(buckets)) console.log(` ${b}: ${억(buckets[b])} (${cnt[b]}건, ${Math.round(buckets[b]/total*100)}%)`);
console.log(' └ 기타 샘플:', 기타샘플.slice(0, 8).join(' / '));

// ── ③ 채권추심 확정미수 ──
const RC = XLSX.utils.sheet_to_json(wb.Sheets['채권추심'], { header: 1, defval: '' });
console.log('\n── ③ 채권추심 확정미수 ──');
let sum = 0, n = 0;
for (let i = 1; i < RC.length; i++) { const name = String(RC[i][0] || '').trim(); const plate = String(RC[i][1] || '').trim(); if (!name || !/\d/.test(plate)) continue; const 최종 = num(RC[i][12]); sum += 최종; n++; console.log(` ${plate} ${name}: 최종 ${(최종/1e4).toFixed(0)}만 (위약금산출 ${(num(RC[i][11])/1e4).toFixed(0)}만, 대여료 ${(num(RC[i][7])/1e4).toFixed(0)}만)`); }
console.log(` → 확정미수 ${n}건 합계 ${억(sum)}`);
