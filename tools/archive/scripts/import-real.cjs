/* 사업현황(스위치플랜) 엑셀 → lib/seed-real.ts (실 jpk 데이터). PII(주민번호·연락처·주소) 제외. */
const XLSX = require('xlsx'), fs = require('fs');
const F = 'C:/Users/admin/Documents/카카오톡 받은 파일/[스위치플랜] 사업현황 (7).xlsx';
const wb = XLSX.readFile(F);
const TODAY = new Date('2026-07-11');
const MS_M = 2629800000;

function ser(v) { const n = Number(v); if (!n || n < 20000 || n > 60000) return ''; const d = XLSX.SSF.parse_date_code(n); if (!d) return ''; const p = x => String(x).padStart(2, '0'); return `${d.y}-${p(d.m)}-${p(d.d)}`; }
function num(v) { const n = Number(String(v).replace(/[,\s₩원]/g, '')); return isFinite(n) ? n : 0; }
function rowsOf(sn) { return XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' }); }
function hmap(rows, key) { const hi = rows.findIndex(r => r.map(String).some(c => c.includes(key))); const m = {}; (rows[hi] || []).forEach((c, i) => { const k = String(c).trim(); if (k && !(k in m)) m[k] = i; }); return { hi, m }; }
const s = (r, m, k) => String(r[m[k]] ?? '').trim();

// ── 자산 → 차량 ──
const A = rowsOf('자산'); const { hi: ah, m: am } = hmap(A, '차량번호');
const vehicles = [], vmap = {};
for (let i = ah + 1; i < A.length; i++) {
  const r = A[i]; const plate = s(r, am, '차량번호'); if (!/\d/.test(plate) || vmap[plate]) continue;
  const price = num(r[am['실제구입가격']]) || num(r[am['차량가격']]) || num(r[am['소비자가격']]);
  const v = {
    plate, companyId: 'jpk', maker: s(r, am, '제조사'), modelLine: s(r, am, '모델'), carName: s(r, am, '세부모델') || s(r, am, '모델'),
    trim: s(r, am, '트림'), year: num(r[am['연식']]) || '', displacement: num(r[am['배기량']]) || '', fuel: s(r, am, '연료'),
    vin: s(r, am, '차대번호'), usage: s(r, am, '구분'), regRegion: s(r, am, '등록지'), color: s(r, am, '외장색상'),
    acquisitionDate: ser(r[am['취득일']]), firstReg: ser(r[am['최초등록일']]), inspectionTo: ser(r[am['차령만료일']]),
    acquisitionPrice: price, status: '대기',
  };
  vehicles.push(v); vmap[plate] = v;
}

// ── 채권추심 → 미수 마킹 ──
const CH = rowsOf('채권추심'); const { hi: ch, m: cm } = hmap(CH, '차량번호');
const overdue = {};
for (let i = ch + 1; i < CH.length; i++) { const r = CH[i]; const p = s(r, cm, '차량번호'); if (!/\d/.test(p)) continue; overdue[p] = num(r[cm['위약금 산출금액']]) || num(r[cm['대여료']]) * 2 || 500000; }

// ── 지우지마세요(대여현황) → 계약 ──
// 한 행 = 한 차량. 블록(구분·고객명·인도·종료·반납·대여료·보증금·영업자) 8칸씩 반복.
// 첫 블록(반납일자 빈칸) = 현재 운행 계약, 이후 블록 = 직전 계약자(계약이력).
const Z = rowsOf('지우지마세요');
const BASE = 5, STRIDE = 8; // 5:구분 6:고객명 7:인도 8:종료 9:반납 10:대여료 11:보증금 12:영업자
const contracts = [];
for (let i = 1; i < Z.length; i++) {
  const r = Z[i]; const plate = String(r[1] ?? '').trim(); if (!/\d/.test(plate)) continue;
  const age = num(r[3]); const rowCar = String(r[4] ?? '').trim();
  for (let k = 0; BASE + STRIDE * k + 6 < r.length + STRIDE; k++) {
    const b = BASE + STRIDE * k; if (b + 1 >= r.length) break;
    const name = String(r[b + 1] ?? '').trim(); const start = ser(r[b + 2]);
    if (!name || !start) continue; // 빈 블록
    const end = ser(r[b + 3]); const back = ser(r[b + 4]);
    const rent = num(r[b + 5]); const dep = num(r[b + 6]);
    const status = back ? '종료' : '운행';
    const months = end ? Math.max(1, Math.round((new Date(end) - new Date(start)) / MS_M)) : 12;
    const elapsed = Math.max(0, Math.min(months, Math.round((TODAY - new Date(start)) / MS_M)));
    const mi = status === '운행' ? (overdue[plate] || 0) : 0;
    const c = {
      companyId: 'jpk', plate, carName: rowCar || (vmap[plate]?.carName ?? ''), contractorName: name,
      rentalMonths: months, startDate: start, contractDate: start, endDate: end || '', returnScheduledDate: end || '',
      monthlyRent: rent, deposit: dep, _paidTotal: status === '종료' ? rent * months : Math.max(0, rent * elapsed - mi),
      status, deliveredDate: start, salesperson: String(r[b + 7] ?? '').trim(),
    };
    if (k === 0 && status === '운행' && age) c.driverAge = age;
    if (back) c.returnedDate = back;
    contracts.push(c);
    if (status === '운행' && vmap[plate]) vmap[plate].status = '운행';
  }
}

// ── 면책금 → 이력(사고) ──
const M = rowsOf('면책금'); const { hi: mh, m: mm } = hmap(M, '차량번호');
const history = [];
for (let i = mh + 1; i < M.length; i++) {
  const r = M[i]; const p = s(r, mm, '차량번호'); if (!/\d/.test(p)) continue;
  history.push({
    plate: p, companyId: 'jpk', category: '사고', title: s(r, mm, '보험처리항목') || '면책금 청구',
    date: s(r, mm, '사고일자').replace(/\s*청구$/, ''), vendor: s(r, mm, '보험사') || '', cost: num(r[mm['청구금액']]),
    status: num(r[mm['미납금액']]) > 0 ? '진행' : '완료',
  });
}

// ── 자금일보 → 계좌 거래(계정과목 분류 태깅됨) = 돈의 흐름 ──
const JBO = XLSX.readFile('C:/Users/admin/Documents/카카오톡 받은 파일/26년_스위치플랜_자금일보.xlsx');
const bankTx = [];
for (const sn of JBO.SheetNames.filter((s) => /계좌/.test(s))) {
  const rows = XLSX.utils.sheet_to_json(JBO.Sheets[sn], { header: 1, defval: '' });
  const hi = rows.findIndex((r) => r.map(String).some((c) => c.includes('입금액')));
  if (hi < 0) continue;
  const h = rows[hi].map((c) => String(c).trim());
  const ci = (n) => h.findIndex((c) => c === n);
  const [DT, IN, OUT, MEMO, ACC, PL, RENTER] = [ci('거래일시'), ci('입금액'), ci('출금액'), ci('내용'), ci('계정과목'), ci('차량번호'), ci('임차인')];
  const acct = sn.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i]; const inA = num(r[IN]), outA = num(r[OUT]); if (!inA && !outA) continue;
    const dt = String(r[DT] || '').slice(0, 10).replace(/\./g, '-');
    if (!/^\d{4}-\d{2}-\d{2}/.test(dt)) continue;
    bankTx.push({ companyId: 'jpk', account: acct, txDate: dt, amount: inA, withdraw: outA, counterparty: String(r[MEMO] || '').trim(), category: String(r[ACC] || '').trim() || '(미분류)', plate: String(r[PL] || '').trim(), renter: String(r[RENTER] || '').trim(), method: '계좌' });
  }
}
bankTx.sort((a, b) => (a.txDate < b.txDate ? 1 : -1));

const out = `/* 실 사업현황+자금일보(스위치플랜) 파생 — 자산 ${vehicles.length}·계약 ${contracts.length}·이력 ${history.length}·계좌거래 ${bankTx.length}. PII 제외. scripts/import-real.cjs 생성. */
import type { EntityRecord } from './intake/entities';
export const JPK_VEHICLES: EntityRecord[] = ${JSON.stringify(vehicles)};
export const JPK_CONTRACTS: EntityRecord[] = ${JSON.stringify(contracts)};
export const JPK_HISTORY: EntityRecord[] = ${JSON.stringify(history)};
export const JPK_BANK_TX: EntityRecord[] = ${JSON.stringify(bankTx)};
`;
fs.writeFileSync('lib/seed-real.ts', out);
console.log('계좌거래', bankTx.length, '| 계정과목:', [...new Set(bankTx.map((b) => b.category))].slice(0, 12).join(', '));
const 운행 = contracts.filter(c => c.status === '운행');
const 미수 = contracts.filter(c => c._paidTotal < c.monthlyRent * Math.max(1, Math.round((TODAY - new Date(c.startDate)) / MS_M)) && overdue[c.plate]);
console.log(`차량 ${vehicles.length} · 계약 ${contracts.length}(운행 ${운행.length}) · 이력 ${history.length}`);
console.log(`차량상태: 운행 ${vehicles.filter(v => v.status === '운행').length} / 대기(유휴) ${vehicles.filter(v => v.status === '대기').length}`);
console.log(`미수(채권추심) ${Object.keys(overdue).length}건 · 대여료 있는 계약 ${contracts.filter(c => c.monthlyRent > 0).length}`);
console.log('샘플차:', vehicles.slice(0, 3).map(v => `${v.plate} ${v.carName}`).join(' / '));
console.log('샘플계약:', contracts.slice(0, 3).map(c => `${c.plate} ${c.contractorName} ${c.monthlyRent}`).join(' / '));
