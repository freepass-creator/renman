import fs from 'node:fs/promises';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const outputDir = 'C:/dev/renman/outputs/019fef03-rental-excel';
const outputPath = `${outputDir}/스위치플랜_사업현황_5탭.xlsx`;
const asOf = new Date(2026, 7, 14);

const C = {
  ink: '#18231F',
  dark: '#10231E',
  green: '#1F6B57',
  greenSoft: '#E9F2EE',
  blue: '#7EA2D8',
  blueSoft: '#EAF1FB',
  red: '#B74337',
  redSoft: '#FBEAE7',
  amber: '#9A6715',
  amberSoft: '#FFF3D9',
  gray: '#6D7873',
  faint: '#F4F6F4',
  line: '#CDD5D0',
  lineDark: '#91A098',
  white: '#FFFFFF',
  input: '#1D4ED8',
};

const workbook = Workbook.create();
const summary = workbook.worksheets.add('요약');
const operations = workbook.worksheets.add('운영현황');
const assets = workbook.worksheets.add('자산');
const contracts = workbook.worksheets.add('계약');
const collections = workbook.worksheets.add('수납');

function setBase(sheet) {
  sheet.showGridLines = false;
  sheet.getRange('A1:AE204').format.font = { name: 'Noto Sans KR', size: 10, color: C.ink };
}

for (const sheet of [summary, operations, assets, contracts, collections]) setBase(sheet);

function titleBand(sheet, endCol, title, subtitle, mode) {
  sheet.getRange(`A1:${endCol}1`).merge();
  sheet.getRange('A1').values = [[title]];
  sheet.getRange(`A1:${endCol}1`).format = {
    fill: C.dark,
    font: { name: 'Noto Sans KR', size: 18, bold: true, color: C.white },
    verticalAlignment: 'center',
  };
  sheet.getRange('A1').format.rowHeightPx = 46;
  sheet.getRange(`A2:${endCol}2`).merge();
  sheet.getRange('A2').values = [[subtitle]];
  sheet.getRange(`A2:${endCol}2`).format = {
    fill: mode === '입력' ? C.greenSoft : C.blueSoft,
    font: { name: 'Noto Sans KR', size: 10, color: mode === '입력' ? C.green : '#355C93' },
    verticalAlignment: 'center',
    borders: { bottom: { style: 'thin', color: C.lineDark } },
  };
  sheet.getRange('A2').format.rowHeightPx = 30;
}

function styleHeader(range, fill = C.dark) {
  range.format = {
    fill,
    font: { name: 'Noto Sans KR', size: 10, bold: true, color: C.white },
    horizontalAlignment: 'center',
    verticalAlignment: 'center',
    wrapText: true,
    borders: {
      bottom: { style: 'medium', color: C.lineDark },
      insideVertical: { style: 'thin', color: '#52615A' },
    },
  };
}

function styleBody(range) {
  range.format = {
    font: { name: 'Noto Sans KR', size: 10, color: C.ink },
    verticalAlignment: 'center',
    borders: { insideHorizontal: { style: 'thin', color: '#E3E8E5' } },
  };
}

function mergeMetric(sheet, labelRange, valueRange, label, formula, tone = 'normal') {
  sheet.getRange(labelRange).merge();
  sheet.getRange(labelRange.split(':')[0]).values = [[label]];
  sheet.getRange(valueRange).merge();
  sheet.getRange(valueRange.split(':')[0]).formulas = [[formula]];
  const fill = tone === 'danger' ? C.redSoft : tone === 'warn' ? C.amberSoft : C.faint;
  const color = tone === 'danger' ? C.red : tone === 'warn' ? C.amber : C.ink;
  sheet.getRange(labelRange).format = {
    fill,
    font: { name: 'Noto Sans KR', size: 10, bold: true, color: C.gray },
    horizontalAlignment: 'left',
    verticalAlignment: 'center',
    borders: { top: { style: 'thin', color: C.line }, left: { style: 'thin', color: C.line }, right: { style: 'thin', color: C.line } },
  };
  sheet.getRange(valueRange).format = {
    fill,
    font: { name: 'Noto Sans KR', size: 19, bold: true, color },
    horizontalAlignment: 'right',
    verticalAlignment: 'center',
    borders: { bottom: { style: 'thin', color: C.line }, left: { style: 'thin', color: C.line }, right: { style: 'thin', color: C.line } },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 자산 입력
// ─────────────────────────────────────────────────────────────────────────────
titleBand(assets, 'J', '자산', '차량 한 대당 한 줄로 입력합니다. 매각·폐차 차량도 삭제하지 않고 상태만 변경합니다.', '입력');
assets.getRange('A3:J3').merge();
assets.getRange('A3').values = [['자산 원장 · 입력']];
assets.getRange('A3:J3').format = { fill: C.green, font: { name: 'Noto Sans KR', size: 10, bold: true, color: C.white }, verticalAlignment: 'center' };
assets.getRange('A4:J4').values = [['번호', '차번', '차종', '소속', '연식', '등록일', '취득', '보험', '상태', '비고']];
styleHeader(assets.getRange('A4:J4'));
assets.getRange('Z4').values = [['보유순번\n(자동)']];
styleHeader(assets.getRange('Z4'), '#69756F');

const assetRows = [
  [1, '231가4820', '그랜저 IG', '본사', 2021, new Date(2021, 7, 14), '할부', 'DB손보', '보유', ''],
  [2, '45나7719', '카니발 하이리무진', '본사', 2022, new Date(2022, 3, 2), '할부', 'KB손보', '보유', ''],
  [3, '03머0389', 'K5 DL3', '본사', 2023, new Date(2023, 4, 8), '리스', 'DB손보', '보유', ''],
  [4, '187허2264', '셀토스', '본사', 2020, new Date(2020, 10, 27), '현금', 'DB손보', '보유', '상품화 예정'],
  [5, '92소5513', '스타리아 라운지', '본사', 2024, new Date(2024, 8, 22), '할부', 'KB손보', '보유', ''],
  [6, '318수9047', '아반떼 CN7', '본사', 2022, new Date(2022, 6, 15), '할부', 'KB손보', '보유', '계약 만료 확인'],
  [7, '76조1188', '쏘렌토 MQ4', '본사', 2021, new Date(2021, 1, 18), '현금', 'DB손보', '보유', '쉬는차'],
  [8, '264라3396', '팰리세이드', '본사', 2024, new Date(2024, 11, 11), '할부', '현대해상', '보유', ''],
  [9, '509부7731', '모닝 JA', '본사', 2018, new Date(2018, 2, 9), '현금', '', '매각', '2026-02-11 매각'],
  [10, '140머6628', '아반떼 AD', '본사', 2017, new Date(2017, 5, 21), '현금', '', '폐차', '2025-12-04 폐차'],
];
assets.getRange(`A5:J${4 + assetRows.length}`).values = assetRows;
styleBody(assets.getRange('A5:J204'));
assets.getRange('A5:J204').format.rowHeightPx = 24;
assets.getRange('A5:J204').format.font = { name: 'Noto Sans KR', size: 10, color: C.input };
assets.getRange('A5:A204').format.horizontalAlignment = 'center';
assets.getRange('D5:I204').format.horizontalAlignment = 'center';
assets.getRange('F5:F204').format.numberFormat = 'yy-mm-dd';
assets.getRange('Z5:Z204').formulas = Array.from({ length: 200 }, (_, i) => {
  const r = i + 5;
  return [`=IF(I${r}="보유",COUNTIF($I$5:I${r},"보유"),"")`];
});
assets.getRange('Z5:Z204').format = { fill: C.faint, font: { name: 'Noto Sans KR', size: 9, color: C.gray }, horizontalAlignment: 'center' };
assets.getRange('D5:D204').dataValidation = { rule: { type: 'list', values: ['본사', '지점', '위탁'] } };
assets.getRange('G5:G204').dataValidation = { rule: { type: 'list', values: ['현금', '할부', '리스', '위탁'] } };
assets.getRange('I5:I204').dataValidation = { rule: { type: 'list', values: ['보유', '매각', '폐차'] } };
assets.getRange('I5:I204').conditionalFormats.add('containsText', { text: '보유', format: { fill: C.greenSoft, font: { color: C.green, bold: true } } });
assets.getRange('I5:I204').conditionalFormats.add('containsText', { text: '매각', format: { fill: '#EEF0EF', font: { color: C.gray, bold: true } } });
assets.getRange('I5:I204').conditionalFormats.add('containsText', { text: '폐차', format: { fill: C.redSoft, font: { color: C.red, bold: true } } });
assets.freezePanes.freezeRows(4);
assets.freezePanes.freezeColumns(4);

const assetWidths = { A: 40, B: 100, C: 150, D: 64, E: 64, F: 92, G: 72, H: 90, I: 84, J: 150, Z: 74 };
for (const [col, width] of Object.entries(assetWidths)) assets.getRange(`${col}:${col}`).format.columnWidthPx = width;

// ─────────────────────────────────────────────────────────────────────────────
// 계약 입력
// ─────────────────────────────────────────────────────────────────────────────
titleBand(contracts, 'AE', '계약', '차량 한 줄에서 현재 계약과 과거 계약을 함께 확인합니다. 계약번호는 반드시 입력합니다.', '입력');
for (const col of ['A', 'B', 'C', 'D']) contracts.getRange(`${col}3:${col}4`).merge();
contracts.getRange('A3:D3').values = [['번호', '차번', '차종', '소속']];
contracts.getRange('E3:M3').merge();
contracts.getRange('N3:V3').merge();
contracts.getRange('W3:AE3').merge();
contracts.getRange('E3').values = [['현재 계약']];
contracts.getRange('N3').values = [['직전 계약']];
contracts.getRange('W3').values = [['그 전 계약']];
contracts.getRange('E4:AE4').values = [[
  '구분', '계약번호', '고객명', '인도일자', '종료일자', '반납일자', '대여료', '보증금', '영업자',
  '구분', '계약번호', '고객명', '인도일자', '종료일자', '반납일자', '대여료', '보증금', '영업자',
  '구분', '계약번호', '고객명', '인도일자', '종료일자', '반납일자', '대여료', '보증금', '영업자',
]];
styleHeader(contracts.getRange('A3:D4'));
styleHeader(contracts.getRange('E3:M4'), C.green);
styleHeader(contracts.getRange('N3:V4'), '#426A5D');
styleHeader(contracts.getRange('W3:AE4'), '#69756F');

const blank = ['', '', '', '', '', '', '', '', ''];
const block = (type, no, customer, start, end, returned, rent, deposit, sales) => [type, no, customer, start, end, returned, rent, deposit, sales];
const contractRows = [
  [1, '231가4820', '그랜저 IG', '본사', ...block('개인', 'SP-2411-001', '김성호', new Date(2024,10,5), new Date(2026,10,4), '', 890000, 3000000, '정우석'), ...block('법인', 'SP-2210-014', '대성물류', new Date(2022,9,1), new Date(2024,8,30), new Date(2024,9,18), 870000, 3000000, '한지훈'), ...blank],
  [2, '45나7719', '카니발 하이리무진', '본사', ...block('개인', 'SP-2503-006', '이재원', new Date(2025,2,18), new Date(2027,2,17), '', 1150000, 5000000, '한지훈'), ...block('개인', 'SP-2302-009', '최우진', new Date(2023,1,20), new Date(2025,1,19), new Date(2025,2,6), 1100000, 4000000, '정우석'), ...block('개인', 'SP-2205-003', '서정민', new Date(2022,4,11), new Date(2023,1,10), new Date(2023,1,14), 1080000, 4000000, '한지훈')],
  [3, '03머0389', 'K5 DL3', '본사', ...block('장기렌트', 'SP-2506-002', '박민정', new Date(2025,5,1), new Date(2026,8,30), '', 1030000, 2000000, '정우석'), ...block('개인', 'SP-2305-004', '강현수', new Date(2023,4,8), new Date(2025,4,7), new Date(2025,4,24), 660000, 2000000, '정우석'), ...blank],
  [4, '187허2264', '셀토스', '본사', ...blank, ...blank, ...blank],
  [5, '92소5513', '스타리아 라운지', '본사', ...block('법인', 'SP-2509-010', '오세영', new Date(2025,8,22), new Date(2027,8,21), '', 1020000, 4000000, '한지훈'), ...blank, ...blank],
  [6, '318수9047', '아반떼 CN7', '본사', ...block('개인', 'SP-2407-011', '장태윤', new Date(2024,6,30), new Date(2026,6,29), '', 560000, 1500000, '정우석'), ...blank, ...blank],
  [7, '76조1188', '쏘렌토 MQ4', '본사', ...blank, ...blank, ...blank],
  [8, '264라3396', '팰리세이드', '본사', ...block('법인', 'SP-2512-008', '윤도현', new Date(2025,11,11), new Date(2027,11,10), '', 1280000, 5000000, '한지훈'), ...blank, ...blank],
  [9, '509부7731', '모닝 JA', '본사', ...blank, ...block('월렌트', 'SP-2502-017', '정하늘', new Date(2025,1,5), new Date(2026,1,4), new Date(2026,1,11), 560000, 1000000, '정우석'), ...blank],
  [10, '140머6628', '아반떼 AD', '본사', ...blank, ...block('개인', 'SP-2301-002', '한대수', new Date(2023,0,12), new Date(2025,10,30), new Date(2025,11,4), 520000, 1000000, '한지훈'), ...blank],
];
contracts.getRange(`A5:AE${4 + contractRows.length}`).values = contractRows;
styleBody(contracts.getRange('A5:AE204'));
contracts.getRange('A5:AE204').format.rowHeightPx = 24;
contracts.getRange('A5:AE204').format.font = { name: 'Noto Sans KR', size: 10, color: C.input };
contracts.getRange('AF4').values = [['잔여개월\n(자동)']];
styleHeader(contracts.getRange('AF4'), '#69756F');
contracts.getRange('AF5:AF204').formulas = Array.from({ length: 200 }, (_, i) => {
  const r = i + 5;
  return [`=IF(OR(G${r}="",I${r}="",J${r}<>""),"",IF(I${r}<'요약'!$B$2,"만료",(YEAR(I${r})-YEAR('요약'!$B$2))*12+MONTH(I${r})-MONTH('요약'!$B$2)))`];
});
contracts.getRange('AF5:AF204').format = { fill: C.faint, font: { name:'Noto Sans KR', size:9, color:C.gray }, horizontalAlignment:'center' };
contracts.getRange('AG4').values = [['만료구간\n(자동)']];
styleHeader(contracts.getRange('AG4'), '#69756F');
contracts.getRange('AG5:AG204').formulas = Array.from({ length: 200 }, (_, i) => {
  const r = i + 5;
  return [`=IF(G${r}="","",IF(AF${r}="만료","만료",IF(AF${r}=0,"이달",IF(AF${r}=1,"다음달",IF(AF${r}<=3,"3개월 내","장기")))))`];
});
contracts.getRange('AG5:AG204').format = { fill: C.faint, font: { name:'Noto Sans KR', size:9, color:C.gray }, horizontalAlignment:'center' };
contracts.getRange('A5:A204').format.horizontalAlignment = 'center';
contracts.getRange('D5:E204').format.horizontalAlignment = 'center';
for (const c of ['H','I','J','Q','R','S','Z','AA','AB']) contracts.getRange(`${c}5:${c}204`).format.numberFormat = 'yy-mm-dd';
for (const c of ['K','L','T','U','AC','AD']) {
  contracts.getRange(`${c}5:${c}204`).format.numberFormat = '#,##0;[Red](#,##0);-';
  contracts.getRange(`${c}5:${c}204`).format.horizontalAlignment = 'right';
}
for (const c of ['E','N','W']) contracts.getRange(`${c}5:${c}204`).dataValidation = { rule: { type: 'list', values: ['개인', '법인', '사고대차', '장기렌트', '월렌트', '일렌트'] } };
contracts.getRange('I5:I204').conditionalFormats.addCustom('=AND($I5<>"",$J5="",$I5<\'요약\'!$B$2)', { fill: C.redSoft, font: { color: C.red, bold: true } });
contracts.freezePanes.freezeRows(4);
contracts.freezePanes.freezeColumns(4);
const contractWidths = { A:40, B:100, C:150, D:64 };
for (const c of ['E','N','W']) contractWidths[c] = 74;
for (const c of ['F','O','X']) contractWidths[c] = 105;
for (const c of ['G','P','Y']) contractWidths[c] = 104;
for (const c of ['H','I','J','Q','R','S','Z','AA','AB']) contractWidths[c] = 92;
for (const c of ['K','L','T','U','AC','AD']) contractWidths[c] = 104;
for (const c of ['M','V','AE']) contractWidths[c] = 84;
for (const [col, width] of Object.entries(contractWidths)) contracts.getRange(`${col}:${col}`).format.columnWidthPx = width;
contracts.getRange('AF:AF').format.columnWidthPx = 74;
contracts.getRange('AG:AG').format.columnWidthPx = 74;

// ─────────────────────────────────────────────────────────────────────────────
// 수납 입력
// ─────────────────────────────────────────────────────────────────────────────
titleBand(collections, 'Y', '수납', '월별 청구와 실제 결제를 입력합니다. 미납은 전월잔액 + 당월청구 − 당월결제로 자동 계산됩니다.', '입력');
for (const col of ['A','B','C','D','E']) collections.getRange(`${col}3:${col}4`).merge();
collections.getRange('A3:E3').values = [['번호', '차번', '고객명', '결제일', '현재잔액']];
collections.getRange('F3:J3').merge(); collections.getRange('F3').values = [['26-08']];
collections.getRange('K3:O3').merge(); collections.getRange('K3').values = [['26-07']];
collections.getRange('P3:T3').merge(); collections.getRange('P3').values = [['26-06']];
collections.getRange('U3:X3').merge(); collections.getRange('U3').values = [['위약금']];
collections.getRange('Y3:Y4').merge(); collections.getRange('Y3').values = [['연체개월\n(자동)']];
collections.getRange('F4:Y4').values = [['청구', '결제', '결제일자', '수단', '미납', '청구', '결제', '결제일자', '수단', '미납', '청구', '결제', '결제일자', '수단', '미납', '청구액', '수납액', '수납일', '잔액', '연체개월']];
styleHeader(collections.getRange('A3:E4'));
styleHeader(collections.getRange('F3:J4'), '#6689C2');
styleHeader(collections.getRange('K3:O4'), '#54759F');
styleHeader(collections.getRange('P3:T4'), '#465E78');
styleHeader(collections.getRange('U3:X4'), C.amber);
styleHeader(collections.getRange('Y3:Y4'), '#69756F');

const collectionRows = [
  [1,'231가4820','김성호','05일','', 890000,890000,new Date(2026,7,5),'자동이체','', 890000,890000,new Date(2026,6,5),'자동이체','', 890000,890000,new Date(2026,5,5),'자동이체','', 0,0,'','', ''],
  [2,'45나7719','이재원','10일','', 1150000,0,'','', '', 1150000,240000,new Date(2026,6,12),'계좌','', 1150000,1150000,new Date(2026,5,10),'계좌','', 0,0,'','', ''],
  [3,'03머0389','박민정','25일','', 1030000,0,'','', '', 1030000,0,'','', '', 1030000,1030000,new Date(2026,5,25),'카드','', 0,0,'','', ''],
  [4,'187허2264','','','', 0,0,'','', '', 0,0,'','', '', 0,0,'','', '', 0,0,'','', ''],
  [5,'92소5513','오세영','05일','', 1020000,1020000,new Date(2026,7,5),'자동이체','', 1020000,1020000,new Date(2026,6,5),'자동이체','', 1020000,1020000,new Date(2026,5,5),'자동이체','', 0,0,'','', ''],
  [6,'318수9047','장태윤','10일','', 0,0,'','', '', 560000,0,'','', '', 560000,560000,new Date(2026,5,10),'계좌','', 0,0,'','', ''],
  [7,'76조1188','','','', 0,0,'','', '', 0,0,'','', '', 0,0,'','', '', 0,0,'','', ''],
  [8,'264라3396','윤도현','25일','', 1280000,1280000,new Date(2026,7,25),'계좌','', 1280000,1280000,new Date(2026,6,25),'계좌','', 1280000,1280000,new Date(2026,5,25),'계좌','', 0,0,'','', ''],
  [9,'509부7731','정하늘','반납','', 0,0,'','', '', 0,400000,new Date(2026,6,19),'계좌','', 2240000,0,'','', '', 4120000,0,'','', ''],
  [10,'140머6628','한대수','반납','', 0,0,'','', '', 0,0,'','', '', 0,0,'','', '', 0,0,'','', ''],
];
collections.getRange(`A5:Y${4 + collectionRows.length}`).values = collectionRows;
styleBody(collections.getRange('A5:Y204'));
collections.getRange('A5:Y204').format.rowHeightPx = 24;
collections.getRange('A5:Y204').format.font = { name: 'Noto Sans KR', size: 10, color: C.input };
collections.getRange('E5:E204').formulas = Array.from({ length: 200 }, (_, i) => { const r=i+5; return [`=IF(B${r}="","",J${r})`]; });
collections.getRange('T5:T204').formulas = Array.from({ length: 200 }, (_, i) => { const r=i+5; return [`=IF(B${r}="","",MAX(0,P${r}-Q${r}))`]; });
collections.getRange('O5:O204').formulas = Array.from({ length: 200 }, (_, i) => { const r=i+5; return [`=IF(B${r}="","",MAX(0,T${r}+K${r}-L${r}))`]; });
collections.getRange('J5:J204').formulas = Array.from({ length: 200 }, (_, i) => { const r=i+5; return [`=IF(B${r}="","",MAX(0,O${r}+F${r}-G${r}))`]; });
collections.getRange('X5:X204').formulas = Array.from({ length: 200 }, (_, i) => { const r=i+5; return [`=IF(B${r}="","",MAX(0,U${r}-V${r}))`]; });
collections.getRange('Y5:Y204').formulas = Array.from({ length: 200 }, (_, i) => { const r=i+5; return [`=IF(B${r}="","",IF(E${r}<=0,0,IF(T${r}>0,3,IF(O${r}>0,2,1))))`]; });
for (const c of ['E','J','O','T','X','Y']) collections.getRange(`${c}5:${c}204`).format = { fill: C.faint, font: { name:'Noto Sans KR', size:10, color:C.ink } };
for (const c of ['E','F','G','J','K','L','O','P','Q','T','U','V','X']) {
  collections.getRange(`${c}5:${c}204`).format.numberFormat = '#,##0;[Red](#,##0);-';
  collections.getRange(`${c}5:${c}204`).format.horizontalAlignment = 'right';
}
for (const c of ['H','M','R','W']) collections.getRange(`${c}5:${c}204`).format.numberFormat = 'yy-mm-dd';
for (const c of ['I','N','S']) collections.getRange(`${c}5:${c}204`).dataValidation = { rule: { type:'list', values:['계좌','카드','자동이체','현금','기타'] } };
for (const c of ['E','J','O','T','X']) collections.getRange(`${c}5:${c}204`).conditionalFormats.add('cellIs', { operator:'greaterThan', formula:0, format:{ fill:C.redSoft, font:{ color:C.red, bold:true } } });
collections.freezePanes.freezeRows(4);
collections.freezePanes.freezeColumns(5);
const collectionWidths = { A:40,B:100,C:104,D:64,E:108,F:92,G:92,H:92,I:84,J:100,K:92,L:92,M:92,N:84,O:100,P:92,Q:92,R:92,S:84,T:100,U:100,V:100,W:92,X:100,Y:74 };
for (const [col,width] of Object.entries(collectionWidths)) collections.getRange(`${col}:${col}`).format.columnWidthPx = width;

// ─────────────────────────────────────────────────────────────────────────────
// 운영현황 산출
// ─────────────────────────────────────────────────────────────────────────────
titleBand(operations, 'N', '운영현황', '현재 보유차량만 자동으로 올라옵니다. 한 대 한 줄에서 계약 만료와 미수 여부를 확인합니다.', '산출');
operations.getRange('A3:N3').merge();
operations.getRange('A3').values = [['운영 보유차량 · 자동 산출 / 수정하지 않음']];
operations.getRange('A3:N3').format = { fill:C.blue, font:{ name:'Noto Sans KR', size:10, bold:true, color:C.white }, verticalAlignment:'center' };
operations.getRange('A4:N4').values = [['번호','차번','차종','소속','상태','고객명','인도일','종료일','잔여','대여료','보증금','미납잔액','결제일','영업자']];
styleHeader(operations.getRange('A4:N4'));

const opFormulas = [];
for (let r=5; r<=204; r++) {
  const seq = r - 4;
  const plate = `IFERROR(INDEX('자산'!$B$5:$B$204,MATCH(${seq},'자산'!$Z$5:$Z$204,0)),"")`;
  const asset = (col) => `IF($B${r}="","",IFERROR(INDEX('자산'!$${col}$5:$${col}$204,MATCH($B${r},'자산'!$B$5:$B$204,0)),""))`;
  const contract = (col) => `IF($B${r}="","",IFERROR(INDEX('계약'!$${col}$5:$${col}$204,MATCH($B${r},'계약'!$B$5:$B$204,0)),""))`;
  const cash = (col) => `IF($B${r}="","",IFERROR(INDEX('수납'!$${col}$5:$${col}$204,MATCH($B${r},'수납'!$B$5:$B$204,0)),0))`;
  opFormulas.push([
    `=IF(B${r}="","",${seq})`, `=${plate}`, `=${asset('C')}`, `=${asset('D')}`,
    `=IF(B${r}="","",IF(${contract('G')}<>"","대여중","쉬는차"))`, `=${contract('G')}`,
    `=${contract('H')}`, `=${contract('I')}`,
    `=IF(H${r}="","",IF(H${r}<'요약'!$B$2,"만료",(YEAR(H${r})-YEAR('요약'!$B$2))*12+MONTH(H${r})-MONTH('요약'!$B$2)))`,
    `=${contract('K')}`, `=${contract('L')}`, `=${cash('E')}`, `=${cash('D')}`, `=${contract('M')}`,
  ]);
}
operations.getRange('A5:N204').formulas = opFormulas;
styleBody(operations.getRange('A5:N204'));
operations.getRange('A5:N204').format.rowHeightPx = 24;
operations.getRange('A5:A204').format.horizontalAlignment = 'center';
operations.getRange('D5:E204').format.horizontalAlignment = 'center';
operations.getRange('G5:H204').format.numberFormat = 'yy-mm-dd';
for (const c of ['J','K','L']) operations.getRange(`${c}5:${c}204`).format.numberFormat = '#,##0;[Red](#,##0);-';
operations.getRange('E5:E204').conditionalFormats.add('containsText', { text:'쉬는차', format:{ fill:C.amberSoft, font:{ color:C.amber, bold:true } } });
operations.getRange('I5:I204').conditionalFormats.add('containsText', { text:'만료', format:{ fill:C.redSoft, font:{ color:C.red, bold:true } } });
operations.getRange('I5:I204').conditionalFormats.add('cellIs', { operator:'lessThanOrEqual', formula:3, format:{ fill:C.redSoft, font:{ color:C.red, bold:true } } });
operations.getRange('L5:L204').conditionalFormats.add('cellIs', { operator:'greaterThan', formula:0, format:{ fill:C.redSoft, font:{ color:C.red, bold:true } } });
operations.freezePanes.freezeRows(4);
operations.freezePanes.freezeColumns(4);
const opWidths = { A:40,B:100,C:150,D:64,E:84,F:104,G:92,H:92,I:64,J:104,K:104,L:110,M:64,N:84 };
for (const [col,width] of Object.entries(opWidths)) operations.getRange(`${col}:${col}`).format.columnWidthPx = width;

// ─────────────────────────────────────────────────────────────────────────────
// 요약 산출
// ─────────────────────────────────────────────────────────────────────────────
titleBand(summary, 'O', '스위치플랜 사업현황', '자산·계약·수납에 입력한 사실을 한 화면으로 자동 집계합니다. 이 시트는 수정하지 않습니다.', '산출');
summary.getRange('A2:C2').unmerge();
summary.getRange('A2').values = [['기준일']];
summary.getRange('B2').values = [[asOf]];
summary.getRange('B2').format.numberFormat = 'yyyy-mm-dd';
summary.getRange('C2:O2').merge();
summary.getRange('C2').values = [['표본 데이터가 포함된 작동 예시입니다. 실제 데이터는 입력 탭에 붙여 넣으면 됩니다.']];
summary.getRange('A2:O2').format = { fill:C.blueSoft, font:{ name:'Noto Sans KR', size:10, color:'#355C93' }, verticalAlignment:'center', borders:{ bottom:{style:'thin',color:C.lineDark} } };
summary.getRange('B2').format.font = { name:'Noto Sans KR', size:10, bold:true, color:C.input };

mergeMetric(summary, 'A4:C4', 'A5:C7', '자산 원장', '=COUNTIF(\'자산\'!$B$5:$B$204,"<>")');
mergeMetric(summary, 'D4:F4', 'D5:F7', '운영 보유', '=COUNTIF(\'자산\'!$I$5:$I$204,"보유")');
mergeMetric(summary, 'G4:I4', 'G5:I7', '대여중', '=COUNTIF(\'운영현황\'!$E$5:$E$204,"대여중")');
mergeMetric(summary, 'J4:L4', 'J5:L7', '쉬는차', '=COUNTIF(\'운영현황\'!$E$5:$E$204,"쉬는차")', 'warn');
mergeMetric(summary, 'M4:O4', 'M5:O7', '반납 추적', '=COUNT(\'계약\'!$J$5:$J$204)+COUNT(\'계약\'!$S$5:$S$204)+COUNT(\'계약\'!$AB$5:$AB$204)');
mergeMetric(summary, 'A9:C9', 'A10:C12', '당월 청구', '=SUM(\'수납\'!$F$5:$F$204)');
mergeMetric(summary, 'D9:F9', 'D10:F12', '당월 수납', '=SUM(\'수납\'!$G$5:$G$204)');
mergeMetric(summary, 'G9:I9', 'G10:I12', '수납률', '=IFERROR(SUM(\'수납\'!$G$5:$G$204)/SUM(\'수납\'!$F$5:$F$204),0)');
mergeMetric(summary, 'J9:L9', 'J10:L12', '미납 총잔액', '=SUM(\'수납\'!$E$5:$E$204)', 'danger');
mergeMetric(summary, 'M9:O9', 'M10:O12', '위약금 채권', '=SUM(\'수납\'!$X$5:$X$204)', 'danger');
for (const cell of ['A5','D5','G5','J5','M5','A10','D10','J10','M10']) summary.getRange(cell).format.numberFormat = '#,##0;[Red](#,##0);-';
summary.getRange('G10').format.numberFormat = '0.0%';

summary.getRange('A14:F14').merge(); summary.getRange('A14').values = [['연체 구간']];
summary.getRange('H14:M14').merge(); summary.getRange('H14').values = [['계약 만료']];
styleHeader(summary.getRange('A14:F14'));
styleHeader(summary.getRange('H14:M14'));
summary.getRange('A15:C15').values = [['구간','건수','잔액']];
summary.getRange('H15:J15').values = [['시점','대수','월 대여료']];
styleHeader(summary.getRange('A15:C15'), '#52615A');
styleHeader(summary.getRange('H15:J15'), '#52615A');
summary.getRange('A16:C18').values = [['1개월','',''],['2개월','',''],['3개월 이상','','']];
summary.getRange('B16:B18').formulas = [["=COUNTIF('수납'!$Y$5:$Y$204,1)"],["=COUNTIF('수납'!$Y$5:$Y$204,2)"],["=COUNTIF('수납'!$Y$5:$Y$204,\">=3\")"]];
summary.getRange('C16:C18').formulas = [["=SUMIF('수납'!$Y$5:$Y$204,1,'수납'!$E$5:$E$204)"],["=SUMIF('수납'!$Y$5:$Y$204,2,'수납'!$E$5:$E$204)"],["=SUMIF('수납'!$Y$5:$Y$204,\">=3\",'수납'!$E$5:$E$204)"]];
summary.getRange('H16:J18').values = [['이달 종료','',''],['다음달 종료','',''],['3개월 내','','']];
summary.getRange('I16:I18').formulas = [["=COUNTIF('계약'!$AG$5:$AG$204,\"이달\")"],["=COUNTIF('계약'!$AG$5:$AG$204,\"다음달\")"],["=COUNTIF('계약'!$AG$5:$AG$204,\"이달\")+COUNTIF('계약'!$AG$5:$AG$204,\"다음달\")+COUNTIF('계약'!$AG$5:$AG$204,\"3개월 내\")"]];
summary.getRange('J16:J18').formulas = [["=SUMIF('계약'!$AG$5:$AG$204,\"이달\",'계약'!$K$5:$K$204)"],["=SUMIF('계약'!$AG$5:$AG$204,\"다음달\",'계약'!$K$5:$K$204)"],["=SUMIF('계약'!$AG$5:$AG$204,\"이달\",'계약'!$K$5:$K$204)+SUMIF('계약'!$AG$5:$AG$204,\"다음달\",'계약'!$K$5:$K$204)+SUMIF('계약'!$AG$5:$AG$204,\"3개월 내\",'계약'!$K$5:$K$204)"]];
styleBody(summary.getRange('A16:C18'));
styleBody(summary.getRange('H16:J18'));
summary.getRange('B16:C18').format.numberFormat = '#,##0;[Red](#,##0);-';
summary.getRange('I16:J18').format.numberFormat = '#,##0;[Red](#,##0);-';
summary.getRange('A16:A18').format.font = { name:'Noto Sans KR', size:10, bold:true, color:C.ink };
summary.getRange('H16:H18').format.font = { name:'Noto Sans KR', size:10, bold:true, color:C.ink };
summary.getRange('A19:F21').merge();
summary.getRange('A19').values = [['미수는 당월분이 아니라 누적잔액입니다. 반납·매각 차량도 잔액이 0원이 될 때까지 수납 탭에 남겨 회수합니다.']];
summary.getRange('A19:F21').format = { fill:C.redSoft, font:{ name:'Noto Sans KR', size:10, color:C.red }, wrapText:true, verticalAlignment:'center', borders:{left:{style:'medium',color:C.red}} };
summary.getRange('H19:M21').merge();
summary.getRange('H19').values = [['종료 3개월 이내 계약과 이미 만료됐지만 반납일이 없는 계약을 먼저 확인합니다. 운영현황의 「잔여」가 만료 또는 3 이하이면 붉게 표시됩니다.']];
summary.getRange('H19:M21').format = { fill:C.amberSoft, font:{ name:'Noto Sans KR', size:10, color:C.amber }, wrapText:true, verticalAlignment:'center', borders:{left:{style:'medium',color:C.amber}} };
summary.getRange('A24:O24').merge();
summary.getRange('A24').values = [['입력은 자산·계약·수납 3개 탭에서만 합니다. 요약·운영현황은 잠금 대상 산출 시트입니다.']];
summary.getRange('A24:O24').format = { fill:C.dark, font:{ name:'Noto Sans KR', size:10, bold:true, color:C.white }, horizontalAlignment:'center', verticalAlignment:'center' };
summary.getRange('A27:O27').merge();
summary.getRange('A27').values = [['설계 참고: https://claude.ai/code/artifact/6e9a7c43-472d-42ad-817c-69d3b1e5beb9 · 작성일 2026-08-14 · 표본 데이터']];
summary.getRange('A27:O27').format = { font:{ name:'Noto Sans KR', size:9, color:C.gray }, horizontalAlignment:'left' };
summary.getRange('A4:O12').format.rowHeightPx = 24;
summary.getRange('A5:O7').format.rowHeightPx = 30;
summary.getRange('A10:O12').format.rowHeightPx = 30;
summary.getRange('A14:M18').format.rowHeightPx = 25;
summary.getRange('A19:M21').format.rowHeightPx = 24;
summary.freezePanes.freezeRows(2);
for (const col of ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O']) summary.getRange(`${col}:${col}`).format.columnWidthPx = 76;

// Final metadata and export.
await fs.mkdir(outputDir, { recursive: true });
const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);

const previewRanges = {
  '요약': 'A1:O27',
  '운영현황': 'A1:N14',
  '자산': 'A1:J16',
  '계약': 'A1:AE11',
  '수납': 'A1:Y14',
};
for (const [sheetName, range] of Object.entries(previewRanges)) {
  const preview = await workbook.render({ sheetName, range, scale: 1.2, format: 'png' });
  const safe = sheetName.replace(/[^0-9A-Za-z가-힣_-]/g, '_');
  await fs.writeFile(`${outputDir}/preview-${safe}.png`, new Uint8Array(await preview.arrayBuffer()));
}

const keyCheck = await workbook.inspect({
  kind: 'table',
  range: '요약!A1:O18',
  include: 'values,formulas',
  tableMaxRows: 18,
  tableMaxCols: 15,
  maxChars: 8000,
});
const errorCheck = await workbook.inspect({
  kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',
  options: { useRegex: true, maxResults: 300 },
  summary: 'final formula error scan',
});
const operationCheck = await workbook.inspect({
  kind: 'table',
  range: '운영현황!A4:N12',
  include: 'values,formulas',
  tableMaxRows: 9,
  tableMaxCols: 14,
  maxChars: 6000,
});
const collectionCheck = await workbook.inspect({
  kind: 'table',
  range: '수납!A3:Y14',
  include: 'values,formulas',
  tableMaxRows: 12,
  tableMaxCols: 25,
  maxChars: 8000,
});
const summaryValues = JSON.parse(keyCheck.ndjson).values;
const assertions = [
  ['자산 원장', summaryValues[4][0], 10],
  ['운영 보유', summaryValues[4][3], 8],
  ['대여중', summaryValues[4][6], 6],
  ['쉬는차', summaryValues[4][9], 2],
  ['반납 추적', summaryValues[4][12], 6],
  ['당월 청구', summaryValues[9][0], 5370000],
  ['당월 수납', summaryValues[9][3], 3190000],
  ['미납 총잔액', summaryValues[9][9], 6520000],
  ['위약금 채권', summaryValues[9][12], 4120000],
  ['3개월 내 계약', summaryValues[17][8], 2],
];
for (const [label, actual, expected] of assertions) {
  if (actual !== expected) throw new Error(`${label} 검증 실패: ${actual} !== ${expected}`);
}
await fs.writeFile(`${outputDir}/verification.txt`, `${keyCheck.ndjson}\n\n${operationCheck.ndjson}\n\n${collectionCheck.ndjson}\n\n${errorCheck.ndjson}\n`, 'utf8');

console.log(JSON.stringify({ outputPath, previews: Object.keys(previewRanges), checks: 'PASS', errors: errorCheck.ndjson }, null, 2));
