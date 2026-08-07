/**
 * 계약서 투입 SSOT — OCR→엔티티매핑→차량매칭→중복·겹침검사→원본저장→saveIntake.
 *   계약관리(/contract) 생성 패널에서 소비. 과태료(lib/penalty-intake)와 같은 구조·같은 규칙.
 *   ★새 OCR·매칭 엔진을 만들지 않는다 — ocrBatch·mapOcrToEntity·findVehicleByPlate·
 *     contractPeriodOverlaps 를 그대로 쓴다. 투입 경로마다 규칙이 갈리면
 *     「투입 때는 통과, 대시보드에선 충돌」이 된다.
 */
import { companyLabel } from '@/lib/companies';
import { contractPeriodOverlaps } from '@/lib/contracts/dates';
import { saveIntake } from '@/lib/intake';
import type { EntityRecord } from '@/lib/intake/entities';
import { ocrBatch, mapOcrToEntity } from '@/lib/ocr-client';
import type { CrosscheckResult } from '@/lib/ocr-crosscheck';
import { findVehicleByPlate, normPlate } from '@/lib/plate';
import { docPath, uploadDoc } from '@/lib/storage';

/** 계약서 엔티티의 OCR 종류(lib/intake/entities `contract.ocrType`). 'contract' 가 아니다. */
export const CONTRACT_OCR_TYPE = 'rental_contract';
export const CONTRACT_OCR_MAX = 10;

export type ContractIntakeStatus = 'pending' | 'done' | 'failed';

export type ContractIntakeRow = {
  id: string;
  fileName: string;
  file: File;
  status: ContractIntakeStatus;
  rec: EntityRecord;
  ocrOriginal?: unknown;
  crosscheck?: CrosscheckResult;
  error?: string;
};

export type ContractMatchDerive = {
  /** 차량 원장에서 찾은 차명. 못 찾으면 null. */
  carName: string | null;
  /** 차번은 읽혔는데 차량 원장에 그 차가 없다 — 저장은 되지만 리스크(서류미첨부)로 뜬다. */
  ghostPlate: boolean;
  /** 같은 계약번호, 또는 같은 차번+시작일이 이미 있다. */
  dup: boolean;
  /** 같은 차량의 기간이 겹치는 기존 계약(이중배차). 있으면 계약자명. */
  overlapWith: string | null;
};

export function makeContractIntakeRows(files: File[], stamp = Date.now()): ContractIntakeRow[] {
  return files.map((f, i) => ({
    id: `ctr-${stamp}-${i}`,
    fileName: f.name,
    file: f,
    status: 'pending' as const,
    rec: {},
  }));
}

/** OCR 배치 실행 후 행 상태 갱신. */
export async function ocrContractFiles(
  files: File[],
  baseRows: ContractIntakeRow[],
): Promise<ContractIntakeRow[]> {
  const results = await ocrBatch(files, CONTRACT_OCR_TYPE);
  return baseRows.map((row, i) => {
    const res = results[i];
    if (res?.ok && res.raw) {
      return {
        ...row,
        status: 'done' as const,
        rec: mapOcrToEntity('contract', res.raw),
        ocrOriginal: res.ocrOriginal,
        crosscheck: res.crosscheck,
      };
    }
    return { ...row, status: 'failed' as const, error: res?.error };
  });
}

export function deriveContractMatch(
  rec: EntityRecord,
  vehicles: EntityRecord[],
  existing: EntityRecord[],
): ContractMatchDerive {
  const plate = normPlate(rec.plate);
  const vehicle = plate ? findVehicleByPlate(vehicles, plate) : undefined;
  const contractNo = String(rec.contractNo || '').trim();
  const start = String(rec.startDate || '').slice(0, 10);

  const dup = existing.some((e) => {
    if (contractNo && String(e.contractNo || '').trim() === contractNo) return true;
    return !!plate && !!start
      && normPlate(e.plate) === plate
      && String(e.startDate || '').slice(0, 10) === start;
  });

  // 겹침은 «다른 계약»과만 본다 — 중복 건은 dup 이 이미 알린다.
  const overlap = plate
    ? existing.find((e) =>
      normPlate(e.plate) === plate
      && !e.returnedDate
      && String(e.startDate || '').slice(0, 10) !== start
      && contractPeriodOverlaps(rec, e))
    : undefined;

  return {
    carName: vehicle ? String(vehicle.carName || vehicle.model || '') || null : null,
    ghostPlate: !!plate && !vehicle,
    dup,
    overlapWith: overlap ? String(overlap.contractorName || overlap.contractNo || '기존 계약') : null,
  };
}

/**
 * 저장해도 되는 상태인가.
 * 임차인·차량번호·시작일 — 셋이 없으면 계약이 «누가·무슨 차를·언제부터»를 못 말한다.
 * (계약번호는 비어도 된다 — store 가 시스템 id 를 자연키로 승격한다.)
 */
export function isContractIntakeReady(row: ContractIntakeRow): boolean {
  return !!String(row.rec.contractorName || '').trim()
    && !!String(row.rec.plate || '').trim()
    && !!String(row.rec.startDate || '').trim();
}

/** 아직 못 채운 항목 이름 — 그 줄에서 수기로 보완하라고 알려 준다. */
export function contractIntakeMissing(row: ContractIntakeRow): string[] {
  const miss: string[] = [];
  if (!String(row.rec.contractorName || '').trim()) miss.push('임차인');
  if (!String(row.rec.plate || '').trim()) miss.push('차량번호');
  if (!String(row.rec.startDate || '').trim()) miss.push('시작일');
  return miss;
}

export async function buildContractSaveRecords(
  rows: ContractIntakeRow[],
  companyId: string,
  derive: (rec: EntityRecord) => ContractMatchDerive,
): Promise<EntityRecord[]> {
  return Promise.all(rows.map(async (r) => {
    const { carName } = derive(r.rec);
    let fileUrl = '';
    try {
      fileUrl = (await uploadDoc(
        r.file,
        docPath(companyId, 'contract', String(r.rec.contractNo || r.id), r.fileName),
      )) || '';
    } catch { /* Firebase 미설정 시 스킵 — 계약은 저장한다(파일만 없음) */ }
    return {
      ...r.rec,
      companyId,
      // 계약서만 들어온 시점은 아직 «인도 전»이다 — 인도·반납은 계약화면의 전이가 맡는다.
      status: String(r.rec.status || '') || '대기',
      // 차명이 OCR 에서 안 읽혔으면 차량 원장 값으로 채운다(비워 두지 않는다).
      ...(!r.rec.carName && carName ? { carName } : {}),
      ...(fileUrl ? { fileUrl } : {}),
      _ocrOriginal: r.ocrOriginal,
    };
  }));
}

export async function saveContractRecords(companyId: string, records: EntityRecord[]): Promise<number> {
  await saveIntake('contract', companyId, records);
  return records.length;
}

export function contractSavedToast(count: number, companyId: string): string {
  return `계약 ${count}건 등록 · ${companyLabel(companyId)}`;
}
