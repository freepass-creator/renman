const XLSX = require('xlsx');
const D = 'C:/Users/admin/Documents/카카오톡 받은 파일/';
// 채권 sheet
const wb = XLSX.readFile(D+'[스위치플랜] 채권현황.xlsx');
const R = XLSX.utils.sheet_to_json(wb.Sheets['채권'], {header:1, defval:''});
console.log('채권 행수', R.length);
for(let i=0;i<8;i++) console.log(i, JSON.stringify(R[i].slice(0,20)));
console.log('...채권추심...');
const RC = XLSX.utils.sheet_to_json(wb.Sheets['채권추심'], {header:1, defval:''});
console.log('행수', RC.length);
for(let i=0;i<6;i++) console.log(i, JSON.stringify(RC[i].slice(0,15)));
