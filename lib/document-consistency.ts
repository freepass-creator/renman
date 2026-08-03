import { normPlate } from "@/lib/plate";
import type { EntityRecord } from "@/lib/intake/entities";

export type FieldCheck = {
  field: string;
  extracted: string;
  ledger: string;
  result: "exact" | "normalized" | "mismatch" | "missing";
};
export type DocumentMatch = {
  target: EntityRecord | null;
  score: number;
  decision: "auto" | "review" | "unmatched" | "ambiguous";
  checks: FieldCheck[];
};

function text(v: unknown): string {
  return String(v ?? "").trim();
}
function compact(v: unknown): string {
  return text(v)
    .replace(/[\s\-().]/g, "")
    .toUpperCase();
}
function extracted(raw: EntityRecord, ...keys: string[]): string {
  for (const key of keys) if (text(raw[key])) return text(raw[key]);
  return "";
}
function check(
  field: string,
  a: string,
  b: string,
  normalizer = compact,
): FieldCheck {
  if (!a || !b) return { field, extracted: a, ledger: b, result: "missing" };
  if (a === b) return { field, extracted: a, ledger: b, result: "exact" };
  return {
    field,
    extracted: a,
    ledger: b,
    result: normalizer(a) === normalizer(b) ? "normalized" : "mismatch",
  };
}

/** VIN > plate > company/name. A conflicting VIN always prevents auto-placement. */
export function matchDocumentToVehicle(
  raw: EntityRecord,
  vehicles: EntityRecord[],
): DocumentMatch {
  const plate = normPlate(extracted(raw, "plate", "car_number"));
  const vin = compact(extracted(raw, "vin", "chassis_number"));
  const owner = extracted(
    raw,
    "ownerName",
    "owner_name",
    "contractor",
    "insured",
  );
  const ranked = vehicles
    .map((v) => {
      const checks = [
        check("vin", vin, compact(v.vin)),
        check("plate", plate, normPlate(v.plate)),
        check("owner", owner, extracted(v, "ownerName", "companyName")),
      ];
      let score = 0;
      if (vin && compact(v.vin) === vin) score += 75;
      if (plate && normPlate(v.plate) === plate) score += 35;
      if (
        owner &&
        compact(extracted(v, "ownerName", "companyName")) === compact(owner)
      )
        score += 10;
      if (vin && v.vin && compact(v.vin) !== vin) score -= 100;
      return { target: v, score, checks };
    })
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < 35)
    return {
      target: null,
      score: best?.score || 0,
      decision: "unmatched",
      checks: best?.checks || [],
    };
  if (ranked[1] && ranked[1].score === best.score)
    return { ...best, target: null, decision: "ambiguous" };
  return { ...best, decision: best.score >= 70 ? "auto" : "review" };
}

export function matchDocumentBatch(
  rawDocs: EntityRecord[],
  vehicles: EntityRecord[],
) {
  return rawDocs.map((document) => ({
    document,
    match: matchDocumentToVehicle(document, vehicles),
  }));
}
