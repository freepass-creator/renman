/**
 * OCR 교차검증 — 추출값의 **내부 정합성**을 검산해 신뢰도와 경고를 부여한다.
 *
 * 목적(능동 지능): 비개발자 운영자가 "어느 업로드를 다시 봐야 하는지" 몰라도
 *   시스템이 먼저 짚어준다. Gemini/OCR 이 값을 틀리게 읽어도(1↔7, 금액 오독, 번호판 누락)
 *   지금은 아무도 모르고 그대로 저장됨 → 검산 규칙으로 의심 건에 ⚠ 를 달아 사람이 그 건만 확인.
 *
 * 원칙:
 *   · 저장을 막지 않는다 — 원본 보존 우선([[feedback_ocr_preserve_original]]). 경고만 부여.
 *   · 순수 함수 — 네트워크/GPU 불필요. raw OCR JSON(= /api/ocr/extract 출력) 을 그대로 받는다.
 *   · GPU 재판독(오프라인 대량 금액 대조)은 scripts/ocr_crosscheck_gpu 로 별도 트랙.
 */

export type CrosscheckLevel = 'ok' | 'warn' | 'error';

export interface CrosscheckIssue {
  field?: string;
  message: string;
  severity: 'warn' | 'error';
}

export interface CrosscheckResult {
  level: CrosscheckLevel; // 최고 심각도
  confidence: number;     // 0~100 (100 = 완벽 정합)
  issues: CrosscheckIssue[];
}

// ── 헬퍼 ───────────────────────────────────────────────────────────
function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,\s원]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}
function str(v: unknown): string { return v == null ? '' : String(v).trim(); }
function ymd(v: unknown): string { return str(v).slice(0, 10); }
function daysBetween(a: string, b: string): number | null {
  const ta = new Date(a).getTime(), tb = new Date(b).getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.round((tb - ta) / 86400000);
}

/** issues → level/confidence 집계 (error −40, warn −15, clamp 0~100) */
function summarize(issues: CrosscheckIssue[]): CrosscheckResult {
  const hasError = issues.some((i) => i.severity === 'error');
  const hasWarn = issues.some((i) => i.severity === 'warn');
  const penalty = issues.reduce((s, i) => s + (i.severity === 'error' ? 40 : 15), 0);
  return {
    level: hasError ? 'error' : hasWarn ? 'warn' : 'ok',
    confidence: Math.max(0, 100 - penalty),
    issues,
  };
}

const WON = (n: number) => n.toLocaleString('ko-KR') + '원';

// ── 보험증권 ────────────────────────────────────────────────────────
/** raw: INSURANCE_POLICY_SCHEMA 출력 (total_premium, paid_premium, installments[{cycle,amount}], start/end_date …) */
export function crosscheckInsurance(raw: Record<string, unknown>): CrosscheckResult {
  const issues: CrosscheckIssue[] = [];
  const total = num(raw.total_premium);
  const paid = num(raw.paid_premium);
  const insts = Array.isArray(raw.installments) ? raw.installments : [];
  const later = insts
    .map((it) => (typeof it === 'object' && it ? { cycle: num((it as Record<string, unknown>).cycle), amount: num((it as Record<string, unknown>).amount) } : null))
    .filter((x): x is { cycle: number | undefined; amount: number | undefined } => !!x && x.cycle != null && x.amount != null && (x.cycle as number) > 1);
  const laterSum = later.reduce((s, x) => s + (x.amount ?? 0), 0);

  if (total == null) {
    issues.push({ field: 'total_premium', message: '총보험료를 못 읽음 — 1회차 산출 불가', severity: 'warn' });
  } else if (later.length > 0) {
    // 1회차 = 총 − sum(2..N)  ([[feedback_jpkerp5_form_engine_standard]] 확정 정책)
    const first = total - laterSum;
    if (first < 0) {
      issues.push({ field: 'installments', message: `2~N회차 합(${WON(laterSum)})이 총보험료(${WON(total)})보다 큼 — 회차 금액 오독 의심`, severity: 'error' });
    } else if (first > total * 0.9 && later.length >= 3) {
      // 1회차가 총의 90% 초과인데 분납이 3회+ → 2~N 회차를 놓쳐 읽었을 가능성
      issues.push({ field: 'installments', message: `1회차 산출액이 총보험료의 ${Math.round(first / total * 100)}% — 일부 회차 누락 읽기 의심`, severity: 'warn' });
    }
    // page-81 유형: 납입한 보험료가 총과 같은데 분납이 존재 → paid_premium 신뢰 불가(코드는 무시하고 산출)
    if (paid != null && total != null && Math.abs(paid - total) <= 1 && later.length > 0) {
      issues.push({ field: 'paid_premium', message: `"납입한 보험료"가 총보험료와 동일한데 분납 명세 존재 — 1회차는 총−Σ(2~N)=${WON(first)} 로 산출됨(증권 표기 오류 가능)`, severity: 'warn' });
    }
  }

  // 분납 회차 금액은 보통 균등(예: 50,320 안팎) — 한 회차만 크게 튀면 OCR 오독 의심.
  // (실측: DB손보 bulk 2~6회차 모두 근사. "납입한 보험료" 필드는 불신뢰라 검산에 안 씀.)
  if (later.length >= 2) {
    const amts = later.map((x) => x.amount ?? 0).filter((a) => a > 0);
    if (amts.length >= 2) {
      const mn = Math.min(...amts), mx = Math.max(...amts);
      if (mn > 0 && mx > mn * 3) {
        issues.push({ field: 'installments', message: `분납 회차 금액 편차 큼(${WON(mn)}~${WON(mx)}) — 특정 회차 오독 의심`, severity: 'warn' });
      }
    }
  }

  const s = ymd(raw.start_date), e = ymd(raw.end_date);
  if (s && e) {
    const d = daysBetween(s, e);
    if (d != null && d <= 0) issues.push({ field: 'end_date', message: `보험 종기(${e})가 시기(${s}) 이전 — 날짜 오독 의심`, severity: 'error' });
    else if (d != null && (d < 180 || d > 400)) issues.push({ field: 'end_date', message: `보험기간이 ${d}일 (통상 1년 아님) — 날짜 확인 요망`, severity: 'warn' });
  }
  if (!str(raw.car_number)) issues.push({ field: 'car_number', message: '차량번호 미인식 — 차량/계약 매칭 불가', severity: 'warn' });

  return summarize(issues);
}

// ── 과태료/통행료 ───────────────────────────────────────────────────
/** raw: PENALTY_SCHEMA 출력 (amount, 그리고 track D 이후 penalty_amount/surcharge_amount/…). */
export function crosscheckPenalty(raw: Record<string, unknown>): CrosscheckResult {
  const issues: CrosscheckIssue[] = [];
  const amount = num(raw.amount);
  if (amount == null || amount <= 0) {
    issues.push({ field: 'amount', message: '부과금액을 못 읽음(0/공란) — 금액 확인 요망', severity: 'error' });
  } else {
    // 세부금액 검산 — 본세는 상호배타(과태료 OR 범칙금 OR 통행료 중 하나) + 가산금.
    // 셋을 다 합치면 안 됨(상시 오검). 부과액 = 본세 + 가산금.
    const main = [num(raw.penalty_amount), num(raw.fine_amount), num(raw.toll_amount)]
      .find((x): x is number => x != null && x > 0);
    const surcharge = num(raw.surcharge_amount) ?? 0;
    if (main != null) {
      const expected = main + surcharge;
      if (Math.abs(expected - amount) > 1) {
        issues.push({ field: 'amount', message: `본세+가산금(${WON(expected)})과 부과금액(${WON(amount)}) 불일치 — 금액 오독 의심`, severity: 'warn' });
      }
    }
  }
  if (!str(raw.car_number)) issues.push({ field: 'car_number', message: '차량번호 미인식 — 계약 매칭/부과 통지 불가', severity: 'warn' });

  const issue = ymd(raw.issue_date), due = ymd(raw.due_date);
  if (issue && due) {
    const d = daysBetween(issue, due);
    if (d != null && d < 0) issues.push({ field: 'due_date', message: `납부기한(${due})이 발송일(${issue}) 이전 — 날짜 오독 의심`, severity: 'warn' });
  }
  return summarize(issues);
}

// ── 자동차등록증 ────────────────────────────────────────────────────
/** raw: VEHICLE_REG_SCHEMA 출력 (vin/plate/displacement/first_registered_date …). */
export function crosscheckVehicleReg(raw: Record<string, unknown>): CrosscheckResult {
  const issues: CrosscheckIssue[] = [];
  const vin = str(raw.vin);
  if (vin && vin.replace(/\s/g, '').length !== 17) {
    issues.push({ field: 'vin', message: `차대번호 길이 ${vin.replace(/\s/g, '').length}자 (표준 17자 아님) — 오독 의심`, severity: 'warn' });
  }
  const cc = num(raw.displacement);
  if (cc != null && (cc < 50 || cc > 10000)) {
    issues.push({ field: 'displacement', message: `배기량 ${cc}cc 비정상 범위 — 오독 의심`, severity: 'warn' });
  }
  if (!str(raw.plate) && !str(raw.car_number)) {
    issues.push({ field: 'plate', message: '차량번호 미인식 — 자산 등록 불가', severity: 'error' });
  }
  const first = ymd(raw.first_registration_date); // 스키마 필드명 정합 (구 first_registered_date는 미발화였음)
  if (first) {
    const d = daysBetween(new Date().toISOString().slice(0, 10), first);
    if (d != null && d > 0) issues.push({ field: 'first_registration_date', message: `최초등록일(${first})이 미래 — 날짜 오독 의심`, severity: 'warn' });
  }
  return summarize(issues);
}

// ── 상환스케줄표(할부/리스) ─────────────────────────────────────────
/** raw: LOAN_SCHEDULE_SCHEMA 출력 (principal/acquisition_cost, total_repayment, months, rows[{principal,interest,payment,remaining_principal}]). */
export function crosscheckLoanSchedule(raw: Record<string, unknown>): CrosscheckResult {
  const issues: CrosscheckIssue[] = [];
  const rows = Array.isArray(raw.rows) ? raw.rows : [];
  if (rows.length === 0) {
    issues.push({ field: 'rows', message: '회차 행을 못 읽음 — 상환표 인식 실패', severity: 'error' });
    return summarize(issues);
  }
  const months = num(raw.months);
  const principal = num(raw.principal) ?? num(raw.acquisition_cost);
  const totalRep = num(raw.total_repayment);

  let pSum = 0, iSum = 0, paySum = 0, rowMismatch = 0, remainViolation = 0;
  let prev = Infinity;
  for (const it of rows) {
    if (typeof it !== 'object' || it === null) continue;
    const o = it as Record<string, unknown>;
    const p = num(o.principal) ?? 0;
    const ic = num(o.interest) ?? 0;
    let pay = num(o.payment) ?? 0;
    if (pay === 0) pay = p + ic;
    pSum += p; iSum += ic; paySum += pay;
    if (pay > 0 && Math.abs(p + ic - pay) > 1) rowMismatch++;
    const rem = num(o.remaining_principal ?? o.remainingPrincipal);
    if (rem != null) { if (rem > prev + 1) remainViolation++; prev = rem; }
  }
  void iSum;
  if (rowMismatch > 0) issues.push({ field: 'rows', message: `${rowMismatch}개 회차에서 원금+이자 ≠ 월불입금 — 금액 오독 의심`, severity: 'warn' });
  if (remainViolation > 0) issues.push({ field: 'rows', message: `미회수원금이 증가하는 회차 ${remainViolation}개 — 잔액 오독 의심`, severity: 'warn' });
  if (months != null && rows.length !== months) issues.push({ field: 'months', message: `회차 수(${rows.length})와 기간(${months}) 불일치 — 일부 행 누락 의심`, severity: 'warn' });
  if (principal != null && pSum > 0 && Math.abs(pSum - principal) > Math.max(1000, principal * 0.01)) issues.push({ field: 'principal', message: `원금 합(${WON(pSum)})과 대출원금(${WON(principal)}) 불일치`, severity: 'warn' });
  if (totalRep != null && paySum > 0 && Math.abs(paySum - totalRep) > Math.max(1000, totalRep * 0.01)) issues.push({ field: 'total_repayment', message: `월불입 합(${WON(paySum)})과 총상환액(${WON(totalRep)}) 불일치`, severity: 'warn' });
  return summarize(issues);
}

// ── 디스패처 ────────────────────────────────────────────────────────
export function crosscheckOcr(docType: string, raw: Record<string, unknown>): CrosscheckResult {
  switch (docType) {
    case 'insurance_policy': return crosscheckInsurance(raw);
    case 'penalty':          return crosscheckPenalty(raw);
    case 'vehicle_reg':      return crosscheckVehicleReg(raw);
    case 'loan_schedule':    return crosscheckLoanSchedule(raw);
    default:                 return { level: 'ok', confidence: 100, issues: [] };
  }
}
