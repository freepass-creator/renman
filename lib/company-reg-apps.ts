/**
 * 증차·감차 신청 = **업무**(사장님 확정 2026-08-07, AUDIT §6-3).
 *
 * 「신청→접수→승인/반려」로 도는 워크플로라 담당자·기한·상태가 붙는다. 그래서 법인 마스터의
 * 배열(`CompanyMaster.regApplications`)이 아니라 `work_item` 에 산다.
 * (공문 대장은 반대다 — 발신·수신 «기록»이지 할 일이 아니라 법인 속성으로 남는다.)
 *
 * 이 파일은 **옛 배열 → 업무** 변환만 한다. 순수함수 · 저장은 호출부.
 */
import type { EntityRecord } from './intake/entities';
import type { RegApplication } from './company-master';

/** 이 세부에 속한 업무가 증차·감차 신청이다. */
export const REG_APP_CATEGORY = '증차·감차';

/**
 * 신청 상태 → 업무 상태.
 * **반려도 «끝난» 것이다** — 상태는 완료로 두고 결과(`regResult`)로 가른다.
 * 반려를 「보류」로 두면 영원히 열린 일로 남아 할 일 목록을 오염시킨다.
 */
export function regAppWorkStatus(status: RegApplication['status']): '대기' | '진행' | '완료' {
  if (status === '접수') return '진행';
  if (status === '승인' || status === '반려') return '완료';
  return '대기';   // 준비
}

/** 승인·반려만 결과다. 준비·접수는 아직 결과가 없다. */
export function regAppResult(status: RegApplication['status']): '승인' | '반려' | undefined {
  return status === '승인' || status === '반려' ? status : undefined;
}

/**
 * 옛 마스터 배열 1건 → `work_item` 레코드.
 *
 * `workId` 를 신청 id 로 고정한다 — 이관을 두 번 돌려도 문서가 하나다(자연키 = 문서ID).
 * 지시(자동업무)의 `auto:` 접두와 겹치지 않게 `regapp:` 접두를 쓴다.
 */
export function regAppToWorkItem(app: RegApplication, companyId: string): EntityRecord {
  const result = regAppResult(app.status);
  return {
    workId: `regapp:${app.id}`,
    companyId,
    date: app.date || '',
    category: REG_APP_CATEGORY,
    targetType: '회사',
    status: regAppWorkStatus(app.status),
    priority: '보통',
    title: `${app.kind} 신청${app.count ? ` ${app.count}대` : ''}${app.office ? ` · ${app.office}` : ''}`,
    regKind: app.kind,
    ...(app.count != null ? { regCount: app.count } : {}),
    ...(app.office ? { regOffice: app.office } : {}),
    ...(result ? { regResult: result } : {}),
    ...(app.resultDate ? { regResultDate: app.resultDate } : {}),
    ...(app.note ? { description: app.note } : {}),
  };
}

/** 마스터에 남아 있는 옛 신청 전부 → 업무 레코드. 빈 배열이면 이관할 것이 없다. */
export function regAppsToWorkItems(
  apps: readonly RegApplication[] | undefined,
  companyId: string,
): EntityRecord[] {
  return (apps || []).map((a) => regAppToWorkItem(a, companyId));
}

/** 업무 목록에서 이 회사의 증차·감차 신청만. 화면이 `.filter()` 를 손롤하지 않게 여기 둔다. */
export function selectRegAppWorks(workItems: readonly EntityRecord[], companyId: string): EntityRecord[] {
  return workItems
    .filter((w) => String(w.category || '') === REG_APP_CATEGORY && String(w.companyId || '') === companyId)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}
