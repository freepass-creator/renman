// 렌터카 법령·정책 능동 컴플라이언스 체크 — 위반 소지를 시스템이 먼저 짚어줌(업무 편의).
// 여객자동차 운수사업법(운전자격 확인 제34조의2)·자배법(의무보험)·표준약관 정합. 순수 primitive.
import type { EntityRecord } from './intake/entities';
import { todayKST } from './contracts/dates'; // KST 기준 오늘

export interface ComplianceFlag {
  code: string;
  label: string;
  severity: 'high' | 'med';
  detail: string;
}

// 생년월일(YYYY-MM-DD) → 기준일 만나이. 잘못된 값이면 0. (주민번호 아님 — 생년월일만)
export function ageFromBirth(birth: unknown, today?: string): number {
  const b = String(birth || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b)) return 0;
  const t = today && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : todayKST();
  let age = Number(t.slice(0, 4)) - Number(b.slice(0, 4));
  if (t.slice(5) < b.slice(5)) age--; // 생일 안 지났으면 -1
  return age > 0 && age < 120 ? age : 0;
}

// 운행 중 계약 + 그 차량 → 법령/정책 위반 경고 배열.
export function checkCompliance(c: EntityRecord, v: EntityRecord | null, today: string): ComplianceFlag[] {
  const flags: ComplianceFlag[] = [];
  // 운전자격 확인 의무: 면허 미확인 대여 (법 제34조의2)
  if (!String(c.contractorLicenseNo || '')) {
    flags.push({ code: 'no_license', label: '면허 미확인', severity: 'high', detail: '운전자 면허 미확인 대여 — 여객법 제34조의2 위반 소지' });
  }
  // 보험 커버리지: 운전자 연령 < 보험 허용연령 → 무보험(운전불가)
  // driverAge 없으면 생년월일에서 산출, insuranceAge는 차량 denorm에서도 읽음.
  const da = Number(c.driverAge) || ageFromBirth(c.contractorBirth, today) || 0;
  const ia = Number(c.insuranceAge ?? v?.insuranceAge) || 0;
  if (da && ia && da < ia) {
    flags.push({ code: 'ins_age', label: '보험 미커버', severity: 'high', detail: `운전자 ${da}세 < 보험 허용 ${ia}세 → 운전불가` });
  }
  // 의무보험: 차량 보험 만기 경과 = 무보험 운행 (자배법)
  const insExp = String(v?.insuranceExpiryDate ?? c.insuranceExpiryDate ?? '').slice(0, 10);
  if (insExp && /^\d{4}-\d{2}-\d{2}$/.test(insExp)) {
    if (insExp < today) flags.push({ code: 'ins_expired', label: '무보험 운행', severity: 'high', detail: `자동차보험 만기 ${insExp} 경과 — 즉시 조치` });
  } else if (v) {
    flags.push({ code: 'ins_missing', label: '보험 미확인', severity: 'med', detail: '자동차보험 만기 데이터 없음' });
  }
  // 정기검사 만료: 검사 지나면 불법 운행 (자동차관리법 제43조)
  const inspExp = String(v?.inspectionTo ?? c.inspectionTo ?? '').slice(0, 10);
  if (inspExp && /^\d{4}-\d{2}-\d{2}$/.test(inspExp)) {
    const days = Math.round((new Date(inspExp).getTime() - new Date(today).getTime()) / 86400000);
    if (days < 0) flags.push({ code: 'inspection_expired', label: '검사 만료', severity: 'high', detail: `정기검사 만료 ${inspExp} 경과 ${-days}일 — 불법 운행` });
    else if (days <= 30) flags.push({ code: 'inspection_soon', label: '검사 임박', severity: 'med', detail: `정기검사 만료 D-${days} (${inspExp})` });
  }
  // 21세 미만 대여(표준약관 제3조)
  if (da && da < 21) {
    flags.push({ code: 'age_under21', label: '연령 미달', severity: 'med', detail: `운전자 ${da}세 (표준약관 만 21세 미만 대여 제한)` });
  }
  return flags;
}

export const complianceTone = (sev: 'high' | 'med'): 'red' | 'amber' => (sev === 'high' ? 'red' : 'amber');
