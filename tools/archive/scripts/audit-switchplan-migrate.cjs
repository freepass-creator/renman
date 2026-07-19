/**
 * 스위치플랜 마이그레이션 원천 정합성 감사 (크로스)
 * 대상: C:\dev\jpkerp6-마이그레이션\switchplan_스위치플랜
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ROOT = process.env.MIGRATE_ROOT || 'C:\\dev\\jpkerp6-마이그레이션\\switchplan_스위치플랜';
const BIZ = path.join(ROOT, '사업현황.xlsx');
const JBO = path.join(ROOT, '자금일보.xlsx');
const PDF_DIR = path.join(ROOT, '계약서');
const FROZEN = path.join(__dirname, '..', 'lib', 'migrate', 'switchplan-data.json');
const AUDIT_DOC = path.join(__dirname, '..', 'lib', 'migrate', 'contract-doc-audit.json');

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

function sheetMatrix(wb, name) {
  const sh = wb.Sheets[name];
  if (!sh) return null;
  return XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', raw: true });
}

function headerIndex(row) {
  const m = new Map();
  row.forEach((h, i) => {
    const k = cellStr(h);
    if (k && !m.has(k)) m.set(k, i);
  });
  return m;
}

function findCol(idx, ...names) {
  for (const n of names) if (idx.has(n)) return idx.get(n);
  return -1;
}

function setOf(arr) { return new Set(arr.filter(Boolean)); }
function onlyIn(a, b) { return [...a].filter((x) => !b.has(x)); }
function won(n) { return Math.round(n || 0).toLocaleString('ko-KR'); }

const findings = []; // { sev, kind, detail, n?, samples? }
function push(sev, kind, detail, samples = [], n) {
  findings.push({ sev, kind, detail, n: n ?? samples.length, samples: samples.slice(0, 12) });
}

// ── load files ──
if (!fs.existsSync(BIZ)) { console.error('MISSING', BIZ); process.exit(1); }
if (!fs.existsSync(JBO)) { console.error('MISSING', JBO); process.exit(1); }

const bizWb = XLSX.read(fs.readFileSync(BIZ), { type: 'buffer', cellDates: true });
const jboWb = XLSX.read(fs.readFileSync(JBO), { type: 'buffer', cellDates: true });
const frozen = JSON.parse(fs.readFileSync(FROZEN, 'utf8'));
const docAudit = fs.existsSync(AUDIT_DOC) ? JSON.parse(fs.readFileSync(AUDIT_DOC, 'utf8')) : [];

const sheetNames = bizWb.SheetNames;
const inventory = {
  root: ROOT,
  bizSheets: sheetNames,
  jboSheets: jboWb.SheetNames,
  pdfCount: fs.existsSync(PDF_DIR) ? fs.readdirSync(PDF_DIR).filter((f) => /\.pdf$/i.test(f)).length : 0,
  otherDirs: fs.readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name),
  otherFiles: fs.readdirSync(ROOT).filter((f) => /\.(xlsx|xls|csv)$/i.test(f)),
};

// ── 자산 ──
const assetM = sheetMatrix(bizWb, '자산');
const assetHdr = headerIndex(assetM[0] || []);
const cPlateA = findCol(assetHdr, '차량번호');
const cUsage = findCol(assetHdr, '구분');
const cVin = findCol(assetHdr, '차대번호');
const assets = [];
const assetPlates = [];
const vinDup = new Map();
for (let r = 1; r < assetM.length; r++) {
  const row = assetM[r];
  const plate = cellStr(row[cPlateA]);
  if (!plate) continue;
  const np = normPlate(plate);
  assets.push({ plate, np, usage: cellStr(row[cUsage]), vin: cellStr(row[cVin]) });
  assetPlates.push(np);
  if (row[cVin]) {
    const v = cellStr(row[cVin]);
    if (!vinDup.has(v)) vinDup.set(v, []);
    vinDup.get(v).push(plate);
  }
}
const assetSet = setOf(assetPlates);
const dupPlatesAsset = [...assetSet].filter((p) => assetPlates.filter((x) => x === p).length > 1);

// ── 채권 / 반납 (간단: 차량번호·코드명·보증금·대여료·carry 마지막 미수 컬럼) ──
function parseLedger(name, hasMonthRow) {
  const m = sheetMatrix(bizWb, name);
  if (!m) return { rows: [], plates: [], warnings: [`시트 없음: ${name}`] };
  const hdrRow = hasMonthRow ? 1 : 0;
  const hdr = headerIndex(m[hdrRow] || []);
  const iPlate = findCol(hdr, '차량번호');
  const iName = findCol(hdr, '코드명');
  const iRent = findCol(hdr, '대여료');
  const iDep = findCol(hdr, '보증금');
  const iStart = findCol(hdr, '시작');
  const iEnd = findCol(hdr, '종료');
  const iBill = findCol(hdr, '청구금액');
  if (iPlate < 0 || iBill < 0) return { rows: [], plates: [], warnings: [`${name}: 헤더 인식 실패`] };

  // ledger blocks of 5 from 청구금액
  const blocks = [];
  for (let c = iBill; c + 4 < (m[hdrRow] || []).length; c += 5) {
    const h0 = cellStr(m[hdrRow][c]);
    if (!/청구/.test(h0) && blocks.length) break;
    if (!/청구/.test(h0) && !blocks.length) continue;
    blocks.push(c);
  }

  const rows = [];
  const platesAll = [];
  const seen = new Set();
  for (let r = hdrRow + 1; r < m.length; r++) {
    const row = m[r];
    const plate = cellStr(row[iPlate]);
    if (!plate) continue;
    const name = cellStr(row[iName]);
    const np = normPlate(plate);
    platesAll.push(np);

    // last non-empty carry (col+4) among due-ish blocks
    let carry = 0, lastCarryCol = -1, billed = 0, paid = 0, months = 0;
    for (const c of blocks) {
      const bill = cellNum(row[c]);
      const pay = cellNum(row[c + 1]);
      const bal = cellNum(row[c + 4]);
      if (bill || pay || bal || cellStr(row[c + 2])) {
        months += 1;
        billed += bill;
        paid += pay;
        if (row[c + 4] !== '' && row[c + 4] != null) { carry = bal; lastCarryCol = c; }
      }
    }
    const sig = `${np}|${name}|${billed}|${paid}|${carry}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    if (!name) continue; // nameless → active plate only
    rows.push({
      plate, np, name,
      rent: cellNum(row[iRent]),
      deposit: cellNum(row[iDep]),
      start: cellStr(row[iStart]),
      end: cellStr(row[iEnd]),
      carry, billed, paid, months,
      gross: Math.max(0, billed - paid),
    });
  }
  return { rows, plates: [...new Set(platesAll)], platesAll, warnings: [] };
}

const cur = parseLedger('채권', true);
const ret = parseLedger('반납', false);
const activePlateSet = setOf(cur.plates);
const currentNamed = cur.rows;
const returnedNamed = ret.rows;

// ── 상환합계 ──
const loanM = sheetMatrix(bizWb, '상환합계');
const loanHdr = headerIndex((loanM[0] && /차량번호/.test(cellStr(loanM[0][0])) ? loanM[0] : loanM[1]) || []);
// try row0 then row1
let loanHeaderRow = 0;
if (findCol(headerIndex(loanM[0] || []), '차량번호') < 0) loanHeaderRow = 1;
const loanIdx = headerIndex(loanM[loanHeaderRow] || []);
const iLp = findCol(loanIdx, '차량번호');
const loans = [];
for (let r = loanHeaderRow + 1; r < (loanM || []).length; r++) {
  const plate = cellStr(loanM[r][iLp]);
  if (!plate) continue;
  loans.push({ plate, np: normPlate(plate) });
}
const loanSet = setOf(loans.map((l) => l.np));

// ── 고객(기준) ──
const custSheet = bizWb.Sheets['고객(기준)'] ? '고객(기준)' : (bizWb.Sheets['고객'] ? '고객' : null);
const custM = custSheet ? sheetMatrix(bizWb, custSheet) : [];
const custHdr = headerIndex(custM[0] || []);
const iCp = findCol(custHdr, '차량번호');
const iCn = findCol(custHdr, '코드명');
const iCid = findCol(custHdr, '주민/법인번호');
const iCph = findCol(custHdr, '본인연락처', '연락처');
const customers = [];
for (let r = 1; r < custM.length; r++) {
  const plate = cellStr(custM[r][iCp]);
  const name = cellStr(custM[r][iCn]);
  if (!plate && !name) continue;
  customers.push({
    plate, np: normPlate(plate), name,
    ident: cellStr(custM[r][iCid]),
    phone: cellStr(custM[r][iCph]),
  });
}
const custPlateSet = setOf(customers.map((c) => c.np).filter(Boolean));

// ── 자금일보 ──
const bankRows = [];
for (const sn of jboWb.SheetNames) {
  if (sn === '차량 데이터') continue;
  const m = sheetMatrix(jboWb, sn);
  let hdrR = -1;
  for (let r = 0; r < Math.min(5, m.length); r++) {
    if (m[r].some((c) => cellStr(c) === '계정과목')) { hdrR = r; break; }
  }
  if (hdrR < 0) continue;
  const idx = headerIndex(m[hdrR]);
  const iIn = findCol(idx, '입금액');
  const iOut = findCol(idx, '출금액');
  const iCat = findCol(idx, '계정과목');
  const iP = findCol(idx, '차량번호');
  const iR = findCol(idx, '임차인');
  const iParty = findCol(idx, '내용');
  const iMemo = findCol(idx, '적요');
  const iDate = findCol(idx, '거래일시');
  for (let r = hdrR + 1; r < m.length; r++) {
    const inn = cellNum(m[r][iIn]);
    const out = cellNum(m[r][iOut]);
    if (!inn && !out) continue;
    bankRows.push({
      account: sn,
      in: inn, out,
      cat: cellStr(m[r][iCat]) || '(미분류)',
      plate: cellStr(m[r][iP]),
      np: normPlate(m[r][iP]),
      renter: cellStr(m[r][iR]),
      party: cellStr(m[r][iParty]) || cellStr(m[r][iMemo]),
      date: cellStr(m[r][iDate]),
    });
  }
}

// ── PDF plates ──
const pdfFiles = fs.existsSync(PDF_DIR) ? fs.readdirSync(PDF_DIR).filter((f) => /\.pdf$/i.test(f)) : [];
const pdfPlates = [];
for (const f of pdfFiles) {
  // filename starts with plate like 12가3456 or 서울12가3456
  const m = f.match(/^([0-9]{2,3}[가-힣][0-9]{4}|[가-힣]{2,4}[0-9]{2}[가-힣][0-9]{4})/);
  if (m) pdfPlates.push(normPlate(m[1]));
  else {
    // fallback: first token
    const t = f.split(/[\s_]/)[0];
    if (/[가-힣]/.test(t) && /\d/.test(t)) pdfPlates.push(normPlate(t));
  }
}
const pdfSet = setOf(pdfPlates);

// ── Cross checks ──
const summary = {
  asset: assets.length,
  assetUnique: assetSet.size,
  activePlates: activePlateSet.size,
  currentContracts: currentNamed.length,
  returnedContracts: returnedNamed.length,
  loans: loans.length,
  customers: customers.length,
  bankTx: bankRows.length,
  pdfs: pdfFiles.length,
  frozen: {
    asOf: frozen.asOf,
    vehicles: (frozen.vehicles || []).length,
    contracts: (frozen.contracts || []).length,
    bankTx: (frozen.bankTx || []).length,
    insurance: (frozen.insurance || []).length,
    carrySum: (frozen.contracts || []).reduce((s, c) => s + (c._carry || 0), 0),
  },
};

const carryCurrent = currentNamed.reduce((s, c) => s + c.carry, 0);
const carryReturned = returnedNamed.reduce((s, c) => s + c.carry, 0);
const grossCurrent = currentNamed.reduce((s, c) => s + c.gross, 0);
summary.carryCurrent = carryCurrent;
summary.carryReturned = carryReturned;
summary.grossCurrent = grossCurrent;
summary.carryLive = carryCurrent + carryReturned;

// A. plate orphans
const contractPlates = setOf([...currentNamed, ...returnedNamed].map((c) => c.np));
const ghostContracts = onlyIn(contractPlates, assetSet);
const idleAssets = onlyIn(assetSet, new Set([...activePlateSet, ...contractPlates]));
const loanOrphans = onlyIn(loanSet, assetSet);
const activeNotInAsset = onlyIn(activePlateSet, assetSet);

if (ghostContracts.length) push('high', 'plate고아', `계약 plate가 자산에 없음 ${ghostContracts.length}건`, ghostContracts);
if (activeNotInAsset.length) push('high', 'plate고아', `채권 활성 plate가 자산에 없음 ${activeNotInAsset.length}건`, activeNotInAsset);
if (loanOrphans.length) push('mid', 'loan고아', `상환합계 plate가 자산에 없음 ${loanOrphans.length}건`, loanOrphans);

// active but sold? usage check
const soldButActive = assets.filter((a) => activePlateSet.has(a.np) && /매각|처분/.test(a.usage)).map((a) => a.plate);
if (soldButActive.length) push('high', '상태충돌', `자산 구분이 매각/처분인데 채권 활성 ${soldButActive.length}건`, soldButActive);

// B. frozen vs live
const frozenVeh = (frozen.vehicles || []).length;
const frozenCon = (frozen.contracts || []).length;
const frozenBank = (frozen.bankTx || []).length;
if (frozenVeh !== assets.length) {
  push('high', '경로불일치', `동결 JSON 차량 ${frozenVeh} ≠ 자산시트 ${assets.length} (라이브 파서는 자산 전체 유지 의도)`, [], Math.abs(frozenVeh - assets.length));
}
const liveCon = currentNamed.length + returnedNamed.length;
if (Math.abs(frozenCon - liveCon) > 5) {
  push('mid', '경로불일치', `동결 계약 ${frozenCon} vs 라이브 명명계약≈${liveCon} (파서 중복제거·무명행 차이 가능)`, [], Math.abs(frozenCon - liveCon));
}
if (Math.abs(frozenBank - bankRows.length) > 50) {
  push('mid', '경로불일치', `동결 bankTx ${frozenBank} ≠ 자금일보 ${bankRows.length}`, [], Math.abs(frozenBank - bankRows.length));
}
const frozenCarry = summary.frozen.carrySum;
const carryDelta = frozenCarry - summary.carryLive;
if (Math.abs(carryDelta) > 10000) {
  push('high', '미수괴리', `동결 Σcarry ${won(frozenCarry)} vs 라이브 시트 Σcarry ${won(summary.carryLive)} (Δ ${won(carryDelta)})`, [], 1);
}

// C. carry vs gross per contract (current)
const diverge = currentNamed
  .map((c) => ({ ...c, diff: c.carry - c.gross }))
  .filter((c) => Math.abs(c.diff) > 1000)
  .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
if (diverge.length) {
  push('mid', 'carry≠gross', `운행 계약 carry≠gross(±1천) ${diverge.length}건 — 묶음결제·선청구·정산 잔여`, diverge.slice(0, 8).map((c) => `${c.plate} ${c.name} carry=${won(c.carry)} gross=${won(c.gross)}`), diverge.length);
}

// D. customer join miss
const custByPlateName = new Set(customers.map((c) => `${c.np}|${c.name}`));
const joinMiss = currentNamed.filter((c) => !custByPlateName.has(`${c.np}|${c.name}`));
if (joinMiss.length) {
  push('mid', '고객조인실패', `채권 코드명↔고객(기준) 미매칭 ${joinMiss.length}/${currentNamed.length}`, joinMiss.slice(0, 10).map((c) => `${c.plate}·${c.name}`), joinMiss.length);
}
const noPhone = customers.filter((c) => !c.phone).length;
const noIdent = customers.filter((c) => !c.ident).length;
if (noPhone) push('low', '고객결손', `고객 연락처 공란 ${noPhone}건`, [], noPhone);
if (noIdent) push('low', '고객결손', `고객 주민/법인번호 공란 ${noIdent}건`, [], noIdent);

// E. PDF coverage vs current contracts
const currentPlateSet = setOf(currentNamed.map((c) => c.np));
const pdfMissing = onlyIn(currentPlateSet, pdfSet);
const pdfExtra = onlyIn(pdfSet, new Set([...currentPlateSet, ...setOf(returnedNamed.map((c) => c.np))]));
if (pdfMissing.length) push('mid', '계약서누락', `운행 계약 plate에 PDF 없음 ${pdfMissing.length}건`, pdfMissing, pdfMissing.length);
if (pdfExtra.length) push('low', '계약서잉여', `PDF 있는데 채권/반납 명명계약에 없음 ${pdfExtra.length}건`, pdfExtra, pdfExtra.length);

// F. bank vs ledger payments (이름·plate 느슨 매칭)
const rentCats = bankRows.filter((b) => b.in > 0 && /대여료|렌트|입금/.test(b.cat + b.party));
const depositBank = bankRows.filter((b) => b.in > 0 && /보증금/.test(b.cat));
const unclassIn = bankRows.filter((b) => b.in > 0 && (b.cat === '(미분류)' || !b.cat));
const sweep = bankRows.filter((b) => /자금이동/.test(b.cat));
const bankIn = bankRows.reduce((s, b) => s + b.in, 0);
const bankOut = bankRows.reduce((s, b) => s + b.out, 0);
const bankRealIn = bankRows.filter((b) => !/자금이동/.test(b.cat)).reduce((s, b) => s + b.in, 0);

// ledger paid total
const ledgerPaid = [...currentNamed, ...returnedNamed].reduce((s, c) => s + c.paid, 0);

// name match: deposits tagged with renter or party containing contractor
let matchedPayAmt = 0, matchedPayN = 0;
const nameIndex = new Map();
for (const c of [...currentNamed, ...returnedNamed]) {
  if (!nameIndex.has(c.name)) nameIndex.set(c.name, []);
  nameIndex.get(c.name).push(c);
}
for (const b of bankRows) {
  if (b.in <= 0) continue;
  if (/자금이동/.test(b.cat)) continue;
  const hit = b.renter && nameIndex.has(b.renter);
  const hit2 = [...nameIndex.keys()].find((n) => n && (b.party.includes(n) || n.includes(b.party.slice(0, 2))));
  if (hit || hit2) { matchedPayAmt += b.in; matchedPayN += 1; }
}

summary.bank = { rows: bankRows.length, in: bankIn, out: bankOut, realIn: bankRealIn, sweep: sweep.length, unclassIn: unclassIn.length, depositTagged: depositBank.length };
summary.ledgerPaid = ledgerPaid;
summary.bankNameMatchedIn = matchedPayAmt;

if (unclassIn.length) push('mid', '자금미분류', `입금 미분류 ${unclassIn.length}건 / ${won(unclassIn.reduce((s, b) => s + b.in, 0))}`, unclassIn.slice(0, 5).map((b) => `${b.date} ${b.party} ${won(b.in)}`), unclassIn.length);

// plate tagged bank vs contract
const bankPlates = setOf(bankRows.map((b) => b.np).filter(Boolean));
const bankPlateGhost = onlyIn(bankPlates, assetSet);
if (bankPlateGhost.length) push('low', '자금plate고아', `자금일보 차량번호가 자산에 없음 ${bankPlateGhost.length}`, bankPlateGhost.slice(0, 10), bankPlateGhost.length);

// G. vin duplicates
const vinClash = [...vinDup.entries()].filter(([, ps]) => new Set(ps.map(normPlate)).size > 1);
if (vinClash.length) push('high', 'VIN중복', `차대번호 공유 차량 ${vinClash.length}건`, vinClash.slice(0, 5).map(([v, ps]) => `${v}→${ps.join(',')}`), vinClash.length);
if (dupPlatesAsset.length) push('high', 'plate중복', `자산 시트 plate 중복 ${dupPlatesAsset.length}`, dupPlatesAsset, dupPlatesAsset.length);

// H. date anomalies in current
const dateBad = currentNamed.filter((c) => c.start && c.end && c.end < c.start);
if (dateBad.length) push('high', '날짜역전', `시작>종료 ${dateBad.length}건`, dateBad.map((c) => `${c.plate} ${c.start}>${c.end}`), dateBad.length);

// I. zero rent active
const zeroRent = currentNamed.filter((c) => !c.rent);
if (zeroRent.length) push('mid', '대여료0', `운행 계약 대여료 0원 ${zeroRent.length}건`, zeroRent.map((c) => `${c.plate} ${c.name}`), zeroRent.length);

// J. deposit 0 on current
const zeroDep = currentNamed.filter((c) => !c.deposit);
if (zeroDep.length) push('low', '보증금0', `운행 계약 보증금 0 ${zeroDep.length}건`, zeroDep.slice(0, 8).map((c) => `${c.plate} ${c.name}`), zeroDep.length);

// K. contract-doc-audit stale snapshot
if (Array.isArray(docAudit) && docAudit.length) {
  const byKind = {};
  for (const it of docAudit) byKind[it.kind] = (byKind[it.kind] || 0) + 1;
  push('mid', '동결감사', `contract-doc-audit.json ${docAudit.length}건(재생성 스크립트 없음) — ${Object.entries(byKind).map(([k, v]) => `${k}:${v}`).join(', ')}`, [], docAudit.length);
}

// L. sheets present but unused by live parser
const usedSheets = new Set(['자산', '채권', '반납', '상환합계', '고객(기준)', '고객']);
const unusedSheets = sheetNames.filter((s) => !usedSheets.has(s));
if (unusedSheets.length) {
  push('mid', '미파싱시트', `사업현황 시트 중 라이브 파서 미사용: ${unusedSheets.join(', ')}`, unusedSheets, unusedSheets.length);
}

// M. insurance only in frozen
if ((frozen.insurance || []).length && true) {
  push('high', '보험경로', `보험 ${(frozen.insurance || []).length}건은 동결 JSON에만 있음 — buildSwitchplanPackFromBuffer는 insurance 미생성`, [], (frozen.insurance || []).length);
}

// N. returned with carry (채권보전)
const retCarry = returnedNamed.filter((c) => c.carry > 0);
if (retCarry.length) {
  push('mid', '반납미수잔존', `반납 계약에 carry>0 ${retCarry.length}건 Σ${won(retCarry.reduce((s, c) => s + c.carry, 0))}`, retCarry.slice(0, 8).map((c) => `${c.plate} ${c.name} ${won(c.carry)}`), retCarry.length);
}

// severity counts
const sevCount = { high: 0, mid: 0, low: 0 };
for (const f of findings) sevCount[f.sev] = (sevCount[f.sev] || 0) + 1;

const out = {
  generatedAt: new Date().toISOString(),
  inventory,
  summary,
  sevCount,
  findings: findings.sort((a, b) => ({ high: 0, mid: 1, low: 2 }[a.sev] - ({ high: 0, mid: 1, low: 2 }[b.sev]))),
  samples: {
    topCarry: [...currentNamed].sort((a, b) => b.carry - a.carry).slice(0, 10).map((c) => ({ plate: c.plate, name: c.name, carry: c.carry, gross: c.gross, rent: c.rent })),
    divergeTop: diverge.slice(0, 10).map((c) => ({ plate: c.plate, name: c.name, carry: c.carry, gross: c.gross, diff: c.diff })),
    pdfMissing: pdfMissing.slice(0, 15),
    joinMiss: joinMiss.slice(0, 15).map((c) => `${c.plate}|${c.name}`),
  },
};

const outPath = path.join(__dirname, 'audit-switchplan-migrate.result.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify({ ok: true, outPath, sevCount, summary: {
  asset: summary.asset,
  active: summary.activePlates,
  current: summary.currentContracts,
  returned: summary.returnedContracts,
  carryLive: summary.carryLive,
  frozenCarry: summary.frozen.carrySum,
  bankTx: summary.bankTx,
  pdfs: summary.pdfs,
  findings: findings.length,
} }, null, 2));
