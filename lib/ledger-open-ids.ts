/**
 * 원장 딥링크 open id SSOT — 보내는 쪽이 목적지 row id를 그대로 씀.
 *   접두어를 새로 발명하지 말 것. risk-ledger · penalty-work 규칙과 동기.
 */
export function riskUnpaidOpenId(rec: { _key?: unknown; contractNo?: unknown; plate?: unknown }): string {
  return `미납:${rec._key || rec.contractNo || rec.plate || ''}`;
}

export function riskComplianceOpenId(rec: { _key?: unknown; plate?: unknown }): string {
  return `컴플라이언스:${rec._key || rec.plate || ''}`;
}

export function riskDepositOpenId(rec: { _key?: unknown; contractNo?: unknown; plate?: unknown }): string {
  return `보증금미반환:${rec._key || rec.contractNo || rec.plate || ''}`;
}

/** 반납·계약 만기경과 — risk-ledger `미완료:만기경과:${plate}` */
export function riskReturnOverOpenId(plate: string): string {
  return `미완료:만기경과:${plate}`;
}

/** 일정 어김 — risk-ledger `미완료:일정:${agenda.key}` */
export function riskAgendaOverOpenId(agendaKey: string): string {
  return `미완료:일정:${agendaKey}`;
}

/** 과태료 — penalty-work / work ledger `penalty:${_key||id}` */
export function penaltyOpenId(rec: { _key?: unknown; id?: unknown }): string {
  return `penalty:${String(rec._key || rec.id || '')}`;
}
