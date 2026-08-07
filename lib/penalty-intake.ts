/**
 * 과태료 고지서 투입 SSOT — OCR→엔티티매핑→계약매칭→원본저장→saveIntake.
 *   패널(/work) · 대량페이지(/penalty/upload) 동일 소비. 새 OCR·매칭 엔진 금지.
 */
import { companyLabel } from '@/lib/companies';
import {
  type DocIntakeRow, type DocIntakeSpec, type DocIntakeVerdict,
  isDocIntakeReady, makeDocIntakeRows, ocrDocFiles,
} from '@/lib/doc-intake';
import { saveIntake } from '@/lib/intake';
import type { EntityRecord } from '@/lib/intake/entities';
import { matchPenalty } from '@/lib/penalty-match';
import { normPlate } from '@/lib/plate';
import { docPath, uploadDoc } from '@/lib/storage';

export const PENALTY_OCR_MAX = 10;

/** 행 모양은 공용 규격을 그대로 쓴다(lib/doc-intake). */
export type PenaltyIntakeRow = DocIntakeRow;

export type PenaltyMatchDerive = {
  renter: string | null;
  contractNo: string | null;
  outOfRange: boolean;
  dup: boolean;
};

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

/** 문서 투입 공용 패널 규격 — 화면은 components/ui/doc-intake-panel 하나. */
export const PENALTY_INTAKE_SPEC: DocIntakeSpec = {
  entityKey: 'penalty',
  ocrType: 'penalty',
  max: PENALTY_OCR_MAX,
  hint: '고지서 이미지·PDF · 여러 장',
  refEntities: ['contract', 'penalty'],
  missing: (rec) => {
    const miss: string[] = [];
    if (!String(rec.plate || '').trim()) miss.push('차량번호');
    if (!String(rec.violationDate || '').trim()) miss.push('위반일');
    if (!(Number(rec.amount) > 0)) miss.push('금액');
    return miss;
  },
  derive: (rec, refs) => {
    const m = derivePenaltyMatch(rec, refs[0] || [], refs[1] || []);
    const badges: DocIntakeVerdict['badges'] = [];
    if (m.renter) badges.push({ t: `임차인 ${m.renter}`, tone: 'green' });
    if (m.outOfRange) badges.push({ t: '계약기간 밖', tone: 'amber' });
    return { dup: m.dup, badges };
  },
  manual: [
    { key: 'plate', label: '차량번호', placeholder: '12가3456' },
    { key: 'violationDate', label: '위반일', type: 'date' },
    { key: 'amount', label: '금액', placeholder: '0' },
  ],
  summary: (rec) => [String(rec.plate || '').trim(), String(rec.violationDate || '').trim()].filter(Boolean).join(' · '),
  build: (rows, companyId, refs) =>
    buildPenaltySaveRecords(rows, companyId, (rec) => derivePenaltyMatch(rec, refs[0] || [], refs[1] || [])),
  save: savePenaltyRecords,
  savedToast: penaltySavedToast,
  saveLabel: (n) => `과태료 ${n}건 등록`,
  incompleteNote: (n) => `미완 ${n}건은 차번·위반일·금액을 수기 입력해야 등록됩니다.`,
};

/* ── 대량 업로드 페이지(/penalty/upload) 용 얇은 위임 ──
   패널과 대량페이지가 서로 다른 구현을 갖지 않도록 공용(lib/doc-intake)으로 넘긴다. */
export const makePenaltyIntakeRows = (files: File[], stamp?: number) =>
  makeDocIntakeRows(files, 'penalty', stamp);
export const ocrPenaltyFiles = (files: File[], baseRows: PenaltyIntakeRow[]) =>
  ocrDocFiles(PENALTY_INTAKE_SPEC, files, baseRows);
export const isPenaltyIntakeReady = (row: PenaltyIntakeRow) =>
  isDocIntakeReady(PENALTY_INTAKE_SPEC, row);
