/**
 * Switchplan migration attachment / rest-source integrity audit (A–F).
 * Output: scripts/audit-switchplan-rest.result.json
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const XLSX = require('xlsx');

const ROOT =
  process.env.MIGRATE_ROOT ||
  'C:\\dev\\jpkerp6-\uB9C8\uC774\uADF8\uB808\uC774\uC158\\switchplan_\uC2A4\uC704\uCE58\uD50C\uB79C';
const APP = path.join(__dirname, '..');
const FROZEN = path.join(APP, 'lib', 'migrate', 'switchplan-data.json');
const OUT = path.join(__dirname, 'audit-switchplan-rest.result.json');

const normPlate = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
const cellStr = (v) => {
  if (v == null) return '';
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).trim();
};
const cellNum = (v) => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Math.round(v);
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
};
const setOf = (arr) => new Set(arr.filter(Boolean));
const onlyIn = (a, b) => [...a].filter((x) => !b.has(x));

function sheetMatrix(wb, name) {
  const sh = wb.Sheets[name];
  if (!sh) return null;
  return XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', raw: true });
}
function headerIndex(row) {
  const m = new Map();
  (row || []).forEach((h, i) => {
    const k = cellStr(h);
    if (k && !m.has(k)) m.set(k, i);
  });
  return m;
}
function findCol(idx, ...names) {
  for (const n of names) if (idx.has(n)) return idx.get(n);
  return -1;
}
function walkFiles(dir, pred) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkFiles(p, pred));
    else if (!pred || pred(p)) out.push(p);
  }
  return out;
}
function plateFromFilename(f) {
  const base = path.basename(f, path.extname(f)).replace(/\(해지\)/g, '');
  const m = base.match(/^([0-9]{2,3}[가-힣][0-9]{4}|[가-힣]{2,4}[0-9]{2}[가-힣][0-9]{4})/);
  if (m) return normPlate(m[1]);
  const t = base.split(/[\s_]/)[0];
  if (/[가-힣]/.test(t) && /\d/.test(t)) return normPlate(t);
  return '';
}

const findings = [];
function push(sev, kind, detail, samples = [], n) {
  findings.push({ sev, kind, detail, n: n ?? (Array.isArray(samples) ? samples.length : 0), samples: (samples || []).slice(0, 15) });
}

// ── Load core workbooks ──
const bizPath = path.join(ROOT, '사업현황.xlsx');
const jboPath = path.join(ROOT, '자금일보.xlsx');
const debtPath = path.join(ROOT, '채권현황.xlsx');
if (!fs.existsSync(bizPath)) {
  console.error('MISSING', bizPath);
  process.exit(1);
}
const bizWb = XLSX.read(fs.readFileSync(bizPath), { type: 'buffer', cellDates: true });
const jboWb = fs.existsSync(jboPath) ? XLSX.read(fs.readFileSync(jboPath), { type: 'buffer', cellDates: true }) : null;
const debtWb = fs.existsSync(debtPath) ? XLSX.read(fs.readFileSync(debtPath), { type: 'buffer', cellDates: true }) : null;
const frozen = JSON.parse(fs.readFileSync(FROZEN, 'utf8'));

// Assets + ledger (mirror migrate audit)
const assetM = sheetMatrix(bizWb, '자산') || [];
const assetHdr = headerIndex(assetM[0] || []);
const cPlateA = findCol(assetHdr, '차량번호');
const assetPlates = [];
for (let r = 1; r < assetM.length; r++) {
  const plate = cellStr(assetM[r][cPlateA]);
  if (plate) assetPlates.push(normPlate(plate));
}
const assetSet = setOf(assetPlates);

function parseLedger(name, hasMonthRow) {
  const m = sheetMatrix(bizWb, name);
  if (!m) return { rows: [], plates: [], platesAll: [] };
  const hdrRow = hasMonthRow ? 1 : 0;
  const hdr = headerIndex(m[hdrRow] || []);
  const iPlate = findCol(hdr, '차량번호');
  const iName = findCol(hdr, '코드명');
  const platesAll = [];
  const rows = [];
  for (let r = hdrRow + 1; r < m.length; r++) {
    const row = m[r];
    const plate = cellStr(row[iPlate]);
    if (!plate) continue;
    const np = normPlate(plate);
    platesAll.push(np);
    const name = cellStr(row[iName]);
    if (name) rows.push({ plate, np, name });
  }
  return { rows, plates: [...new Set(platesAll)], platesAll };
}
const cur = parseLedger('채권', true);
const activePlateSet = setOf(cur.plates);
const currentPlateSet = setOf(cur.rows.map((c) => c.np));

// Live parser snapshot (optional)
let liveParse = null;
const liveRun = spawnSync('npx', ['tsx', path.join(__dirname, '_parse-live-totals.mjs')], {
  cwd: APP,
  encoding: 'utf8',
  shell: true,
  timeout: 120000,
});
if (liveRun.status === 0 && liveRun.stdout) {
  try {
    const j = JSON.parse(liveRun.stdout);
    liveParse = j.live;
  } catch {
    push('low', 'liveParse', 'parseSwitchplanWorkbook snapshot: stdout not JSON', [String(liveRun.stdout).slice(0, 200)]);
  }
} else {
  push('mid', 'liveParse', `tsx _parse-live-totals failed (status ${liveRun.status})`, [String(liveRun.stderr || '').slice(0, 300)]);
}

const sections = {};
const summary = { root: ROOT, generatedAt: new Date().toISOString() };

// ═══ A. 보험증권 ═══
const insRoot = path.join(ROOT, '보험증권');
const insXlsx = walkFiles(insRoot, (p) => /\.xlsx$/i.test(p)).map((p) => path.relative(ROOT, p));
const insMain = path.join(insRoot, '보험증권_128건_2026-06-08.xlsx');
const insMainDup = path.join(insRoot, '보험증권_128건_2026-06-08 (1).xlsx');
const insOne = path.join(insRoot, '보험증권_1건_2026-06-10.xlsx');

function readInsuranceXlsx(filePath) {
  const wb = XLSX.read(fs.readFileSync(filePath), { type: 'buffer', cellDates: true });
  const sn = wb.SheetNames[0];
  const m = sheetMatrix(wb, sn) || [];
  const hdr = m[0] || [];
  const ip = hdr.findIndex((h) => cellStr(h) === '차량번호');
  const plates = [];
  for (let r = 1; r < m.length; r++) {
    const p = cellStr(m[r][ip]);
    if (p) plates.push({ plate: p, np: normPlate(p), row: m[r] });
  }
  return { file: path.basename(filePath), sheet: sn, headers: hdr.map(cellStr), rowCount: Math.max(0, m.length - 1), plates };
}

const ins128 = fs.existsSync(insMain) ? readInsuranceXlsx(insMain) : null;
const ins128b = fs.existsSync(insMainDup) ? readInsuranceXlsx(insMainDup) : null;
const ins1 = fs.existsSync(insOne) ? readInsuranceXlsx(insOne) : null;
const insPlateSet = ins128 ? setOf(ins128.plates.map((p) => p.np)) : new Set();
const frozenInsSet = setOf((frozen.insurance || []).map((x) => normPlate(x.plate)));

const dbPdfDir = path.join(insRoot, 'DB보험증권');
const dbPdfs = fs.existsSync(dbPdfDir) ? fs.readdirSync(dbPdfDir).filter((f) => /\.pdf$/i.test(f)) : [];
const dbHaesi = dbPdfs.filter((f) => /\(해지\)/.test(f));
const dbPdfPlates = setOf(dbPdfs.map((f) => plateFromFilename(f)).filter(Boolean));

const insNotAsset = onlyIn(insPlateSet, assetSet);
const assetNoInsXlsx = onlyIn(assetSet, insPlateSet);
const activeNoIns = onlyIn(activePlateSet, insPlateSet);
const insNotFrozen = onlyIn(insPlateSet, frozenInsSet);
const frozenNotIns = onlyIn(frozenInsSet, insPlateSet);
const insXlsxNotPdf = onlyIn(insPlateSet, dbPdfPlates);
const pdfNotXlsx = onlyIn(dbPdfPlates, insPlateSet);

let dup128same = null;
if (ins128 && ins128b) {
  const a = ins128.plates.map((p) => p.np).sort().join('|');
  const b = ins128b.plates.map((p) => p.np).sort().join('|');
  dup128same = a === b;
}

sections.A_insurance = {
  xlsxFiles: insXlsx,
  main128: ins128
    ? { headers: ins128.headers, rowCount: ins128.rowCount, uniquePlates: insPlateSet.size }
    : null,
  duplicate128FileIdentical: dup128same,
  oneOff: ins1 ? { rowCount: ins1.rowCount, plates: ins1.plates.map((p) => p.plate) } : null,
  frozenInsuranceCount: frozenInsSet.size,
  delta128vs118: {
    xlsxRows: ins128?.rowCount ?? 0,
    frozenCount: frozenInsSet.size,
    xlsxMinusFrozen: (ins128?.rowCount ?? 0) - frozenInsSet.size,
    platesInXlsxNotFrozen: insNotFrozen,
    platesInFrozenNotXlsx: frozenNotIns,
    explanation:
      insNotFrozen.length === 10 && frozenNotIns.length === 0
        ? '128건 xlsx − 118건 frozen = 10 plates added in xlsx after 2026-06-30 frozen asOf; frozen is subset of xlsx.'
        : 'Compare plate lists: xlsx may include post-freeze policies; frozen may omit cancelled or synthetic rows.',
  },
  plateInXlsxNotAssets: insNotAsset,
  assetsWithoutInsuranceXlsx: assetNoInsXlsx,
  activePlatesWithoutInsuranceXlsx: activeNoIns,
  dbInsurancePdf: { total: dbPdfs.length, haesiInFilename: dbHaesi.length, haesiSamples: dbHaesi.slice(0, 12) },
  xlsxPlatesWithoutPdf: insXlsxNotPdf,
  pdfPlatesWithoutXlsx: pdfNotXlsx,
  liveActivePlates: liveParse?.activePlatesLength ?? activePlateSet.size,
};

if (insNotAsset.length) push('high', '보험고아', `보험 xlsx plate가 자산에 없음 ${insNotAsset.length}건`, insNotAsset);
if (activeNoIns.length)
  push('mid', '보험누락', `운행(active) plate 중 보험 xlsx 없음 ${activeNoIns.length}/${activePlateSet.size}`, activeNoIns);
if (assetNoInsXlsx.length)
  push('mid', '자산무보험', `자산 163 중 보험 xlsx 미포함 ${assetNoInsXlsx.length}건 (해지·미가입·개인보험 등)`, assetNoInsXlsx.slice(0, 15), assetNoInsXlsx.length);
if (insNotFrozen.length)
  push('mid', '보험동결차', `xlsx에만 있고 frozen JSON 없음 ${insNotFrozen.length}건 → 128 vs 118 설명`, insNotFrozen, insNotFrozen.length);
if (dbHaesi.length) push('low', '보험해지PDF', `DB보험증권 파일명 (해지) ${dbHaesi.length}건`, dbHaesi.map((f)=>path.basename(f)), dbHaesi.length);
if (insXlsxNotPdf.length)
  push('mid', '보험PDF누락', `xlsx 정책 대비 DB보험증권 PDF 없음 ${insXlsxNotPdf.length}`, insXlsxNotPdf, insXlsxNotPdf.length);

// ═══ B. 자동차등록증 ═══
const regDir = path.join(ROOT, '자동차등록증');
const regPdfs = fs.existsSync(regDir) ? fs.readdirSync(regDir).filter((f) => /\.pdf$/i.test(f)) : [];
const regPlateList = regPdfs.map((f) => plateFromFilename(f)).filter(Boolean);
const regSet = setOf(regPlateList);
const regMissing = onlyIn(assetSet, regSet);
const regExtra = onlyIn(regSet, assetSet);
sections.B_registration = {
  pdfCount: regPdfs.length,
  uniquePlates: regSet.size,
  assetPlates: assetSet.size,
  missingRegistrationPdf: regMissing,
  extraRegistrationPdf: regExtra,
};
if (regMissing.length) push('mid', '등록증누락', `자산 plate 중 등록증 PDF 없음 ${regMissing.length}`, regMissing, regMissing.length);
if (regExtra.length) push('low', '등록증잉여', `등록증 PDF가 자산에 없음 ${regExtra.length}`, regExtra, regExtra.length);

// ═══ C. 채권현황 vs 사업현황 ═══
function platesFromWb(wb, name, hasMonth) {
  if (!wb || !wb.Sheets[name]) return null;
  const m = sheetMatrix(wb, name) || [];
  const hdrRow = hasMonth ? 1 : 0;
  const hdr = m[hdrRow] || [];
  const ip = hdr.findIndex((h) => cellStr(h) === '차량번호');
  const plates = [];
  for (let r = hdrRow + 1; r < m.length; r++) {
    const p = normPlate(m[r][ip]);
    if (p) plates.push(p);
  }
  return { dataRows: Math.max(0, m.length - 1 - hdrRow), uniquePlates: [...new Set(plates)], plateRows: plates.length };
}
const overlapSheets = ['채권', '지우지마세요', '채권추심'];
const debtSheetInfo = debtWb ? debtWb.SheetNames.map((n) => ({ name: n, ...(platesFromWb(debtWb, n, n === '채권') || { dataRows: (sheetMatrix(debtWb, n) || []).length }) })) : [];
const cComparisons = [];
for (const sn of overlapSheets) {
  const d = debtWb ? platesFromWb(debtWb, sn, sn === '채권') : null;
  const b = platesFromWb(bizWb, sn, sn === '채권');
  if (!d) continue;
  const entry = {
    sheet: sn,
    debt: { dataRows: d.dataRows, uniquePlates: d.uniquePlates.length, plateRows: d.plateRows },
    biz: b ? { dataRows: b.dataRows, uniquePlates: b.uniquePlates.length, plateRows: b.plateRows } : null,
  };
  if (b) {
    const dSet = setOf(d.uniquePlates);
    const bSet = setOf(b.uniquePlates);
    entry.onlyInDebt = onlyIn(dSet, bSet);
    entry.onlyInBiz = onlyIn(bSet, dSet);
    entry.samePlateSet = entry.onlyInDebt.length === 0 && entry.onlyInBiz.length === 0;
    entry.verdict =
      entry.samePlateSet && d.dataRows === b.dataRows
        ? 'duplicate_snapshot'
        : entry.onlyInDebt.length && !entry.onlyInBiz.length
          ? 'debt_newer_or_extended'
          : 'diverged';
  } else entry.verdict = 'biz_missing_sheet';
  cComparisons.push(entry);
  if (entry.verdict === 'debt_newer_or_extended')
    push('mid', '채권현황차', `채권현황.${sn}: 사업현황 대비 +${entry.onlyInDebt.length} plates (채권현황이 더 많음)`, entry.onlyInDebt.slice(0, 12), entry.onlyInDebt.length);
  else if (entry.verdict === 'duplicate_snapshot' && sn !== '채권')
    push('low', '채권현황복제', `${sn} 시트: 채권현황.xlsx와 사업현황 동일 plate·행`, [], 0);
}
sections.C_debt_workbook = {
  debtSheets: debtWb ? debtWb.SheetNames : [],
  debtSheetCounts: debtSheetInfo,
  overlapComparisons: cComparisons,
};

// ═══ D. 계좌_CMS vs 자금일보 ═══
function parseBankExportFile(filePath) {
  const wb = XLSX.read(fs.readFileSync(filePath), { type: 'buffer', cellDates: true });
  const sn = wb.SheetNames[0];
  const G = sheetMatrix(wb, sn) || [];
  let hdr = -1;
  for (let i = 0; i < Math.min(8, G.length); i++) {
    if ((G[i] || []).some((c) => String(c).includes('거래일시'))) {
      hdr = i;
      break;
    }
  }
  const h = (G[hdr] || []).map((x) => String(x).trim());
  const ci = (lbl) => h.findIndex((x) => x.includes(lbl));
  const depI = ci('입금액');
  const outI = ci('출금액');
  const dtI = ci('거래일시');
  let dataRows = 0;
  let deposit = 0;
  let withdraw = 0;
  const dates = [];
  for (let r = hdr + 1; r < G.length; r++) {
    const row = G[r];
    const inAmt = depI >= 0 ? cellNum(row[depI]) : 0;
    const outAmt = outI >= 0 ? cellNum(row[outI]) : 0;
    if (!inAmt && !outAmt) continue;
    dataRows++;
    deposit += inAmt;
    withdraw += outAmt;
    const d = dtI >= 0 ? String(row[dtI]) : '';
    const m = d.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
    if (m) dates.push(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`);
  }
  dates.sort();
  return { sheet: sn, approxRows: G.length, dataRows, deposit, withdraw, dateFrom: dates[0] || '', dateTo: dates[dates.length - 1] || '' };
}

function parseJboSheet(wb, sheetName) {
  const G = sheetMatrix(wb, sheetName) || [];
  const hRow = G.findIndex((r) => (r || []).some((v) => cellStr(v) === '계정과목'));
  if (hRow < 0) return { dataRows: 0, deposit: 0, dateFrom: '', dateTo: '' };
  const h = G[hRow].map(cellStr);
  const ci = (lbl) => h.findIndex((x) => x === lbl);
  let dataRows = 0;
  let deposit = 0;
  const dates = [];
  for (let r = hRow + 1; r < G.length; r++) {
    const row = G[r];
    const inAmt = cellNum(row[ci('입금액')]);
    const outAmt = cellNum(row[ci('출금액')]);
    if (!inAmt && !outAmt) continue;
    dataRows++;
    deposit += inAmt;
    const d = cellStr(row[ci('거래일시')]);
    const m = d.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
    if (m) dates.push(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`);
  }
  dates.sort();
  return { dataRows, deposit, dateFrom: dates[0] || '', dateTo: dates[dates.length - 1] || '' };
}

const cmsDir = path.join(ROOT, '계좌_CMS');
const cmsFiles = fs.existsSync(cmsDir) ? fs.readdirSync(cmsDir).filter((f) => /\.xlsx$/i.test(f)) : [];
const cmsProfiles = cmsFiles.map((f) => ({ file: f, ...parseBankExportFile(path.join(cmsDir, f)) }));
const jboProfiles = jboWb
  ? jboWb.SheetNames.map((sn) => ({ sheet: sn, ...parseJboSheet(jboWb, sn) }))
  : [];
const cms2026 = cmsProfiles.find((x) => x.file.includes('2026'));
const jbo1868 = jboProfiles.find((x) => x.sheet.includes('1868'));
const cmsMeta = cmsProfiles.find((x) => x.file.toLowerCase() === 'cms.xlsx');
sections.D_accounts = {
  cmsFiles: cmsProfiles,
  jboSheets: jboProfiles,
  cmsIsSeparateChannel: true,
  cmsNote:
    'CMS.xlsx is CMS billing roster (member/charge rows), not bank ledger; 계좌.xlsx is short bank export; yearly 운영계좌 files are raw 신한 381868 exports.',
  compare2026Operating: cms2026 && jbo1868
    ? {
        cms2026File: cms2026.file,
        cmsRows: cms2026.dataRows,
        cmsDeposit: cms2026.deposit,
        jboSheet: jbo1868.sheet,
        jboRows: jbo1868.dataRows,
        jboDeposit: jbo1868.deposit,
        rowDelta: cms2026.dataRows - jbo1868.dataRows,
        depositDelta: cms2026.deposit - jbo1868.deposit,
        dateRanges: { cms: [cms2026.dateFrom, cms2026.dateTo], jbo: [jbo1868.dateFrom, jbo1868.dateTo] },
      }
    : null,
  liveJboTotals: liveParse ? null : null,
};
if (cms2026 && jbo1868) {
  const rd = Math.abs(cms2026.dataRows - jbo1868.dataRows);
  const dd = Math.abs(cms2026.deposit - jbo1868.deposit);
  if (rd > 20 || dd > 500000)
    push(
      'mid',
      '운영계좌차',
      `2026 CMS export vs 자금일보 ${jbo1868.sheet}: rows ${cms2026.dataRows} vs ${jbo1868.dataRows} (Δ${cms2026.dataRows - jbo1868.dataRows}), 입금 ${cms2026.deposit} vs ${jbo1868.deposit} (Δ${cms2026.deposit - jbo1868.deposit})`,
      [],
      1,
    );
  else push('low', '운영계좌근접', `2026 운영계좌 CMS↔자금일보 신한1868 근사 일치 (rows Δ${cms2026.dataRows - jbo1868.dataRows})`, [], 0);
}
if (cmsMeta && cmsMeta.approxRows <= 10)
  push('low', 'CMS별도', `CMS.xlsx ${cmsMeta.approxRows}(roster)행 — 자동이체 청구 채널(은행원장 아님)`, [], Math.max(0, cmsMeta.approxRows - 1));

// ═══ E. 계약서 PDF vs current contracts ═══
const pdfDir = path.join(ROOT, '계약서');
const pdfFiles = fs.existsSync(pdfDir) ? fs.readdirSync(pdfDir).filter((f) => /\.pdf$/i.test(f)) : [];
const pdfPlates = pdfFiles.map((f) => plateFromFilename(f)).filter(Boolean);
const pdfSet = setOf(pdfPlates);
const curMissingPdf = onlyIn(currentPlateSet, pdfSet);
const pdfExtra = onlyIn(pdfSet, currentPlateSet);
sections.E_contract_pdf = {
  pdfCount: pdfFiles.length,
  uniquePdfPlates: pdfSet.size,
  liveCurrentContracts: liveParse?.totals?.countCurrent ?? cur.rows.length,
  currentNamedPlates: currentPlateSet.size,
  missingPdfForCurrent: curMissingPdf,
  extraPdfNotCurrent: pdfExtra,
  duplicatePdfPlates: pdfFiles.length - pdfSet.size,
};
if (curMissingPdf.length) push('mid', '계약서누락', `현행 계약 plate PDF 없음 ${curMissingPdf.length}`, curMissingPdf, curMissingPdf.length);
if (pdfExtra.length) push('low', '계약서잉여', `PDF만 있고 현행 계약 아님 ${pdfExtra.length}`, pdfExtra, pdfExtra.length);

// ═══ F. sonogong / prime ═══
const migRoot = path.dirname(ROOT);
const peerDirs = fs.readdirSync(migRoot, { withFileTypes: true }).filter((d) => d.isDirectory() && /sonogong|prime/i.test(d.name));
const peerReport = [];
for (const d of peerDirs) {
  const full = path.join(migRoot, d.name);
  const all = walkFiles(full);
  const dataFiles = all.filter((p) => /\.(xlsx|xls|csv|pdf)$/i.test(p));
  const bizLike = dataFiles.filter((p) => /사업현황|자금일보|채권|계약/i.test(path.basename(p)));
  peerReport.push({ dir: d.name, totalFiles: all.length, dataFiles: dataFiles.length, bizLikeFiles: bizLike.map((p) => path.relative(migRoot, p)) });
  if (bizLike.length)
    push('mid', '타법인데이터', `${d.name}에 사업 데이터 파일 ${bizLike.length}개`, bizLike.map((p) => path.basename(p)), bizLike.length);
  else push('low', '타법인없음', `${d.name}: 렌터카 사업 xlsx/pdf 없음 (README·빈 폴더 수준)`, [], 0);
}
sections.F_peers = { peers: peerReport, noBusinessData: peerReport.every((p) => p.bizLikeFiles.length === 0) };

// ── inventory ──
const inventory = {
  root: ROOT,
  dirs: fs.readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name),
  rootXlsx: fs.readdirSync(ROOT).filter((f) => /\.xlsx$/i.test(f)),
};

const sevCount = { high: 0, mid: 0, low: 0 };
for (const f of findings) sevCount[f.sev] = (sevCount[f.sev] || 0) + 1;

summary.counts = {
  assets: assetSet.size,
  activePlates: activePlateSet.size,
  currentContracts: currentPlateSet.size,
  insuranceXlsxPlates: insPlateSet.size,
  frozenInsurance: frozenInsSet.size,
  registrationPdfs: regPdfs.length,
  contractPdfs: pdfFiles.length,
  dbInsurancePdfs: dbPdfs.length,
  dbHaesiPdfs: dbHaesi.length,
};

const out = {
  generatedAt: summary.generatedAt,
  root: ROOT,
  inventory,
  summary: summary.counts,
  liveParse: liveParse
    ? {
        asOf: liveParse.asOf,
        activePlatesLength: liveParse.activePlatesLength,
        countCurrent: liveParse.totals?.countCurrent,
        vehicleCount: liveParse.vehicleCount,
      }
    : null,
  sections,
  sevCount,
  findings: findings.sort((a, b) => ({ high: 0, mid: 1, low: 2 }[a.sev] - ({ high: 0, mid: 1, low: 2 }[b.sev]))),
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');

const lines = [
  `switchplan rest audit → ${OUT}`,
  `A 보험: xlsx ${insPlateSet.size} plates, frozen ${frozenInsSet.size}, DB PDF ${dbPdfs.length} (해지 ${dbHaesi.length}), active w/o ins ${activeNoIns.length}`,
  `B 등록증: ${regPdfs.length} PDF, missing vs 자산 ${regMissing.length}, extra ${regExtra.length}`,
  `C 채권현황: ${cComparisons.map((c) => `${c.sheet}=${c.verdict}`).join(', ')}`,
  `D 2026 운영: CMS rows ${cms2026?.dataRows ?? '?'} vs JBO ${jbo1868?.dataRows ?? '?'}`,
  `E 계약서: ${pdfFiles.length} PDF, missing current ${curMissingPdf.length}`,
  `F peers: ${peerReport.map((p) => `${p.dir}(data=${p.dataFiles})`).join('; ')}`,
  `findings: high=${sevCount.high} mid=${sevCount.mid} low=${sevCount.low}`,
];
console.log(lines.join('\n'));
