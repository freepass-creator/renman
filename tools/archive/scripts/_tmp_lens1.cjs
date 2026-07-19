const XLSX = require('xlsx');
const D = 'C:/Users/admin/Documents/카카오톡 받은 파일/';
const num = v => { const n = Number(String(v).replace(/[,\s₩원]/g,'')); return isFinite(n)?n:0; };
const 억 = n => (n/1e8).toFixed(2)+'억';
const 만 = n => (n/1e4).toFixed(0)+'만';
const ser = v => { const n=Number(v); if(!n||n<20000||n>60000)return null; const d=XLSX.SSF.parse_date_code(n); return d?{y:d.y,m:d.m,d:d.d}:null; };
const npl = p => String(p||'').replace(/\s/g,'').trim();  // normalize plate

// ===== 1) 반납(사업현황) 장부: per-vehicle 청구/결제/미수 + 2026결제 =====
const wb = XLSX.readFile(D+'[스위치플랜] 사업현황 (7).xlsx');
const R = XLSX.utils.sheet_to_json(wb.Sheets['반납'],{header:1,defval:''});
const ledger = {}; // plate -> {name,청구,결제,미수, pay2026, payAll}
for(let i=1;i<R.length;i++){
  const r=R[i]; const plate=npl(r[9]); if(!/\d/.test(plate))continue;
  const name=String(r[2]||'').trim();
  const L = ledger[plate] = ledger[plate]||{name,청구:0,결제:0,pay2026:0,pays:0};
  let lastMi=null;
  for(let b=12;b+4<r.length;b+=5){
    const 청구=num(r[b]); const pay=num(r[b+1]); const dt=ser(r[b+2]);
    L.청구+=청구; L.결제+=pay;
    if(pay>0){ L.pays++; if(dt&&dt.y===2026) L.pay2026+=pay; }
  }
}
Object.values(ledger).forEach(L=>L.미수=L.청구-L.결제);

// ===== 2) 2026 영업계좌 대여료: per-vehicle 실수납 =====
const jbo = XLSX.readFile(D+'26년_스위치플랜_자금일보.xlsx');
const jr = XLSX.utils.sheet_to_json(jbo.Sheets['영업계좌(신한6616)'],{header:1,defval:''});
const recv = {}; // plate -> {수납, 건수, name}
let 대여료합=0,대여료건=0, cms=0,cmsN=0, card=0,cardN=0, 보증금=0;
for(let i=2;i<jr.length;i++){
  const r=jr[i]; const io=num(r[4]); if(!io)continue;
  const acct=String(r[9]||'').trim(); const plate=npl(r[10]); const name=String(r[11]||'').trim();
  if(acct==='대여료'){ 대여료합+=io; 대여료건++; const V=recv[plate]=recv[plate]||{수납:0,건수:0,name}; V.수납+=io; V.건수++; }
  else if(acct==='CMS집금'){ cms+=io; cmsN++; }
  else if(acct==='카드자동집금'){ card+=io; cardN++; }
  else if(acct==='보증금'){ 보증금+=io; }
}

// ===== 3) 대사: 2026 장부결제 vs 2026 실수납 (per vehicle) =====
const plates = new Set([...Object.keys(ledger), ...Object.keys(recv)]);
const rows=[];
for(const p of plates){
  const L=ledger[p]; const V=recv[p];
  rows.push({plate:p, name:(L&&L.name)||(V&&V.name)||'', 장부2026:L?L.pay2026:0, 실수납:V?V.수납:0,
    실건:V?V.건수:0, 청구cum:L?L.청구:0, 결제cum:L?L.결제:0, 미수cum:L?L.미수:0, inLedger:!!L});
}
// 유형 분류 (2026 기준)
const 유령 = rows.filter(r=>r.실수납>0 && !r.inLedger); // 실입금 있는데 장부에 차량 자체가 없음
const 장부만 = rows.filter(r=>r.장부2026>50000 && r.실수납===0); // 장부엔 2026결제인데 실입금 0
const 실입금무장부결제 = rows.filter(r=>r.실수납>50000 && r.inLedger && r.장부2026===0); // 차량은 장부에 있으나 2026결제 기록 0
const 불일치 = rows.filter(r=>r.inLedger && r.실수납>0 && r.장부2026>0 && Math.abs(r.장부2026-r.실수납)>100000);

const 미수리스트 = Object.values(ledger).filter(L=>L.미수>10000).sort((a,b)=>b.미수-a.미수);
const 미수총 = 미수리스트.reduce((s,c)=>s+c.미수,0);

console.log('===== KEY NUMBERS =====');
console.log('[2026 영업계좌 손님수납] 대여료',억(대여료합),대여료건+'건 | CMS집금',억(cms),cmsN+'건 | 카드집금',억(card),cardN+'건 | 보증금',억(보증금));
console.log('  → 손님수납 소계(대여료+CMS+카드)', 억(대여료합+cms+card));
console.log('[채권장부(반납) 누계] 청구', 억(Object.values(ledger).reduce((s,L)=>s+L.청구,0)),
  '결제', 억(Object.values(ledger).reduce((s,L)=>s+L.결제,0)), '| 차량', Object.keys(ledger).length);
console.log('[장부 2026 결제 누계]', 억(Object.values(ledger).reduce((s,L)=>s+L.pay2026,0)));
console.log('[채권 내부미수 Σ청구-Σ결제]', 억(미수총), 미수리스트.length+'건');

console.log('\n===== 대사 (2026 장부결제 vs 실수납) =====');
console.log('대상 차량(합집합):', plates.size);
console.log('① 실입금 있으나 장부에 차량 없음(유령/미등록):', 유령.length,'건 /', 억(유령.reduce((s,r)=>s+r.실수납,0)));
유령.sort((a,b)=>b.실수납-a.실수납).slice(0,8).forEach(r=>console.log('   '+r.plate+' '+r.name+' 실수납'+만(r.실수납)+' ('+r.실건+'건)'));
console.log('② 장부엔 2026결제인데 실입금 0(미입금/타계좌):', 장부만.length,'건 /', 억(장부만.reduce((s,r)=>s+r.장부2026,0)));
장부만.sort((a,b)=>b.장부2026-a.장부2026).slice(0,8).forEach(r=>console.log('   '+r.plate+' '+r.name+' 장부2026결제'+만(r.장부2026)));
console.log('③ 실입금 있으나 장부 2026결제 0(장부미반영):', 실입금무장부결제.length,'건 /', 억(실입금무장부결제.reduce((s,r)=>s+r.실수납,0)));
실입금무장부결제.sort((a,b)=>b.실수납-a.실수납).slice(0,8).forEach(r=>console.log('   '+r.plate+' '+r.name+' 실수납'+만(r.실수납)));
console.log('④ 장부2026결제 vs 실수납 금액불일치(>10만):', 불일치.length,'건');
불일치.sort((a,b)=>Math.abs(b.장부2026-b.실수납)-Math.abs(a.장부2026-a.실수납)).slice(0,10).forEach(r=>console.log('   '+r.plate+' '+r.name+' 장부'+만(r.장부2026)+' vs 실수납'+만(r.실수납)+' 차'+만(r.실수납-r.장부2026)));

console.log('\n===== 미수 TOP12 (Σ청구-Σ결제, 누계) =====');
미수리스트.slice(0,12).forEach(c=>console.log('   '+'?'+' '+c.name+' 청구'+만(c.청구)+' 결제'+만(c.결제)+' 미수'+만(c.미수)));
