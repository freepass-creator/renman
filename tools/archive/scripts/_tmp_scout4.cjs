const XLSX = require('xlsx');
const D = 'C:/Users/admin/Documents/카카오톡 받은 파일/';
const num = v => { const n = Number(String(v).replace(/[,\s]/g,'')); return isFinite(n)?n:0; };
const wb = XLSX.readFile(D+'26년_스위치플랜_자금일보.xlsx');
for(const sn of wb.SheetNames.filter(s=>s.startsWith('영업계좌'))){
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:''});
  const acc={}; let inS=0,tag=0,taggedIn=0;
  for(let i=2;i<rows.length;i++){
    const r=rows[i]; const io=num(r[4]); const a=String(r[9]||'').trim()||'(빈)'; const plate=String(r[10]||'').trim();
    if(!io && !num(r[5])) continue;
    inS+=io; acc[a]=acc[a]||{n:0,in:0,out:0}; acc[a].n++; acc[a].in+=io; acc[a].out+=num(r[5]);
    if(plate && io) {tag++; taggedIn+=io;}
  }
  console.log('\n['+sn+'] 총입금',(inS/1e8).toFixed(3)+'억',' 차량태깅입금건',tag,' 태깅입금액',(taggedIn/1e8).toFixed(3)+'억');
  Object.entries(acc).sort((a,b)=>b[1].in-a[1].in).forEach(([k,v])=>console.log('  '+k+': '+v.n+'건 입'+(v.in/1e7).toFixed(2)+'천만 출'+(v.out/1e7).toFixed(2)+'천만'));
}
