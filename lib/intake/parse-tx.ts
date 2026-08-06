/**
 * 계좌·CMS 실파일 파서 — v5 검증본 이식(excel-detect + intake/classify + import-commit.parseBankTxRow + parsers/cms).
 *   은행 통장 export(신한 등)·효성CMS 결제내역 엑셀을 헤더 자동탐지 → v6 bank_tx 레코드로.
 *   v6 인제스천(xlsx.parseSpreadsheet)에서 entityKey='bank_tx'일 때 사용.
 *   출력 = bank_tx 엔티티 필드 { account, txDate, amount(입금), withdraw(출금), balance, counterparty, memo, method } (+ contractNo 보조).
 */
import * as XLSX from 'xlsx';
import type { EntityRecord } from './entities';

/* ── 날짜 정규화 (v5 parsers/date 이식) ── */
export function normalizeKoreanDate(s: unknown): string {
  if (s == null) return '';
  if (s instanceof Date) return Number.isNaN(s.getTime()) ? '' : toISO(s.getFullYear() < 1990 ? new Date(s.getFullYear() + 100, s.getMonth(), s.getDate()) : s);
  if (typeof s === 'number' && s >= 40000 && s < 60000) {
    const d = new Date(Date.UTC(1899, 11, 30) + s * 86400000);
    const y = d.getUTCFullYear();
    if (!Number.isNaN(d.getTime()) && y >= 2000 && y <= 2100) return `${y}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
  }
  const t = String(s).trim();
  if (!t) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (/^\d{8}$/.test(t)) return validISO(t.slice(0, 4), t.slice(4, 6), t.slice(6, 8));
  if (/^\d{6}$/.test(t)) return validISO(fullYear(t.slice(0, 2)), t.slice(2, 4), t.slice(4, 6));
  const m4 = t.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})$/); if (m4) return validISO(m4[1], m4[2], m4[3]);
  const m2 = t.match(/^(\d{2})\D+(\d{1,2})\D+(\d{1,2})$/); if (m2) return validISO(fullYear(m2[1]), m2[2], m2[3]);
  const fb = t.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/); if (fb) return validISO(fb[1], fb[2], fb[3]);
  return '';
}
const p2 = (n: number) => String(n).padStart(2, '0');
const toISO = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
function fullYear(yy: string) { const n = parseInt(yy, 10); return String(n < 50 ? 2000 + n : 1900 + n); }
function validISO(y: string, mo: string, d: string): string {
  const yi = +y, mi = +mo, di = +d;
  if (yi < 1900 || yi > 2100 || mi < 1 || mi > 12) return '';
  const last = new Date(yi, mi, 0).getDate();
  if (di < 1 || di > last) return '';
  return `${p2(yi).padStart(4, '0')}-${p2(mi)}-${p2(di)}`;
}

/* ── 헤더 키워드 분류 (v5 intake/classify 이식 — 계좌/CMS/카드) ── */
const HEADER_KEYWORDS: Record<string, string[]> = {
  'bank-tx': ['거래일', '거래일자', '거래일시', '거래시각', '입금일', '출금일', '입금', '입금액', '받은금액', '출금', '출금액', '인출액', '지급액', '적요', '메모', '내용', '거래내용', '거래메모', '용도', '상대계좌', '상대', '예금주', '입금자', '입금자명', '송금인', '보낸이', '받는분', '수취인', '계좌번호', '잔액', '이체'],
  'auto-debit': ['회원명', '회원번호', '납부자', '납부자명', '납부자 휴대전화', '수납금액', '청구금액', '청구월', '최초청구월', '청구완납일자', '결제일(납부기간)', '결제수단', '결제방식', '결제상태', '수납상태', '미수처리상태', 'CMS', '자동이체', '이체출금', '집금'],
  'card-tx': ['승인번호', '승인일', '카드번호', '카드', '매입금액', '카드사', '가맹점', '이용일시', '이용카드', '이용금액', '이용자명', '가맹점명'],
};
type Kind = 'bank-tx' | 'auto-debit' | 'card-tx' | 'unknown';
function classifyByHeaders(headers: string[]): { kind: Kind; confidence: number } | null {
  const cells = headers.map((h) => String(h ?? '').trim());
  // CMS 강제 룰 — 회원명 + (수납금액|청구완납일자|청구월|청구금액)
  if (cells.some((c) => c === '회원명') && cells.some((c) => c === '수납금액' || c === '청구완납일자' || c === '청구월' || c === '청구금액')) {
    return { kind: 'auto-debit', confidence: 1 };
  }
  let bestKind: Kind = 'unknown', bestScore = 0;
  for (const [k, kws] of Object.entries(HEADER_KEYWORDS)) {
    const hit = kws.filter((kw) => cells.some((c) => c.includes(kw))).length;
    if (hit > bestScore) { bestScore = hit; bestKind = k as Kind; }
  }
  if (bestScore < 2) return null;
  return { kind: bestKind, confidence: Math.min(bestScore / 4, 1) };
}

/* ── 헤더행 자동탐지 + 푸터/체크박스 제거 (v5 excel-detect 이식) ── */
const CHECKBOX_RE = /^(전체\s*선택|선택|체크|✓|☑|순번|no\.?|번호)$/i;
const FOOTER_RE = /^(합계|소계|총계|총\s*합계|이월|기말|기초|평균|건수|total)$/i;
const BANK_PATTERNS: Array<[RegExp, string]> = [
  [/(국민은행|KB(국민)?)/i, 'KB'], [/(우리은행|우리|woori)/i, '우리'], [/(신한은행|신한|shinhan)/i, '신한'],
  [/(하나은행|하나|keb|hana)/i, '하나'], [/(농협은행|농협|nh)/i, '농협'], [/(IBK|기업은행)/i, 'IBK'],
  [/(카카오뱅크|카카오|kakao)/i, '카카오뱅크'], [/(토스뱅크|toss)/i, '토스뱅크'], [/(새마을|MG)/i, '새마을금고'],
  [/(우체국)/i, '우체국'], [/(수협)/i, '수협'], [/(부산은행|BNK)/i, '부산'], [/(대구은행|DGB)/i, '대구'],
];
function detectBankFromFileName(name: string): string | undefined {
  const n = name.replace(/\.[^.]+$/, '');
  for (const [re, label] of BANK_PATTERNS) if (re.test(n)) return label;
  return undefined;
}
function detectHeaderRow(aoa: unknown[][]): { headerRow: number; kind: Kind; confidence: number } {
  let best = { headerRow: 0, kind: 'unknown' as Kind, confidence: 0 };
  const look = Math.min(aoa.length, 30);
  for (let r = 0; r < look; r++) {
    const cells = (aoa[r] || []).map((v) => String(v ?? '').trim());
    if (cells.filter((c) => c.length > 0).length < 3) continue;
    const res = classifyByHeaders(cells);
    if (!res) continue;
    if (res.confidence >= 1 && res.kind === 'auto-debit') return { headerRow: r, kind: 'auto-debit', confidence: 1 };
    if (res.confidence > best.confidence) best = { headerRow: r, kind: res.kind, confidence: res.confidence };
  }
  return best;
}

/* ── 행 헬퍼 ── */
function get(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) { const v = row[k]; if (v != null && String(v).trim() !== '') return String(v).trim(); }
  return '';
}
/**
 * 날짜 후보 중 **실제로 날짜로 읽히는 첫 값**을 쓴다.
 *
 * ★자금일보는 `거래월 | 거래일 | 거래일시` 를 다 갖는다(docs/UPLOAD-FORMATS.md §3-4).
 *   `거래일` 값은 `2` 같은 «일자 숫자»라 앞에서 집어 가면 판독 실패 → 파일 전체가 0건이 된다
 *   (실측: 1,794건 전건 거부). 이름 순서가 아니라 «읽히는가»로 골라야 한다.
 */
function getDate(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v == null || String(v).trim() === '') continue;
    const d = normalizeKoreanDate(v);
    if (d) return d;
  }
  return '';
}
function toNum(s: string): number { const n = Number(String(s).replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; }
function deriveMethod(summary: string, memo: string): string {
  const t = `${summary} ${memo}`;
  if (/CMS|자동이체|집금|이체출/.test(t)) return 'CMS';
  if (/카드|승인/.test(t)) return '카드';
  return '계좌';
}

/* ── 은행 통장 행 → bank_tx (v5 parseBankTxRow 이식) ── */
export function parseBankRow(row: Record<string, unknown>, fileName: string, bankHint?: string): EntityRecord | null {
  const txDate = getDate(row, '거래일자', '거래일시', '거래일', '거래시각', '거래시간', '입금일', '출금일', '일자', '발생일', '처리일', '결제일', '청구완납일자', '수납일');
  if (!txDate) return null;
  const deposit = toNum(get(row, '입금액', '입금', '받은금액', '입금금액', '예입액', '수납금액', '납입금액'));
  const withdraw = toNum(get(row, '출금액', '출금', '지급액', '인출액', '출금금액'));
  const amountSingle = toNum(get(row, '거래금액', '금액', '거래액', '청구금액'));
  const status = get(row, '수납상태', '납부상태', '결제상태');
  if (status && /미납|연체|미수|취소|정지|보류|실패/.test(status)) return null;
  const useSingle = deposit <= 0 && withdraw <= 0 && Math.abs(amountSingle) > 0;
  const directionRaw = get(row, '구분', '입출구분', '거래구분', '입출금구분');
  const dirMemo = get(row, '적요', '거래내용', '내용', '거래종류');
  const isWithdrawDir = /출금|지급|인출|이체출/.test(directionRaw) || (useSingle && /출금|지급|인출|이체출|카드대금|자동납부|공과금|송금/.test(dirMemo));
  const finalDeposit = useSingle ? (amountSingle > 0 && !isWithdrawDir ? amountSingle : 0) : deposit;
  const finalWithdraw = useSingle ? (amountSingle < 0 ? -amountSingle : (isWithdrawDir ? amountSingle : 0)) : withdraw;
  if (finalDeposit <= 0 && finalWithdraw <= 0) return null;
  const counterparty = get(row, '입금자', '입금자명', '거래상대', '상대', '상대방', '예금주', '수취인', '받는분', '송금인', '보낸이', '의뢰인', '상대계좌', '회원명', '납부자', '고객명', '계약자명');
  const summary = get(row, '적요', '거래종류', '구분');
  const memo = get(row, '내용', '거래내용', '거래메모', '메모', '용도', '비고', '상품', '청구타입', '결제수단');
  const balance = toNum(get(row, '잔액', '잔고', '거래후잔액'));
  const cpFinal = counterparty || memo || summary || (finalWithdraw > 0 ? '(출금)' : '(미상)');
  const rec: EntityRecord = {
    txDate, amount: finalDeposit > 0 ? finalDeposit : 0,
    counterparty: cpFinal, memo: memo || summary || '',
    method: get(row, '결제수단', '은행', '거래은행', '은행명') || bankHint || '계좌',
    account: get(row, '계좌번호', '계좌', '나의계좌', '본인계좌', '회원번호'),
  };
  if (finalWithdraw > 0) rec.withdraw = finalWithdraw;
  if (balance > 0) rec.balance = balance;
  const txTime = extractTxTime(get(row, '거래일시', '거래시각', '거래시간', '처리일시'));
  if (txTime) rec.txTime = txTime;
  const contractNo = get(row, '계약번호', '약정번호'); if (contractNo) rec.contractNo = contractNo;
  return rec;
}

/**
 * 법인카드 이용내역 행 → `card_tx`.
 *
 * ★`card-tx` 종류가 **선언만 되고 파싱 분기가 없어** 카드 파일이 은행 파서로 흘렀고,
 *   「거래일을 판독할 수 없음」으로 **전건 거부**됐다(신한 25년 파일 1,983건 전멸).
 *
 * ⚠ 카드번호는 **마스킹 원문 그대로** 담는다 — 카드사마다 가리는 자리가 다르다
 *   (신한: `9410-64**-****-9901`). 끝 4자리를 억지로 뽑으면 다른 카드사에서 어긋난다.
 *   회사 귀속은 `cardMaskMatches`(lib/company-master)로 판정한다.
 */
export function parseCardRow(row: Record<string, unknown>, _fileName: string): EntityRecord | null {
  const txDate = getDate(row, '이용일시', '승인일시', '승인일', '거래일시', '거래일자', '거래일', '매출일');
  if (!txDate) return null;
  const amount = toNum(get(row, '이용금액', '승인금액', '매입금액', '금액', '결제금액'));
  if (amount <= 0) return null;
  const cardMask = get(row, '이용카드', '카드번호', '카드');
  const rec: EntityRecord = {
    txDate,
    amount,
    merchant: get(row, '가맹점명', '가맹점', '이용가맹점') || '(미상)',
    approvalNo: get(row, '승인번호', '거래번호'),
    // 마스킹 원문 — 매칭 키. 끝 4자리는 «자릿수가 다 보일 때만» 부수적으로 담는다.
    cardNo: cardMask,
    holder: get(row, '이용자명', '이용자', '명의자', '사용자'),
  };
  const digits = cardMask.replace(/[^0-9*]/g, '');
  const tail = digits.slice(-4);
  if (tail.length === 4 && !tail.includes('*')) rec.cardLast4 = tail;
  const txTime = extractTxTime(get(row, '이용일시', '승인일시', '거래일시'));
  if (txTime) rec.txTime = txTime;
  return rec;
}

/* ── CMS 결제내역 행 → bank_tx (v5 parsers/cms.parseCmsTxRow 이식) ── */
export function parseCmsRow(row: Record<string, unknown>, _fileName: string): EntityRecord | null {
  const customerName = get(row, '회원명', '고객명', '납부자', '납부자명');
  if (!customerName) return null;
  const amount = toNum(get(row, '수납금액', '청구금액'));
  if (amount <= 0) return null;
  const status = get(row, '수납상태', '결제상태', '납부상태');
  if (status && /미납|연체|미수|취소|정지|보류|실패/.test(status)) return null;
  // 결제일 = CMS 성공일. 통장 집금은 보통 3~5일 후(cms-matching LAG). 정산일보다 결제일을 우선.
  const txDate = normalizeKoreanDate(get(row, '결제일', '청구완납일자', '결제일(납부기간)', '정산일', '약정일'));
  if (!txDate) return null;
  const memo = [get(row, '상품', '상품명'), get(row, '청구월', '최초청구월'), get(row, '결제수단', '결제방식')].filter(Boolean).join(' / ');
  const rec: EntityRecord = {
    txDate, amount, counterparty: customerName, memo, method: 'CMS',
    account: get(row, '회원번호', '고객번호'),
  };
  const contractNo = get(row, '계약번호'); if (contractNo) rec.contractNo = contractNo;
  return rec;
}

/* ── 파일 전체 → bank_tx 레코드 (은행/CMS 자동판별) ── */
/** 거래시각 — 날짜만 남기는 normalize와 별도. HH:mm[:ss] */
export function extractTxTime(raw: string): string {
  const t = String(raw || '').trim();
  if (!t) return '';
  const m = t.match(/(?:T|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return '';
  return `${String(+m[1]).padStart(2, '0')}:${m[2]}${m[3] != null ? `:${m[3]}` : ''}`;
}

/** 내용 fingerprint — 재임포트 안정 · 동일키 N건은 #2… */
export function bankTxFingerprint(r: EntityRecord): string {
  return [
    r.account ?? '',
    r.txDate ?? '',
    r.txTime ?? '',
    r.amount ?? 0,
    r.withdraw ?? 0,
    r.balance ?? '',
    r.counterparty ?? '',
    r.memo ?? '',
    r.method ?? '',
  ].join('|');
}

/** 파일 내 등장 순으로 txKey 부여. 1건=fp · 2건째=fp#2 (재임포트 동일키 → store dedupe). */
export function assignBankTxKeys(rows: EntityRecord[]): EntityRecord[] {
  const counts = new Map<string, number>();
  for (const rec of rows) {
    const fp = bankTxFingerprint(rec);
    const n = (counts.get(fp) ?? 0) + 1;
    counts.set(fp, n);
    rec.txKey = n === 1 ? fp : `${fp}#${n}`;
  }
  return rows;
}

export type TxParseRejection = { sheet: string; row: number; reason: string; values: Record<string, unknown> };
export type TxParseReport = {
  records: EntityRecord[];
  rejected: TxParseRejection[];
  warnings: string[];
};

function bankRejectReason(row: Record<string, unknown>, cms: boolean): string {
  const status = get(row, '수납상태', '납부상태', '결제상태');
  if (status && /미납|연체|미수|취소|정지|보류|실패/.test(status)) return `미완료 거래 상태(${status})`;
  const date = getDate(row, '거래일자', '거래일시', '거래일', '거래시각', '거래시간', '입금일', '출금일', '일자', '발생일', '처리일', '결제일', '청구완납일자', '수납일');
  if (!date) return '거래일을 판독할 수 없음';
  if (cms && !get(row, '회원명', '고객명', '납부자', '납부자명')) return 'CMS 회원·납부자 없음';
  return '입금·출금 금액을 판독할 수 없음';
}

/**
 * 워크북 읽기 — **CSV는 인코딩을 스스로 판단한다.**
 *
 * ★PG 정산 파일(`일별정산내역_*.csv`)이 **CP949(EUC-KR)** 로 온다.
 *   UTF-8로 읽으면 헤더가 `°áÁ¦ÀÏ` 로 깨져 **어떤 키워드와도 안 맞고 «헤더를 찾지 못함»** 이 된다
 *   (실측: 전건 0). SheetJS `codepage` 옵션은 `cpexcel.js`(~200KB)를 같이 실어야 동작하므로,
 *   번들을 키우지 않고 **브라우저·Node 내장 `TextDecoder`** 로 해결한다.
 *
 * 판정: UTF-8로 디코드해 치환문자(U+FFFD)가 나오면 잘못된 인코딩으로 보고 EUC-KR로 다시 읽는다.
 */
function readWorkbook(buf: ArrayBuffer, fileName: string): XLSX.WorkBook {
  if (!/\.csv$/i.test(fileName)) return XLSX.read(buf, { type: 'array', cellDates: true });
  const bytes = new Uint8Array(buf);
  let text = new TextDecoder('utf-8').decode(bytes);
  if (text.includes('�')) {
    try {
      const alt = new TextDecoder('euc-kr').decode(bytes);
      if (!alt.includes('�')) text = alt;
    } catch { /* euc-kr 미지원 환경 — UTF-8 결과를 그대로 쓴다 */ }
  }
  return XLSX.read(text, { type: 'string', cellDates: true });
}

export async function parseTxFileReport(file: File): Promise<TxParseReport> {
  const buf = await file.arrayBuffer();
  const wb = readWorkbook(buf, file.name);
  const bankHint = detectBankFromFileName(file.name);
  const out: EntityRecord[] = [];
  const rejected: TxParseRejection[] = [];
  const warnings: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: null }) as unknown[][];
    if (aoa.length < 2) continue;
    const det = detectHeaderRow(aoa);
    if (det.kind === 'unknown') {
      warnings.push(`${sheetName}: 거래내역 헤더를 찾지 못함`);
      continue;
    }
    const rawHeaders = (aoa[det.headerRow] || []).map((v, i) => (v == null || v === '' ? `col${i + 1}` : String(v).trim().replace(/\s*\*\s*$/, '')));
    const dropIdx = new Set<number>();
    rawHeaders.forEach((h, i) => { if (CHECKBOX_RE.test(h)) dropIdx.add(i); });
    const headers = rawHeaders.filter((_, i) => !dropIdx.has(i));
    const isCms = det.kind === 'auto-debit';
    const isCard = det.kind === 'card-tx';
    for (const [offset, r] of aoa.slice(det.headerRow + 1).entries()) {
      if (!r.some((v) => v != null && String(v).trim() !== '')) continue;
      if (FOOTER_RE.test(String(r[0] ?? '').trim()) || FOOTER_RE.test(String(r[1] ?? '').trim())) continue;
      const filtered = dropIdx.size === 0 ? r : r.filter((_, i) => !dropIdx.has(i));
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => { obj[h] = filtered[i] ?? null; });
      const rec = isCms ? parseCmsRow(obj, file.name) : isCard ? parseCardRow(obj, file.name) : parseBankRow(obj, file.name, bankHint);
      if (rec) out.push(rec);
      else rejected.push({ sheet: sheetName, row: det.headerRow + offset + 2, reason: bankRejectReason(obj, isCms), values: obj });
    }
  }
  return { records: assignBankTxKeys(out), rejected, warnings };
}

export async function parseTxFile(file: File): Promise<EntityRecord[]> {
  return (await parseTxFileReport(file)).records;
}
