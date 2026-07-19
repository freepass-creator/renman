/**
 * PDF ↔ 사업현황/보험증권 크로스체크
 * 출력: scripts/pdf-crosscheck.result.json
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { PDFParse } = require("pdf-parse");
const XLSX = require("xlsx");

const ROOT = "C:\\dev\\jpkerp6-마이그레이션\\switchplan_스위치플랜";
const BIZ = path.join(ROOT, "사업현황.xlsx");
const INS_XLSX = path.join(ROOT, "보험증권", "보험증권_128건_2026-06-08.xlsx");
const CONTRACT_DIR = path.join(ROOT, "계약서");
const INS_DIR = path.join(ROOT, "보험증권", "DB보험증권");
const REG_PDF = path.join(ROOT, "자동차등록증", "01도9893_모닝_자동차등록증[스위치플랜].pdf");
const OUT_PNG = path.join(__dirname, "..", "tmp", "reg-01도9893.png");
const OUT_JSON = path.join(__dirname, "pdf-crosscheck.result.json");

const PLATE_RE = /\d{2,3}[가-힣]\d{4}/g;
const PLATE_START_RE = /^\d{2,3}[가-힣]\d{4}/;

const CONTRACT_PDFS = [
  path.join(CONTRACT_DIR, "김찬일 133가8292 모하비 셀렉션_최종확정.pdf"),
  path.join(CONTRACT_DIR, "01도9893 모닝 김효은[셀렉션].pdf"),
  path.join(CONTRACT_DIR, "02마4731 모닝 하정만[셀렉션].pdf"),
];
const INS_PDFS = [
  path.join(INS_DIR, "01도9893.pdf"),
  path.join(INS_DIR, "02마4731.pdf"),
];

function normPlate(s) {
  return String(s || "").replace(/\s+/g, "").toLowerCase();
}
function cellStr(v) {
  if (v == null) return "";
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).trim();
}
function cellNum(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Math.round(v);
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}
function excelSerialToYmd(n) {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 30000) return null;
  // Excel serial (1900 date system) → JS Date
  const epoch = Date.UTC(1899, 11, 30);
  const dt = new Date(epoch + Math.round(n) * 86400000);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function normalizeDate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return cellStr(v);
  if (typeof v === "number") return excelSerialToYmd(v) || null;
  const s = String(v).trim();
  if (!s || s === "-") return null;
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  if ((m = s.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})$/))) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  if ((m = s.match(/^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?/))) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  if ((m = s.match(/^(\d{2})-(\d{2})-(\d{2})$/))) {
    const yy = Number(m[1]);
    const y = yy >= 70 ? 1900 + yy : 2000 + yy;
    return `${y}-${m[2]}-${m[3]}`;
  }
  const asNum = Number(s);
  if (Number.isFinite(asNum) && asNum > 30000) return excelSerialToYmd(asNum);
  return null;
}

async function pdfText(abs) {
  if (!fs.existsSync(abs)) return { text: "", error: "FILE_NOT_FOUND", pages: null };
  let parser = null;
  try {
    const buf = fs.readFileSync(abs);
    parser = new PDFParse({ data: buf });
    const data = await parser.getText();
    return { text: (data.text || "").replace(/\r/g, ""), error: null, pages: data.total ?? null };
  } catch (e) {
    return { text: "", error: String(e && e.message ? e.message : e), pages: null };
  } finally {
    if (parser) try { await parser.destroy(); } catch (_) {}
  }
}

function parseContractText(text, filename) {
  const plates = [...new Set(text.match(PLATE_RE) || [])];
  const filePlates = [...new Set(filename.match(PLATE_RE) || [])];
  const plate = plates[0] || filePlates[0] || null;

  let customer = null;
  let m;
  if ((m = text.match(/임차인\s*\(계약자\)[\s\S]{0,40}?([가-힣]{2,4})\s*(?:\n|$)/))) {
    customer = m[1];
  } else if ((m = text.match(/고객명\s*\n([가-힣]{2,10})/))) {
    customer = m[1];
  }
  // filename name-first: "김찬일 133가8292 ..."
  if (!customer) {
    const fm = filename.match(/^([가-힣]{2,10})\s+\d{2,3}[가-힣]\d{4}/);
    if (fm) customer = fm[1];
  }
  // plate-first filename: "01도9893 모닝 김효은[셀렉션]"
  if (!customer) {
    const fm = filename.match(/^\d{2,3}[가-힣]\d{4}\s+\S+\s+([가-힣]{2,10})/);
    if (fm) customer = fm[1];
  }

  let carModel = null;
  if ((m = text.match(/차량\s*정보\s*\n고객명\s*\n연락처\s*\n([^\n]+)\s*\n([가-힣]{2,10})/))) {
    carModel = m[1].trim();
  } else if ((m = text.match(/\n(모하비|모닝|쏘렌토|아반떼|그랜저|카니발|스타렉스|싼타페|투싼|코나|니로|쏘나타|K[0-9]|레이|스파크|티볼리|QM6|렉스턴|팰리세이드)[^\n]{0,20}\n/))) {
    carModel = m[1];
  }
  if (!carModel) {
    const fm = filename.match(/\d{2,3}[가-힣]\d{4}\s+([^\s\[]+)/) || filename.match(/^\S+\s+\d{2,3}[가-힣]\d{4}\s+([^\s_]+)/);
    if (fm) carModel = fm[1].replace(/_최종확정$/, "").replace(/셀렉션$/, "").trim();
  }

  let months = null;
  if ((m = text.match(/차량\s*인도일(?:로)?\s*부터\s*(\d+)\s*개월/))) months = Number(m[1]);
  else if ((m = text.match(/대여기간[^\n]{0,40}?(\d+)\s*개월/))) months = Number(m[1]);

  // Prefer YYYY년 M월 D일 pairs / YY-MM-DD ~ YY-MM-DD
  let start = null, end = null;
  const range1 = text.match(/(\d{2}-\d{2}-\d{2})\s*[~～\-]\s*(\d{2}-\d{2}-\d{2})/);
  if (range1) {
    start = normalizeDate(range1[1]);
    end = normalizeDate(range1[2]);
  }
  const korDates = [...text.matchAll(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)].map(
    (x) => `${x[1]}-${String(x[2]).padStart(2, "0")}-${String(x[3]).padStart(2, "0")}`
  );
  if ((!start || !end) && korDates.length >= 2) {
    start = start || korDates[0];
    end = end || korDates[1];
  }

  let company = null;
  if ((m = text.match(/(제이피케이오토셀렉션\s*주식회사|스위치플랜\s*\(주\)|스위치플랜주식회사)/))) {
    company = m[1].replace(/\s+/g, "");
  } else if (/렌트회사/.test(text) && /제이피케이/.test(text)) {
    company = "제이피케이오토셀렉션주식회사";
  }

  return { plate, customer, carModel, start, end, months, company, platesInText: plates };
}

function parseInsuranceText(text, filename) {
  const plates = [...new Set(text.match(PLATE_RE) || [])];
  const filePlate = (filename.match(PLATE_RE) || [])[0] || null;
  const plate = filePlate || plates[0] || null;

  let start = null, end = null, policyNo = null, insurer = null, carName = null;

  let m;
  if ((m = text.match(/보험기간\s*(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*[~～\-]\s*(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/))) {
    start = `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
    end = `${m[4]}-${String(m[5]).padStart(2, "0")}-${String(m[6]).padStart(2, "0")}`;
  }
  if ((m = text.match(/증권번호\s*([0-9\-]+)/))) policyNo = m[1].trim();
  if (/DB\s*손해보험|디비손해보험|프로미카/.test(text)) insurer = "DB손해보험";
  if ((m = text.match(/차명\s*([^\n]+)/))) carName = m[1].trim().split(/\s{2,}|\t/)[0].trim();

  return { plate, start, end, policyNo, insurer, carName, platesInText: plates };
}

function loadBizDebt() {
  const wb = XLSX.read(fs.readFileSync(BIZ), { type: "buffer", cellDates: true });
  const m = XLSX.utils.sheet_to_json(wb.Sheets["채권"], { header: 1, defval: "", raw: true });
  const hdr = m[1] || [];
  const idx = new Map();
  hdr.forEach((h, i) => {
    const k = cellStr(h);
    if (k && !idx.has(k)) idx.set(k, i);
  });
  const iPlate = idx.get("차량번호");
  const iName = idx.get("코드명");
  const iRent = idx.get("대여료");
  const iDep = idx.get("보증금");
  const iStart = idx.get("시작");
  const iEnd = idx.get("종료");

  const byPlate = new Map(); // norm -> best row (prefer named)
  const activePlates = [];
  for (let r = 2; r < m.length; r++) {
    const row = m[r];
    const plate = cellStr(row[iPlate]);
    if (!plate) continue;
    const np = normPlate(plate);
    activePlates.push(np);
    const rec = {
      plate,
      코드명: cellStr(row[iName]) || null,
      대여료: cellNum(row[iRent]),
      보증금: cellNum(row[iDep]),
      시작: normalizeDate(row[iStart]),
      종료: normalizeDate(row[iEnd]),
    };
    const prev = byPlate.get(np);
    if (!prev || (!prev.코드명 && rec.코드명)) byPlate.set(np, rec);
  }

  // optional 고객(기준) enrichment
  const custM = XLSX.utils.sheet_to_json(wb.Sheets["고객(기준)"], { header: 1, defval: "", raw: true });
  const cHdr = custM[0] || [];
  const cIdx = new Map();
  cHdr.forEach((h, i) => {
    const k = cellStr(h);
    if (k && !cIdx.has(k)) cIdx.set(k, i);
  });
  const ciPlate = cIdx.get("차량번호") ?? cIdx.get("차량 번호");
  const ciName = cIdx.get("고객명") ?? cIdx.get("성명") ?? cIdx.get("코드명") ?? cIdx.get("이름");
  const custByPlate = new Map();
  if (ciPlate != null) {
    for (let r = 1; r < custM.length; r++) {
      const plate = cellStr(custM[r][ciPlate]);
      if (!plate) continue;
      const name = ciName != null ? cellStr(custM[r][ciName]) : "";
      if (name) custByPlate.set(normPlate(plate), name);
    }
  }

  return {
    byPlate,
    activePlates: [...new Set(activePlates)],
    custByPlate,
    custHeader: [...cIdx.keys()],
  };
}

function loadInsuranceXlsx() {
  const wb = XLSX.read(fs.readFileSync(INS_XLSX), { type: "buffer", cellDates: true });
  const sh = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sh, { defval: "" });
  const byPlate = new Map();
  for (const row of rows) {
    const plate = cellStr(row["차량번호"]);
    if (!plate) continue;
    byPlate.set(normPlate(plate), {
      시작일: normalizeDate(row["시작일"]) || cellStr(row["시작일"]) || null,
      만기일: normalizeDate(row["만기일"]) || cellStr(row["만기일"]) || null,
      증권번호: cellStr(row["증권번호"]) || null,
      보험사: cellStr(row["보험사"]) || null,
      차명: cellStr(row["차명"]) || null,
    });
  }
  return byPlate;
}

function contractCoverage(activePlates) {
  const names = fs.existsSync(CONTRACT_DIR)
    ? fs.readdirSync(CONTRACT_DIR).filter((n) => n.toLowerCase().endsWith(".pdf"))
    : [];
  let nameFirstCount = 0;
  for (const n of names) {
    const plates = n.match(PLATE_RE) || [];
    if (plates.length && !PLATE_START_RE.test(n)) nameFirstCount += 1;
  }
  const stillMissingActivePlates = [];
  for (const np of activePlates) {
    // match plate ANYWHERE in filename (case-insensitive via lower)
    const hit = names.some((n) => normPlate(n).includes(np));
    if (!hit) {
      // restore display form from first matching active source: use original casing from np if we stored lower
      stillMissingActivePlates.push(np);
    }
  }
  // Prefer original plate strings from filenames / debt — rebuild display from active map keys
  return {
    totalPdfs: names.length,
    nameFirstCount,
    stillMissingActivePlates,
  };
}

function renderRegPng() {
  fs.mkdirSync(path.dirname(OUT_PNG), { recursive: true });
  const py = `
import sys
try:
    import pypdfium2 as pdfium
    from PIL import Image
except Exception as e:
    print("IMPORT_FAIL:" + str(e))
    sys.exit(2)
pdf_path = r"""${REG_PDF.replace(/\\/g, "\\\\")}"""
out_path = r"""${OUT_PNG.replace(/\\/g, "\\\\")}"""
try:
    pdf = pdfium.PdfDocument(pdf_path)
    page = pdf[0]
    bitmap = page.render(scale=2)
    pil = bitmap.to_pil()
    pil.save(out_path, "PNG")
    print("OK:" + out_path)
    sys.exit(0)
except Exception as e:
    print("RENDER_FAIL:" + str(e))
    sys.exit(3)
`;
  const pyFile = path.join(__dirname, "_tmp_reg_render.py");
  fs.writeFileSync(pyFile, py, "utf8");

  // ensure deps
  const pip = spawnSync("pip", ["install", "pypdfium2", "pillow", "--quiet"], {
    encoding: "utf8",
    shell: true,
    timeout: 180000,
  });
  const run = spawnSync("python", [pyFile], { encoding: "utf8", shell: true, timeout: 120000 });
  try { fs.unlinkSync(pyFile); } catch (_) {}

  const out = ((run.stdout || "") + (run.stderr || "")).trim();
  if (run.status === 0 && out.startsWith("OK:")) {
    return { ok: true, path: OUT_PNG, error: null, pipStderr: pip.stderr || null };
  }

  // fallback pdf2image
  const py2 = `
import sys
try:
    from pdf2image import convert_from_path
except Exception as e:
    print("IMPORT_FAIL:" + str(e))
    sys.exit(2)
pdf_path = r"""${REG_PDF.replace(/\\/g, "\\\\")}"""
out_path = r"""${OUT_PNG.replace(/\\/g, "\\\\")}"""
try:
    pages = convert_from_path(pdf_path, first_page=1, last_page=1, dpi=144)
    pages[0].save(out_path, "PNG")
    print("OK:" + out_path)
except Exception as e:
    print("RENDER_FAIL:" + str(e))
    sys.exit(3)
`;
  const pyFile2 = path.join(__dirname, "_tmp_reg_render2.py");
  fs.writeFileSync(pyFile2, py2, "utf8");
  spawnSync("pip", ["install", "pdf2image", "--quiet"], { encoding: "utf8", shell: true, timeout: 120000 });
  const run2 = spawnSync("python", [pyFile2], { encoding: "utf8", shell: true, timeout: 120000 });
  try { fs.unlinkSync(pyFile2); } catch (_) {}
  const out2 = ((run2.stdout || "") + (run2.stderr || "")).trim();
  if (run2.status === 0 && out2.startsWith("OK:")) {
    return { ok: true, path: OUT_PNG, error: null, via: "pdf2image" };
  }

  const err =
    (out && !out.startsWith("OK:") ? out : null) ||
    (out2 && !out2.startsWith("OK:") ? out2 : null) ||
    `pypdfium2 status=${run.status}; pdf2image status=${run2.status}`;
  return { ok: false, path: OUT_PNG, error: err };
}

(async () => {
  const biz = loadBizDebt();
  const insX = loadInsuranceXlsx();

  // restore display plates for missing list
  const displayByNorm = new Map();
  for (const [np, rec] of biz.byPlate) displayByNorm.set(np, rec.plate);
  // also from all active (including nameless)
  const wb = XLSX.read(fs.readFileSync(BIZ), { type: "buffer", cellDates: true });
  const m = XLSX.utils.sheet_to_json(wb.Sheets["채권"], { header: 1, defval: "", raw: true });
  const hdr = m[1] || [];
  const iPlate = hdr.findIndex((h) => cellStr(h) === "차량번호");
  for (let r = 2; r < m.length; r++) {
    const plate = cellStr(m[r][iPlate]);
    if (plate) displayByNorm.set(normPlate(plate), plate);
  }

  const contracts = [];
  for (const abs of CONTRACT_PDFS) {
    const base = path.basename(abs);
    const { text, error, pages } = await pdfText(abs);
    const parsed = error ? {} : parseContractText(text, base);
    const np = normPlate(parsed.plate);
    let xlsx = np ? biz.byPlate.get(np) || null : null;
    if (xlsx && !xlsx.코드명 && biz.custByPlate.has(np)) {
      xlsx = { ...xlsx, 코드명: biz.custByPlate.get(np), _from고객기준: true };
    }
    contracts.push({
      file: base,
      path: abs,
      error,
      pages,
      textLen: text.length,
      parsed: {
        plate: parsed.plate || null,
        customer: parsed.customer || null,
        carModel: parsed.carModel || null,
        start: parsed.start || null,
        end: parsed.end || null,
        months: parsed.months ?? null,
        company: parsed.company || null,
      },
      xlsxMatch: xlsx
        ? {
            코드명: xlsx.코드명,
            대여료: xlsx.대여료,
            보증금: xlsx.보증금,
            시작: xlsx.시작,
            종료: xlsx.종료,
            _from고객기준: xlsx._from고객기준 || false,
          }
        : null,
      dateMatch: xlsx
        ? {
            startEq: !!(parsed.start && xlsx.시작 && parsed.start === xlsx.시작),
            endEq: !!(parsed.end && xlsx.종료 && parsed.end === xlsx.종료),
          }
        : null,
    });
  }

  const insurance = [];
  for (const abs of INS_PDFS) {
    const base = path.basename(abs);
    const { text, error, pages } = await pdfText(abs);
    const parsed = error ? {} : parseInsuranceText(text, base);
    const np = normPlate(parsed.plate);
    const xlsx = np ? insX.get(np) || null : null;
    insurance.push({
      file: base,
      path: abs,
      error,
      pages,
      textLen: text.length,
      parsed: {
        plate: parsed.plate || null,
        start: parsed.start || null,
        end: parsed.end || null,
        policyNo: parsed.policyNo || null,
        insurer: parsed.insurer || null,
        carName: parsed.carName || null,
      },
      xlsxMatch: xlsx,
      match: xlsx
        ? {
            startEq: !!(parsed.start && xlsx.시작일 && parsed.start === xlsx.시작일),
            endEq: !!(parsed.end && xlsx.만기일 && parsed.end === xlsx.만기일),
            policyEq: !!(parsed.policyNo && xlsx.증권번호 && parsed.policyNo === xlsx.증권번호),
          }
        : null,
    });
  }

  const covRaw = contractCoverage(biz.activePlates);
  const contractPdfCoverage = {
    nameFirstCount: covRaw.nameFirstCount,
    totalPdfs: covRaw.totalPdfs,
    activePlateCount: biz.activePlates.length,
    stillMissingActivePlates: covRaw.stillMissingActivePlates.map(
      (np) => displayByNorm.get(np) || np
    ),
  };

  const regRender = renderRegPng();

  const report = {
    generatedAt: new Date().toISOString(),
    contracts,
    insurance,
    contractPdfCoverage: {
      nameFirstCount: contractPdfCoverage.nameFirstCount,
      stillMissingActivePlates: contractPdfCoverage.stillMissingActivePlates,
      // extras kept for debugging but required keys present
      totalPdfs: contractPdfCoverage.totalPdfs,
      activePlateCount: contractPdfCoverage.activePlateCount,
    },
    regRender: {
      ok: !!regRender.ok,
      path: regRender.path,
      error: regRender.error || null,
    },
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), "utf8");

  // short stdout summary
  console.log("=== pdf-crosscheck summary ===");
  console.log(`contracts: ${contracts.length}`);
  for (const c of contracts) {
    const p = c.parsed;
    console.log(
      `  ${c.file}: plate=${p.plate} cust=${p.customer} model=${p.carModel} ${p.start}~${p.end} mo=${p.months} xlsx=${c.xlsxMatch ? c.xlsxMatch.코드명 + "/" + c.xlsxMatch.대여료 : "NONE"}`
    );
  }
  console.log(`insurance: ${insurance.length}`);
  for (const i of insurance) {
    const p = i.parsed;
    console.log(
      `  ${i.file}: ${p.plate} ${p.start}~${p.end} pol=${p.policyNo} xlsx=${i.xlsxMatch ? i.xlsxMatch.증권번호 : "NONE"} match=${JSON.stringify(i.match)}`
    );
  }
  console.log(
    `contractPdfCoverage: nameFirst=${contractPdfCoverage.nameFirstCount}/${contractPdfCoverage.totalPdfs} missingActive=${contractPdfCoverage.stillMissingActivePlates.length}/${contractPdfCoverage.activePlateCount}`
  );
  if (contractPdfCoverage.stillMissingActivePlates.length) {
    console.log("  missing:", contractPdfCoverage.stillMissingActivePlates.join(", "));
  }
  console.log(`regRender: ok=${report.regRender.ok} path=${report.regRender.path} err=${report.regRender.error}`);
  console.log("WROTE", OUT_JSON);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
