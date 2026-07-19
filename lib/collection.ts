// 미수 회수 SLA 단계 — 렌터카 채권관리 프로토콜. 순수 원자 primitive(다른 렌탈 ERP에도 재사용).
// 연체 경과일(overdueDays) → 지금 해야 할 조치 단계. SLA 임계값은 설정으로 조정 가능(회사별).
export type CollectionStage = '정상' | '경고' | '시동제어' | '내용증명' | '채권화';

export interface CollectionInfo {
  stage: CollectionStage;
  tone: 'gray' | 'amber' | 'orange' | 'red' | 'purple';
  nextAction: string; // 지금 해야 할 다음 조치(비면 없음)
  overdueDays: number;
}

export interface CollectionSLA { warn?: number; engineLock?: number; notice?: number; debt?: number }

// 기본 SLA: 경고 D+1, 시동제어 D+3, 내용증명 D+10, 채권화 D+30 (렌터카 실무 표준)
export function collectionStage(overdueDays: number, sla?: CollectionSLA): CollectionInfo {
  const warn = sla?.warn ?? 1, lock = sla?.engineLock ?? 3, notice = sla?.notice ?? 10, debt = sla?.debt ?? 30;
  const d = Math.max(0, Math.round(overdueDays));
  if (d < warn) return { stage: '정상', tone: 'gray', nextAction: '', overdueDays: d };
  if (d < lock) return { stage: '경고', tone: 'amber', nextAction: '독촉 연락', overdueDays: d };
  if (d < notice) return { stage: '시동제어', tone: 'orange', nextAction: '시동 제어', overdueDays: d };
  if (d < debt) return { stage: '내용증명', tone: 'red', nextAction: '내용증명 발송', overdueDays: d };
  return { stage: '채권화', tone: 'purple', nextAction: '법적조치·채권화', overdueDays: d };
}
