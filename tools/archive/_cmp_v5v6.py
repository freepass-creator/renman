# -*- coding: utf-8 -*-
from pathlib import Path
import json

v5 = Path(r"C:/dev/_backup/jpkerp5")
v6 = Path(r"C:/dev/jpkerp6-app")


def pages(root: Path):
    app = root / "app"
    out = []
    if not app.exists():
        return out
    for p in app.rglob("page.tsx"):
        parts = p.parent.relative_to(app).parts
        route = "/" + "/".join(parts) if parts != (".",) else "/"
        if route == "/.":
            route = "/"
        out.append(route)
    return sorted(set(out))


def lib_modules(root: Path):
    lib = root / "lib"
    if not lib.exists():
        return []
    names = []
    for p in lib.iterdir():
        names.append(p.name)
    return sorted(names)


def pkg(root: Path):
    p = root / "package.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def has_any(root: Path, patterns):
    lib = root / "lib"
    if not lib.exists():
        return False
    for pat in patterns:
        if list(lib.rglob(pat)):
            return True
    return False


p5, p6 = pkg(v5), pkg(v6)
pages5, pages6 = pages(v5), pages(v6)
only5 = sorted(set(pages5) - set(pages6))
only6 = sorted(set(pages6) - set(pages5))
both = sorted(set(pages5) & set(pages6))

engines = {
    "migrate/switchplan": (["migrate/switchplan*"], ["migrate/switchplan*", "migrate/pack.ts"]),
    "receipt-match": (["**/receipt-match*"], ["**/receipt-match*"]),
    "payment-schedule": (["**/payment-schedule*"], ["**/payment-schedule*"]),
    "early-termination": (["**/early-termination*"], ["**/early-termination*"]),
    "contract-ops/lifecycle": (["**/contract-lifecycle*", "**/contract-ops*"], ["**/contract-ops*"]),
    "operating-snapshot": (["**/operating-snapshot*"], ["**/operating-snapshot*"]),
    "section-registry": (["**/section-registry*"], ["**/section-registry*"]),
    "domain/model linkFleet": (["**/domain/**", "**/contract-linkage*"], ["**/domain/model*"]),
    "cash-ledger / finance": (["**/classify-subject*", "**/gl-entries*"], ["**/cash-ledger*", "**/finance/**"]),
    "OCR": (["**/ocr*", "**/parsers/**"], ["**/ocr*"]),
    "firebase stores (per-entity)": (["firebase/*-store.ts"], ["store.ts", "firebase/**"]),
    "attendance": (["**/attendance*"], ["**/attendance*"]),
    "notice/cert": (["**/notice*", "**/penalty-pdf*"], ["**/notify/**", "**/Notify*"]),
    "integrity/doc-audit": (["**/data-integrity*"], ["**/integrity/**"]),
    "agenda / MyDesk": (["**/ops-alerts*"], ["**/agenda*", "**/section-registry*"]),
}

eng_rows = []
for name, (p5p, p6p) in engines.items():
    eng_rows.append(
        {
            "name": name,
            "v5": has_any(v5, p5p),
            "v6": has_any(v6, p6p),
        }
    )

# feature groups for only5
groups = {
    "모바일 /m": [r for r in only5 if r.startswith("/m")],
    "자산 세부": [r for r in only5 if r.startswith("/asset/")],
    "계약 세부": [r for r in only5 if r.startswith("/contract/")],
    "자금 세부": [r for r in only5 if r.startswith("/finance/")],
    "admin 도구": [r for r in only5 if r.startswith("/admin")],
    "공지/내용증명": [r for r in only5 if r.startswith("/notice")],
    "기타 v5만": [],
}
used = set()
for k, vs in groups.items():
    if k != "기타 v5만":
        used.update(vs)
groups["기타 v5만"] = [r for r in only5 if r not in used]

report = {
    "paths": {"v5": str(v5), "v6": str(v6)},
    "versions": {"v5": p5.get("version"), "v6": p6.get("version"), "v5_name": p5.get("name"), "v6_name": p6.get("name")},
    "ports": {"v5": "7502", "v6": "6006"},
    "deps_v5_extra": sorted(set(p5.get("dependencies", {})) - set(p6.get("dependencies", {}))),
    "deps_v6_extra": sorted(set(p6.get("dependencies", {})) - set(p5.get("dependencies", {}))),
    "pages": {"v5_n": len(pages5), "v6_n": len(pages6), "both_n": len(both), "only5_n": len(only5), "only6_n": len(only6)},
    "both": both,
    "only5": only5,
    "only6": only6,
    "only5_groups": groups,
    "engines": eng_rows,
    "lib_top_v5": lib_modules(v5),
    "lib_top_v6": lib_modules(v6),
}

out = Path(r"C:/dev/jpkerp6-app/tools/archive/v5-v6-compare.json")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print("OK", out)
print("pages", report["pages"])
print("only5 groups:")
for k, v in groups.items():
    print(f"  {k}: {len(v)}")
print("engines:")
for e in eng_rows:
    mark = "both" if e["v5"] and e["v6"] else ("v5only" if e["v5"] else ("v6only" if e["v6"] else "none"))
    print(f"  {e['name']}: {mark}")
