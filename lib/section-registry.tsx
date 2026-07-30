'use client';
/**
 * 섹션 레지스트리 — /repair 등 업무 페이지용 Sec 공유물.
 * 업무지시(instruction) 합성은 lib/work-orders.ts + InstructionStrip 로 이동.
 *
 *   · SectionCtx   = 공유 계산 묶음(useDashboardData의 D + 파생 자산)
 *   · SECTIONS     = { id, label, group, render(ctx, secProps) } 목록 (한 번만 정의)
 *   · SECTION_MAP  = id → 정의
 *   · buildSectionCtx / buildAssetDerived = 파생 데이터(자산 카드 원자 포함) 1회 계산
 *
 * 유지 섹션: s-repair · a-other (차량수선).
 * ※ 자금(f-unhandled·f-done) 은 FinanceLens 로컬 — 레지스트리 밖.
 */
import { type ReactNode } from 'react';
import { Sec, ObjCard, Cards, C, won, EmptyState, Ok } from '@/components/ui';
import { WorkPipe } from '@/components/WorkPipe';
import { openCar } from '@/lib/ui-bus';
import { type EntityRecord } from '@/lib/intake/entities';
import { normPlate } from '@/lib/plate';
import { dday } from '@/lib/dashboard-consts';

/* ── 공용 조각 ── */
export { EmptyState, Ok };
function vstone(s: string): 'green' | 'gray' | 'amber' | 'red' | 'blue' {
  if (s === '운행') return 'green';
  if (['정비', '사고'].includes(s)) return 'amber';
  return 'gray';
}

/* ── 타입 ── */
export type SecProps = { onReorder?: (fromId: string, toId: string) => void };
export type DeskGroup = '미결' | '리스크' | '자산' | '자금' | '고객';
export type AssetRow = { v: EntityRecord; av: any; status: string; miss?: string[] };
export type Field2 = [ReactNode, ReactNode];

export type AssetDerived = {
  others: AssetRow[];
  carTypeOf: (r: any) => string | undefined;
  repairFieldsOf: (r: any) => Field2[];
};

export type SectionCtx = {
  D: any;
  contracts: EntityRecord[];
  history: EntityRecord[];
  bankTx: EntityRecord[];
  scopeAll: boolean;
  asset: AssetDerived;
  dueMatch?: ((dday: number | null | undefined) => boolean) | null;
};

export type SectionDef = {
  id: string;
  label: string;
  group: DeskGroup;
  render: (ctx: SectionCtx, p: SecProps) => ReactNode;
};

/* ── 자산 파생 — a-other(그 밖의 상태)용 ── */
export function buildAssetDerived(D: any, _contracts: EntityRecord[], history: EntityRecord[]): AssetDerived {
  const rows: AssetRow[] = D.rows;
  const running: AssetRow[] = D.running;
  const idle: AssetRow[] = D.idleCars;
  const outCars: AssetRow[] = D.soldRows;
  const runPlates = new Set(running.map((r) => String(r.v.plate)));
  const idlePlates = new Set(idle.map((r) => String(r.v.plate)));
  const outPlates = new Set(outCars.map((r) => String(r.v.plate)));
  const others = rows.filter((r) => {
    const p = String(r.v.plate);
    return !runPlates.has(p) && !idlePlates.has(p) && !outPlates.has(p);
  });

  const moveLoc = new Map<string, string>();
  for (const h of [...history].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))) {
    if (String(h.category) !== '이동') continue;
    const p = String(h.plate || ''); if (p && !moveLoc.has(p)) moveLoc.set(p, String(h.title || ''));
  }

  const redeployEta = (r: any): string => {
    const insD = dday(r.v.inspectionTo);
    if (insD != null && insD < 0) return '검사 후';
    if (['정비', '사고'].includes(r.status)) {
      const rel = [...history]
        .filter((h) => normPlate(h.plate) === normPlate(r.v.plate) && ['정비', '사고', '이동'].includes(String(h.category)))
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      const nd = rel.find((h) => h.nextDate)?.nextDate;
      return nd ? String(nd) : '작업 후';
    }
    return '즉시';
  };

  const carTypeOf = (r: any): string | undefined => r.v.carName || r.v.vehicleType || undefined;
  const repairFieldsOf = (r: any): Field2[] => [
    ['작업', String(r.status || '—')],
    ['위치', moveLoc.get(String(r.v.plate)) || '차고지'],
    ['복귀', redeployEta(r)],
  ];

  return { others, carTypeOf, repairFieldsOf };
}

/* ── 공유 ctx 빌드 ── */
export function buildSectionCtx(args: {
  D: any;
  contracts: EntityRecord[];
  history: EntityRecord[];
  bankTx?: EntityRecord[];
  scopeAll: boolean;
  dueMatch?: ((dday: number | null | undefined) => boolean) | null;
  vehicles?: EntityRecord[];
  insurances?: EntityRecord[];
  penalties?: EntityRecord[];
  inbox?: EntityRecord[];
}): SectionCtx {
  const { D, contracts, history, bankTx = [], scopeAll, dueMatch = null } = args;
  return {
    D, contracts, history, bankTx, scopeAll, dueMatch,
    asset: buildAssetDerived(D, contracts, history),
  };
}

/* ══════════════ 섹션 정의 ══════════════ */
export const SECTIONS: SectionDef[] = [
  {
    id: 's-repair', label: '정비·사고 / 보험불일치', group: '자산',
    render: ({ D, dueMatch }, p) => (dueMatch ? null :
      <Sec key="s-repair" id="s-repair" title="정비·사고 / 보험불일치" n={D.repair.length + D.insMismatch.length} tone="warn" desc="위험 우선" right={<WorkPipe to="repair" />} {...p}>
        {(D.repair.length + D.insMismatch.length) === 0 ? <EmptyState variant="ok">이상 없음</EmptyState> :
          <Cards min={280}>{[...D.insMismatch.slice(0, 4).map((m: any, i: number) => <ObjCard key={'m' + i} onClick={() => openCar(m.rec.plate, 'unpaid')} rail="danger" badge="보험불일치" badgeTone="purple" plate={String(m.rec.plate)} carType={m.rec.contractorName ? String(m.rec.contractorName) : undefined} fields={[['차량', String(m.rec.plate)], ['계약자', m.rec.contractorName ? String(m.rec.contractorName) : '—'], ['내용', String(m.detail)]]} sub={m.detail} right={<span style={{ color: C.danger }}>위험</span>} />),
            ...D.repair.slice(0, 6).map((r: any, i: number) => <ObjCard key={'r' + i} onClick={() => openCar(r.v.plate, 'inspect')} rail="warn" badge={r.status} badgeTone="teal" plate={String(r.v.plate)} carType={r.v.carName || undefined} fields={[['차량', String(r.v.plate)], ['차명', r.v.carName ? String(r.v.carName) : '—'], ['상태', String(r.status)], ['임차인', r.av ? String(r.av.rec.contractorName || '—') : '—']]} sub="정비/사고" right={<span style={{ color: C.warn }}>처리중</span>} />)]}</Cards>}
      </Sec>
    ),
  },
  {
    id: 'a-other', label: '그 밖의 상태 (정비·사고)', group: '자산',
    render: ({ asset }, p) => { const { others, carTypeOf, repairFieldsOf } = asset; return others.length > 0 ? (
      <Sec key="a-other" id="a-other" title="그 밖의 상태" n={others.length} desc="정비·사고 등 · 언제 복귀" {...p}>
        <Cards min={360}>{others.slice(0, 40).map((r: any, i: number) => <ObjCard key={i} onClick={() => openCar(r.v.plate)} rail="warn" badge={r.status} badgeTone={vstone(r.status)} co={String(r.v.companyId || '')} plate={String(r.v.plate)} carType={carTypeOf(r)} fields={repairFieldsOf(r)} />)}</Cards>
      </Sec>
    ) : null; },
  },
];

export const SECTION_MAP: Record<string, SectionDef> = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
