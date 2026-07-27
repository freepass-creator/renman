/** XLSX ingestion (SheetJS 0.20.3+) — schema template generation and workbook parsing. */
import * as XLSX from 'xlsx';
import { ENTITIES, type EntityRecord } from './entities';
import { parseTxFile } from './parse-tx';

export function downloadXlsxTemplate(entityKey: string): void {
  const entity = ENTITIES[entityKey];
  if (!entity) return;
  const headers = entity.fields.map((field) => field.label + (field.required ? ' *' : ''));
  const worksheet = XLSX.utils.aoa_to_sheet([headers]);
  worksheet['!cols'] = headers.map((header) => ({ wch: Math.max(10, header.length + 2) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, entity.label);
  XLSX.writeFile(workbook, `${entity.label}_템플릿.xlsx`);
}

export async function parseSpreadsheet(entityKey: string, file: File): Promise<EntityRecord[]> {
  if (entityKey === 'bank_tx') return parseTxFile(file);
  const entity = ENTITIES[entityKey];
  if (!entity) return [];
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!worksheet) return [];
  const rows = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, raw: false, defval: '' });
  if (rows.length < 2) return [];

  const header = (rows[0] as unknown[]).map((value) => String(value).replace(/\s*\*\s*$/, '').trim());
  const labelToKey: Record<string, string> = {};
  entity.fields.forEach((field) => { labelToKey[field.label] = field.key; });
  const columnKeys = header.map((label) => labelToKey[label] || null);
  const records: EntityRecord[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const cells = rows[index] as unknown[];
    if (!cells || cells.every((cell) => !String(cell).trim())) continue;
    const record: EntityRecord = {};
    cells.forEach((cell, cellIndex) => {
      const key = columnKeys[cellIndex];
      const value = String(cell).trim();
      if (key && value) record[key] = value;
    });
    if (Object.keys(record).length) records.push(record);
  }
  return records;
}
