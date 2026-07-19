const XLSX = require('xlsx');
const D = 'C:/Users/admin/Documents/카카오톡 받은 파일/';
function dump(f, sn, maxr=12){
  const wb = XLSX.readFile(D+f);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], {header:1, defval:''});
  console.log('\n#### ['+f+'] 시트['+sn+'] 행수='+rows.length);
  for(let i=0;i<Math.min(maxr,rows.length);i++){
    console.log(i, JSON.stringify(rows[i].slice(0,14)));
  }
}
// 2024 카랜: 한 날짜 시트
dump('2024년 자금일보_카랜(주).xlsx','03.04');
// 2025 프리패스 single sheet
dump('2025년 자금일보_프리패스모빌리티(주).xlsx','sheet',15);
// 2026 영업계좌 신한
dump('26년_스위치플랜_자금일보.xlsx','영업계좌(신한6616)');
dump('26년_스위치플랜_자금일보.xlsx','영업계좌(농협5311)');
