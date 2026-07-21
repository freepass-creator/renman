/** 회사 스코프 해소 SSOT — "이 레코드를 어느 법인에 쓰나".
 *  ⚠️ 절대 COMPANIES[0]·'switchplan' 같은 임의 폴백을 쓰지 말 것(합본 보기에서 조용한 타 법인 오배치 = 회사격리 위반).
 *  모호하면 null을 반환하고, 호출부는 저장을 막고 사용자에게 회사 선택을 요구한다.
 */
import { ALL_COMPANIES, COMPANIES } from './companies';

export const NEED_COMPANY = '저장할 법인을 선택하세요 (전체 보기에서는 자동 지정하지 않습니다).';

/** 쓰기 대상 법인 해소: ①레코드에 박힌 회사 ②단일 스코프면 그 회사 ③합본이면 null(=선택 요구). */
export function resolveWriteCompany(sessionCompanyId: string, rec?: { companyId?: unknown } | null): string | null {
  const fromRec = String(rec?.companyId ?? '').trim();
  if (fromRec && COMPANIES.includes(fromRec)) return fromRec;
  if (sessionCompanyId && sessionCompanyId !== ALL_COMPANIES) return sessionCompanyId;
  return null;
}

/** 합본 보기 여부(선택 UI 강제 판단용). */
export const isAllScope = (companyId: string) => companyId === ALL_COMPANIES;
