const XLSX = require('xlsx');
const D = 'C:/Users/admin/Documents/카카오톡 받은 파일/';
const files = ['2024년 자금일보_카랜(주).xlsx','2025년 자금일보_프리패스모빌리티(주).xlsx','26년_스위치플랜_자금일보.xlsx'];
for (const f of files){
  const wb = XLSX.readFile(D+f);
  console.log('\n########', f);
  console.log('시트:', wb.SheetNames.join(' | '));
}
console.log('\n====== 채권현황 시트 ======');
const wb2 = XLSX.readFile(D+'[스위치플랜] 채권현황.xlsx');
console.log(wb2.SheetNames.join(' | '));
