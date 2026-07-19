// 과태료 변경부과 — 명의자(회사)로 온 과태료를 위반일시 기준 실운전자(임차인)에게 재부과.
// 위반일시→그 시점 그 차의 계약(임차인) 자동매칭. 순수 primitive.
import type { EntityRecord } from './intake/entities';
import { normPlate } from './plate';

export type PenaltyStatus = '접수' | '임차인확인' | '변경부과신청' | '변경부과완료' | '종결';

export function penaltyStatus(p: EntityRecord): PenaltyStatus {
  const s = String(p.reassignStatus || '');
  return (['접수', '임차인확인', '변경부과신청', '변경부과완료', '종결'].includes(s) ? s : '접수') as PenaltyStatus;
}

// 위반일시에 그 차를 대여 중이던 계약(임차인) 찾기. 없으면 null(회사 부담 or 미매칭).
// SSOT — /penalty·업로드·공문·360·operating-snapshot·PrintHost 전부 여기. (start~end만 보는 짧은 매칭 금지)
export function matchDriver(penalty: EntityRecord, contracts: EntityRecord[]): EntityRecord | null {
  const plate = normPlate(penalty.plate);
  const vdate = String(penalty.violationDate || '').slice(0, 10);
  if (!plate || !/^\d{4}-\d{2}-\d{2}/.test(vdate)) return null;
  const day = vdate.slice(0, 10);
  const cands = contracts
    .filter((c) => normPlate(c.plate) === plate)
    .filter((c) => {
      const start = String(c.startDate || c.deliveredDate || c.contractDate || '').slice(0, 10);
      const end = String(c.returnedDate || c.endDate || '').slice(0, 10);
      return !!start && start <= day && (!end || day <= end);
    })
    .sort((a, b) => String(b.startDate || b.deliveredDate || '').localeCompare(String(a.startDate || a.deliveredDate || '')));
  return cands[0] || null;
}

export const penaltyTone = (s: PenaltyStatus): 'gray' | 'amber' | 'orange' | 'green' =>
  s === '변경부과완료' || s === '종결' ? 'green' : s === '변경부과신청' ? 'orange' : 'amber';
