/**
 * 리스크 엔진 — 베이스 정합성 경고. 대여(계약) 레코드의 사실에서 파생, 저장 안 함.
 * 베이스 3종: ① 미수(돈 안 냄) ② 보험 불일치(운전자<보험허용) ③ 반납 지남.
 * 차량 마스터 없이 대여 행만으로 동작 — 엑셀 마이그레이션 직후 바로 경고가 뜬다.
 */
import type { EntityRecord } from './intake/entities';
import { computeContractView, type ContractView } from './contract-ops';
import { ageFromBirth } from './compliance';

export type RiskKind = '미수' | '보험불일치' | '반납지남';
export type Severity = 'high' | 'mid';
export type RiskFlag = { kind: RiskKind; sev: Severity; detail: string };

function ymd(d: unknown): string { const s = String(d || ''); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''; }

/** 대여 1건의 경고 목록(0~3개). view를 넘기면 computeContractView 재계산 없음. */
export function contractRisks(rec: EntityRecord, today: string, view?: ContractView): RiskFlag[] {
  const out: RiskFlag[] = [];
  const v = view ?? computeContractView(rec, today);

  // ① 미수 — 도래 미수 − 입금 > 0
  if (v.net > 0) out.push({ kind: '미수', sev: v.net >= v.monthlyRent ? 'high' : 'mid', detail: `미수 ₩${v.net.toLocaleString()}${v.count ? ` (${v.count}회 연체)` : ''}` });

  // ② 보험 불일치 — 운전자 연령 < 보험 허용연령
  const driver = Number(rec.driverAge) || ageFromBirth(rec.contractorBirth, today) || 0;
  const insAge = Number(rec.insuranceAge) || 0;
  if (driver && insAge && driver < insAge) out.push({ kind: '보험불일치', sev: 'high', detail: `운전자 ${driver}세 < 보험 허용 ${insAge}세 (보장 안 됨)` });

  // ③ 반납 지남 — 운행 중인데 종료일 경과·미반납
  const end = ymd(rec.endDate);
  if (v.status === '운행' && end && !ymd(rec.returnedDate) && end < today) {
    const days = Math.round((new Date(today).getTime() - new Date(end).getTime()) / 86400000);
    out.push({ kind: '반납지남', sev: days >= 7 ? 'high' : 'mid', detail: `반납 예정 ${end} · ${days}일 경과` });
  }
  return out;
}

export type RiskRow = { rec: EntityRecord; flags: RiskFlag[] };

/** 전체 대여 → 경고 있는 것만. high 우선 정렬. views는 contracts와 동일 순서(선택). */
export function scanRisks(contracts: EntityRecord[], today: string, views?: ContractView[]): RiskRow[] {
  return contracts
    .map((rec, i) => ({ rec, flags: contractRisks(rec, today, views?.[i]) }))
    .filter((r) => r.flags.length > 0)
    .sort((a, b) => {
      const ah = a.flags.some((f) => f.sev === 'high') ? 0 : 1;
      const bh = b.flags.some((f) => f.sev === 'high') ? 0 : 1;
      return ah - bh || b.flags.length - a.flags.length;
    });
}
