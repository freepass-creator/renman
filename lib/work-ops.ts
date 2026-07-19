/**
 * 차량 수선(정비·사고수리·상품화·세차) — 순수 로직 SSOT. (jpkerp4 상품화센터/차량케어센터 events 모델 이식)
 * 수선 작업은 별도 엔티티가 아니라 history(활동·이력) 레코드에 작업구분(category)+작업상태(work_status)를 실어 산다.
 *   · _kind:'work' 로 활동로그(_kind:'activity')와 구분. category는 수선 4종.
 *   · 저장 시 유휴차(활성계약 없음)면 차량 자산상태(status)를 파생 전이 → 휴차 워크벤치가 자동 반영.
 * 원칙: 운행 중(활성계약 보유)인 차·처분(매각/말소)된 차는 상태를 바꾸지 않는다(운행·처분이 우선). 유휴차만.
 */
import type { EntityRecord } from './intake/entities';

export const WORK_CATEGORIES = ['정비', '사고수리', '상품화', '세차'] as const;
export type WorkCategory = typeof WORK_CATEGORIES[number];
const WORK_CATEGORY_SET: ReadonlySet<string> = new Set(WORK_CATEGORIES);

export const WORK_STATUSES = ['접수', '진행중', '완료'] as const;
export type WorkStatus = typeof WORK_STATUSES[number];

// 파생 전이를 막는 상태(처분 완료) — 휴차 워크벤치 EXITED와 동일 어휘.
const TERMINAL: ReadonlySet<string> = new Set(['매각', '말소']);

type Tone = 'gray' | 'green' | 'red' | 'amber' | 'blue' | 'orange' | 'purple' | 'teal';

/** 수선 레코드인지 — _kind:'work' 이거나 category가 수선 4종(레거시·이관분 호환). */
export function isWorkRecord(rec: EntityRecord | null | undefined): boolean {
  if (!rec) return false;
  return rec._kind === 'work' || WORK_CATEGORY_SET.has(String(rec.category || ''));
}

/**
 * 작업구분·작업상태 → 차량 자산상태 전이 대상. 바꿀 필요 없으면 null.
 *   · 정비   (접수/진행중) → '정비'
 *   · 사고수리(접수/진행중) → '사고'
 *   · 상품화 (진행중)       → '상품화'    (접수는 미변경)
 *   · 정비·사고수리·상품화 (완료) → '대기' (= 즉시 출고 가능)
 *   · 세차 → 미변경(항상 null)
 * 유휴/처분 판정은 여기서 하지 않는다(순수). 적용 가드는 canApplyWorkStatus 참고.
 */
export function workStatusPatch(category: string, workStatus: string): string | null {
  if (category === '세차') return null;
  if (workStatus === '완료') {
    return category === '정비' || category === '사고수리' || category === '상품화' ? '대기' : null;
  }
  if (category === '정비') return '정비';
  if (category === '사고수리') return '사고';
  if (category === '상품화') return workStatus === '진행중' ? '상품화' : null;
  return null;
}

/**
 * 파생 전이를 실제로 적용해도 되는가 — 유휴차(활성계약 없음) && 처분 전 상태.
 * 운행 중(활성계약 보유)이면 그 차는 '운행'이 진실 → 수선 로그만 남기고 상태는 손대지 않는다.
 */
export function canApplyWorkStatus(idle: boolean, currentStatus: string): boolean {
  return idle && !TERMINAL.has(currentStatus);
}

/** 수선 레코드 핵심 요약(카드 제목·활동로그 title 파생). 작업구분별 대표 필드로 한 줄. */
export function workSummary(rec: EntityRecord): string {
  const cat = String(rec.category || '');
  const s = (v: unknown) => (v == null || v === '' ? '' : String(v));
  if (cat === '정비') return [s(rec.maint_type) || '정비', s(rec.vendor)].filter(Boolean).join(' · ');
  if (cat === '사고수리') {
    const frame = s(rec.damage_frame);
    const role = s(rec.acc_role);    // 가해/피해
    const fault = s(rec.fault_pct);  // 내 과실 %
    return [
      s(rec.damage_area) || '사고수리',
      role,
      fault !== '' ? `과실 ${fault}%` : '',
      frame && frame !== '없음' ? `골격 ${frame}` : '',
    ].filter(Boolean).join(' · ');
  }
  if (cat === '상품화') return ['외관 ' + (s(rec.exterior) || '—'), '실내 ' + (s(rec.interior) || '—'), '타이어 ' + (s(rec.tire_status) || '—')].join(' · ');
  if (cat === '세차') return s(rec.wash_type) || '세차';
  return cat || '수선';
}

/** 작업구분 뱃지 색 — 정비=amber·사고수리=red·상품화=blue·세차=teal. */
export function workCategoryTone(category: string): Tone {
  return category === '사고수리' ? 'red' : category === '상품화' ? 'blue' : category === '세차' ? 'teal' : 'amber';
}

/** 작업상태 뱃지 색 — 접수=gray·진행중=amber·완료=green. */
export function workStatusTone(workStatus: string): Tone {
  return workStatus === '완료' ? 'green' : workStatus === '진행중' ? 'amber' : 'gray';
}
