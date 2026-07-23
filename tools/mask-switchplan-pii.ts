/**
 * 얼린 시드(switchplan-data.json) 가명화 — 실고객 PII를 합성값으로 치환.
 *
 * 왜: switchplan-data.json 은 lib/migrate/switchplan.ts 가 정적 import 하여 번들에 포함되고,
 *     GitHub(freepass-creator/renman)로 푸시된다. 실명·실전화·번호판·VIN 원본을 리포에 담으면 안 된다.
 *     (주민번호는 애초에 시드에 없음.) 재무·날짜·상태·미수(carry) 구조는 100% 보존 → 데모/대사/화면 무영향.
 *
 * 결정적(deterministic)·참조무결성 보존:
 *   · 같은 실명 → 항상 같은 가명(고객NNN). contracts.contractorName ↔ bankTx.counterparty 동일 매핑.
 *   · 같은 실번호판 → 항상 같은 가짜번호판. vehicles/contracts/insurance/bankTx.memo 걸쳐 일관.
 *   · 회사 상대방(금융·조합·㈜ 등, 계약자명 아님)은 보존 — 개인정보 아니고 업무 의미 유지.
 *
 *   재사용: tools/rebuild-switchplan-frozen.ts 가 기록 직전 이 함수를 통과시킨다(재생성해도 PII 안 들어감).
 *   단독 실행: npx --yes tsx tools/mask-switchplan-pii.ts   → 현재 커밋된 파일을 제자리 가명화.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Rec = Record<string, unknown>;
export interface SwitchplanSeed {
  asOf: string;
  vehicles: Rec[];
  contracts: Rec[];
  bankTx: Rec[];
  insurance: Rec[];
}

const HANGUL = '가나다라마거너더러머버서어저고노도로모보소오조구누두루무부수우주바사아자허호하'.split('');

export function maskSwitchplanPII(input: SwitchplanSeed): SwitchplanSeed {
  const d = JSON.parse(JSON.stringify(input)) as SwitchplanSeed;
  const str = (v: unknown) => String(v ?? '').trim();

  // ── 결정적 매퍼(첫 등장 순서로 번호 부여) ──
  const plateMap = new Map<string, string>();
  const fakePlate = (real: unknown): string => {
    const k = str(real);
    if (!k) return k;
    if (!plateMap.has(k)) {
      const n = plateMap.size;
      plateMap.set(k, `${10 + (n % 90)}${HANGUL[n % HANGUL.length]}${1000 + n}`); // 1000+n → 유일
    }
    return plateMap.get(k)!;
  };
  const nameMap = new Map<string, string>();
  const fakeName = (real: unknown): string => {
    const k = str(real);
    if (!k) return k;
    if (!nameMap.has(k)) nameMap.set(k, `고객${String(nameMap.size + 1).padStart(3, '0')}`);
    return nameMap.get(k)!;
  };
  const phoneMap = new Map<string, string>();
  const fakePhone = (real: unknown): string => {
    const k = str(real);
    if (!k) return k;
    if (!phoneMap.has(k)) {
      const n = phoneMap.size + 1;
      phoneMap.set(k, `010-${String(2000 + n).slice(-4)}-${String(n).padStart(4, '0').slice(-4)}`);
    }
    return phoneMap.get(k)!;
  };
  const vinMap = new Map<string, string>();
  const fakeVin = (real: unknown): string => {
    const k = str(real);
    if (!k) return k;
    if (!vinMap.has(k)) vinMap.set(k, `DEMO${String(vinMap.size + 1).padStart(13, '0')}`); // 17자
    return vinMap.get(k)!;
  };

  // 회사 상대방(금융·캐피탈·은행·㈜·라틴 약칭 등)은 개인정보 아님 → 보존. 그 외 순수 한글 인명은 가명.
  const COMPANY = /금융|캐피탈|은행|저축|파이낸셜|대부|카드|조합|렌터카|리스|보험|공제|㈜|\(주\)|주식회사|[A-Za-z]{2,}/;
  const isPersonLike = (cp: string) =>
    !!cp && !COMPANY.test(cp) && /[가-힣]{2,4}/.test(cp) && cp.replace(/[가-힣0-9\s]/g, '').length === 0 && cp.length <= 8;

  // ── 1) 계약자명/번호판/전화/VIN 맵을 안정 순서로 선구축 ──
  for (const v of d.vehicles) { fakePlate(v.plate); fakeVin(v.vin); }
  for (const c of d.contracts) { fakePlate(c.plate); fakeName(c.contractorName); fakePhone(c.contractorPhone); }
  for (const i of d.insurance) fakePlate(i.plate);
  // 계약자 아닌 임차인이 bankTx.counterparty 로만 등장하는 경우(예: 대납·가족)도 인명이면 가명.
  for (const t of d.bankTx) { const cp = str(t.counterparty); if (cp && !nameMap.has(cp) && isPersonLike(cp)) fakeName(cp); }

  // ── 2) 적용 ──
  for (const v of d.vehicles) { if (v.plate) v.plate = fakePlate(v.plate); if (v.vin) v.vin = fakeVin(v.vin); }
  for (const c of d.contracts) {
    if (c.contractorName) c.contractorName = fakeName(c.contractorName);
    if (c.contractorPhone) c.contractorPhone = fakePhone(c.contractorPhone);
    if (c.plate) c.plate = fakePlate(c.plate);
  }
  for (const i of d.insurance) {
    if (i.plate) i.plate = fakePlate(i.plate);
    if (nameMap.has(str(i.contractor))) i.contractor = fakeName(i.contractor); // 회사(스위치플랜)면 보존
  }
  // bankTx: counterparty 가 계약자명(=고객)이면 가명, 회사면 보존. memo 안의 실번호판·실명도 치환.
  const nameHits = [...nameMap.keys()].sort((a, b) => b.length - a.length); // 긴 것부터(부분치환 안전)
  const plateHits = [...plateMap.keys()].sort((a, b) => b.length - a.length);
  for (const t of d.bankTx) {
    if (nameMap.has(str(t.counterparty))) t.counterparty = fakeName(t.counterparty);
    let memo = str(t.memo);
    if (memo) {
      for (const p of plateHits) if (memo.includes(p)) memo = memo.split(p).join(plateMap.get(p)!);
      for (const nm of nameHits) if (memo.includes(nm)) memo = memo.split(nm).join(nameMap.get(nm)!);
      t.memo = memo;
    }
  }
  return d;
}

// ── 단독 실행: 커밋된 시드를 제자리 가명화 ──
if (require.main === module) {
  const FROZEN = resolve(__dirname, '../lib/migrate/switchplan-data.json');
  const before = JSON.parse(readFileSync(FROZEN, 'utf-8')) as SwitchplanSeed;
  const after = maskSwitchplanPII(before);
  writeFileSync(FROZEN, JSON.stringify(after, null, 2) + '\n', 'utf-8');
  const carry = after.contracts.reduce((a, c) => a + Math.max(0, Number(c._carryUnpaid) || 0), 0);
  console.log(`✔ 가명화: 차량 ${after.vehicles.length} · 계약 ${after.contracts.length} · 계좌 ${after.bankTx.length} · 보험 ${after.insurance.length}`);
  console.log(`  carry 합 ${carry.toLocaleString('ko-KR')}원 (보존 확인)`);
}
