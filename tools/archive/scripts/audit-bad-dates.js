const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const MIG = 'C:\\dev\\jpkerp6-마이그레이션\\switchplan_스위치플랜';
const OUT = path.join('C:\\dev\\jpkerp6-app', 'scripts', 'audit-bad-dates.result.json');
const JSON_PATH = 'C:\\dev\\jpkerp6-app\\lib\\migrate\\switchplan-data.json';
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function excelSerialToDate(n) {
  return new Date(EXCEL_EPOCH + n * 86400000);
}

function headerLooksDate(h) {
  if (!h || typeof h !== 'string') return false;
  return /종료|시작|반납|일자|날짜|date|Date|예정|계약일|등록일|입고|출고|만료|갱신|납기|입금일|이체일|작성|기준일|from|to|start|end|return/i.test(h);
}

function yearOfDate(d) {
  return d instanceof Date && !isNaN(d.getTime()) ? d.getFullYear() : null;
}

function isSuspiciousYear(y) {
  return y !== null && (y < 1990 || y > 2035 || y === 1930);
}

function cellMeta(v) {
  const meta = {
    raw: v instanceof Date ? v.toISOString() : v,
    typeof: v === null ? 'null' : (v instanceof Date ? 'Date' : typeof v),
  };
  if (v instanceof Date) {
    meta.getTime = v.getTime();
    meta.ISO = v.toISOString();
    meta.year = v.getFullYear();
  } else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    meta.year = parseInt(v.slice(0, 4), 10);
    meta.ISO = v;
  } else if (typeof v === 'number') {
    const d = excelSerialToDate(v);
    meta.asExcelDate = d.toISOString();
    meta.year = d.getFullYear();
    meta.excelSerial = v;
    meta.smallSerial = v === 0 || v === 1 || (v >= 0 && v < 10);
  }
  return meta;
}

function detectHeaderRow(rows) {
  for (const hr of [0, 1]) {
    if (!rows[hr]) continue;
    const strCount = rows[hr].filter(c => typeof c === 'string' && String(c).trim()).length;
    if (strCount >= 3) return hr;
  }
  return 0;
}

function plateFromRow(headers, row) {
  const keys = ['차량번호', '번호판', '차량', 'plate', '번호'];
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || '');
    if (keys.some(k => h.includes(k))) {
      const v = row[i];
      if (v != null && v !== '') return String(v);
    }
  }
  for (let i = 0; i < Math.min(10, row.length); i++) {
    const v = row[i];
    if (typeof v === 'string' && /\d{2,3}[가-힣]\d{4}/.test(v)) return v;
  }
  return null;
}

function codeNameFromRow(headers, row) {
  const keys = ['코드명', '고객명', '성명', '거래처', '계약자'];
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || '');
    if (keys.some(k => h.includes(k))) {
      const v = row[i];
      if (v != null && v !== '') return String(v);
    }
  }
  // also try exact 코드명
  for (let i = 0; i < headers.length; i++) {
    if (String(headers[i] || '') === '코드명' || String(headers[i] || '').includes('코드')) {
      const v = row[i];
      if (v != null && v !== '') return String(v);
    }
  }
  return null;
}

/**
 * Classify a cell as date-like:
 * A) Date object (cellDates:true) — always
 * B) string /^\d{4}-\d{2}-\d{2}/ — always
 * C) Excel serial number — ONLY if header looks like a date column,
 *    OR value is tiny sentinel (0,1,<10) in a date-ish column,
 *    OR we are probing epoch hypothesis on date columns
 */
function classifyCell(v, header) {
  if (v == null || v === '') return null;

  if (v instanceof Date && !isNaN(v.getTime())) {
    return { kind: 'Date', year: v.getFullYear() };
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    return { kind: 'string', year: parseInt(v.slice(0, 4), 10) };
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    const dateCol = headerLooksDate(header);
    // Tiny serials in date columns = empty/sentinel hypothesis
    if (dateCol && v >= 0 && v < 100) {
      const y = excelSerialToDate(v).getFullYear();
      return { kind: 'excelSerial', year: y, sentinel: v < 10 };
    }
    // Larger serials only in date columns (typical Excel date serial ~30000-50000 for 1980-2035)
    if (dateCol && v >= 1 && v < 80000) {
      const y = excelSerialToDate(v).getFullYear();
      return { kind: 'excelSerial', year: y };
    }
  }
  return null;
}

function scanWorkbook(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true, cellNF: false, cellText: false });
  // Also read without cellDates to inspect raw serials for date-formatted cells
  const wbRaw = XLSX.readFile(filePath, { cellDates: false, cellNF: true, cellText: false });
  const fileName = path.basename(filePath);
  const sheetSummaries = {};
  const badCells = [];
  const bondReturnBadRows = [];
  const epochHypothesis = {
    zeros: 0, ones: 0, smallSerials: [],
    date1899: 0, date1900: 0, date1930: 0,
    samples: [],
  };

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const wsRaw = wbRaw.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
    const hr = detectHeaderRow(rows);
    const headers = (rows[hr] || []).map((h, i) =>
      h != null && String(h).trim() ? String(h).trim() : `COL_${i}`
    );
    const groupKeyCounts = {};
    const kindCounts = { Date: 0, string: 0, excelSerial: 0 };
    const isBondOrReturn = /채권|반납/.test(sheetName) || /채권|반납/.test(fileName);

    for (let r = hr + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const rowBadCols = [];

      for (let c = 0; c < Math.max(headers.length, row.length); c++) {
        const header = headers[c] || `COL_${c}`;
        const v = row[c];

        // Probe raw cell for serial when parsed as Date
        let rawSerial = null;
        if (wsRaw) {
          const addr = XLSX.utils.encode_cell({ r, c });
          const cell = wsRaw[addr];
          if (cell && typeof cell.v === 'number') rawSerial = cell.v;
        }

        const cls = classifyCell(v, header);
        if (!cls) continue;
        if (!isSuspiciousYear(cls.year)) continue;

        kindCounts[cls.kind] = (kindCounts[cls.kind] || 0) + 1;
        const gk = `${sheetName}||${header}`;
        groupKeyCounts[gk] = (groupKeyCounts[gk] || 0) + 1;

        const meta = cellMeta(v);
        if (rawSerial != null) meta.rawExcelSerial = rawSerial;

        const entry = {
          file: fileName,
          sheet: sheetName,
          row: r + 1,
          col: c,
          header,
          year: cls.year,
          kind: cls.kind,
          ...meta,
        };
        badCells.push(entry);

        // Epoch hypothesis tracking
        const serial = rawSerial != null ? rawSerial : (typeof v === 'number' ? v : null);
        if (serial === 0) {
          epochHypothesis.zeros++;
          if (epochHypothesis.samples.length < 40)
            epochHypothesis.samples.push({ ...entry, note: 'serial0' });
        } else if (serial === 1) {
          epochHypothesis.ones++;
          if (epochHypothesis.samples.length < 40)
            epochHypothesis.samples.push({ ...entry, note: 'serial1' });
        } else if (serial != null && serial > 0 && serial < 10) {
          epochHypothesis.smallSerials.push({ sheet: sheetName, header, row: r + 1, serial, year: cls.year });
          if (epochHypothesis.samples.length < 40)
            epochHypothesis.samples.push({ ...entry, note: 'smallSerial' });
        }

        if (cls.year === 1899) epochHypothesis.date1899++;
        if (cls.year === 1900) epochHypothesis.date1900++;
        if (cls.year === 1930) {
          epochHypothesis.date1930++;
          if (epochHypothesis.samples.length < 40)
            epochHypothesis.samples.push({ ...entry, note: 'year1930' });
        }

        // Check Date at 1899-12-30
        if (v instanceof Date) {
          const iso = v.toISOString();
          if (iso.startsWith('1899-12-30') || iso.startsWith('1899-12-31')) {
            if (epochHypothesis.samples.length < 40)
              epochHypothesis.samples.push({ ...entry, note: 'Date1899-12-30', rawSerial });
          }
        }

        if (isBondOrReturn && headerLooksDate(header) && (cls.year === 1930 || cls.year < 1990)) {
          rowBadCols.push(entry);
        }
      }

      if (rowBadCols.length) {
        bondReturnBadRows.push({
          file: fileName,
          sheet: sheetName,
          row: r + 1,
          plate: plateFromRow(headers, row),
          코드명: codeNameFromRow(headers, row),
          badDates: rowBadCols.map(e => ({
            header: e.header,
            raw: e.raw,
            typeof: e.typeof,
            kind: e.kind,
            getTime: e.getTime,
            ISO: e.ISO,
            year: e.year,
            rawExcelSerial: e.rawExcelSerial,
            asExcelDate: e.asExcelDate,
          })),
        });
      }
    }

    sheetSummaries[sheetName] = {
      headerRow: hr,
      headers,
      kindCounts,
      groupCounts: Object.entries(groupKeyCounts)
        .map(([k, count]) => ({ sheet: sheetName, header: k.split('||')[1], count }))
        .sort((a, b) => b.count - a.count),
      suspiciousCellCount: Object.values(groupKeyCounts).reduce((a, b) => a + b, 0),
    };
  }

  return { fileName, sheetSummaries, badCells, bondReturnBadRows, epochHypothesis };
}

function scanJsonContracts(jsonPath) {
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const contracts = data.contracts || [];
  const fields = ['endDate', 'returnScheduledDate', 'startDate'];
  const bad = [];
  const byField = {};
  const yearDist = {};

  for (let i = 0; i < contracts.length; i++) {
    const c = contracts[i];
    for (const f of fields) {
      const v = c[f];
      if (v == null || v === '') continue;
      let y = null;
      const meta = { raw: v, typeof: typeof v };
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
        y = parseInt(v.slice(0, 4), 10);
        meta.ISO = v;
      } else if (typeof v === 'number') {
        const d = new Date(v);
        if (!isNaN(d.getTime())) {
          y = d.getFullYear();
          meta.getTime = d.getTime();
          meta.ISO = d.toISOString();
        }
      }
      if (y !== null && (y < 1990 || y > 2035 || y === 1930)) {
        byField[f] = (byField[f] || 0) + 1;
        yearDist[y] = (yearDist[y] || 0) + 1;
        bad.push({
          index: i,
          id: c.id || null,
          plate: c.plate || c.vehiclePlate || null,
          코드명: c.customerName || c.코드명 || c.codeName || null,
          field: f,
          year: y,
          ...meta,
          contractSnippet: {
            startDate: c.startDate,
            endDate: c.endDate,
            returnScheduledDate: c.returnScheduledDate,
          },
        });
      }
    }
  }
  return { contractCount: contracts.length, byField, yearDist, badCount: bad.length, bad };
}

const files = [
  path.join(MIG, '사업현황.xlsx'),
  path.join(MIG, '채권현황.xlsx'),
].filter(f => fs.existsSync(f));

let allBadCells = [];
let allBondRows = [];
const groupAgg = {};
const epochAgg = { zeros: 0, ones: 0, smallSerials: [], date1899: 0, date1900: 0, date1930: 0, samples: [] };
const workbooks = [];
const kindTotals = { Date: 0, string: 0, excelSerial: 0 };

for (const f of files) {
  console.log('Scanning', path.basename(f));
  const r = scanWorkbook(f);
  workbooks.push({
    file: r.fileName,
    sheets: Object.fromEntries(
      Object.entries(r.sheetSummaries).map(([sn, s]) => [
        sn,
        {
          headerRow: s.headerRow,
          suspiciousCellCount: s.suspiciousCellCount,
          kindCounts: s.kindCounts,
          groupCounts: s.groupCounts,
        },
      ])
    ),
  });
  allBadCells = allBadCells.concat(r.badCells);
  allBondRows = allBondRows.concat(r.bondReturnBadRows);
  for (const [sn, s] of Object.entries(r.sheetSummaries)) {
    for (const g of s.groupCounts) {
      const k = `${r.fileName}::${sn}::${g.header}`;
      groupAgg[k] = (groupAgg[k] || 0) + g.count;
    }
    for (const [k, n] of Object.entries(s.kindCounts || {})) kindTotals[k] = (kindTotals[k] || 0) + n;
  }
  epochAgg.zeros += r.epochHypothesis.zeros;
  epochAgg.ones += r.epochHypothesis.ones;
  epochAgg.date1899 += r.epochHypothesis.date1899;
  epochAgg.date1900 += r.epochHypothesis.date1900;
  epochAgg.date1930 += r.epochHypothesis.date1930;
  epochAgg.smallSerials = epochAgg.smallSerials.concat(r.epochHypothesis.smallSerials);
  epochAgg.samples = epochAgg.samples.concat(r.epochHypothesis.samples).slice(0, 50);
}

console.log('Scanning JSON');
const jsonResult = scanJsonContracts(JSON_PATH);

const yearDist = {};
for (const c of allBadCells) yearDist[c.year] = (yearDist[c.year] || 0) + 1;

const groupedSorted = Object.entries(groupAgg)
  .map(([k, count]) => {
    const [file, sheet, header] = k.split('::');
    return { file, sheet, header, count };
  })
  .sort((a, b) => b.count - a.count);

const result = {
  scannedAt: new Date().toISOString(),
  files,
  filterNote:
    'Date objects + YYYY-MM-DD strings always; numeric Excel serials only when column header looks date-related (avoids money/cc/연식 false positives). cellDates:true used; rawExcelSerial from cellDates:false pass.',
  summary: {
    suspiciousExcelCells: allBadCells.length,
    byKind: kindTotals,
    bondReturnBadRows: allBondRows.length,
    jsonBadContractDates: jsonResult.badCount,
    jsonByField: jsonResult.byField,
    jsonYearDist: jsonResult.yearDist,
    yearDistribution: yearDist,
    epochHypothesis: {
      zeros: epochAgg.zeros,
      ones: epochAgg.ones,
      smallSerialCount: epochAgg.smallSerials.length,
      date1899: epochAgg.date1899,
      date1900: epochAgg.date1900,
      date1930: epochAgg.date1930,
      conclusion:
        epochAgg.zeros || epochAgg.ones || epochAgg.date1899
          ? 'Some empty/sentinel serials map to 1899/1900 epoch'
          : 'No serial 0/1 → 1899-12-30 pattern in date columns; 1930 appears as real Date objects (not Excel epoch empty)',
    },
  },
  groupedBySheetColumn: groupedSorted,
  workbooks,
  bondReturnDetail: allBondRows,
  jsonBad: jsonResult.bad,
  sampleBadCells: allBadCells.slice(0, 50),
  epochSamples: epochAgg.samples,
  smallSerials: epochAgg.smallSerials.slice(0, 30),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8');

console.log('\n=== SUMMARY ===');
console.log('Suspicious Excel cells (filtered):', result.summary.suspiciousExcelCells, result.summary.byKind);
console.log('채권/반납 bad rows (종료/시작/반납 cols, y=1930 or <1990):', result.summary.bondReturnBadRows);
console.log('JSON bad:', result.summary.jsonBadContractDates, result.summary.jsonByField, result.summary.jsonYearDist);
console.log('Year dist:', JSON.stringify(yearDist));
console.log('Epoch: zeros=', epochAgg.zeros, 'ones=', epochAgg.ones, '1899=', epochAgg.date1899, '1900=', epochAgg.date1900, '1930=', epochAgg.date1930);
console.log('smallSerials in date cols:', epochAgg.smallSerials.length);
console.log('\nGroups:');
groupedSorted.forEach(g => console.log(`  ${g.count}\t${g.file} / ${g.sheet} / ${g.header}`));
console.log('\n=== 20 SAMPLE BAD CELLS ===');
allBadCells.slice(0, 20).forEach((e, i) => {
  console.log(
    `${i + 1}. ${e.file}|${e.sheet}|r${e.row}|${e.header}|y=${e.year}|kind=${e.kind}|typeof=${e.typeof}|raw=${JSON.stringify(e.raw)}` +
      (e.ISO ? `|ISO=${e.ISO}` : '') +
      (e.getTime != null ? `|t=${e.getTime}` : '') +
      (e.rawExcelSerial != null ? `|serial=${e.rawExcelSerial}` : '')
  );
});
console.log('\n=== ALL 채권/반납 BAD ROWS (' + allBondRows.length + ') ===');
allBondRows.forEach((e, i) => {
  console.log(
    `${i + 1}. ${e.file}|${e.sheet}|r${e.row}|plate=${e.plate}|코드명=${e.코드명}|` +
      e.badDates.map(d => `${d.header}:${d.ISO || d.raw}(y=${d.year},typeof=${d.typeof},serial=${d.rawExcelSerial})`).join('; ')
  );
});
console.log('\n=== 20 SAMPLE JSON BAD ===');
jsonResult.bad.slice(0, 20).forEach((e, i) => {
  console.log(`${i + 1}. idx=${e.index}|plate=${e.plate}|field=${e.field}|y=${e.year}|raw=${e.raw}`);
});
console.log('\nWrote', OUT);
