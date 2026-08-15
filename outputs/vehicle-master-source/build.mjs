import fs from 'node:fs/promises';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';

const sourcePath = 'C:/dev/freepasserp4/public/data/vehicle-master.json';
const outputDir = 'C:/dev/renman/outputs/vehicle-master-source';
const source = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
const entries = Array.isArray(source) ? source : (source.entries || []);

const join = (value) => Array.isArray(value) ? value.filter(Boolean).join(' | ') : '';
const num = (value) => value == null || value === '' ? null : Number(value);
const headers = [
  '관리상태','행키','마스터ID','파워트레인순번','제조사','모델','세부모델','세대명','개발코드',
  '생산시작(YYYY-MM)','생산종료(YYYY-MM/현재)','연식시작','연식종료','원산지','차체형태','세부모델별칭',
  '파워트레인','연료','정확배기량(cc)','표시배기량(L)','터보','구동방식','인승','배터리(kWh)',
  '엔진코드','변속기','모터배치','출력(kW)','파워트레인생산시작','파워트레인생산종료',
  '세부트림','파워트레인별칭','근거URL','근거메모','최종확인일','검증상태',
];

const rows = [];
for (const entry of entries) {
  const variants = entry.variants?.length ? entry.variants : [null];
  variants.forEach((variant, index) => {
    rows.push([
      '보강대기', `${entry.id}::v${String(index + 1).padStart(2, '0')}`, entry.id, index + 1,
      entry.maker || '', entry.model || '', entry.sub_model || '', entry.generation_name || '', entry.gen_code || '',
      entry.production_start || '', entry.production_end || '', entry.year_start || '', entry.year_end || '',
      entry.origin || '', entry.body_type || '', join(entry.aliases),
      variant?.label || '', variant?.fuel || '', num(variant?.engine_cc), num(variant?.displacement_l),
      variant ? (variant.turbo ? '예' : '아니오') : '', variant?.drivetrain || '', num(variant?.seat), num(variant?.battery_kwh),
      variant?.engine_code || '', variant?.transmission || '', variant?.motor_layout || '', num(variant?.power_kw),
      variant?.production_start || '', variant?.production_end || '', join(variant?.trims || entry.trims), join(variant?.aliases),
      '', '', '', '미검증',
    ]);
  });
}

const entryHeaders = ['마스터ID','제조사','모델','세부모델','개발코드','생산시작','생산종료','연식시작','연식종료','원산지','파워트레인수','별칭'];
const entryRows = entries.map((entry) => [
  entry.id, entry.maker || '', entry.model || '', entry.sub_model || '', entry.gen_code || '',
  entry.production_start || '', entry.production_end || '', entry.year_start || '', entry.year_end || '', entry.origin || '',
  entry.variants?.length || 0, join(entry.aliases),
]);

const wb = Workbook.create();
const guide = wb.worksheets.add('사용안내');
const master = wb.worksheets.add('차종마스터');
const models = wb.worksheets.add('세부모델목록');
const codes = wb.worksheets.add('코드목록');

guide.showGridLines = false;
guide.getRange('A1:H1').merge();
guide.getRange('A1').values = [['ERP4 차종마스터 원천대장']];
guide.getRange('A3:B11').values = [
  ['항목','사용 방법'],
  ['편집 단위','차종마스터 시트의 한 행 = 세부모델 × 파워트레인 조합'],
  ['필수 식별축','제조사 → 모델 → 세부모델(세대/개발코드) → 파워트레인 → 세부트림'],
  ['정확 배기량','표시배기량 1.6과 별도로 제조사 공식 총배기량 1,598cc처럼 입력'],
  ['생산기간','확인 가능하면 YYYY-MM, 판매 중이면 종료값을 현재로 입력'],
  ['별칭 구분','여러 값은 | 로 구분. 등록증·카눈·엔카·공급사 표기를 보관'],
  ['근거 보관','근거URL·근거메모·최종확인일을 함께 기록'],
  ['검증상태','미검증 → 1차확인 → 교차확인 → 확정 순서'],
  ['ERP 반영','확정 행만 ERP4 JSON으로 반영하고 마스터ID·행키는 변경하지 않음'],
];
guide.getRange('A13:B17').values = [
  ['우선순위','기준'],
  ['1','손오공 자산 시트에 실제 존재하는 차량'],
  ['2','다른 운영 시트와 판매 매물에 등장하는 차량'],
  ['3','카눈의 현재 판매 신차'],
  ['4','엔카에서 확인되는 최근 10년 주요 중고차'],
];

master.getRangeByIndexes(0, 0, 1, headers.length).values = [headers];
master.getRangeByIndexes(1, 0, rows.length, headers.length).values = rows;
models.getRangeByIndexes(0, 0, 1, entryHeaders.length).values = [entryHeaders];
models.getRangeByIndexes(1, 0, entryRows.length, entryHeaders.length).values = entryRows;

const codeRows = [
  ['관리상태','검증상태','연료','구동방식','원산지','터보'],
  ['보강대기','미검증','가솔린','2WD','국산','예'],
  ['검증중','1차확인','디젤','FWD','수입','아니오'],
  ['확정','교차확인','LPG','RWD','',''],
  ['제외','확정','하이브리드','AWD','',''],
  ['','','전기','4WD','',''],
  ['','','수소','e-AWD','',''],
  ['','','기타','','',''],
];
codes.getRangeByIndexes(0, 0, codeRows.length, codeRows[0].length).values = codeRows;

const headerFill = '#E8EAED';
for (const [sheet, cols, count] of [[master, headers.length, rows.length + 1], [models, entryHeaders.length, entryRows.length + 1], [codes, codeRows[0].length, codeRows.length]]) {
  sheet.showGridLines = false;
  sheet.freezePanes.freezeRows(1);
  const header = sheet.getRangeByIndexes(0, 0, 1, cols);
  header.format = { fill: headerFill, font: { bold: true, color: '#202124', name: 'Noto Sans KR', size: 10 }, verticalAlignment: 'center', wrapText: true, borders: { bottom: { style: 'thin', color: '#9AA0A6' } } };
  header.format.rowHeightPx = 34;
  sheet.getRangeByIndexes(1, 0, Math.max(1, count - 1), cols).format = { font: { name: 'Noto Sans KR', size: 9 }, verticalAlignment: 'center' };
}

guide.getRange('A1:H1').format = { font: { bold: true, color: '#174EA6', name: 'Noto Sans KR', size: 16 }, verticalAlignment: 'center' };
guide.getRange('A1:H1').format.rowHeightPx = 34;
guide.getRange('A3:B3').format = { fill: headerFill, font: { bold: true, name: 'Noto Sans KR', size: 10 } };
guide.getRange('A13:B13').format = { fill: headerFill, font: { bold: true, name: 'Noto Sans KR', size: 10 } };
guide.getRange('A3:B17').format.wrapText = true;
guide.getRange('A:A').format.columnWidthPx = 125;
guide.getRange('B:B').format.columnWidthPx = 620;

master.getRange('A:A').format.columnWidthPx = 84;
master.getRange('B:D').format.columnWidthPx = 122;
master.getRange('E:F').format.columnWidthPx = 88;
master.getRange('G:G').format.columnWidthPx = 190;
master.getRange('H:I').format.columnWidthPx = 100;
master.getRange('J:M').format.columnWidthPx = 100;
master.getRange('N:O').format.columnWidthPx = 82;
master.getRange('P:P').format.columnWidthPx = 220;
master.getRange('Q:R').format.columnWidthPx = 130;
master.getRange('S:T').format.columnWidthPx = 105;
master.getRange('U:V').format.columnWidthPx = 88;
master.getRange('W:X').format.columnWidthPx = 90;
master.getRange('Y:AD').format.columnWidthPx = 115;
master.getRange('AE:AF').format.columnWidthPx = 260;
master.getRange('AG:AG').format.columnWidthPx = 230;
master.getRange('AH:AH').format.columnWidthPx = 180;
master.getRange('AI:AJ').format.columnWidthPx = 105;
master.getRange(`S2:S${rows.length + 1}`).format.numberFormat = '0';
master.getRange(`T2:T${rows.length + 1}`).format.numberFormat = '0.0';
master.getRange(`W2:X${rows.length + 1}`).format.numberFormat = '0.0';
master.getRange(`AB2:AB${rows.length + 1}`).format.numberFormat = '0.0';

models.getRange('A:A').format.columnWidthPx = 180;
models.getRange('B:C').format.columnWidthPx = 90;
models.getRange('D:D').format.columnWidthPx = 190;
models.getRange('E:J').format.columnWidthPx = 105;
models.getRange('K:K').format.columnWidthPx = 90;
models.getRange('L:L').format.columnWidthPx = 260;
codes.getRange('A:F').format.columnWidthPx = 120;

const checks = await wb.inspect({ kind: 'table', range: `차종마스터!A1:AJ8`, include: 'values,formulas', tableMaxRows: 8, tableMaxCols: 36 });
console.log(checks.ndjson);
const errors = await wb.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A', options: { useRegex: true, maxResults: 100 }, summary: 'formula error scan' });
console.log(errors.ndjson);

await fs.mkdir(outputDir, { recursive: true });
for (const [sheetName, range, file] of [
  ['사용안내','A1:H17','preview-guide.png'],
  ['차종마스터','A1:AJ18','preview-master.png'],
  ['세부모델목록','A1:L18','preview-models.png'],
  ['코드목록','A1:F8','preview-codes.png'],
]) {
  const image = await wb.render({ sheetName, range, scale: 1, format: 'png' });
  await fs.writeFile(`${outputDir}/${file}`, new Uint8Array(await image.arrayBuffer()));
}
const out = await SpreadsheetFile.exportXlsx(wb);
await out.save(`${outputDir}/ERP4_차종마스터_원천대장.xlsx`);
console.log(JSON.stringify({ entries: entries.length, rows: rows.length, file: `${outputDir}/ERP4_차종마스터_원천대장.xlsx` }));
