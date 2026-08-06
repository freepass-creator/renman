/**
 * 사업자등록증 OCR 결과 → 법인 마스터 필드 매핑 (SSOT).
 *
 * `CompanyRegistry`(/admin)에 손롤로 있던 것을 끌어냈다 — 경영관리 법인 패널의
 * 문서 섹션도 같은 매핑을 써야 «어디서 올렸냐»에 따라 결과가 달라지지 않는다.
 * (AUDIT §3 · §6-2 — /admin 을 없애기 위한 선행 작업)
 */
import type { CompanyMasterInput } from './companies';

function text(raw: Record<string, unknown>, key: string): string {
  return String(raw[key] || '').trim();
}

function list(raw: Record<string, unknown>, key: string): string[] | undefined {
  const value = text(raw, key);
  return value ? value.split(/[,\n]/).map((v) => v.trim()).filter(Boolean) : undefined;
}

/** OCR 원문 → 마스터 패치 + 상호(label). 상호는 레지스트리가 따로 받으므로 분리해 돌려준다. */
export function businessRegToMaster(raw: Record<string, unknown>): {
  label: string;
  master: CompanyMasterInput;
} {
  const businessAddress = text(raw, 'address');
  const headquartersAddress = text(raw, 'hq_address');
  return {
    label: text(raw, 'partner_name'),
    master: {
      bizNo: text(raw, 'biz_no'),
      corpNo: text(raw, 'corp_no'),
      ceo: text(raw, 'ceo'),
      openDate: text(raw, 'open_date'),
      address: headquartersAddress || businessAddress,
      businessAddress,
      headquartersAddress,
      entityType: text(raw, 'entity_type'),
      industry: list(raw, 'industry'),
      category: list(raw, 'category'),
      email: text(raw, 'email'),
      taxOffice: text(raw, 'tax_office'),
      businessRegistration: { issueDate: text(raw, 'issue_date') },
    },
  };
}

/** 빈 값은 기존 값을 덮지 않는다 — OCR이 한 칸 못 읽었다고 이미 넣은 정보를 지우면 안 된다. */
export function mergeNonEmpty(base: CompanyMasterInput, patch: CompanyMasterInput): CompanyMasterInput {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v == null) continue;
    if (typeof v === 'string' && !v.trim()) continue;
    if (Array.isArray(v) && !v.length) continue;
    out[k] = v;
  }
  return out as CompanyMasterInput;
}
