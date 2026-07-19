/** 엑셀(CSV) 인제스천 — 엔티티 스키마에서 템플릿 생성 + 업로드 파싱. (XLSX 라이브러리는 추후) */
import { ENTITIES, type EntityRecord } from './entities';

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

/** 스키마 → CSV 템플릿 (헤더 = 필드 라벨, 필수는 * 표시). BOM 포함(엑셀 한글). */
export function templateCsv(entityKey: string): string {
  const e = ENTITIES[entityKey];
  if (!e) return '';
  const headers = e.fields.map((f) => f.label + (f.required ? ' *' : ''));
  return '﻿' + headers.map((h) => '"' + h.replace(/"/g, '""') + '"').join(',') + '\r\n';
}

/** 업로드 CSV → 표준 엔티티 레코드 배열 (헤더 라벨 → 필드 key 매핑) */
export function parseCsv(entityKey: string, text: string): EntityRecord[] {
  const e = ENTITIES[entityKey];
  if (!e) return [];
  const clean = text.replace(/^﻿/, '').trim();
  const lines = clean.split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.replace(/\s*\*\s*$/, '').trim());
  const labelToKey: Record<string, string> = {};
  e.fields.forEach((f) => { labelToKey[f.label] = f.key; });
  const colKeys = header.map((h) => labelToKey[h] || null);
  const records: EntityRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    if (cells.every((c) => !c.trim())) continue;
    const rec: EntityRecord = {};
    cells.forEach((c, idx) => {
      const k = colKeys[idx];
      if (k && c.trim()) rec[k] = c.trim();
    });
    if (Object.keys(rec).length) records.push(rec);
  }
  return records;
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
