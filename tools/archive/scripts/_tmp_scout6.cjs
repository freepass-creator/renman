const XLSX = require('xlsx');
const D = 'C:/Users/admin/Documents/카카오톡 받은 파일/';
const wb = XLSX.readFile(D+'26년_스위치플랜_자금일보.xlsx');
const rows = XLSX.utils.sheet_to_json(wb.Sheets['영업계좌(신한6616)'],{header:1,defval:''});
let mind='9', maxd='0';
for(const acct of ['대여료','CMS집금','카드자동집금']){
  let n=0,tagged=0;
  for(let i=2;i<rows.length;i++){ const r=rows[i]; if(String(r[9]).trim()!==acct) continue; n++; if(String(r[10]).trim())tagged++;
    const dt=String(r[2]).slice(0,10); if(dt<mind)mind=dt; if(dt>maxd)maxd=dt;}
  console.log(acct+': '+n+'건, 차량태깅 '+tagged+'건');
}
console.log('영업계좌 날짜범위', mind, '~', maxd);
