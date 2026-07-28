/**
 * 업무관리 ↔ 과태료 CMS집금식 SSOT.
 *   전체 뷰 = 집계 1줄(bucket) · 과태료 뷰 = 고지서 1건=1행.
 *   매칭·상태·유형 분류는 matchPenalty / penaltyStatus 재사용(페이지 손롤 금지).
 */
import type { EntityRecord } from '@/lib/intake/entities';
import { companyDisplay } from '@/lib/companies';
import { matchPenalty } from '@/lib/penalty-match';
import { penaltyStatus } from '@/lib/penalty-reassign';

export type PenaltyKind = '주정차위반' | '경찰서건' | '기타';
export type PenaltyProcess = '미매칭' | '진행' | '종결';

export const PENALTY_KINDS: PenaltyKind[] = ['주정차위반', '경찰서건', '기타'];
export const PENALTY_PROCESSES: PenaltyProcess[] = ['미매칭', '진행', '종결'];

/** 고지서 유형 — 내용·발급기관·docType 휴리스틱(분류값만, 청구분기 X). */
export function penaltyKindOf(p: EntityRecord): PenaltyKind {
  const blob = `${p.docType || ''} ${p.description || ''} ${p.issuer || ''}`;
  if (/주정차|주차|정차/.test(blob)) return '주정차위반';
  if (/구청|시청|군청|자치/.test(blob) && !/경찰/.test(blob)) return '주정차위반';
  if (/경찰|교통위반|속도|신호|카메라|범칙|지구대/.test(blob)) return '경찰서건';
  return '기타';
}

export function penaltyProcessOf(p: EntityRecord, matched: boolean): PenaltyProcess {
  const st = penaltyStatus(p);
  if (st === '변경부과완료' || st === '종결') return '종결';
  if (!matched) return '미매칭';
  return '진행';
}

export type PenaltyWorkRow = {
  id: string;
  company: string;
  companyId: string;
  kind: string;
  group: '과태료';
  target: string;
  title: string;
  workAt: string;
  workDate: string;
  dueDate: string;
  status: string;
  assignee: string;
  amount: number;
  source: 'penalty';
  nest?: 'penalty-bucket';
  /** 개별 행 */
  plate: string;
  violationDate: string;
  driverName: string;
  penaltyKind: PenaltyKind;
  process: PenaltyProcess;
  matched: boolean;
  count?: number;
  openCount?: number;
  raw: EntityRecord;
};

export function buildPenaltyWorkRows(
  penalties: EntityRecord[],
  contracts: EntityRecord[],
): PenaltyWorkRow[] {
  return penalties.map((r) => {
    const m = matchPenalty(r, contracts);
    const matched = !!(m && m.renter);
    const driver = matched
      ? String(m!.renter)
      : String(r.driverName || '');
    const process = penaltyProcessOf(r, matched);
    const workAt = String(r.updatedAt || r.createdAt || r.issueDate || r.violationDate || '');
    const st = penaltyStatus(r);
    return {
      id: `penalty:${String(r._key || r.id)}`,
      company: companyDisplay(String(r.companyId || '')),
      companyId: String(r.companyId || ''),
      kind: '과태료',
      group: '과태료' as const,
      target: String(r.plate || r.contractNo || ''),
      title: String(r.description || r.docType || '과태료 처리'),
      workAt,
      workDate: workAt.slice(0, 10),
      dueDate: String(r.dueDate || r.violationDate || '').slice(0, 10),
      status: process === '미매칭' ? '미매칭' : st,
      assignee: String(r.assignee || r.author || ''),
      amount: Number(r.amount) || 0,
      source: 'penalty' as const,
      plate: String(r.plate || ''),
      violationDate: String(r.violationDate || '').slice(0, 10),
      driverName: driver || '미매칭',
      penaltyKind: penaltyKindOf(r),
      process,
      matched,
      raw: r,
    };
  }).sort((a, b) => b.violationDate.localeCompare(a.violationDate) || b.workAt.localeCompare(a.workAt));
}

/** 전체(비과태료) 뷰용 집계 1줄 — CMS집금 대칭. */
export function buildPenaltyBucketRow(rows: PenaltyWorkRow[]): PenaltyWorkRow | null {
  if (!rows.length) return null;
  const openCount = rows.filter((r) => r.process !== '종결').length;
  const amount = rows.reduce((s, r) => s + r.amount, 0);
  const latest = rows.reduce((mx, r) => (r.workAt > mx ? r.workAt : mx), '');
  return {
    id: 'penalty:bucket',
    company: '',
    companyId: '',
    kind: '과태료',
    group: '과태료' as const,
    target: '',
    title: `과태료 ${rows.length}건 · 미처리 ${openCount}`,
    workAt: latest,
    workDate: latest.slice(0, 10),
    dueDate: '',
    status: openCount ? '미처리' : '종결',
    assignee: '',
    amount,
    source: 'penalty' as const,
    nest: 'penalty-bucket' as const,
    plate: '',
    violationDate: '',
    driverName: '',
    penaltyKind: '기타',
    process: openCount ? '진행' : '종결',
    matched: false,
    count: rows.length,
    openCount,
    raw: {},
  };
}

/** 유형별 묶음 — 버킷 상세패널. */
export function groupPenaltiesByKind(rows: PenaltyWorkRow[]): { kind: PenaltyKind; rows: PenaltyWorkRow[] }[] {
  const map = new Map<PenaltyKind, PenaltyWorkRow[]>();
  for (const k of PENALTY_KINDS) map.set(k, []);
  for (const r of rows) {
    const list = map.get(r.penaltyKind) || [];
    list.push(r);
    map.set(r.penaltyKind, list);
  }
  return PENALTY_KINDS
    .map((kind) => ({ kind, rows: map.get(kind) || [] }))
    .filter((g) => g.rows.length > 0);
}
