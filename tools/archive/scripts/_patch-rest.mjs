import fs from "node:fs";
const p = "C:/dev/jpkerp6-app/scripts/audit-switchplan-rest.cjs";
let t = fs.readFileSync(p, "utf8");
t = t.replace("cmsMeta.dataRows <= 10", "cmsMeta.approxRows <= 10");
t = t.replace("CMS.xlsx ${cmsMeta.dataRows}", "CMS.xlsx ${cmsMeta.approxRows}(roster)");
t = t.replace("[], cmsMeta.dataRows);", "[], Math.max(0, cmsMeta.approxRows - 1));");
t = t.replace("duplicatePdfPlates: pdfPlates.length - pdfSet.size,", "duplicatePdfPlates: pdfFiles.length - pdfSet.size,");
fs.writeFileSync(p, t);
console.log("ok");
