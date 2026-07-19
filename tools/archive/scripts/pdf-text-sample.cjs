const fs = require("fs");
const path = require("path");
const { PDFParse } = require("pdf-parse");

const files = [
  { kind: "CONTRACT", path: "C:\\dev\\jpkerp6-마이그레이션\\switchplan_스위치플랜\\계약서\\김찬일 133가8292 모하비 셀렉션_최종확정.pdf" },
  { kind: "CONTRACT", path: "C:\\dev\\jpkerp6-마이그레이션\\switchplan_스위치플랜\\계약서\\01도9893 모닝 김효은[셀렉션].pdf" },
  { kind: "CONTRACT", path: "C:\\dev\\jpkerp6-마이그레이션\\switchplan_스위치플랜\\계약서\\02마4731 모닝 하정만[셀렉션].pdf" },
  { kind: "REG", path: "C:\\dev\\jpkerp6-마이그레이션\\switchplan_스위치플랜\\자동차등록증\\01도9893_모닝_자동차등록증[스위치플랜].pdf" },
  { kind: "REG", path: "C:\\dev\\jpkerp6-마이그레이션\\switchplan_스위치플랜\\자동차등록증\\02마4731_모닝_자동차등록증[스위치플랜].pdf" },
  { kind: "REG", path: "C:\\dev\\jpkerp6-마이그레이션\\switchplan_스위치플랜\\자동차등록증\\75두7412_스타렉스_자동차등록증[스위치플랜].pdf" },
  { kind: "INS", path: "C:\\dev\\jpkerp6-마이그레이션\\switchplan_스위치플랜\\보험증권\\DB보험증권\\01도9893.pdf" },
  { kind: "INS", path: "C:\\dev\\jpkerp6-마이그레이션\\switchplan_스위치플랜\\보험증권\\DB보험증권\\02마4731.pdf" },
  { kind: "INS", path: "C:\\dev\\jpkerp6-마이그레이션\\switchplan_스위치플랜\\보험증권\\DB보험증권\\02무0357(해지).pdf" },
];

const PLATE_RE = /\d{2,3}[가-힣]\d{4}/g;
const KOREAN_RE = /[가-힣]/;

async function processOne(entry) {
  const abs = entry.path;
  const base = path.basename(abs);
  const out = {
    kind: entry.kind,
    file: base,
    path: abs,
    bytes: null,
    textLen: 0,
    preview: "",
    hasKorean: false,
    plateHits: [],
    hasTextLayer: false,
    numpages: null,
    error: null,
  };
  let parser = null;
  try {
    if (!fs.existsSync(abs)) {
      out.error = "FILE_NOT_FOUND";
      return out;
    }
    const buf = fs.readFileSync(abs);
    out.bytes = buf.length;
    parser = new PDFParse({ data: buf });
    const data = await parser.getText();
    const text = (data.text || "").replace(/\r/g, "");
    out.textLen = text.length;
    out.preview = text.slice(0, 800);
    out.hasKorean = KOREAN_RE.test(text);
    out.plateHits = [...new Set(text.match(PLATE_RE) || [])];
    out.hasTextLayer = out.textLen > 20;
    out.numpages = data.total != null ? data.total : (data.pages && data.pages.length);
  } catch (e) {
    out.error = String(e && e.message ? e.message : e);
  } finally {
    if (parser) {
      try { await parser.destroy(); } catch (_) {}
    }
  }
  return out;
}

(async () => {
  const results = [];
  for (const f of files) {
    const r = await processOne(f);
    results.push(r);
    console.log(JSON.stringify({
      kind: r.kind,
      file: r.file,
      bytes: r.bytes,
      textLen: r.textLen,
      hasTextLayer: r.hasTextLayer,
      hasKorean: r.hasKorean,
      plateHits: r.plateHits,
      numpages: r.numpages,
      preview: r.preview,
      error: r.error,
    }, null, 2));
    console.log("---");
  }

  const contractDir = "C:\\dev\\jpkerp6-마이그레이션\\switchplan_스위치플랜\\계약서";
  const targetPlates = ["133가8292", "89너4007", "41호8300", "41호8301"];
  let allNames = [];
  try {
    allNames = fs.readdirSync(contractDir).filter((n) => n.toLowerCase().endsWith(".pdf"));
  } catch (e) {
    allNames = [];
  }
  const plateStartsWith = /^\d{2,3}[가-힣]\d{4}/;
  const coverage = targetPlates.map((plate) => {
    const hits = allNames.filter((n) => n.includes(plate));
    return {
      plate,
      found: hits.length > 0,
      matches: hits.map((n) => ({
        filename: n,
        startsWithPlate: plateStartsWith.test(n),
        nameFirst: !plateStartsWith.test(n) && n.includes(plate),
      })),
    };
  });
  const nameFirstCount = coverage.filter((c) => c.matches.some((m) => m.nameFirst)).length;
  const foundCount = coverage.filter((c) => c.found).length;

  const report = {
    generatedAt: new Date().toISOString(),
    tools: {
      pdftotext: false,
      mutool: false,
      magick: false,
      python: true,
      pdfParse: true,
      pdfParseApi: "PDFParse.getText",
    },
    samples: results,
    contractPlateCoverage: {
      dir: contractDir,
      totalContractPdfs: allNames.length,
      targetPlates,
      foundCount,
      nameFirstAmongTargets: nameFirstCount,
      stillMissing: coverage.filter((c) => !c.found).map((c) => c.plate),
      details: coverage,
    },
  };

  const outPath = path.join(__dirname, "pdf-text-sample.result.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log("WROTE", outPath);
  console.log(JSON.stringify(report.contractPlateCoverage, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
