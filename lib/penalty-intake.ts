/**
 * 과태료 고지서 투입 SSOT — OCR→엔티티매핑→계약매칭→원본저장→saveIntake.
 *   패널(/work) · 대량페이지(/penalty/upload) 동일 소비. 새 OCR·매칭 엔진 금지.
 */
import { companyLabel } from '@/lib/companies';
import { saveIntake } from '@/lib/intake';
import type { EntityRecord } from '@/lib/intake/entities';
import { ocrBatch, mapOcrToEntity } from '@/lib/ocr-client';
import type { CrosscheckResult } from '@/lib/ocr-crosscheck';
import { matchPenalty } from '@/lib/penalty-match';
import { normPlate } from '@/lib/plate';
import { docPath, uploadDoc } from '@/lib/storage';

export const PENALTY_OCR_MAX = 10;

export type PenaltyIntakeStatus = 'pending' | 'done' | 'failed';

export type PenaltyIntakeRow = {
  id: string;
  fileName: string;
  file: File;
  status: PenaltyIntakeStatus;
  rec: EntityRecord;
  ocrOriginal?: unknown;
  crosscheck?: CrosscheckResult;
  error?: string;
};

export type PenaltyMatchDerive = {
  renter: string | null;
  contractNo: string | null;
  outOfRange: boolean;
  dup: boolean;
};

export function makePenaltyIntakeRows(files: File[], stamp = Date.now()): PenaltyIntakeRow[] {
  return files.map((f, i) => ({
    id: `pen-${stamp}-${i}`,
    fileName: f.name,
    file: f,
    status: 'pending' as const,
    rec: {},
  }));
}

/** OCR 배치 실행 후 행 상태 갱신. */
export async function ocrPenaltyFiles(
  files: File[],
  baseRows: PenaltyIntakeRow[],
): Promise<PenaltyIntakeRow[]> {
  const results = await ocrBatch(files, 'penalty');
  return baseRows.map((row, i) => {
    const res = results[i];
    if (res?.ok && res.raw) {
      return {
        ...row,
        status: 'done' as const,
        rec: mapOcrToEntity('penalty', res.raw),
        ocrOriginal: res.ocrOriginal,
        crosscheck: res.crosscheck,
      };
    }
    return { ...row, status: 'failed' as const, error: res?.error };
  });
}

export function derivePenaltyMatch(
  rec: EntityRecord,
  contracts: EntityRecord[],
  existing: EntityRecord[],
): PenaltyMatchDerive {
  const plate = normPlate(rec.plate);
  const vdate = String(rec.violationDate || '');
  const m = matchPenalty(rec, contracts);
  const samePlate = contracts.filter((k) => normPlate(k.plate) === plate);
  const outOfRange = !!plate && !!vdate && samePlate.length > 0 && !m;
  const dup = existing.some((e) =>
    (rec.noticeNo && String(e.noticeNo) === String(rec.noticeNo))
    || (plate && vdate && normPlate(e.plate) === plate && String(e.violationDate).slice(0, 10) === vdate.slice(0, 10)));
  return {
    renter: m ? m.renter : null,
    contractNo: m ? String(m.contract.contractNo || '') : null,
    outOfRange,
    dup,
  };
}

export function isPenaltyIntakeReady(row: PenaltyIntakeRow): boolean {
  return !!String(row.rec.plate || '').trim()
    && !!String(row.rec.violationDate || '').trim()
    && Number(row.rec.amount) > 0;
}

export async function buildPenaltySaveRecords(
  rows: PenaltyIntakeRow[],
  companyId: string,
  derive: (rec: EntityRecord) => PenaltyMatchDerive,
): Promise<EntityRecord[]> {
  return Promise.all(rows.map(async (r) => {
    const { renter } = derive(r.rec);
    let fileUrl = '';
    try {
      fileUrl = (await uploadDoc(r.file, docPath(companyId, 'penalty', String(r.rec.noticeNo || r.id), r.fileName))) || '';
    } catch { /* Firebase 미설정 시 스킵 */ }
    return {
      ...r.rec,
      companyId,
      reassignStatus: renter ? '임차인확인' : '접수',
      ...(renter ? { driverName: renter } : {}),
      ...(fileUrl ? { fileUrl } : {}),
      _ocrOriginal: r.ocrOriginal,
    };
  }));
}

export async function savePenaltyRecords(companyId: string, records: EntityRecord[]): Promise<number> {
  await saveIntake('penalty', companyId, records);
  return records.length;
}

export function penaltySavedToast(count: number, companyId: string): string {
  return `과태료 ${count}건 등록 · ${companyLabel(companyId)}`;
}
