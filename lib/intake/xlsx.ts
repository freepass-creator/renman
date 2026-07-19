/** 진짜 XLSX 인제스천 (SheetJS) — 스키마 → .xlsx 템플릿 생성 + 업로드 .xlsx/.csv 파싱. */
import * as XLSX from 'xlsx';
import { ENTITIES, type EntityRecord } from './entities';
import { parseTxFile } from './parse-tx';

export function downloadXlsxTemplate(entityKey: string): void {
  const e = ENTITIES[entityKey];
  if (!e) return;
  const headers = e.fields.map((f) => f.label + (f.required ? ' *' : ''));
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(10, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, e.label);
  XLSX.writeFile(wb, `${e.label}_템플릿.xlsx`);
}

export async function parseSpreadsheet(entityKey: string, file: File): Promise<EntityRecord[]> {
  // 계좌 거래(bank_tx) = 은행 통장/효성CMS 실파일 → 헤더 자동탐지 fuzzy 파서(v5 이식). 템플릿 정확일치 불필요.
  if (entityKey === 'bank_tx') return parseTxFile(file);
  const e = ENTITIES[entityKey];
  if (!e) return [];
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' });
  if (rows.length < 2) return [];
  const header = (rows[0] as unknown[]).map((h) => String(h).replace(/\s*\*\s*$/, '').trim());
  const labelToKey: Record<string, string> = {};
  e.fields.forEach((f) => { labelToKey[f.label] = f.key; });
  const colKeys = header.map((h) => labelToKey[h] || null);
  const records: EntityRecord[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i] as unknown[];
    if (!cells || cells.every((c) => !String(c).trim())) continue;
    const rec: EntityRecord = {};
    cells.forEach((c, idx) => {
      const k = colKeys[idx];
      const v = String(c).trim();
      if (k && v) rec[k] = v;
    });
    if (Object.keys(rec).length) records.push(rec);
  }
  return records;
}
