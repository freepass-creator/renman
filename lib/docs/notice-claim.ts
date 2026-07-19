/**
 * 내용증명 청구액·문서번호 SSOT — v5 cert-document + v6 PrintHost 합본.
 *   미납(gross) + 중도해지 위약금 − 보증금 = 최종 청구. PrintHost·미수 발송이 공유.
 */
import { type EntityRecord } from '@/lib/intake/entities';
import { computeContractView } from '@/lib/contract-ops';
import { earlyTerminationFee, type EarlyTerm } from '@/lib/domain/early-termination';
import { TODAY } from '@/lib/dashboard-consts';
import { fmtKMoneyHangul } from '@/lib/won-korean';

export type NoticeClaim = {
  asOf: string;
  dueDate: string;
  docNo: string;
  unpaidGross: number;
  unpaidCount: number;
  deposit: number;
  early: EarlyTerm;
  /** max(0, 미납 + 위약금 − 보증금) */
  claim: number;
  claimHangul: string;
};

function addDays(ymd: string, days: number): string {
  const d = new Date(ymd + 'T12:00:00');
  if (isNaN(d.getTime())) return ymd;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 문서번호 NCM-YYYYMMDD-xxxx (계약번호/차번 끝4). */
export function noticeDocNo(c: EntityRecord, asOf: string = TODAY): string {
  const ymd = asOf.replace(/-/g, '');
  const tail = (String(c.contractNo || c.plate || '').replace(/[^0-9A-Za-z가-힣]/g, '').slice(-4) || '0000').toUpperCase();
  return `NCM-${ymd}-${tail}`;
}

/** 내용증명 청구 스냅샷 — 화면·인쇄 동일 숫자. */
export function buildNoticeClaim(c: EntityRecord, asOf: string = TODAY, dueInDays = 7): NoticeClaim {
  const v = computeContractView(c, asOf);
  const early = earlyTerminationFee(c, asOf);
  const unpaidGross = Number(v.gross) || 0;
  const deposit = Number(c.deposit) || 0;
  const claim = Math.max(0, unpaidGross + early.fee - deposit);
  return {
    asOf,
    dueDate: addDays(asOf, dueInDays),
    docNo: noticeDocNo(c, asOf),
    unpaidGross,
    unpaidCount: v.count,
    deposit,
    early,
    claim,
    claimHangul: fmtKMoneyHangul(claim),
  };
}
