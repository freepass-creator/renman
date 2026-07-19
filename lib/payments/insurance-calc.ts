/**
 * 자동차보험증권 — 1회차 보험료 산출 + 만기 일수 + OCR raw 매핑.
 *
 * 1회차 산출 룰 (사용자 정책):
 *   총보험료 = 1회차 + 2~N회차 합산
 *   ∴ 1회차 = 총보험료 - sum(installments[2..N])
 *
 * OCR 분납 정보는 2회차부터만 명세에 있고 1회차는 명시 안 됨 (가입시 즉시 납입).
 * "납입한 보험료" = 1회차 == paid_premium 으로 이미 산출돼 있을 수도 있지만,
 * total - sum(2..N) 결과와 paid_premium 가 다르면 OCR 인식 오차일 가능성 → 산출값 우선.
 */

import type { InsurancePolicy, InsuranceInstallment } from './types';

/**
 * OCR raw → InsurancePolicy 변환 + 1회차 자동 prepend.
 *
 * 입력 installments 는 2회차부터의 명세 (1회차는 OCR 명세에 없음).
 * 산출된 1회차를 installments[0] 로 prepend.
 */
export function buildInsurancePolicyFromOcr(
  raw: Record<string, unknown>,
  opts?: { id?: string; companyCode?: string; vehicleId?: string },
): InsurancePolicy {
  const s = (k: string): string | undefined => (raw[k] != null ? String(raw[k]) : undefined);
  const n = (k: string): number | undefined => {
    const v = raw[k];
    if (v == null) return undefined;
    const num = typeof v === 'number' ? v : Number(String(v).replace(/[,\s]/g, ''));
    return Number.isFinite(num) ? num : undefined;
  };

  const totalPremium = n('total_premium');
  const paidPremium = n('paid_premium');
  const startDate = s('start_date');

  // OCR installments 정규화 — 회차 키 우선순위 (cycle, due_date 또는 dueDate)
  const rawInstallments = Array.isArray(raw.installments) ? raw.installments : [];
  const parsed: InsuranceInstallment[] = rawInstallments
    .map((it): InsuranceInstallment | null => {
      if (typeof it !== 'object' || it === null) return null;
      const o = it as Record<string, unknown>;
      const cycle = Number(o.cycle);
      const dueDate = String(o.due_date ?? o.dueDate ?? '');
      const amount = Number(String(o.amount ?? '').replace(/[,\s]/g, ''));
      if (!Number.isFinite(cycle) || cycle < 1) return null;
      if (!Number.isFinite(amount) || amount <= 0) return null;
      return { cycle, dueDate, amount };
    })
    .filter((x): x is InsuranceInstallment => x !== null);

  // 정책 (사용자 확정): 1회차 = 총보험료 − sum(2~N회차) — 항상 산출
  // OCR 이 cycle=1 을 명시했더라도 무시하고 산출값 사용 (paid_premium 불일치 케이스 회피)
  const later = parsed.filter((x) => x.cycle > 1).sort((a, b) => a.cycle - b.cycle);

  const installments: InsuranceInstallment[] = [];
  let firstInst: InsuranceInstallment | undefined;

  if (totalPremium != null && later.length > 0) {
    const laterSum = later.reduce((sum, i) => sum + i.amount, 0);
    const firstAmount = Math.max(0, totalPremium - laterSum);
    firstInst = {
      cycle: 1,
      dueDate: startDate ?? later[0]?.dueDate ?? '',
      amount: firstAmount,
      paid: true,
    };
  } else if (totalPremium != null && later.length === 0) {
    // 분납 명세 없음 — 일시납. 1회차 = 총보험료
    firstInst = {
      cycle: 1,
      dueDate: startDate ?? '',
      amount: totalPremium,
      paid: true,
    };
  } else if (paidPremium != null) {
    // 총보험료 OCR 실패 fallback — 납입한 금액으로
    firstInst = {
      cycle: 1,
      dueDate: startDate ?? '',
      amount: paidPremium,
      paid: true,
    };
  }

  if (firstInst) installments.push(firstInst);
  installments.push(...later);

  return {
    id: opts?.id ?? `ins-${Date.now()}`,
    companyCode: opts?.companyCode,
    vehicleId: opts?.vehicleId,
    insurer: s('insurer'),
    productName: s('product_name'),
    policyNo: s('policy_no'),
    contractor: s('contractor'),
    insured: s('insured'),
    bizNo: s('biz_no'),
    startDate,
    endDate: s('end_date'),
    carNumber: s('car_number'),
    carName: s('car_name'),
    carYear: n('car_year'),
    carClass: s('car_class'),
    displacement: n('displacement'),
    seats: n('seats'),
    vehicleValueMan: n('vehicle_value_man'),
    accessoryValueMan: n('accessory_value_man'),
    accessories: s('accessories'),
    driverScope: s('driver_scope'),
    driverAge: s('driver_age'),
    deductibleMan: n('deductible_man'),
    covPersonal1: s('cov_personal1'),
    covPersonal2: s('cov_personal2'),
    covProperty: s('cov_property'),
    covSelfAccident: s('cov_self_accident'),
    covUninsured: s('cov_uninsured'),
    covSelfVehicle: s('cov_self_vehicle'),
    covEmergency: s('cov_emergency'),
    paidPremium,
    totalPremium,
    autoDebitBank: s('auto_debit_bank'),
    autoDebitAccount: s('auto_debit_account'),
    autoDebitHolder: s('auto_debit_holder'),
    installments,
    createdAt: new Date().toISOString(),
  };
}

/** end_date 까지 남은 일수 (today 기준). 음수면 만료된 일수. */
export function daysToExpiry(policy: InsurancePolicy, today = new Date()): number | null {
  if (!policy.endDate) return null;
  const end = new Date(policy.endDate);
  if (Number.isNaN(end.getTime())) return null;
  return Math.floor((end.getTime() - today.getTime()) / 86400000);
}

/** 분납 합계 — 검산용 (paid 무관 전체 합) */
export function installmentSum(policy: InsurancePolicy): number {
  return (policy.installments ?? []).reduce((sum, i) => sum + (i.amount ?? 0), 0);
}

/** 검산: 분납 합계 vs 총보험료 일치? (1원 오차 허용) */
export function installmentMatchesTotal(policy: InsurancePolicy): boolean {
  if (policy.totalPremium == null) return true;
  return Math.abs(installmentSum(policy) - policy.totalPremium) <= 1;
}
