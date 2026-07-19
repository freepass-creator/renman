/**
 * 계약서·자금일보·보험증권 대조 결과 — 정합성 엔진 SSOT.
 *   원천 JSON은 migrate 산출물(1회 생성). UI(section-registry)·/integrity는 여기만 본다.
 */
import docAuditRaw from '@/lib/migrate/contract-doc-audit.json';
import { normPlate } from '@/lib/plate';

export type DocAuditKind = '입금확인' | '연락처확인' | '보험만기' | '보험없음' | '연령미달';
export type DocAuditSev = 'high' | 'med' | 'low';
export type DocAuditItem = {
  companyId: string;
  plate: string;
  name: string;
  kind: DocAuditKind;
  sev: DocAuditSev;
  detail: string;
};

export const DOC_AUDIT = docAuditRaw as DocAuditItem[];

const SEV_RANK: Record<DocAuditSev, number> = { high: 0, med: 1, low: 2 };

/** 현재 스코프 계약 plate 집합에 해당하는 감사 항목(심각도순). */
export function docAuditForPlates(plates: Iterable<string>): DocAuditItem[] {
  const set = new Set([...plates].map((p) => normPlate(p)).filter(Boolean));
  return DOC_AUDIT
    .filter((a) => set.has(normPlate(a.plate)))
    .sort((a, b) => SEV_RANK[a.sev] - SEV_RANK[b.sev]);
}
