/**
 * 운영시트 인라인 경고 — 기존 SSOT(compliance·collectionStage) «재호출·합성»만. 새 판정식 신설 금지.
 *   행 1개가 안고 있는 문제를 위험(high)/경고(med) 2톤으로. 시트 ⚠ 열·'경고있음' 필터가 이걸 씀.
 *
 *   보험은 renman이 별도 엔티티를 plate로 조인(FleetRow.insEnd)한다 → checkCompliance 의 veh 기반 보험판정은
 *   버리고(오경보 방지) 조인 insEnd 로 직접 계산. 면허·연령만 checkCompliance 에서 취함. 검사는 여기서 일원 계산.
 */
import type { EntityRecord } from './intake/entities';
import { checkCompliance } from './compliance';
import { collectionStage } from './domain/status';

export type WarnSev = 'high' | 'med';
export interface SheetWarning { code: string; label: string; sev: WarnSev; }

/** target(YYYY-MM-DD)까지 남은 일수(음수=경과). 파싱 불가 시 null. today 주입(순수·테스트 가능). */
function daysUntil(target: string, today: string): number | null {
  const t = String(target || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  return Math.round((new Date(t).getTime() - new Date(today).getTime()) / 86400000);
}

export interface RowWarnCtx {
  held: boolean;                     // 보유(온북) 차량만 경고. 매각·차량없음(고아)은 제외.
  active: boolean;                   // 활성(운행) 계약 있음 — 계약기반 경고 게이트.
  contractRec: EntityRecord | null;  // 활성 계약 rec(면허·연령 판정용).
  veh: EntityRecord | null;
  util: string;
  customer: string;
  dday: number | null;               // 활성 계약 만기 D-day.
  rent: number;
  overdueDays: number;               // 이 차의 최장 연체일(반납·잔존채권 포함).
  insEnd: string;                    // 조인된 보험 만기(정본).
  inspectionTo: string;              // 검사 만기(veh).
  today: string;
}

/** 행 1개 → 경고 배열. 순수. */
export function rowWarnings(ctx: RowWarnCtx): SheetWarning[] {
  const out: SheetWarning[] = [];
  if (!ctx.held) return out;

  // 1) 보험 — 조인 insEnd 정본. 만료=무보험(위험) · D-7 임박(위험) · D-30 임박(경고) · 미확인은 운행중만(노이즈 억제).
  const insD = daysUntil(ctx.insEnd, ctx.today);
  if (!ctx.insEnd) {
    if (ctx.active) out.push({ code: 'ins_missing', label: '보험 미확인', sev: 'med' });
  } else if (insD != null) {
    if (insD < 0) out.push({ code: 'ins_expired', label: '무보험', sev: 'high' });
    else if (insD <= 7) out.push({ code: 'ins_soon', label: '보험 임박', sev: 'high' });
    else if (insD <= 30) out.push({ code: 'ins_soon', label: '보험 임박', sev: 'med' });
  }

  // 2) 검사 — veh.inspectionTo. 만료(위험)·D-7(위험)·D-30(경고).
  const inspD = daysUntil(ctx.inspectionTo, ctx.today);
  if (ctx.inspectionTo && inspD != null) {
    if (inspD < 0) out.push({ code: 'inspection_expired', label: '검사 만료', sev: 'high' });
    else if (inspD <= 7) out.push({ code: 'inspection_soon', label: '검사 임박', sev: 'high' });
    else if (inspD <= 30) out.push({ code: 'inspection_soon', label: '검사 임박', sev: 'med' });
  }

  // 3) 미수 회수단계 — overdueDays 있으면 단계 경고. 경고=med, 시동제어·내용증명·채권화=high.
  if (ctx.overdueDays > 0) {
    const cs = collectionStage(ctx.overdueDays);
    if (cs.stage !== '정상') out.push({ code: 'collection', label: `미수·${cs.stage}`, sev: cs.stage === '경고' ? 'med' : 'high' });
  }

  // 4) 계약 기반(운행 계약 있을 때만) — 반납지남·대여료0·면허·연령.
  if (ctx.active && ctx.contractRec) {
    if (ctx.dday != null && ctx.dday < 0) out.push({ code: 'return_overdue', label: '반납 지남', sev: 'high' });
    if (!ctx.rent) out.push({ code: 'rent_zero', label: '대여료 0', sev: 'med' });
    for (const f of checkCompliance(ctx.contractRec, ctx.veh, ctx.today)) {
      if (f.code === 'no_license' || f.code === 'ins_age' || f.code === 'age_under21') {
        out.push({ code: f.code, label: f.label, sev: f.severity });
      }
    }
  }

  // 5) 정합성 — 운행 표기인데 계약자 없음(무계약 운행).
  if (ctx.util === '운행' && !ctx.customer && !ctx.active) {
    out.push({ code: 'no_contract', label: '무계약 운행', sev: 'med' });
  }

  return out;
}

/** 경고 배열 최고심각도. 없으면 null. */
export function rowSeverity(ws: SheetWarning[]): WarnSev | null {
  if (ws.some((w) => w.sev === 'high')) return 'high';
  if (ws.length) return 'med';
  return null;
}
