const XLSX = require('xlsx');
const D = 'C:/Users/admin/Documents/카카오톡 받은 파일/';
const num = v => { const n = Number(String(v).replace(/[,\s]/g, '')); return isFinite(n) ? n : 0; };
const wb = XLSX.readFile(D + '26년_스위치플랜_자금일보.xlsx');
for (const sn of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
  const hi = rows.findIndex(r => r.map(String).some(c => c.includes('입금액')) || r.map(String).some(c => c.includes('세부모델')));
  if (hi < 0) { console.log('\n▶', sn, '— 헤더 못찾음, 행수', rows.length); continue; }
  const h = rows[hi].map(c => String(c).trim());
  const ci = n => h.findIndex(c => c === n);
  const [I, O, A, P, T] = [ci('입금액'), ci('출금액'), ci('계정과목'), ci('차량번호'), ci('임차인')];
  console.log('\n▶', sn, '| 헤더행', hi, '| cols 입금=' + I, '출금=' + O, '계정=' + A, '차량=' + P);
  if (I < 0) { console.log('  (거래 시트 아님) 행수', rows.filter(r => r.some(c => String(c).trim())).length); continue; }
  const acc = {}; let inS = 0, outS = 0, tag = 0, tot = 0;
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i]; const io = num(r[I]), oo = num(r[O]); if (!io && !oo) continue; tot++;
    const a = String(r[A] || '').trim() || '(미분류)'; inS += io; outS += oo;
    acc[a] = acc[a] || { n: 0, in: 0, out: 0 }; acc[a].n++; acc[a].in += io; acc[a].out += oo;
    if (P >= 0 && String(r[P] || '').trim()) tag++;
  }
  console.log('  거래', tot, '| 입금', (inS / 1e8).toFixed(2) + '억', '출금', (outS / 1e8).toFixed(2) + '억', '| 차량태깅', tag);
  Object.entries(acc).sort((a, b) => (b[1].in + b[1].out) - (a[1].in + a[1].out)).slice(0, 12)
    .forEach(([k, v]) => console.log('    ' + k + ': ' + v.n + '건 입' + (v.in / 1e7).toFixed(1) + '천만 출' + (v.out / 1e7).toFixed(1) + '천만'));
}
