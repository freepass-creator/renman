/**
 * 차종마스터(catalog) — freepasserp3 `public/data/car-master/_index.json`(403 세부모델) 이식.
 * 소스 원본: erp3 src/core/catalog-source.js · vehicle-master-tree.js (충실 포팅, renman TS 규격).
 *
 *   5단계 트리: 제조사(maker) → 모델(model_root) → 세부모델(catalog title−maker) → 파워트레인(variant) → 트림(trim)
 *   ※ 화면표기 '파워트레인' = 내부키 variant (welrix 신차견적기 variant와 동일물).
 *
 * 용도: (1) 기존 차량 차명→5단계 자동분류(classifyVehicle), (2) 향후 수기입력 캐스케이드(getCatalog*).
 * 데이터=식별/스펙만(가격은 trims_meta에 일부, 세금 없음). 파일은 public → 클라 fetch(메모이즈).
 */

export type CatalogEntry = {
  id: string;
  title: string;
  maker: string;
  model_root: string;
  year_start?: string;
  year_end?: string;
  trims?: string[];
  trims_meta?: Record<string, number>;
};

let _index: Record<string, CatalogEntry> | null = null;
let _ready: Promise<Record<string, CatalogEntry>> | null = null;
let _modelsByMaker: Map<string, Set<string>> | null = null;   // canonMk → model_root 집합(수입 엔진코드 추론용, 지연구축)

/** catalog _index.json 로드(1회 메모이즈). 부팅/페이지 진입 시 await. */
export async function ensureCatalog(): Promise<Record<string, CatalogEntry>> {
  if (_index) return _index;
  if (_ready) return _ready;
  _ready = (async () => {
    const res = await fetch('/data/car-master/_index.json');
    if (!res.ok) throw new Error('차종마스터 로드 실패: ' + res.status);
    _index = (await res.json()) as Record<string, CatalogEntry>;
    _modelsByMaker = null;
    return _index;
  })();
  return _ready;
}

/** 로드된 catalog(동기 접근). ensureCatalog() 이후에만 유효. */
export function peekCatalog(): Record<string, CatalogEntry> | null {
  return _index;
}

/** catalog 직접 주입 — 서버/노드(rebuild tsx)에서 readFileSync로 로드해 주입할 때 사용(fetch 불가 환경). */
export function setCatalog(index: Record<string, CatalogEntry>): void {
  _index = index;
  _modelsByMaker = null;
}

/** title 에서 maker 접두 제거 → 세부모델 표기. "기아 올 뉴 K3 BD" → "올 뉴 K3 BD" */
export function titleToSubModel(maker: string, title: string): string {
  if (!title) return '';
  if (!maker) return title.trim();
  const m = title.match(new RegExp('^' + maker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+(.+)$'));
  return m ? m[1].trim() : title.trim();
}

const norm = (s: unknown) =>
  String(s || '').toLowerCase().replace(/\s+/g, '').replace(/the|신형|올뉴|디올뉴|더뉴|뉴/g, '');
// 모델 비교용 — 하이픈까지 제거(E-클래스↔E클래스, 5-시리즈↔5시리즈).
const nm = (s: unknown) => norm(s).replace(/-/g, '');
// 제조사 별칭 정규화 — KGM=쌍용=KG모빌리티, 벤츠=benz=mercedes, 쉐보레=GM대우=한국GM 등.
const MAKER_ALIAS: Record<string, string> = {
  '쌍용': 'kgm', 'kg모빌리티': 'kgm', 'kgm': 'kgm', 'ssangyong': 'kgm',
  'benz': '벤츠', 'mercedes': '벤츠', '메르세데스': '벤츠', '벤츠': '벤츠',
  'gm대우': '쉐보레', '한국gm': '쉐보레', '대우': '쉐보레', '르노삼성': '르노', '르노코리아': '르노',
};
const canonMk = (s: unknown) => { const n = norm(s); return MAKER_ALIAS[n] || n; };

// 수입 엔진코드 → SSOT 한글 모델 추론 (520d→5시리즈, C200→C클래스). erp3 ssot-snap.js MB_PAT 이식.
const MB_PAT: [RegExp, string][] = [
  [/glc/i, 'GLC-클래스'], [/gle/i, 'GLE-클래스'], [/gla/i, 'GLA-클래스'], [/glb/i, 'GLB-클래스'], [/gls/i, 'GLS-클래스'],
  [/cls/i, 'CLS-클래스'], [/cla/i, 'CLA-클래스'], [/eqs/i, 'EQS'], [/eqe/i, 'EQE'], [/amg\s*gt/i, 'AMG GT'],
  [/\bsl\b/i, 'SL-클래스'], [/\bv\s?\d{3}/i, 'V-클래스'],
  [/\bs\s?\d{3}|s클래스/i, 'S-클래스'], [/\be\s?\d{3}|e클래스/i, 'E-클래스'], [/\bc\s?\d{3}|c클래스/i, 'C-클래스'],
  [/\ba\s?\d{3}|a클래스/i, 'A-클래스'], [/\bg\s?\d{3}|g클래스/i, 'G-클래스'],
];

/** canonMk(maker) → 그 제조사의 catalog model_root 집합(지연구축). */
function modelsForMaker(maker: string): Set<string> | null {
  if (!_index) return null;
  if (!_modelsByMaker) {
    _modelsByMaker = new Map();
    for (const c of Object.values(_index)) {
      if (!c.model_root) continue;
      const k = canonMk(c.maker);
      if (!_modelsByMaker.has(k)) _modelsByMaker.set(k, new Set());
      _modelsByMaker.get(k)!.add(c.model_root);
    }
  }
  return _modelsByMaker.get(canonMk(maker)) || null;
}

/** 수입 엔진코드 문자열 → catalog의 실제 model_root(정규화 매칭). 벤츠·BMW·아우디. 없으면 ''. */
export function inferImportModel(maker: string, text: string): string {
  const models = modelsForMaker(maker);
  if (!models) return '';
  const has = (label: string): string => {
    const n = nm(label);
    for (const m of models) { const x = nm(m); if (x === n || x.includes(n) || n.includes(x)) return m; }
    return '';
  };
  const mk = canonMk(maker);
  let mm: RegExpMatchArray | null;
  let r: string;
  if (mk === '벤츠') { for (const [re, mo] of MB_PAT) { if (re.test(text)) { r = has(mo); if (r) return r; } } return ''; }
  if (mk === 'bmw') {
    if ((mm = text.match(/\bX\s?([1-7])\b/i)) && (r = has('X' + mm[1]))) return r;
    if ((mm = text.match(/([1-8])\d{2}\s?[a-z]{0,2}/i)) && (r = has(mm[1] + '시리즈'))) return r;
    return '';
  }
  if (mk === '아우디') {
    if ((mm = text.match(/\bQ\s?([1-8])\b/i)) && (r = has('Q' + mm[1]))) return r;
    if ((mm = text.match(/\bA\s?([1-8])\b/i)) && (r = has('A' + mm[1]))) return r;
    return '';
  }
  return '';
}

/** 차명 전처리 — 연속 중복 토큰 제거(벤츠 벤츠) + 붙은 제조사-코드 분리(BMW530i→BMW 530i). */
function preNormName(s: string): string {
  const toks = String(s || '').replace(/\s+/g, ' ').trim().split(' ');
  const out: string[] = [];
  for (const w of toks) if (out[out.length - 1] !== w) out.push(w);
  return out.join(' ').replace(/(BMW|벤츠|아우디|Audi)(\d)/gi, '$1 $2');
}

// ── 제조사 정렬 순위(국산 인기순 → 수입 인기순 → 가나다) ──
const KOR_MAKER_RANK = ['현대', '기아', '제네시스', 'KGM', '쌍용', '쉐보레', '한국GM', 'GM대우', '르노', '르노삼성', '대우'];
const FOREIGN_MAKER_RANK = ['BMW', '벤츠', '아우디', '테슬라', '렉서스', '미니', '볼보', '폭스바겐', '포르쉐', '랜드로버', '재규어', '포드', '지프', '도요타', '토요타', '닛산', '혼다', '인피니티', '캐딜락', '링컨', '크라이슬러', '마세라티', '페라리', '람보르기니', '벤틀리', '롤스로이스', '맥라렌', '애스턴마틴', '부가티'];

export function getCatalogMakers(): string[] {
  if (!_index) return [];
  const set = new Set<string>();
  for (const c of Object.values(_index)) if (c.maker) set.add(c.maker);
  return [...set].sort((a, b) => {
    const ak = KOR_MAKER_RANK.indexOf(a), bk = KOR_MAKER_RANK.indexOf(b);
    const aKor = ak >= 0, bKor = bk >= 0;
    if (aKor !== bKor) return aKor ? -1 : 1;
    if (aKor) return ak - bk;
    const af = FOREIGN_MAKER_RANK.indexOf(a), bf = FOREIGN_MAKER_RANK.indexOf(b);
    const aKnown = af >= 0, bKnown = bf >= 0;
    if (aKnown !== bKnown) return aKnown ? -1 : 1;
    if (aKnown) return af - bf;
    return a.localeCompare(b, 'ko');
  });
}

export function getCatalogModels(maker: string): string[] {
  if (!maker || !_index) return [];
  const set = new Set<string>();
  for (const c of Object.values(_index)) if (c.maker === maker && c.model_root) set.add(c.model_root);
  return [...set].sort((a, b) => a.localeCompare(b, 'ko'));
}

export type SubModelOpt = { id: string; sub: string; title: string; year_start: string; year_end: string };

export function getCatalogSubModels(maker: string, model_root: string): SubModelOpt[] {
  if (!maker || !model_root || !_index) return [];
  const out: SubModelOpt[] = [];
  for (const c of Object.values(_index)) {
    if (c.maker !== maker || c.model_root !== model_root) continue;
    out.push({ id: c.id, sub: titleToSubModel(maker, c.title), title: c.title, year_start: c.year_start || '', year_end: c.year_end || '' });
  }
  const fuelRank = (t: string) => {
    if (/일렉트리파이드|electrified|일렉트릭|electric|\bev\b/i.test(t)) return 2;
    if (/하이브리드|hybrid|hev/i.test(t)) return 1;
    return 0;
  };
  out.sort((a, b) => {
    if (a.year_start && b.year_start && a.year_start !== b.year_start) return b.year_start.localeCompare(a.year_start);
    if (a.year_start && !b.year_start) return -1;
    if (!a.year_start && b.year_start) return 1;
    const ar = fuelRank(a.title || a.sub), br = fuelRank(b.title || b.sub);
    if (ar !== br) return ar - br;
    return a.sub.localeCompare(b.sub, 'ko');
  });
  return out;
}

/** catalog_id 의 트림 배열 — 소비자가(trims_meta) 오름차순, 가격 없는 건 뒤로. */
export function getCatalogTrims(catalogId: string): string[] {
  if (!catalogId || !_index) return [];
  const c = _index[catalogId];
  const trims = Array.isArray(c?.trims) ? c!.trims! : [];
  const meta = c?.trims_meta || {};
  return [...trims].sort((a, b) => {
    const pa = meta[a] || 0, pb = meta[b] || 0;
    if (pa && pb) return pa - pb;
    if (pa && !pb) return -1;
    if (!pa && pb) return 1;
    return 0;
  });
}

export function getCatalogById(catalogId: string): CatalogEntry | null {
  if (!catalogId || !_index) return null;
  return _index[catalogId] || null;
}

export function findCatalogBySubModel(maker: string, subModel: string): CatalogEntry | null {
  if (!maker || !subModel || !_index) return null;
  const target = subModel.trim();
  for (const c of Object.values(_index)) {
    if (c.maker !== maker) continue;
    if (titleToSubModel(maker, c.title) === target) return c;
  }
  return null;
}

/** 모델명 → 제조사(catalog model_root 매칭). */
export function catalogMakerByModel(model: string): string {
  if (!_index || !model) return '';
  const n = norm(model);
  if (n.length < 2) return '';
  const cats = Object.values(_index).filter((c) => c.model_root);
  for (const c of cats) if (norm(c.model_root) === n) return c.maker;      // 정확 일치
  for (const c of cats) {                                                   // 부분일치 — 4자+(짧은코드 충돌 방지)
    const nm = norm(c.model_root);
    if (nm.length >= 4 && (n.includes(nm) || nm.includes(n))) return c.maker;
  }
  return '';
}

// 제조사 미입력 시 모델·트림 문자열로 추론(catalog 실패 후 fallback).
const MAKER_PATTERNS: [RegExp, string][] = [
  [/\bBMW\b|[1-8]시리즈|\bX[1-7]\b|\bM[1-8]\b|\b[1-8]\d{2}[id]\b|xDrive|그란\s?쿠페|미니쿠퍼/i, 'BMW'],
  [/벤츠|benz|mercedes|[ESCGAV]\s?클래스|\bGL[CESAB]\b|\b[ESCG]\d{3}[de]?\b|AMG|4MATIC|마이바흐|EQ[ABCES]/i, '벤츠'],
  [/아우디|audi|\b[AQ][1-8]\b|\bRS\s?[1-8]\b|\bSQ[1-8]\b|TFSI|quattro|콰트로|e-?트론|e-?tron/i, '아우디'],
  [/폭스바겐|volkswagen|골프|티구안|아테온|파사트|제타|투아렉/i, '폭스바겐'],
  [/볼보|volvo|\bXC[1-9]0\b|\b[SV][6-9]0\b/i, '볼보'],
  [/테슬라|tesla|model\s?[3sxy]|모델\s?[3sxy와이쓰리]/i, '테슬라'],
  [/포르쉐|porsche|카이엔|마칸|파나메라|\b911\b|타이칸|박스터|카이맨/i, '포르쉐'],
  [/렉서스|lexus|\b[EINRU]X\d{3}\b|\bES\d{3}\b|\bLS\d{3}\b/i, '렉서스'],
  [/\bMINI\b|미니쿠퍼|쿠퍼|countryman|클럽맨/i, 'MINI'],
  [/지프|jeep|랭글러|체로키|컴패스|레니게이드|그랜드체로키/i, '지프'],
  [/랜드로버|land\s?rover|레인지로버|디스커버리|디펜더|이보크/i, '랜드로버'],
  [/포드|ford|머스탱|익스플로러|토러스|썬더버드/i, '포드'],
  [/혼다|honda|어코드|시빅|CR-?V|파일럿|오딧세이/i, '혼다'],
  [/마세라티|maserati|기블리|르반떼|콰트로포르테|그레칼레/i, '마세라티'],
  [/그랑\s?콜레오스|아르카나|QM6|SM6|XM3|마스터|르노|콜레오스/i, '르노'],
  [/쉐보레|chevrolet|말리부|트래버스|트랙스|이쿼녹스|콜로라도|트레일블레이저|볼트/i, '쉐보레'],
  [/KGM|KG모빌리티|쌍용|토레스|렉스턴|티볼리|코란도|액티언/i, 'KGM'],
];

export function inferMaker(model: string, text = ''): string {
  const byCat = catalogMakerByModel(model);
  if (byCat) return byCat;
  const blob = `${model || ''} ${text || ''}`;
  for (const [re, mk] of MAKER_PATTERNS) if (re.test(blob)) return mk;
  return '';
}

/**
 * maker + model + 연식 → catalog 세대(세부모델). 공급사 표기 강건 fuzzy.
 * 반환: { subModel, catalogId, matched: 'year'|'recent' } | null
 */
export function catalogSubModelByYear(
  maker: string, model: string, regDate?: string,
): { subModel: string; catalogId: string; matched: 'year' | 'recent' } | null {
  if (!_index) return null;
  const nMk = canonMk(maker), nMd = nm(model);
  if (!nMd) return null;
  let cands = Object.values(_index).filter((c) => {
    if (!c.model_root) return false;
    const mk = !maker || canonMk(c.maker) === nMk || norm(c.maker).includes(norm(maker)) || norm(maker).includes(norm(c.maker));
    const md = nm(c.model_root) === nMd || nMd.includes(nm(c.model_root)) || nm(c.model_root).includes(nMd);
    return mk && md;
  });
  if (!cands.length) return null;
  const base = cands.filter((c) => !/HEV|하이브리드/.test(c.title || ''));
  if (base.length) cands = base;
  const parseYM = (s: string) => {
    s = String(s || '').trim();
    let m = s.match(/((?:19|20)\d{2})[-.\/년]?\s*(\d{1,2})?/);
    if (m) return m[1] + '-' + String(m[2] || '1').padStart(2, '0');
    m = s.match(/^(\d{2})[-.\/년]\s*(\d{1,2})?/);
    if (m) return (2000 + Number(m[1])) + '-' + String(m[2] || '1').padStart(2, '0');
    return '';
  };
  const ym = parseYM(regDate || '');
  if (ym) {
    const hit = cands.find((c) => {
      const ys = (c.year_start || '').slice(0, 7) || '0000-00';
      const ye = c.year_end === '현재' ? '9999-99' : ((c.year_end || '').slice(0, 7) || '9999-99');
      return ym >= ys && ym <= ye;
    });
    if (hit) return { subModel: titleToSubModel(hit.maker, hit.title), catalogId: hit.id, matched: 'year' };
  }
  cands.sort((a, b) => (b.year_start || '').localeCompare(a.year_start || ''));
  return { subModel: titleToSubModel(cands[0].maker, cands[0].title), catalogId: cands[0].id, matched: 'recent' };
}

// ── 트림 문자열 → { variant(파워트레인), trim(트림) } (erp3 vehicle-master-tree.parseTrim 이식) ──
const FUEL = new Set(['가솔린', '휘발유', '디젤', '경유', 'LPG', 'LPi', 'LPI', '하이브리드', 'HEV', '전기', 'EV', '수소', 'PHEV', 'FCEV']);
const FUEL_NORM: Record<string, string> = { '경유': '디젤', '휘발유': '가솔린', '전기': 'EV' };
const normFuel = (t: string) => FUEL_NORM[t] || t;
const BATTERY = new Set(['스탠다드', '스탠더드', '롱레인지', '롱 레인지']);
const DRIVE = new Set(['AWD', '4WD', '2WD', 'RWD', 'FWD', 'e-4WD', '2륜', '4륜', '4MATIC', 'xDrive']);
const TURBO = new Set(['T', '터보', 'T-GDI', 'GDI', 'e-VGT', 'TDI', 'T8', 'T6', 'T5']);
const NOISE_TRIM = new Set(['더', '올', '디', '뉴', '신형', '렌터카', '렌트', '렌트카', '자가용', '영업용', '리스', '법인', '런칭', 'the', 'The']);

function isSpecToken(tok: string): boolean {
  if (!tok) return false;
  if (FUEL.has(tok) || BATTERY.has(tok) || DRIVE.has(tok) || TURBO.has(tok)) return true;
  if (/^\d\.\d$/.test(tok)) return true;
  if (/^\d{3,4}cc$/i.test(tok)) return true;
  if (/^\d+인승$/.test(tok)) return true;
  if (/^\d\.\dT$/i.test(tok)) return true;
  return false;
}
function classifySpec(tok: string): 'fuel' | 'battery' | 'turbo' | 'drive' | 'seats' | 'disp' | 'etc' {
  if (FUEL.has(tok)) return 'fuel';
  if (BATTERY.has(tok)) return 'battery';
  if (TURBO.has(tok)) return 'turbo';
  if (DRIVE.has(tok)) return 'drive';
  if (/^\d+인승$/.test(tok)) return 'seats';
  if (/^\d\.\dT$/i.test(tok)) return 'disp';
  if (/^\d\.\d$/.test(tok) || /^\d{3,4}cc$/i.test(tok)) return 'disp';
  return 'etc';
}

export function parseTrim(raw: string): { variant: string; trim: string } {
  const s = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!s) return { variant: '', trim: '(기본)' };
  const toks = s.split(' ');
  const hasEV = toks.some((t) => t === '전기' || t === 'EV');
  const slots: Record<string, string[]> = { fuel: [], disp: [], battery: [], turbo: [], drive: [], seats: [], etc: [] };
  const trimToks: string[] = [];
  for (const tok of toks) {
    const mt = tok.match(/^(\d\.\d)T$/i);
    if (mt) { slots.disp.push(mt[1]); slots.turbo.push('T'); continue; }
    if (FUEL.has(tok)) { slots.fuel.push(tok); continue; }
    if (tok === '롱레인지' || tok === '롱') { slots.battery.push('롱레인지'); continue; }
    if (tok === '레인지') continue;
    if (tok === '스탠다드' || tok === '스탠더드') { (hasEV ? slots.battery : trimToks).push(tok); continue; }
    if (isSpecToken(tok)) { slots[classifySpec(tok)].push(tok); continue; }
    if (NOISE_TRIM.has(tok) || /^\d{2,4}\s*MY$/i.test(tok)) continue;
    trimToks.push(tok);
  }
  slots.fuel = slots.fuel.map(normFuel);
  const ordered = [
    ...slots.fuel, ...slots.disp, ...slots.battery,
    ...(slots.turbo.length ? ['T'] : []),
    ...slots.drive, ...slots.seats, ...slots.etc,
  ];
  return { variant: ordered.join(' '), trim: trimToks.length ? trimToks.join(' ') : '(기본)' };
}

// ── 기존 차량 자동분류: 차명 + 연식(최초등록/제작연월) → 5단계 상위(제조사·모델·세부모델) 스냅 ──
export type ClassifyResult = {
  maker: string;
  modelLine: string;
  subModel: string;
  catalogId: string;
  confidence: 'high' | 'review' | 'none';
};

/**
 * 등록증 차명(carName)은 보통 모델명(±접두) 수준 → 제조사·모델·세부모델까지만 신뢰 스냅.
 * 파워트레인·트림은 차명에 없어 비움(수기/후속). matched='year'→high, 'recent'→review, 실패→none.
 */
export function classifyVehicle(carName: string, regDate?: string): ClassifyResult {
  const empty: ClassifyResult = { maker: '', modelLine: '', subModel: '', catalogId: '', confidence: 'none' };
  const name = preNormName(String(carName || '').trim());
  if (!name || !_index) return empty;
  const maker = inferMaker(name);
  let sub = catalogSubModelByYear(maker, name, regDate);
  // 직접 매칭 실패 & 수입 브랜드 → 엔진코드로 모델 추론 후 재시도(C200→C클래스, 520d→5시리즈).
  if (!sub && maker) { const im = inferImportModel(maker, name); if (im) sub = catalogSubModelByYear(maker, im, regDate); }
  if (!sub) return empty;
  const cat = getCatalogById(sub.catalogId);
  if (!cat) return empty;
  return {
    maker: cat.maker,
    modelLine: cat.model_root,
    subModel: sub.subModel,
    catalogId: sub.catalogId,
    confidence: sub.matched === 'year' ? 'high' : 'review',
  };
}
