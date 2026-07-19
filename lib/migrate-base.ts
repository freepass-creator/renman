/**
 * 베이스 마이그레이션 — 엑셀 쓰던 업체가 1시트로 즉시 전환.
 * 8컬럼(대여 행)만 채우면 운영현황 + 리스크가 바로 작동. 차량 등록증·자산마스터 불필요.
 * 심화(자산/계약/재무)는 나중에 사실을 더 넣으면 자동 활성.
 */
import * as XLSX from 'xlsx';
import type { EntityRecord } from './intake/entities';

// 표시 헤더 → 계약 레코드 키. 입금은 내부 누계(_paidTotal)로.
const COLUMNS: { header: string; key: string; sample: string | number }[] = [
  { header: '차량번호', key: 'plate', sample: '12가3456' },
  { header: '임차인', key: 'contractorName', sample: '김철수' },
  { header: '시작일', key: 'startDate', sample: '2026-04-01' },
  { header: '종료일', key: 'endDate', sample: '2027-03-31' },
  { header: '월대여료', key: 'monthlyRent', sample: 680000 },
  { header: '입금누계', key: '_paidTotal', sample: 1360000 },
  { header: '운전자연령', key: 'driverAge', sample: 41 },
  { header: '보험허용연령', key: 'insuranceAge', sample: 26 },
];
const NUMERIC = new Set(['monthlyRent', '_paidTotal', 'driverAge', 'insuranceAge']);

/** 베이스 템플릿(.xlsx) 다운로드 — 헤더 + 예시 1행. */
export function downloadBaseTemplate(): void {
  const headers = COLUMNS.map((c) => c.header);
  const sample = COLUMNS.map((c) => c.sample);
  const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(11, h.length + 3) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '운영현황');
  XLSX.writeFile(wb, '운영현황_베이스_템플릿.xlsx');
}

/** 업로드(.xlsx/.csv) → 대여(계약) 레코드. 헤더 라벨 매칭, 입금→_paidTotal, 활성으로 표기. */
export async function parseBaseSheet(file: File): Promise<EntityRecord[]> {
  const isCsv = /\.csv$/i.test(file.name);
  let rows: string[][];
  if (isCsv) {
    rows = (await file.text()).split(/\r?\n/).map((l) => l.split(','));
  } else {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return [];
    rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' });
  }
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => String(h).replace(/\s*\*\s*$/, '').replace(/\s+/g, '').trim());
  const headerToKey: Record<string, string> = {};
  COLUMNS.forEach((c) => { headerToKey[c.header.replace(/\s+/g, '')] = c.key; });
  const colKeys = header.map((h) => headerToKey[h] || null);

  const out: EntityRecord[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    if (!cells || cells.every((c) => !String(c).trim())) continue;
    const rec: EntityRecord = {};
    cells.forEach((c, idx) => {
      const k = colKeys[idx]; if (!k) return;
      const v = String(c).trim(); if (!v) return;
      rec[k] = NUMERIC.has(k) ? Number(v.replace(/[^0-9.-]/g, '')) || 0 : v;
    });
    if (!rec.plate && !rec.contractorName) continue;
    // 대여 행 = 운행으로 표기(미반납). 인도일은 시작일.
    rec.status = '운행';
    if (rec.startDate) rec.deliveredDate = rec.startDate;
    // contractNo 없으면 자연키용으로 생성(차량+시작)
    if (!rec.contractNo) rec.contractNo = `${rec.plate || 'NA'}-${rec.startDate || ''}`;
    out.push(rec);
  }
  return out;
}
