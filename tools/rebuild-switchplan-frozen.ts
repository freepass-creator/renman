/**
 * 스위치플랜 얼린 시드 재생성 — 「사업현황.xlsx」 → lib/migrate/switchplan-data.json
 *
 *   npx --yes tsx tools/rebuild-switchplan-frozen.ts <사업현황.xlsx> [--out <경로>] [--as-of YYYY-MM-DD] [--write]
 *
 * 왜 있나: 얼린 JSON은 v5에서 1회 파싱해 손으로 가져온 것이라 v6에 재생성 경로가 없었다.
 *   사업현황이 갱신될 때마다 이 도구로 다시 뽑는다. (CLAUDE.md — `buildSwitchplanPack*` 직접 호출은
 *   마이그레이션 도구만 예외)
 *
 * 중요 — 사업현황.xlsx 에는 계좌·보험 시트가 없다:
 *   · vehicles / contracts = 새 엑셀에서 재생성
 *   · bankTx / insurance   = 기존 얼린 JSON 것을 그대로 보존(운영계좌·DB보험리스트가 원본)
 *   보존하지 않으면 계좌 3,639건이 통째로 날아간다.
 *
 * 기본은 드라이런(파일 안 씀). 실제 반영은 --write.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSwitchplanWorkbook, buildSwitchplanPackFromBuffer } from '../lib/migrate/switchplan-parse';
import { maskSwitchplanPII, type SwitchplanSeed } from './mask-switchplan-pii';
import { setCatalog } from '../lib/domain/vehicle-master';

const FROZEN = resolve(__dirname, '../lib/migrate/switchplan-data.json');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const src = process.argv[2];
if (!src || src.startsWith('--')) {
  console.error('사용법: tsx tools/rebuild-switchplan-frozen.ts <사업현황.xlsx> [--out 경로] [--as-of YYYY-MM-DD] [--write]');
  process.exit(1);
}

const write = process.argv.includes('--write');
const out = arg('--out') || FROZEN;
const asOf = arg('--as-of');

// 차종마스터 로드(노드=fetch 불가 → readFileSync 주입) → 파서 차종마스터 스냅 활성화("차종마스터 기본으로 반영").
try {
  const catPath = resolve(__dirname, '../public/data/car-master/_index.json');
  setCatalog(JSON.parse(readFileSync(catPath, 'utf-8')));
} catch (e) {
  console.warn('⚠ 차종마스터 미로드 — 5단계 스냅 생략(엑셀 원값 유지):', (e as Error).message);
}

const buf = readFileSync(resolve(src));
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
// 저수준 parseSwitchplanWorkbook 직접 쓰면 안 된다 — 차량 status(운행/매각)·할부 필드가 붙지 않는다.
// 그 병합은 buildSwitchplanPackFromBuffer 안에 있다. parsed 는 카운트·경고 확인용으로만.
const parsed = parseSwitchplanWorkbook(ab, asOf);
const pack = buildSwitchplanPackFromBuffer(ab, asOf || parsed.asOf);

const prev = JSON.parse(readFileSync(FROZEN, 'utf-8')) as {
  asOf: string;
  vehicles: unknown[];
  contracts: unknown[];
  bankTx: unknown[];
  insurance: unknown[];
};

// 상환합계(할부) → 차량 필드로 이미 병합돼 나오는지 확인용. loans 는 얼린 스키마에 없음.
const next = {
  asOf: parsed.asOf,
  // 얼린 JSON은 비대칭이다(소비자 switchplan.ts 기준):
  //   vehicles = 병합 완료본(status·할부필드 포함) — 어댑터가 그대로 통과시킨다
  //   contracts = 원본(_carry/_kind) — 어댑터가 로드 시점에 _paidTotal 역산해 변환한다
  // 여기서 pack.contract(변환 완료본)를 넣으면 이중 변환이 되어 미수가 틀어진다.
  vehicles: pack.vehicle,
  contracts: parsed.contracts,
  bankTx: prev.bankTx,        // 보존 — 사업현황에 계좌 시트 없음
  insurance: prev.insurance,  // 보존 — 사업현황에 보험 시트 없음
};

const plates = (rows: unknown[]) =>
  new Set(rows.map((r) => String((r as Record<string, unknown>).plate || '').trim()).filter(Boolean));

const oldV = plates(prev.vehicles), newV = plates(next.vehicles);
const oldC = plates(prev.contracts), newC = plates(next.contracts);
const added = (a: Set<string>, b: Set<string>) => [...b].filter((x) => !a.has(x));
const gone = (a: Set<string>, b: Set<string>) => [...a].filter((x) => !b.has(x));

console.log(`기준일   ${prev.asOf}  →  ${next.asOf}`);
console.log(`차량     ${prev.vehicles.length} → ${next.vehicles.length}   신규 ${added(oldV, newV).length} · 사라짐 ${gone(oldV, newV).length}`);
console.log(`계약     ${prev.contracts.length} → ${next.contracts.length}   신규 ${added(oldC, newC).length} · 사라짐 ${gone(oldC, newC).length}`);
console.log(`계좌     ${prev.bankTx.length} (보존)`);
console.log(`보험     ${prev.insurance.length} (보존)`);
console.log(`할부     ${parsed.loans.length}건 파싱 · 현보유(활성) ${parsed.activePlates.length}`);

const goneV = gone(oldV, newV);
if (goneV.length) console.log(`\n⚠ 사라진 차량 ${goneV.length}건: ${goneV.slice(0, 20).join(', ')}`);

// 스키마 대사 — 얼린 소비자(switchplan.ts)가 기대하는 키가 빠지면 조용히 깨진다.
const keysOf = (rows: unknown[]) => {
  const s = new Set<string>();
  for (const r of rows.slice(0, 200)) for (const k of Object.keys(r as object)) s.add(k);
  return s;
};
for (const [label, a, b] of [
  ['vehicles', keysOf(prev.vehicles), keysOf(next.vehicles)],
  ['contracts', keysOf(prev.contracts), keysOf(next.contracts)],
] as [string, Set<string>, Set<string>][]) {
  const lost = [...a].filter((k) => !b.has(k));
  const gain = [...b].filter((k) => !a.has(k));
  if (lost.length) console.log(`\n⚠ ${label} 사라진 필드: ${lost.join(', ')}`);
  if (gain.length) console.log(`  ${label} 새 필드: ${gain.join(', ')}`);
}

if (parsed.warnings.length) {
  console.log(`\n파서 경고 ${parsed.warnings.length}건:`);
  for (const w of parsed.warnings.slice(0, 15)) console.log('  -', w);
}

if (!write) {
  console.log('\n※ 드라이런 — 파일 안 씀. 반영하려면 --write');
  process.exit(0);
}

// 기록 직전 가명화 — 실 xlsx에서 뽑은 실고객 PII가 커밋/푸시되지 않도록(SECURITY.md). 재무·carry 구조는 보존.
const masked = maskSwitchplanPII(next as unknown as SwitchplanSeed);
writeFileSync(out, JSON.stringify(masked, null, 2) + '\n', 'utf-8');
console.log(`\n✔ 기록(가명화): ${out}`);
