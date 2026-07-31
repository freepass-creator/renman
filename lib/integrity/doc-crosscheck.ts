/**
 * 서류 교차검증 — 투입한 서류와 데이터가 서로 어긋나는지 «실시간»으로 잡는다.
 *
 * 사장님 요구: 「등록증이랑 가입증명서랑 서류 다 업로드할거거든 · 올렸을때 저런거 검증도 해줘야지」
 *
 * ★기존 `lib/integrity/doc-audit.ts` 와 다르다: 그것은 마이그레이션 때 1회 만든 «정적 JSON»을 읽는다.
 *   이 파일은 살아있는 데이터(차량·보험·계약·자금거래)에서 매번 계산하므로, 서류를 올리는 순간
 *   결과가 갱신된다. 데이터관리 대량투입 → 이 검증 → 정합성·리스크 화면이 같은 SSOT를 본다.
 *
 * 규칙 5종은 실제 스위치플랜 실데이터(등록증 139·보험증권 109·계약서 102·자금일보 2,837건)를
 * 손으로 대조해서 «실제로 나온 문제»만 골랐다. 이론적 검사는 넣지 않았다.
 */
import { normPlate, isNormalPlate, vehicleMatchesPlate } from '@/lib/plate';
import type { EntityRecord } from '@/lib/intake/entities';

export type CrossCheckKind =
  | '번호오기입'   // 한 글자 차이 번호가 서로 다른 서류·레코드에 각각 존재
  | '정체불명'     // 거래는 있는데 차량·서류 어디에도 없는 번호
  | '무보험'       // 보유 차량인데 유효 보험이 없다(해지만 있는 경우 포함)
  | '서류미비'     // 등록증·보험증권·계약서 중 없는 것
  | '차종불일치';  // 같은 차의 차명이 서류·마스터·거래에서 다르다

export type CrossCheckSev = 'high' | 'med' | 'low';

export type CrossCheckItem = {
  companyId: string;
  plate: string;
  kind: CrossCheckKind;
  sev: CrossCheckSev;
  /** 사람이 읽는 한 줄. «무엇이 어긋났는지»를 말한다. */
  detail: string;
  /** 근거 — 어느 소스에서 봤는지. 화면 상세에서 그대로 보여준다. */
  evidence: string[];
};

const SEV_RANK: Record<CrossCheckSev, number> = { high: 0, med: 1, low: 2 };

/** 차량이 보유 상태인가 — 매각·말소·폐차는 검증 대상이 아니다. */
const OUT_STATUSES = new Set(['매각', '말소', '폐차', '처분완료']);
function inFleet(v: EntityRecord): boolean {
  return !OUT_STATUSES.has(String(v.status || '')) && !v.deletedAt;
}

/** 차명 비교용 정규화 — 「벤츠E클」/「E250」처럼 표기가 달라도 포함관계면 같은 것으로 본다. */
function modelKey(s: unknown): string {
  return String(s || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
}
function modelDiffers(a: unknown, b: unknown): boolean {
  const x = modelKey(a); const y = modelKey(b);
  if (!x || !y) return false;
  return !x.includes(y) && !y.includes(x);
}

/**
 * 오기입으로 의심되는 번호 쌍 — 두 가지 오타 유형만 잡는다.
 *
 * ★실데이터(보험증권 vs 등록증)에서 실제로 나온 «한 글자» 3쌍:
 *   145«거»1781 ↔ 145«가»1781 · «3»7나3382 ↔ «5»7나3382 · 97«너»0815 ↔ 97«러»0815
 *   사람 눈으로는 못 잡는다 — 같은 차가 두 대로 갈라지거나 서류가 엉뚱한 차에 붙는다.
 *
 * 잡는 유형:
 *   ① 한 글자 치환 — 가/거, 너/러, 3/5 처럼 붙어 있는 자·모나 비슷한 숫자
 *   ② 인접 자리바꿈 — 「1234」→「1243」. 타이핑에서 가장 흔한 오타 유형이다.
 * ★두 글자 이상 다른 것은 잡지 않는다 — 별개 차량일 가능성이 높아 오탐이 된다
 *   (예: 2«54»가2481 vs 2«65»가2481 은 두 글자가 달라 이 규칙에 걸리지 않는다.
 *    의심스럽더라도 «번호오기입»으로 단정할 근거가 없으므로, 그런 건은 서류미비·정체불명 규칙이 잡는다).
 */
export function findPlateTypoPairs(plates: Iterable<string>): Array<[string, string]> {
  const list = [...new Set([...plates].map((p) => normPlate(p)).filter((p) => p && isNormalPlate(p)))];
  const byLen = new Map<number, string[]>();
  for (const p of list) {
    const arr = byLen.get(p.length);
    if (arr) arr.push(p); else byLen.set(p.length, [p]);
  }
  const pairs: Array<[string, string]> = [];
  for (const group of byLen.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]; const b = group[j];
        const at: number[] = [];
        for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) { at.push(k); if (at.length > 2) break; }
        if (at.length === 1) { pairs.push([a, b]); continue; }
        // 인접 자리바꿈 — 다른 자리가 딱 2곳이고 서로 붙어 있으며 두 글자를 맞바꾸면 같아진다.
        if (at.length === 2 && at[1] === at[0] + 1 && a[at[0]] === b[at[1]] && a[at[1]] === b[at[0]]) {
          pairs.push([a, b]);
        }
      }
    }
  }
  return pairs;
}

export type CrossCheckInput = {
  vehicles: EntityRecord[];
  insurances: EntityRecord[];
  contracts: EntityRecord[];
  /** 자금 거래 — 「정체불명 차량에 돈이 오갔다」 판정용. */
  bankTx?: EntityRecord[];
  today: string;
};

/**
 * 서류 교차검증 실행. 순수 함수 — 화면·투입 후처리·정합성 화면이 모두 이걸 부른다.
 * 결과는 심각도순. 같은 차량에 여러 문제가 있으면 각각 한 줄씩 나온다(합치지 않는다 — 조치가 다르므로).
 */
export function crossCheckDocuments(input: CrossCheckInput): CrossCheckItem[] {
  const { vehicles, insurances, contracts, bankTx = [], today } = input;
  const out: CrossCheckItem[] = [];

  const fleet = vehicles.filter(inFleet);
  const coOf = (v?: EntityRecord) => String(v?.companyId || '');

  /* ── ① 번호 오기입 ─────────────────────────────────────────────
     차량·보험·계약·거래에 등장한 «모든» 번호를 모아 한 글자 차이 쌍을 찾는다.
     둘 다 차량마스터에 있으면 정상적인 별개 차량일 수 있으므로 낮은 심각도,
     한쪽만 마스터에 있으면 «없는 쪽이 오기입»일 가능성이 높다 → high. */
  const plateSource = new Map<string, Set<string>>();
  const note = (p: unknown, src: string) => {
    const n = normPlate(p);
    if (!n || !isNormalPlate(n)) return;
    const s = plateSource.get(n);
    if (s) s.add(src); else plateSource.set(n, new Set([src]));
  };
  for (const v of fleet) note(v.plate, '차량');
  for (const i of insurances) note(i.plate, '보험증권');
  for (const c of contracts) note(c.plate, '계약');
  for (const t of bankTx) note(t.plate, '자금거래');

  const inMaster = new Set(fleet.map((v) => normPlate(v.plate)).filter(Boolean));
  for (const [a, b] of findPlateTypoPairs(plateSource.keys())) {
    const aM = inMaster.has(a); const bM = inMaster.has(b);
    if (aM && bM) continue;   // 둘 다 등록된 차 = 별개 차량일 수 있다(오탐 방지)
    const suspect = aM ? b : a;         // 마스터에 없는 쪽이 오기입 후보
    const real = aM ? a : b;
    const srcS = [...(plateSource.get(suspect) || [])].join('·');
    const srcR = [...(plateSource.get(real) || [])].join('·');
    const vr = fleet.find((v) => normPlate(v.plate) === real);
    out.push({
      companyId: coOf(vr),
      plate: suspect,
      kind: '번호오기입',
      sev: 'high',
      detail: `${suspect} 와 ${real} 이 한 글자만 다릅니다 — 같은 차의 번호 오기입일 수 있습니다`,
      evidence: [`${suspect}: ${srcS || '출처불명'}`, `${real}: ${srcR}${vr ? ' (차량 등록됨)' : ''}`],
    });
  }

  /* ── ② 정체불명 — 거래는 있는데 차량·서류 어디에도 없다 ──────────
     실데이터에서 4대 나왔다(161호1259·181호2705·193우6313·394서7476).
     오기입이거나 미등록 차량 운용이다. 돈이 오간 기록이 있으므로 그냥 둘 수 없다. */
  const known = new Set<string>();
  for (const v of vehicles) {
    const n = normPlate(v.plate);
    if (n) known.add(n);
    const hist = Array.isArray(v.plateHistory) ? v.plateHistory : [];
    for (const h of hist) { const hn = normPlate(h); if (hn) known.add(hn); }
  }
  const orphanCount = new Map<string, { n: number; co: string }>();
  for (const t of bankTx) {
    const n = normPlate(t.plate);
    if (!n || !isNormalPlate(n) || known.has(n)) continue;
    const cur = orphanCount.get(n);
    if (cur) cur.n += 1; else orphanCount.set(n, { n: 1, co: String(t.companyId || '') });
  }
  for (const [n, { n: cnt, co }] of orphanCount) {
    out.push({
      companyId: co,
      plate: n,
      kind: '정체불명',
      sev: 'high',
      detail: `차량·서류에 없는 번호인데 자금거래 ${cnt}건이 있습니다 — 오기입이거나 미등록 차량입니다`,
      evidence: [`자금거래 ${cnt}건`, '차량마스터·등록증·보험증권 모두 없음'],
    });
  }

  /* ── ③ 무보험 ─────────────────────────────────────────────────
     실데이터에서 47대 나왔고 그중 6대는 «해지 증권만» 있었다 — 보험을 끊었는데 차가 남아 있다.
     무보험 운행은 사고 시 보험 부인 사유이므로 «해지만 있음»을 따로 구분한다. */
  for (const v of fleet) {
    const n = normPlate(v.plate);
    if (!n) continue;
    const mine = insurances.filter((i) => vehicleMatchesPlate(v, i.plate) || normPlate(i.plate) === n);
    const valid = mine.filter((i) => {
      const end = String(i.endDate || '').slice(0, 10);
      const cancelled = !!i.cancelledDate || String(i.status || '').includes('해지');
      return !cancelled && end >= today;
    });
    if (valid.length > 0) continue;
    const hadAny = mine.length > 0;
    const lastEnd = mine.map((i) => String(i.endDate || '').slice(0, 10)).filter(Boolean).sort().pop();
    out.push({
      companyId: coOf(v),
      plate: String(v.plate || n),
      kind: '무보험',
      sev: 'high',
      detail: hadAny
        ? `유효한 보험이 없습니다 — 이전 증권 ${mine.length}건은 해지·만기(${lastEnd || '날짜불명'})입니다`
        : '보험증권이 아예 없습니다',
      evidence: hadAny ? [`증권 ${mine.length}건 있으나 전부 무효`, `마지막 만기 ${lastEnd || '불명'}`] : ['보험 레코드 0건'],
    });
  }

  /* ── ④ 서류미비 — 등록증·보험증권·계약서 3종 ────────────────────
     첨부는 _docs 에 type 별로 쌓인다(lib/docs.ts). 없는 종류를 나열한다.
     계약서는 «운행 중 계약이 있는 차»에만 요구한다(계약이 없으면 계약서도 없는 게 맞다). */
  const activeContractByPlate = new Map<string, EntityRecord>();
  for (const c of contracts) {
    if (c.returnedDate) continue;
    const n = normPlate(c.plate);
    if (n && !activeContractByPlate.has(n)) activeContractByPlate.set(n, c);
  }
  const docTypes = (rec: EntityRecord): Set<string> => {
    const docs = Array.isArray(rec._docs) ? (rec._docs as Array<Record<string, unknown>>) : [];
    return new Set(docs.map((d) => String(d.type || '')).filter(Boolean));
  };
  for (const v of fleet) {
    const n = normPlate(v.plate);
    if (!n) continue;
    const have = docTypes(v);
    const missing: string[] = [];
    if (!have.has('vehicle')) missing.push('자동차등록증');
    if (!have.has('insurance')) missing.push('보험증권');
    const c = activeContractByPlate.get(n);
    if (c && !docTypes(c).has('contract')) missing.push('계약서');
    if (missing.length === 0) continue;
    out.push({
      companyId: coOf(v),
      plate: String(v.plate || n),
      kind: '서류미비',
      // 등록증이 없으면 차량 자체를 증명할 수 없다 → high. 나머지는 med.
      sev: missing.includes('자동차등록증') ? 'high' : 'med',
      detail: `${missing.join('·')} 미첨부`,
      evidence: [`첨부된 서류: ${[...have].join('·') || '없음'}`, c ? `운행 계약 있음(${String(c.contractorName || '계약자 미기재')})` : '운행 계약 없음'],
    });
  }

  /* ── ⑤ 차종 불일치 ────────────────────────────────────────────
     실데이터에서 41건 나왔다 — 등록증 파일명·차량마스터·자금일보 기입이 세 곳 다 다르다
     (「벤츠S클」/「벤츠S450」, 「3시리즈」/「BMW 330i」…). 차종별 집계가 불가능해진다. */
  for (const v of fleet) {
    const n = normPlate(v.plate);
    if (!n) continue;
    const mine = insurances.filter((i) => normPlate(i.plate) === n);
    const insName = mine.map((i) => i.carName).find(Boolean);
    const txName = bankTx.find((t) => normPlate(t.plate) === n && t.carName)?.carName;
    const conflicts: string[] = [];
    if (insName && modelDiffers(v.carName, insName)) conflicts.push(`보험증권「${insName}」`);
    if (txName && modelDiffers(v.carName, txName)) conflicts.push(`자금거래「${txName}」`);
    if (conflicts.length === 0) continue;
    out.push({
      companyId: coOf(v),
      plate: String(v.plate || n),
      kind: '차종불일치',
      sev: 'low',
      detail: `차명이 서로 다릅니다 — 차량「${String(v.carName || '미기재')}」 ≠ ${conflicts.join(' · ')}`,
      evidence: [`차량마스터: ${String(v.carName || '미기재')}`, ...conflicts],
    });
  }

  return out.sort((a, b) => SEV_RANK[a.sev] - SEV_RANK[b.sev] || a.plate.localeCompare(b.plate, 'ko'));
}

/** 종류별 건수 — 요약 카드·투입 후 안내에 쓴다. */
export function crossCheckCounts(items: CrossCheckItem[]): Record<CrossCheckKind, number> {
  const base: Record<CrossCheckKind, number> = {
    번호오기입: 0, 정체불명: 0, 무보험: 0, 서류미비: 0, 차종불일치: 0,
  };
  for (const it of items) base[it.kind] += 1;
  return base;
}

/** 투입 직후 안내용 한 줄 — 무엇을 몇 건 잡았는지. 문제가 없으면 빈 문자열. */
export function crossCheckSummary(items: CrossCheckItem[]): string {
  const c = crossCheckCounts(items);
  const parts = (Object.entries(c) as Array<[CrossCheckKind, number]>)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k} ${n}건`);
  return parts.length ? parts.join(' · ') : '';
}
