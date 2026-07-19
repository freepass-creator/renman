/**
 * 스위치플랜 마이그레이션 전수 검수 (읽기 전용 · 수정 없음)
 * 출력: scripts/audit-full.result.json
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ROOT = 'C:\\dev\\jpkerp6-마이그레이션';
const SP = path.join(ROOT, 'switchplan_스위치플랜');
const APP = path.join(__dirname, '..');
const FROZEN = path.join(APP, 'lib', 'migrate', 'switchplan-data.json');
const DOC_AUDIT = path.join(APP, 'lib', 'migrate', 'contract-doc-audit.json');

const normPlate = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
const cellStr = (v) => {
  if (v == null) return '';
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, '0'), d = String(v.getDate()).padStart(2, '0');
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
const plateInName = (name) => {
  const m = String(name).match(/(\d{2,3}[가-힣]\d{4}|[가-힣]{1,4}\d{2}[가-힣]\d{4})/g);
  return m ? m.map(normPlate) : [];
};
const won = (n) => Math.round(n || 0).toLocaleString('ko-KR');

const findings = [];
function push(sev, area, kind, detail, samples = [], n) {
  findings.push({ sev, area, kind, detail, n: n ?? samples.length, samples: samples.slice(0, 15) });
}

function matrix(wb, name) {
  const sh = wb.Sheets[name];
  if (!sh) return null;
  return XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', raw: true });
}
function hdrIndex(row) {
  const m = new Map();
  (row || []).forEach((h, i) => { const k = cellStr(h); if (k && !m.has(k)) m.set(k, i); });
  return m;
}
function col(idx, ...names) {
  for (const n of names) if (idx.has(n)) return idx.get(n);
  return -1;
}
function listFiles(dir, extRe) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (!extRe || extRe.test(ent.name)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

// ── companies inventory ──
const companies = {};
for (const name of fs.readdirSync(ROOT)) {
  const p = path.join(ROOT, name);
  if (!fs.statSync(p).isDirectory()) continue;
  const files = listFiles(p);
  companies[name] = {
    files: files.length,
    xlsx: files.filter((f) => /\.xlsx?$/i.test(f)).length,
    pdf: files.filter((f) => /\.pdf$/i.test(f)).length,
    bytes: files.reduce((s, f) => s + fs.statSync(f).size, 0),
  };
}

// ── load workbooks ──
const bizWb = XLSX.read(fs.readFileSync(path.join(SP, '사업현황.xlsx')), { type: 'buffer', cellDates: true });
const jboWb = XLSX.read(fs.readFileSync(path.join(SP, '자금일보.xlsx')), { type: 'buffer', cellDates: true });
const debtPath = path.join(SP, '채권현황.xlsx');
const debtWb = fs.existsSync(debtPath) ? XLSX.read(fs.readFileSync(debtPath), { type: 'buffer', cellDates: true }) : null;
const frozen = JSON.parse(fs.readFileSync(FROZEN, 'utf8'));
const docAudit = fs.existsSync(DOC_AUDIT) ? JSON.parse(fs.readFileSync(DOC_AUDIT, 'utf8')) : [];

// official live parser if available
let live = null;
try {
  // dynamic via child - skip; use light parse below + optional require of precomputed
  const pre = path.join(__dirname, 'audit-live-totals.result.json');
  if (fs.existsSync(pre)) live = JSON.parse(fs.readFileSync(pre, 'utf8'));
} catch (_) {}

// ── 자산 ──
const assetM = matrix(bizWb, '자산');
const aHdr = hdrIndex(assetM[0]);
const iAp = col(aHdr, '차량번호');
const iAu = col(aHdr, '구분');
const iVin = col(aHdr, '차대번호');
const iFirst = col(aHdr, '최초등록일');
const assets = [];
for (let r = 1; r < assetM.length; r++) {
  const plate = cellStr(assetM[r][iAp]);
  if (!plate) continue;
  assets.push({
    plate, np: normPlate(plate), usage: cellStr(assetM[r][iAu]),
    vin: cellStr(assetM[r][iVin]), firstReg: cellStr(assetM[r][iFirst]),
  });
}
const assetSet = new Set(assets.map((a) => a.np));
const vinMap = new Map();
for (const a of assets) {
  if (!a.vin) continue;
  if (!vinMap.has(a.vin)) vinMap.set(a.vin, []);
  vinMap.get(a.vin).push(a.plate);
}
const vinDup = [...vinMap.entries()].filter(([, ps]) => new Set(ps.map(normPlate)).size > 1);
if (vinDup.length) push('high', '자산', 'VIN중복', `${vinDup.length}건`, vinDup.map(([v, ps]) => `${v}:${ps.join(',')}`));

// ── 채권/반납 light (named rows + plates) ──
function ledgerPlates(sheet, hasMonthRow) {
  const m = matrix(bizWb, sheet);
  if (!m) return { plates: [], named: [], warnings: [`no ${sheet}`] };
  const hr = hasMonthRow ? 1 : 0;
  const idx = hdrIndex(m[hr]);
  const ip = col(idx, '차량번호');
  const iname = col(idx, '코드명');
  const irent = col(idx, '대여료');
  const idep = col(idx, '보증금');
  const ist = col(idx, '시작');
  const ien = col(idx, '종료');
  const plates = [];
  const named = [];
  if (ip < 0) return { plates: [], named: [], warnings: [`${sheet} header fail`] };
  for (let r = hr + 1; r < m.length; r++) {
    const plate = cellStr(m[r][ip]);
    if (!plate) continue;
    const np = normPlate(plate);
    plates.push(np);
    const name = cellStr(m[r][iname]);
    if (!name) continue;
    const start = cellStr(m[r][ist]);
    const end = cellStr(m[r][ien]);
    named.push({ plate, np, name, rent: cellNum(m[r][irent]), deposit: cellNum(m[r][idep]), start, end });
  }
  return { plates: [...new Set(plates)], named, warnings: [] };
}
const curL = ledgerPlates('채권', true);
const retL = ledgerPlates('반납', false);
const activeSet = new Set(curL.plates);
const namedCur = curL.named;
const namedRet = retL.named;
const contractPlates = new Set([...namedCur, ...namedRet].map((c) => c.np));

const ghost = [...contractPlates].filter((p) => !assetSet.has(p));
if (ghost.length) push('high', '교차', 'plate고아', `계약 plate∉자산 ${ghost.length}`, ghost);

const dateBad = namedCur.filter((c) => c.start && c.end && /^\d{4}/.test(c.end) && c.end < c.start);
const date1930 = namedCur.filter((c) => /1930/.test(c.end));
if (date1930.length) push('high', '채권', '날짜1930', `종료일 1930 오염 ${date1930.length}`, date1930.map((c) => `${c.plate} ${c.end}`));
else if (dateBad.length) push('high', '채권', '날짜역전', `${dateBad.length}`, dateBad.map((c) => `${c.plate}`));

const zeroRent = namedCur.filter((c) => !c.rent);
if (zeroRent.length) push('mid', '채권', '대여료0', `${zeroRent.length}`, zeroRent.map((c) => `${c.plate} ${c.name}`));

// ── 고객 ──
const custSheet = bizWb.Sheets['고객(기준)'] ? '고객(기준)' : '고객';
const custM = matrix(bizWb, custSheet) || [];
const cIdx = hdrIndex(custM[0]);
const customers = [];
for (let r = 1; r < custM.length; r++) {
  const plate = cellStr(custM[r][col(cIdx, '차량번호')]);
  const name = cellStr(custM[r][col(cIdx, '코드명')]);
  if (!plate && !name) continue;
  customers.push({
    np: normPlate(plate), name,
    phone: cellStr(custM[r][col(cIdx, '본인연락처', '연락처')]),
    ident: cellStr(custM[r][col(cIdx, '주민/법인번호')]),
  });
}
const custPN = new Set(customers.map((c) => `${c.np}|${c.name}`));
const joinMiss = namedCur.filter((c) => !custPN.has(`${c.np}|${c.name}`));
if (joinMiss.length) push('mid', '고객', '조인실패', `${joinMiss.length}/${namedCur.length}`, joinMiss.map((c) => `${c.plate}·${c.name}`));

// ── 상환합계 ──
const loanM = matrix(bizWb, '상환합계') || [];
let lhr = 0;
if (col(hdrIndex(loanM[0]), '차량번호') < 0) lhr = 1;
const lIdx = hdrIndex(loanM[lhr]);
const loans = [];
for (let r = lhr + 1; r < loanM.length; r++) {
  const plate = cellStr(loanM[r][col(lIdx, '차량번호')]);
  if (!plate) continue;
  loans.push(normPlate(plate));
}
const loanOrphan = [...new Set(loans)].filter((p) => !assetSet.has(p));
if (loanOrphan.length) push('mid', '상환', 'loan고아', `${loanOrphan.length}`, loanOrphan);

// ── unused sheets ──
const used = new Set(['자산', '채권', '반납', '상환합계', '고객(기준)', '고객']);
const unused = bizWb.SheetNames.filter((s) => !used.has(s));
push('mid', '사업현황', '미파싱시트', unused.join(', '), unused, unused.length);

// ── 자금일보 ──
const bank = [];
for (const sn of jboWb.SheetNames) {
  if (sn === '차량 데이터') continue;
  const m = matrix(jboWb, sn);
  let hr = -1;
  for (let r = 0; r < Math.min(5, m.length); r++) if (m[r].some((c) => cellStr(c) === '계정과목')) { hr = r; break; }
  if (hr < 0) continue;
  const idx = hdrIndex(m[hr]);
  const iIn = col(idx, '입금액'), iOut = col(idx, '출금액'), iCat = col(idx, '계정과목');
  const iP = col(idx, '차량번호');
  for (let r = hr + 1; r < m.length; r++) {
    const inn = cellNum(m[r][iIn]), out = cellNum(m[r][iOut]);
    if (!inn && !out) continue;
    bank.push({ account: sn, in: inn, out, cat: cellStr(m[r][iCat]) || '(미분류)', np: normPlate(m[r][iP]) });
  }
}
const unclass = bank.filter((b) => b.in > 0 && b.cat === '(미분류)');
if (unclass.length) push('low', '자금', '미분류입금', `${unclass.length} / ${won(unclass.reduce((s, b) => s + b.in, 0))}`);
const bankGhost = [...new Set(bank.map((b) => b.np).filter(Boolean))].filter((p) => !assetSet.has(p) && p !== '자금이동');
if (bankGhost.length) push('low', '자금', 'plate고아', `${bankGhost.length}`, bankGhost);

// ── 채권현황 vs 사업현황 ──
let debtCmp = null;
if (debtWb) {
  const dm = matrix(debtWb, '채권');
  const dhr = dm && col(hdrIndex(dm[0]), '차량번호') >= 0 ? 0 : 1;
  const didx = hdrIndex(dm[dhr]);
  const dip = col(didx, '차량번호');
  const dPlates = new Set();
  for (let r = dhr + 1; r < dm.length; r++) {
    const p = cellStr(dm[r][dip]);
    if (p) dPlates.add(normPlate(p));
  }
  const onlyDebt = [...dPlates].filter((p) => !activeSet.has(p));
  const onlyBiz = [...activeSet].filter((p) => !dPlates.has(p));
  debtCmp = {
    sheets: debtWb.SheetNames,
    debtPlates: dPlates.size,
    bizActive: activeSet.size,
    onlyInDebt: onlyDebt.length,
    onlyInBiz: onlyBiz.length,
    onlyDebtSamples: onlyDebt.slice(0, 12),
    onlyBizSamples: onlyBiz.slice(0, 12),
  };
  if (onlyDebt.length) push('mid', '채권현황', '사업현황보다최신', `채권현황 only +${onlyDebt.length}`, onlyDebt);
  if (onlyBiz.length) push('mid', '채권현황', '사업현황만있음', `사업현황 only ${onlyBiz.length}`, onlyBiz);
}

// ── 계약서 PDF ──
const contractPdfs = listFiles(path.join(SP, '계약서'), /\.pdf$/i);
const pdfPlateSet = new Set();
let nameFirst = 0;
for (const f of contractPdfs) {
  const base = path.basename(f);
  const plates = plateInName(base);
  if (!plates.length) continue;
  const starts = normPlate(base).startsWith(plates[0]) || /^\d{2,3}[가-힣]/.test(base);
  if (!starts && plates.length) nameFirst += 1;
  plates.forEach((p) => pdfPlateSet.add(p));
}
const missingContract = [...activeSet].filter((p) => !pdfPlateSet.has(p));
if (missingContract.length) push('mid', '계약서', 'PDF누락', `활성 대비 ${missingContract.length}/${activeSet.size}`, missingContract);
if (nameFirst) push('info', '계약서', '이름앞파일명', `${nameFirst}건 (plate 중간 매칭 필요)`);

// ── 등록증 ──
const regPdfs = listFiles(path.join(SP, '자동차등록증'), /\.pdf$/i);
const regSet = new Set();
for (const f of regPdfs) plateInName(path.basename(f)).forEach((p) => regSet.add(p));
const missingReg = [...assetSet].filter((p) => !regSet.has(p));
const extraReg = [...regSet].filter((p) => !assetSet.has(p));
if (missingReg.length) push('mid', '등록증', 'PDF누락', `자산 대비 ${missingReg.length}/${assetSet.size}`, missingReg);
if (extraReg.length) push('low', '등록증', '잉여PDF', `${extraReg.length}`, extraReg);

// ── 보험 xlsx ──
const insDir = path.join(SP, '보험증권');
const insXlsx = listFiles(insDir, /보험증권_128건.*\.xlsx$/i).filter((f) => !/\(1\)/.test(f));
let insPlates = new Set();
let insRows = 0;
let insHeaders = [];
if (insXlsx.length) {
  const iwb = XLSX.read(fs.readFileSync(insXlsx[0]), { type: 'buffer', cellDates: true });
  const sn = iwb.SheetNames[0];
  const im = matrix(iwb, sn);
  const ih = hdrIndex(im[0]);
  insHeaders = [...ih.keys()];
  const ip = col(ih, '차량번호');
  for (let r = 1; r < im.length; r++) {
    const p = cellStr(im[r][ip]);
    if (!p) continue;
    insRows += 1;
    insPlates.add(normPlate(p));
  }
}
const frozenIns = (frozen.insurance || []).map((i) => normPlate(i.plate));
const frozenInsSet = new Set(frozenIns);
const xlsxOnly = [...insPlates].filter((p) => !frozenInsSet.has(p));
const frozenOnly = frozenIns.filter((p) => !insPlates.has(p));
const activeNoIns = [...activeSet].filter((p) => !insPlates.has(p));
const assetNoIns = [...assetSet].filter((p) => !insPlates.has(p));
if (xlsxOnly.length) push('mid', '보험', 'xlsx>동결', `+${xlsxOnly.length}`, xlsxOnly);
if (frozenOnly.length) push('mid', '보험', '동결>xlsx', `${frozenOnly.length}`, frozenOnly);
if (activeNoIns.length) push('high', '보험', '활성무보험xlsx', `${activeNoIns.length}`, activeNoIns);
else push('info', '보험', '활성커버', `활성 ${activeSet.size}대 전원 보험xlsx 존재`);
if (assetNoIns.length) push('low', '보험', '자산미커버', `${assetNoIns.length} (매각·해지 후보)`, assetNoIns.slice(0, 15));

const dbPdfs = listFiles(path.join(insDir, 'DB보험증권'), /\.pdf$/i);
const haesi = dbPdfs.filter((f) => /\(해지\)/.test(path.basename(f)));
const dbPlateSet = new Set();
for (const f of dbPdfs) plateInName(path.basename(f).replace(/\(해지\)/g, '')).forEach((p) => dbPlateSet.add(p));
const xlsxNoPdf = [...insPlates].filter((p) => !dbPlateSet.has(p));
if (xlsxNoPdf.length) push('mid', '보험', 'xlsx무PDF', `${xlsxNoPdf.length}`, xlsxNoPdf);
if (haesi.length) push('info', '보험', '해지PDF', `${haesi.length}/${dbPdfs.length}`);

// ── 계좌_CMS ──
const cmsDir = path.join(SP, '계좌_CMS');
const cmsFiles = listFiles(cmsDir, /\.xlsx$/i).map((f) => {
  const wb = XLSX.read(fs.readFileSync(f), { type: 'buffer', cellDates: true });
  const sn = wb.SheetNames[0];
  const m = matrix(wb, sn) || [];
  return { file: path.basename(f), sheets: wb.SheetNames, rows: Math.max(0, m.length - 1) };
});
push('info', 'CMS', '파일목록', cmsFiles.map((c) => `${c.file}:${c.rows}행`).join(' · '), [], cmsFiles.length);

// ── frozen vs live dims ──
const frozenSum = {
  asOf: frozen.asOf,
  vehicles: (frozen.vehicles || []).length,
  contracts: (frozen.contracts || []).length,
  current: (frozen.contracts || []).filter((c) => c._kind === 'current').length,
  returned: (frozen.contracts || []).filter((c) => c._kind === 'returned').length,
  bankTx: (frozen.bankTx || []).length,
  insurance: (frozen.insurance || []).length,
  carry: (frozen.contracts || []).reduce((s, c) => s + (Number(c._carry) || 0), 0),
};
if (frozenSum.vehicles !== assets.length) {
  push('high', '경로', '차량수불일치', `동결 ${frozenSum.vehicles} ≠ 자산 ${assets.length}`);
}
if (frozenSum.insurance && true) {
  push('high', '경로', '보험동결전용', `라이브 파서 insurance 미생성 · 동결 ${frozenSum.insurance} · xlsx ${insRows}`);
}
if (Math.abs(frozenSum.bankTx - bank.length) > 50) {
  push('mid', '경로', '자금건수', `동결 ${frozenSum.bankTx} ≠ 자금일보 ${bank.length}`);
}
if (live?.live) {
  const dCarry = live.live.carrySum - frozenSum.carry;
  if (Math.abs(dCarry) > 1000) push('high', '경로', 'carry괴리', `라이브 ${won(live.live.carrySum)} vs 동결 ${won(frozenSum.carry)} (Δ ${won(dCarry)})`);
  if (live.live.contractsByKind?.returned !== frozenSum.returned) {
    push('mid', '경로', '반납건수', `라이브 ${live.live.contractsByKind.returned} vs 동결 ${frozenSum.returned}`);
  }
}

// ── doc audit stale ──
if (Array.isArray(docAudit) && docAudit.length) {
  const by = {};
  for (const it of docAudit) by[it.kind || '?'] = (by[it.kind || '?'] || 0) + 1;
  push('mid', '동결감사', 'contract-doc-audit', `${docAudit.length}건 ${JSON.stringify(by)} — 재생성 스크립트 없음`);
}

// ── other companies ──
if ((companies['prime_프라임구독']?.files || 0) === 0) push('low', '법인', '프라임대기', '폴더 비어 있음');
const sono = companies['sonogong_손오공렌터카'];
if (sono && sono.xlsx === 0) push('low', '법인', '손오공부분', `파일 ${sono.files} · PDF ${sono.pdf} · 사업현황/자금 없음`);

// ── sample PDF text layer note from prior results ──
const prior = path.join(__dirname, 'pdf-crosscheck.result.json');
let pdfSample = null;
if (fs.existsSync(prior)) {
  pdfSample = JSON.parse(fs.readFileSync(prior, 'utf8'));
  const dateOff = (pdfSample.contracts || []).filter((c) => c.dateMatch && (!c.dateMatch.startEq || !c.dateMatch.endEq));
  if (dateOff.length) push('mid', 'PDF샘플', '계약날짜±1일', `${dateOff.length}/3 샘플 PDF↔채권 날짜 불일치 (오프바이원 패턴)`);
  const insOk = (pdfSample.insurance || []).every((i) => i.match?.policyEq);
  if (insOk) push('info', 'PDF샘플', '보험일치', '샘플 2건 증권번호·기간 = 보험xlsx');
  // frozen insurance vs PDF for 01도9893
  const f01 = (frozen.insurance || []).find((i) => normPlate(i.plate) === normPlate('01도9893'));
  const p01 = (pdfSample.insurance || []).find((i) => normPlate(i.parsed?.plate) === normPlate('01도9893'));
  if (f01 && p01 && String(f01.policyNo || f01.policy_no || '') !== String(p01.parsed.policyNo || '')) {
    push('high', '보험', '동결≠PDF', `01도9893 동결 ${f01.insurer || f01.policyNo} vs PDF ${p01.parsed.insurer} ${p01.parsed.policyNo}`);
  }
}

const sevCount = { high: 0, mid: 0, low: 0, info: 0 };
for (const f of findings) sevCount[f.sev] = (sevCount[f.sev] || 0) + 1;

const out = {
  generatedAt: new Date().toISOString(),
  mode: 'read-only-audit',
  root: ROOT,
  companies,
  dims: {
    assets: assets.length,
    activePlates: activeSet.size,
    namedCurrent: namedCur.length,
    namedReturned: namedRet.length,
    loans: new Set(loans).size,
    customers: customers.length,
    bankTx: bank.length,
    bankIn: bank.reduce((s, b) => s + b.in, 0),
    bankOut: bank.reduce((s, b) => s + b.out, 0),
    contractPdfs: contractPdfs.length,
    regPdfs: regPdfs.length,
    insuranceXlsxRows: insRows,
    insuranceXlsxPlates: insPlates.size,
    dbInsurancePdfs: dbPdfs.length,
    haesiPdfs: haesi.length,
    bizSheets: bizWb.SheetNames,
    unusedSheets: unused,
    cmsFiles,
    debtCmp,
    frozen: frozenSum,
    live: live?.live ? {
      asOf: live.live.asOf,
      carrySum: live.live.carrySum,
      contracts: live.live.contractCount,
      current: live.live.contractsByKind?.current,
      returned: live.live.contractsByKind?.returned,
      vehicles: live.live.vehicleCount,
      active: live.live.activePlatesLength,
    } : null,
  },
  sevCount,
  findings: findings.sort((a, b) => ({ high: 0, mid: 1, low: 2, info: 3 }[a.sev]) - ({ high: 0, mid: 1, low: 2, info: 3 }[b.sev])),
  missingContract,
  missingReg: missingReg.slice(0, 40),
  xlsxOnlyIns: xlsxOnly,
};

const outPath = path.join(__dirname, 'audit-full.result.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify({
  ok: true,
  outPath,
  sevCount,
  dims: {
    assets: out.dims.assets,
    active: out.dims.activePlates,
    contractsPdf: out.dims.contractPdfs,
    missingContract: missingContract.length,
    missingReg: missingReg.length,
    insXlsx: insRows,
    frozenCarry: frozenSum.carry,
    liveCarry: out.dims.live?.carrySum,
    findings: findings.length,
  },
}, null, 2));
