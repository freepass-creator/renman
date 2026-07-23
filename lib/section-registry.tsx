'use client';
/**
 * 섹션 레지스트리 — "같은 섹션 = 하나의 공유물". 홈 렌즈(app/page.tsx)와 담당자 워크벤치(app/ops)가
 * 이 파일의 render 함수를 그대로 호출한다. 섹션 JSX를 페이지에 복붙하지 않는다.
 *
 *   · SectionCtx   = 공유 계산 묶음(useDashboardData의 D + 파생 자산/고객)
 *   · SECTIONS     = { id, label, group, render(ctx, secProps) } 목록 (한 번만 정의)
 *   · SECTION_MAP  = id → 정의 (홈 렌즈가 순서대로 조회)
 *   · buildSectionCtx / buildAssetDerived = 파생 데이터(자산 카드 원자 포함) 1회 계산
 *
 * PART1(상태적응 카드): 자산 카드의 원자(fields)는 상태가 던지는 질문에 답하도록 상태별로 달라진다.
 *   운행중=계약상태 / 휴차=언제 다시 굴리나 / 매각=생애 성과 / 정비·사고=언제 복귀.
 *
 * ※ 자금(f-unhandled·f-done) 두 섹션은 자금일보 툴바의 로컬 상태(기간·계좌·입출금·계정과목)에 강결합
 *    → 레지스트리로 옮기지 않고 FinanceLens에 남긴다. 담당자 워크벤치는 대신 s-money(자금 미분류,
 *    전역 계산)로 자금 도메인을 커버한다.
 */
import { type ReactNode } from 'react';
import { Sec, ObjCard, Cards, C, won, EmptyState, Ok, Badge } from '@/components/ui';
import { WorkPipe } from '@/components/WorkPipe';
import { type PipeId } from '@/lib/work-hub';
import { openCar, openCustomer, openPayments, openFinance } from '@/lib/ui-bus';
import { collectionStage } from '@/lib/collection';
import { penaltyStatus, penaltyTone } from '@/lib/penalty-reassign';
import { complianceTone } from '@/lib/compliance';
import { aggregateCustomers, type CustomerAgg } from '@/lib/customers';
import { type EntityRecord } from '@/lib/intake/entities';
import { normPlate } from '@/lib/plate';
import { depositView } from '@/lib/deposit';
import { TODAY, dday, IDLE, OUT } from '@/lib/dashboard-consts';
import { buildAgenda, type AgendaItem } from '@/lib/agenda';
import { buildDayFeed, type DayFeedItem } from '@/lib/day-feed';
import dynamic from 'next/dynamic';

// migrate JSON(contract-doc-audit) — 동적 청크. 홈/ops 메인에 정적 import 금지.
const DocAuditSec = dynamic(() => import('@/components/DocAuditSec').then((m) => m.DocAuditSec), { ssr: false });

/* ── 공용 조각 ── */
// 빈 상태 = EmptyState(ui SSOT). ok=큐 비움 정상 · sec=목록 없음 · page=페이지 CTA.
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
  nameByPlate: Map<string, string>;
  events: { date: string; plate: string; kind: string; label: string; tone: 'red' | 'amber' | 'green' | 'gray' }[];
  ghost: string[];
  unreg: AssetRow[];
  manage: AssetRow[];
  running: AssetRow[];
  idle: AssetRow[];
  others: AssetRow[];
  outCars: AssetRow[];
  carTypeOf: (r: any) => string | undefined;
  fieldsOf: (r: any) => Field2[];
  runningRight: (r: any) => ReactNode;
  runningRail: (r: any) => 'danger' | 'none';
  idleFieldsOf: (r: any) => Field2[];
  idleRight: (r: any) => ReactNode;
  soldFieldsOf: (r: any) => Field2[];
  soldRight: (r: any) => ReactNode;
  repairFieldsOf: (r: any) => Field2[];
  termOf: (r: any) => { label: string; tone: 'green' | 'teal' };
};

export type CustomerDerived = {
  custs: CustomerAgg[];
  active: CustomerAgg[];
  unpaid: CustomerAgg[];
  past: CustomerAgg[];
};

export type SectionCtx = {
  D: any;
  contracts: EntityRecord[];
  history: EntityRecord[];
  bankTx: EntityRecord[];
  scopeAll: boolean;
  asset: AssetDerived;
  customers: CustomerDerived;
  agenda: AgendaItem[];   // 기한 있는 일 시간표(일정 렌즈). 반납·검사·보험·과태료.
  /** 기간 축 — 그 날 일어난 일(출고·반납·입금·수납·과태료·활동). agenda=예정, dayFeed=실적. */
  dayFeedFor: (asOf: string) => DayFeedItem[];
  dueMatch?: ((dday: number | null | undefined) => boolean) | null; // 처리 기한 필터(활성 시). null=기한 무관.
};

export type SectionDef = {
  id: string;
  label: string;
  group: DeskGroup;
  render: (ctx: SectionCtx, p: SecProps) => ReactNode;
};

/* ── 보유기간 "N년 M개월" ── */
function humanPeriod(fromIso: string, toIso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(fromIso)) return '—';
  const f = new Date(fromIso.slice(0, 10));
  const t = /^\d{4}-\d{2}-\d{2}/.test(toIso) ? new Date(toIso.slice(0, 10)) : new Date(TODAY);
  let months = (t.getFullYear() - f.getFullYear()) * 12 + (t.getMonth() - f.getMonth());
  if (t.getDate() < f.getDate()) months--;
  if (months < 0) months = 0;
  const y = Math.floor(months / 12), m = months % 12;
  return y > 0 ? `${y}년 ${m}개월` : `${m}개월`;
}

/* ── 자산 파생(카드 원자 포함) — 홈 AssetLens·담당자 워크벤치 공유 ── */
export function buildAssetDerived(D: any, contracts: EntityRecord[], history: EntityRecord[]): AssetDerived {
  const rows: AssetRow[] = D.rows;
  const nameByPlate = new Map<string, string>(rows.map((r) => [String(r.v.plate), String(r.v.carName || '')]));
  const events = [
    ...contracts.filter((c) => c.deliveredDate || c.startDate).map((c) => ({ date: String(c.deliveredDate || c.startDate), plate: String(c.plate || ''), kind: '출고', label: String(c.contractorName || ''), tone: 'green' as const })),
    ...contracts.filter((c) => c.returnedDate).map((c) => ({ date: String(c.returnedDate), plate: String(c.plate || ''), kind: '반납', label: String(c.contractorName || ''), tone: 'gray' as const })),
    ...history.map((h) => ({ date: String(h.date || ''), plate: String(h.plate || ''), kind: String(h.category || '이력'), label: String(h.title || ''), tone: (h.category === '사고' ? 'red' : 'amber') as 'red' | 'amber' })),
  ].filter((e) => /^\d{4}-\d{2}-\d{2}/.test(e.date)).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 40);

  const vehPlates = new Set(rows.map((r) => String(r.v.plate)));
  const ghost = Array.from(new Set(contracts.map((c) => String(c.plate || '')).filter((p) => p && !vehPlates.has(p))));
  const missingOf = (v: any): string[] => { const m: string[] = []; if (!v.vin) m.push('차대번호'); if (!v.carName) m.push('차명'); return m; };
  const unreg = rows.map((r) => ({ ...r, miss: missingOf(r.v) })).filter((r) => (r.miss?.length || 0) > 0 || ['구매대기', '등록대기'].includes(r.status));
  const manage = rows.filter((r) => { const ins = dday(r.v.inspectionTo); return ['정비', '사고'].includes(r.status) || IDLE.has(r.status) || (ins != null && ins <= 30); });
  /* 운행·유휴·매각은 «지표와 같은 값»을 써야 한다(D.running / D.idleCars / D.soldRows).
     예전엔 여기서 v.status 로 다시 갈랐는데, 지표는 계약 기준(runningPlates)이라
     계약은 살아있는데 status가 '운행'이 아닌 차에서 요약(102대)과 목록 수가 어긋났다.
     집계는 lib/operating-snapshot 한 곳 — 여기서 다시 세지 않는다. */
  const running: AssetRow[] = D.running;
  const idle: AssetRow[] = D.idleCars;
  const outCars: AssetRow[] = D.soldRows;
  const runPlates = new Set(running.map((r) => String(r.v.plate)));
  const idlePlates = new Set(idle.map((r) => String(r.v.plate)));
  const outPlates = new Set(outCars.map((r) => String(r.v.plate)));
  // 그 밖 = 위 셋 어디에도 안 든 차(정비·사고 등). 분류가 겹치거나 새지 않게 «차집합»으로 잡는다.
  const others = rows.filter((r) => {
    const p = String(r.v.plate);
    return !runPlates.has(p) && !idlePlates.has(p) && !outPlates.has(p);
  });

  // 차량별: 최근 계약(예정 대여료 도출) · 거쳐간 손님 수(생애 성과)
  const lastContractByPlate = new Map<string, EntityRecord>();
  const contractCountByPlate = new Map<string, number>();
  for (const c of contracts) {
    const p = String(c.plate || ''); if (!p) continue;
    contractCountByPlate.set(p, (contractCountByPlate.get(p) || 0) + 1);
    const d = String(c.startDate || c.contractDate || '');
    const cur = lastContractByPlate.get(p);
    const curd = cur ? String(cur.startDate || cur.contractDate || '') : '';
    if (!cur || d >= curd) lastContractByPlate.set(p, c);
  }
  // 최근 '이동' 활동로그 → 위치(차고지 fallback)
  const moveLoc = new Map<string, string>();
  for (const h of [...history].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))) {
    if (String(h.category) !== '이동') continue;
    const p = String(h.plate || ''); if (p && !moveLoc.has(p)) moveLoc.set(p, String(h.title || ''));
  }

  // 출고/복귀 예정 도출(읽기전용). 검사만기 지남→'검사 후'; 정비·사고→history nextDate(있으면) 아니면 '작업 후'; 그 외(상품화 완료)→'즉시'.
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

  // 차종 = 부가 식별(차명 우선, 없으면 차종 대분류). 차번 앵커 옆 1행 보조.
  const carTypeOf = (r: any): string | undefined => r.v.carName || r.v.vehicleType || undefined;

  // 운행중 → "이 계약 상태?": 임차인·반납·검사 (미수는 우측 수치로 분리)
  const fieldsOf = (r: any): Field2[] => [
    ['임차인', r.av ? String(r.av.rec.contractorName || '—') : '—'],
    ['반납', r.av?.endDate ? `${r.av.endDate}${r.av.dday != null ? (r.av.dday < 0 ? `(${-r.av.dday}일 지남)` : `(D-${r.av.dday})`) : ''}` : '—'],
    ['검사', r.v.inspectionTo ? String(r.v.inspectionTo) : '—'],
  ];
  // 운행중 우측 수치 = 미수(있으면 빨강) 없으면 반납 D-day
  const runningRight = (r: any): ReactNode => {
    const net = r.av?.net || 0;
    if (net > 0) return <span style={{ color: C.danger }}>미수 {won(net)}</span>;
    const d = r.av?.dday;
    return d != null ? <span style={{ color: d < 0 ? C.danger : C.warn }}>{d < 0 ? `${-d}일 지남` : `D-${d}`}</span> : undefined;
  };
  const runningRail = (r: any): 'danger' | 'none' => ((r.av?.net || 0) > 0 ? 'danger' : 'none');

  // 휴차/대기 → "언제 다시 굴리나?": 위치·상태·출고예정·검사 (예정대여료는 우측 수치로)
  const idleFieldsOf = (r: any): Field2[] => [
    ['위치', moveLoc.get(String(r.v.plate)) || '차고지'],
    ['상태', String(r.status || '대기')],
    ['출고', redeployEta(r)],
    ['검사', r.v.inspectionTo ? String(r.v.inspectionTo) : '—'],
  ];
  const idleRight = (r: any): ReactNode => {
    const lc = lastContractByPlate.get(String(r.v.plate));
    const monthly = lc ? Number(lc.monthlyRent) || 0 : 0;
    return monthly > 0 ? <span style={{ color: C.mute }}>{won(monthly)}</span> : undefined;
  };

  // 매각·말소 → "이 차 생애 성과?": 매입·손님·보유 (매각가는 우측 수치로)
  const soldFieldsOf = (r: any): Field2[] => [
    ['매입', r.v.acquisitionPrice ? won(r.v.acquisitionPrice) : '—'],
    ['손님', `${contractCountByPlate.get(String(r.v.plate)) || 0}명`],
    ['보유', humanPeriod(String(r.v.firstReg || ''), String(r.v.saleDate || ''))],
  ];
  const soldRight = (r: any): ReactNode => (r.v.salePrice ? <span>{won(r.v.salePrice)}</span> : undefined);

  // 정비·사고 → "언제 복귀?": 작업상태·위치·복귀예정
  const repairFieldsOf = (r: any): Field2[] => [
    ['작업', String(r.status || '—')],
    ['위치', moveLoc.get(String(r.v.plate)) || '차고지'],
    ['복귀', redeployEta(r)],
  ];
  const termOf = (r: any): { label: string; tone: 'green' | 'teal' } => (Number(r.av?.rec?.rentalMonths) || 0) >= 12 ? { label: '장기', tone: 'green' } : { label: '단기', tone: 'teal' };

  return { nameByPlate, events, ghost, unreg, manage, running, idle, others, outCars, carTypeOf, fieldsOf, runningRight, runningRail, idleFieldsOf, idleRight, soldFieldsOf, soldRight, repairFieldsOf, termOf };
}

/* ── 고객 파생 ── */
export function buildCustomerDerived(contracts: EntityRecord[]): CustomerDerived {
  const custs = aggregateCustomers(contracts, TODAY);
  const active = custs.filter((c) => c.activeCount > 0).sort((a, b) => b.totalUnpaid - a.totalUnpaid);
  const unpaid = custs.filter((c) => c.totalUnpaid > 0).sort((a, b) => b.totalUnpaid - a.totalUnpaid);
  const past = custs.filter((c) => c.activeCount === 0);
  return { custs, active, unpaid, past };
}
function custCard(c: CustomerAgg, scopeAll: boolean) {
  return <ObjCard key={c.key} onClick={() => openCustomer(c.key)} rail={c.totalUnpaid > 0 ? 'danger' : 'none'} co={scopeAll ? String(c.companyId || '') : ''} badge={`계약 ${c.contracts.length}`} badgeTone="blue" name={String(c.name)} carType={c.phone ? String(c.phone) : undefined} fields={[['연락처', c.phone ? String(c.phone) : '—'], ['운행계약', `${c.activeCount}건`], ['차량', `${c.vehicles.length}대`], ['총계약', `${c.contracts.length}건`], ['미수', c.totalUnpaid > 0 ? won(c.totalUnpaid) : '—'], ['최근종료', c.lastEnd ? String(c.lastEnd) : '—']]} sub={`운행 ${c.activeCount} · 차량 ${c.vehicles.length}대${c.lastEnd ? ' · 최근 ' + c.lastEnd : ''}`} right={c.totalUnpaid > 0 ? <span style={{ color: C.danger, fontWeight: 700 }}>{won(c.totalUnpaid)}</span> : undefined} />;
}

/* ── 공유 ctx 빌드 ── */
export function buildSectionCtx(args: { D: any; contracts: EntityRecord[]; history: EntityRecord[]; bankTx?: EntityRecord[]; scopeAll: boolean; dueMatch?: ((dday: number | null | undefined) => boolean) | null; vehicles?: EntityRecord[]; insurances?: EntityRecord[]; penalties?: EntityRecord[]; inbox?: EntityRecord[] }): SectionCtx {
  const { D, contracts, history, bankTx = [], scopeAll, dueMatch = null, vehicles = [], insurances = [], penalties = [], inbox = [] } = args;
  return {
    D, contracts, history, bankTx, scopeAll, dueMatch,
    asset: buildAssetDerived(D, contracts, history),
    customers: buildCustomerDerived(contracts),
    agenda: buildAgenda(contracts, vehicles, insurances, penalties),
    dayFeedFor: (asOf: string) => buildDayFeed(asOf, { contracts, bankTx, history, penalties, inbox }),
  };
}

/* ══════════════ 섹션 정의(한 번만) ══════════════ */
export const SECTIONS: SectionDef[] = [
  /* ── 미결(콕핏) ── */
  {
    // 업무지시 — 미결 데이터를 "무엇을 어디서 하라" 지시문으로 합성. 홈 미결 맨 위 헤드라인.
    id: 's-work-orders', label: '업무지시 (지금 할 일)', group: '미결',
    render: ({ D, asset }, p) => {
      const over = D.returnFlow.filter((v: any) => v.dday < 0);
      const missDocs = ((asset as any)?.unreg || []).filter((r: any) => r.miss?.length);
      const orders: { n: number; text: string; to: PipeId; danger?: boolean }[] = [];
      if (over.length) orders.push({ n: over.length, text: '반납일이 지난 차 — 눌러서 차량360에서 «반납» 또는 «연장»을 처리하세요', to: 'dispatch', danger: true });
      if (D.overduePay.length) orders.push({ n: D.overduePay.length, text: '미납(미수) — 미수관리에서 회수 조치(시동제어·내용증명 등)하세요', to: 'receivables', danger: true });
      if (D.ghostPlates.length) orders.push({ n: D.ghostPlates.length, text: '등록증 없는 차 — 데이터센터에서 «자동차등록증»을 업로드하세요', to: 'ingest', danger: true });
      if (missDocs.length) orders.push({ n: missDocs.length, text: '서류 빠진 차 — 데이터센터에서 보험가입증명서·등록증 등 빠진 서류를 업로드하세요', to: 'ingest' });
      if (D.penaltyPending.length) orders.push({ n: D.penaltyPending.length, text: '과태료 — 과태료관리에서 임차인 매칭 후 «변경부과»를 신청하세요', to: 'penalty' });
      if (D.expiring.length) orders.push({ n: D.expiring.length, text: '보험·검사 만기 — 갱신/검사 후 보험증권·등록증을 데이터센터에서 업로드하세요', to: 'ingest' });
      if (D.unmatchedTx.length) orders.push({ n: D.unmatchedTx.length, text: '미분류 입출금 — 자금일보에서 거래를 계약에 «매칭»하세요', to: 'payments' });
      return (
        <Sec key="s-work-orders" id="s-work-orders" title="업무지시 (지금 할 일)" n={orders.length} tone={orders.some((o) => o.danger) ? 'danger' : orders.length ? 'warn' : undefined} desc="무엇을 어디서 처리할지 — 눌러서 이동" {...p}>
          {orders.length === 0 ? <EmptyState variant="ok">지금 처리할 업무 없음 — 깔끔합니다</EmptyState> :
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {orders.map((o, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: `1px solid ${C.line}`, borderLeft: `3px solid ${o.danger ? C.danger : C.warn}`, borderRadius: 8, background: 'var(--bg-card)' }}>
                  <Badge tone={o.danger ? 'red' : 'amber'}>{o.n}건</Badge>
                  <span style={{ flex: 1, fontSize: 13, color: C.ink, lineHeight: 1.5 }}>{o.text}</span>
                  <WorkPipe to={o.to} />
                </div>
              ))}
            </div>}
        </Sec>
      );
    },
  },
  {
    id: 's-return-over', label: '반납 지남 (회수·연장)', group: '미결',
    render: ({ D, dueMatch }, p) => { const over = D.returnFlow.filter((v: any) => v.dday < 0 && (!dueMatch || dueMatch(v.dday))); return over.length ? (
      <Sec key="s-return-over" id="s-return-over" title="반납 지남 (회수·연장)" n={over.length} tone="danger" desc="반납일 지남 · 회수(반납)하거나 연장 결정 — 클릭 → 360에서 처리" right={<WorkPipe to="dispatch" />} {...p}>
        <Cards min={280}>{over.slice(0, 12).map((v: any, i: number) => <ObjCard key={i} onClick={() => openCar(v.rec.plate, 'return')} rail="danger" co={String(v.rec.companyId || '')} badge="지남" badgeTone="red" plate={String(v.rec.plate)} carType={String(v.rec.contractorName || '')} fields={[['계약자', String(v.rec.contractorName || '—')], ['연락처', String(v.rec.contractorPhone || '—')], ['반납예정', String(v.endDate || '—')], ['경과', `${-v.dday}일 지남`], ['월대여료', v.rec.monthlyRent ? won(v.rec.monthlyRent) : '—']]} sub={`${v.endDate} 반납예정`} right={<span style={{ color: C.danger, fontWeight: 700 }}>{-v.dday}일 지남</span>} />)}</Cards>
      </Sec>
    ) : null; },
  },
  {
    id: 's-overlap', label: '중복 대여 (배차 충돌)', group: '미결',
    render: ({ D, dueMatch }, p) => (!dueMatch && D.doubleBooking.length ? (
      <Sec key="s-overlap" id="s-overlap" title="중복 대여 (배차 충돌)" n={D.doubleBooking.length} tone="danger" desc="같은 차 · 기간 겹치는 미반납 계약 — 즉시 확인" {...p}>
        <Cards min={360}>{D.doubleBooking.slice(0, 8).map((d: any, i: number) => <ObjCard key={i} onClick={() => openCar(d.plate)} rail="danger" badge="중복대여" badgeTone="purple" plate={String(d.plate)} fields={[['차량', String(d.plate)], ['겹침', String(d.detail)]]} sub={d.detail} right={<span style={{ color: C.danger }}>충돌</span>} />)}</Cards>
      </Sec>
    ) : null),
  },
  {
    id: 's-penalty', label: '과태료 변경부과', group: '미결',
    render: ({ D, dueMatch }, p) => { const rows = D.penaltyPending.filter((p2: any) => !dueMatch || dueMatch(dday(p2.rec.dueDate))); return (
      <Sec key="s-penalty" id="s-penalty" title="과태료 변경부과" n={rows.length} tone="warn" desc="위반일시→임차인 매칭 · 변경부과 대상" right={<WorkPipe to="penalty" />} {...p}>
        {rows.length === 0 ? <EmptyState variant="ok">미처리 과태료 없음</EmptyState> :
          <Cards min={280}>{rows.slice(0, 12).map((p2: any, i: number) => <ObjCard key={i} onClick={() => openCar(p2.rec.plate, 'inspect')} rail="warn" co={String(p2.rec.companyId || '')} badge={penaltyStatus(p2.rec)} badgeTone={penaltyTone(penaltyStatus(p2.rec))} plate={String(p2.rec.plate)} carType={p2.driver ? String(p2.driver.contractorName || '임차인') : '임차인 미매칭'} fields={[['임차인', p2.driver ? String(p2.driver.contractorName || '—') : '미매칭'], ['위반일', String(p2.rec.violationDate || '—')], ['내용', String(p2.rec.description || '—')], ['금액', p2.rec.amount ? won(p2.rec.amount) : '—'], ['상태', penaltyStatus(p2.rec)]]} sub={`${String(p2.rec.violationDate || '')} · ${String(p2.rec.description || '')}`} right={p2.rec.amount ? <span style={{ color: C.warn }}>{won(p2.rec.amount)}</span> : undefined} />)}</Cards>}
      </Sec>
    ); },
  },
  {
    id: 's-todo', label: '처리 대기 (할 일)', group: '미결',
    render: ({ D, dueMatch }, p) => (!dueMatch && D.todo.length ? (
      <Sec key="s-todo" id="s-todo" title="처리 대기 (할 일)" n={D.todo.length} tone="warn" desc="인도·구매·등록 등 완료 안 된 것 — 처리 필요" right={<WorkPipe to="dispatch" />} {...p}>
        <Cards min={320}>{D.todo.slice(0, 12).map((t: any, i: number) => <ObjCard key={i} onClick={() => openCar(t.plate)} rail="warn" badge={t.action} badgeTone="orange" plate={String(t.plate)} carType={t.name ? String(t.name) : undefined} fields={[['차량', String(t.plate)], ['대상', t.name ? String(t.name) : '—'], ['상태', String(t.action)], ['내용', String(t.detail)], ['조치', String(t.cta)]]} sub={t.detail} right={<span style={{ color: C.warn, fontWeight: 700 }}>{t.cta}</span>} />)}</Cards>
      </Sec>
    ) : null),
  },
  {
    id: 's-return', label: '반납 임박', group: '미결',
    render: ({ D, dueMatch }, p) => { const soon = D.returnFlow.filter((v: any) => v.dday >= 0 && (!dueMatch || dueMatch(v.dday))); return soon.length ? (
      <Sec key="s-return" id="s-return" title="반납 임박" n={soon.length} tone="warn" desc="곧 반납 예정 · 임박순" right={<WorkPipe to="dispatch" />} {...p}>
        <Cards min={280}>{soon.slice(0, 12).map((v: any, i: number) => <ObjCard key={i} onClick={() => openCar(v.rec.plate, 'return')} rail="warn" co={String(v.rec.companyId || '')} badge="반납" badgeTone="orange" plate={String(v.rec.plate)} carType={String(v.rec.contractorName || '')} fields={[['계약자', String(v.rec.contractorName || '—')], ['연락처', String(v.rec.contractorPhone || '—')], ['반납예정', String(v.endDate || '—')], ['잔여', v.dday === 0 ? '오늘' : `D-${v.dday}`], ['월대여료', v.rec.monthlyRent ? won(v.rec.monthlyRent) : '—']]} sub={`${v.endDate} 반납예정`} right={<span style={{ color: C.warn }}>{v.dday === 0 ? '오늘' : `D-${v.dday}`}</span>} />)}</Cards>
      </Sec>
    ) : null; },
  },
  {
    id: 's-expire', label: '만기 (계약·보험·검사)', group: '미결',
    render: ({ D, dueMatch }, p) => { const rows = D.expiring.filter((e: any) => !dueMatch || dueMatch(e.dday)); return (
      <Sec key="s-expire" id="s-expire" title="만기 (계약·보험·검사)" n={rows.length} tone="warn" desc="임박·경과 순" {...p}>
        {rows.length === 0 ? <EmptyState variant="ok">없음</EmptyState> :
          <Cards min={280}>{rows.slice(0, 12).map((e: any, i: number) => <ObjCard key={i} onClick={() => openCar(e.plate, 'inspect')} rail="warn" badge="만기" badgeTone="amber" plate={String(e.plate)} carType={String(e.main).split(' · ')[1] || undefined} fields={[['차량', String(e.plate)], ['대상', String(e.main).split(' · ')[1] || '—'], ['만기', String(e.sub)], ['기한', e.dday < 0 ? `${-e.dday}일 경과` : `D-${e.dday}`]]} sub={e.sub} />)}</Cards>}
      </Sec>
    ); },
  },
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
    id: 's-docwait', label: '서류 미첨부 (등록증 없음)', group: '미결',
    render: ({ D, dueMatch }, p) => (!dueMatch && D.ghostPlates.length ? (
      <Sec key="s-docwait" id="s-docwait" title="서류 미첨부 (등록증 없음)" n={D.ghostPlates.length} tone="warn" desc="계약만 있고 차량 등록증·서류 안 올림" right={<WorkPipe to="ingest" />} {...p}>
        <Cards min={280}>{D.ghostPlates.slice(0, 12).map((pl: string, i: number) => <ObjCard key={i} onClick={() => openCar(pl)} rail="warn" badge="미등록" badgeTone="red" plate={String(pl)} fields={[['상태', '미등록'], ['서류', '등록증 미수집'], ['비고', '계약만 존재 · 등록 필요']]} sub="등록증 미수집 · 계약만 존재" right={<span style={{ color: C.warn }}>등록 필요</span>} />)}</Cards>
      </Sec>
    ) : null),
  },

  /* ── 자금 ── */
  {
    id: 's-money', label: '자금 미분류 (매칭 안 됨)', group: '자금',
    render: ({ D, dueMatch }, p) => (!dueMatch && D.unmatchedTx.length ? (
      <Sec key="s-money" id="s-money" title="자금 미분류 (매칭 안 됨)" n={D.unmatchedTx.length} tone="warn" desc="입출금 분류 안 됨 · 자금일보에서 계약에 붙이기" right={<WorkPipe to="payments" />} {...p}>
        <Cards min={300}>{D.unmatchedTx.slice(0, 12).map((t: any, i: number) => { const isIn = Number(t.amount) > 0; return <ObjCard key={i} onClick={() => (isIn ? openPayments() : openFinance({ unclassified: true }))} rail={isIn ? 'ok' : 'mute'} co={String(t.companyId || '')} badge={isIn ? '입금' : '출금'} badgeTone={isIn ? 'green' : 'gray'} name={String(t.counterparty || '(내용 없음)')} fields={[['구분', isIn ? '입금' : '출금'], ['상대', String(t.counterparty || '—')], ['계좌', String(t.account || '—')], ['일자', String(t.txDate || '—')], ['금액', won(isIn ? t.amount : t.withdraw)]]} sub={`${String(t.account || '계좌')} · ${String(t.txDate || '')}`} right={<span style={{ color: isIn ? 'var(--green-text)' : C.danger }}>{won(isIn ? t.amount : t.withdraw)}</span>} />; })}</Cards>
      </Sec>
    ) : null),
  },
  {
    id: 's-cashflow', label: '최근 자금 흐름', group: '자금',
    render: ({ bankTx }, p) => {
      const recent = bankTx.slice().sort((a, b) => String(b.txDate || '').localeCompare(String(a.txDate || ''))).slice(0, 12);
      return recent.length ? (
        <Sec key="s-cashflow" id="s-cashflow" title="최근 자금 흐름" n={recent.length} desc="계좌·CMS·카드 입출금 최근순" right={<WorkPipe to="finance" />} {...p}>
          <Cards min={300}>{recent.map((t: any, i: number) => { const isIn = Number(t.amount) > 0; const cat = t.category && String(t.category) !== '(미분류)' ? String(t.category) : ''; return <ObjCard key={i} rail={isIn ? 'ok' : 'mute'} co={String(t.companyId || '')} badge={cat || (isIn ? '입금' : '출금')} badgeTone={cat ? 'blue' : (isIn ? 'green' : 'gray')} name={String(t.counterparty || '(내용 없음)')} fields={[['구분', cat || (isIn ? '입금' : '출금')], ['상대', String(t.counterparty || '—')], ['계좌', String(t.account || '—')], ['일자', String(t.txDate || '—')], ['금액', won(isIn ? t.amount : t.withdraw)]]} sub={`${String(t.account || '계좌')} · ${String(t.txDate || '')}`} right={<span style={{ color: isIn ? 'var(--green-text)' : C.danger }}>{won(isIn ? t.amount : t.withdraw)}</span>} />; })}</Cards>
        </Sec>
      ) : null;
    },
  },

  /* ── 리스크 ── */
  {
    // 미수 SSOT — 옛 s-unpaid(미결)와 통합. 미수는 처리해도 큐에서 사라지지 않는 «관리 대상»이라
    // 미결(오늘 끝낼 일)이 아니라 여기 산다. 두 섹션이 같은 D.overduePay·collectionStage를 쓰면서
    // 필드 순서만 달랐던 중복을 접었다. dueMatch(기한칩)는 미결에서 쓰던 필터라 유지.
    id: 'r-unpaid', label: '미수 (계약자 미납)', group: '리스크',
    render: ({ D, dueMatch }, p) => { const rows = D.overduePay.filter((v: any) => !dueMatch || dueMatch(-(Number(v.overdueDays) || 0))); return (
      <Sec key="r-unpaid" id="r-unpaid" title="미수 (계약자 미납)" n={rows.length} tone="danger" desc="회수단계·경과 순 · 다음조치" right={<WorkPipe to="receivables" />} {...p}>
        {rows.length === 0 ? <EmptyState variant="ok">미수 없음</EmptyState> :
          <Cards min={300}>{rows.slice(0, 20).map((v: any, i: number) => { const cs = collectionStage(v.overdueDays); return <ObjCard key={i} onClick={() => openCar(v.rec.plate, 'unpaid')} rail="danger" co={String(v.rec.companyId || '')} badge={cs.stage} badgeTone={cs.tone} plate={String(v.rec.plate)} carType={String(v.rec.contractorName || '')} fields={[['계약자', String(v.rec.contractorName || '—')], ['연락처', String(v.rec.contractorPhone || '—')], ['경과', `${v.overdueDays}일`], ['미납', `${v.count}회`], ['다음조치', cs.nextAction || '—'], ['순미수', won(v.net)]]} sub={`${v.overdueDays}일 경과 · ${v.count}회${cs.nextAction ? ' · ' + cs.nextAction : ''}`} right={<span style={{ color: C.danger }}>{won(v.net)}</span>} />; })}</Cards>}
      </Sec>
    ); },
  },
  {
    id: 'r-compliance', label: '법령·컴플라이언스 경고', group: '리스크',
    render: ({ D }, p) => (
      <Sec key="r-compliance" id="r-compliance" title="법령·컴플라이언스 경고" n={D.compliance.length} tone="danger" desc="무면허·무보험·보험연령 등 위반 소지" {...p}>
        {D.compliance.length === 0 ? <EmptyState variant="ok">위반 소지 없음</EmptyState> :
          <Cards min={280}>{D.compliance.slice(0, 20).map((c: any, i: number) => { const top = c.flags[0]; return <ObjCard key={i} onClick={() => openCar(c.rec.plate, 'inspect')} rail="danger" co={String(c.rec.companyId || '')} badge={top.label} badgeTone={complianceTone(top.severity)} plate={String(c.rec.plate)} carType={c.rec.contractorName ? String(c.rec.contractorName) : undefined} fields={[['차량', String(c.rec.plate)], ['임차인', c.rec.contractorName ? String(c.rec.contractorName) : '—'], ['위반', String(top.label)], ['상세', String(top.detail)], ['건수', `${c.flags.length}건`]]} sub={top.detail} right={c.flags.length > 1 ? <span style={{ color: C.faint, fontSize: 11 }}>+{c.flags.length - 1}</span> : undefined} />; })}</Cards>}
      </Sec>
    ),
  },

  {
    id: 'r-deposit', label: '보증금 미반환', group: '리스크',
    render: ({ contracts }, p) => {
      const pend = contracts.map((c) => ({ c, d: depositView(c, TODAY) })).filter((x) => x.d.pendingRefund)
        .sort((a, b) => String(b.c.returnedDate || '').localeCompare(String(a.c.returnedDate || '')));
      return pend.length ? (
        <Sec key="r-deposit" id="r-deposit" title="보증금 미반환" n={pend.length} tone="warn" desc="종료됐는데 보증금 정산(반환/충당) 안 됨 · 정산 누락 방지" {...p}>
          <Cards min={300}>{pend.slice(0, 20).map(({ c, d }, i) => <ObjCard key={i} onClick={() => openCar(c.plate, 'return')} rail={d.addCharge > 0 ? 'danger' : 'warn'} co={String(c.companyId || '')} badge="미반환" badgeTone="amber" plate={String(c.plate)} carType={c.contractorName ? String(c.contractorName) : undefined} fields={[['계약자', c.contractorName ? String(c.contractorName) : '—'], ['반납일', String(c.returnedDate || '—')], ['보증금', won(d.deposit)], ['추가청구', d.addCharge > 0 ? won(d.addCharge) : '—'], ['반환예정', won(d.refund)]]} sub={`반납 ${String(c.returnedDate || '')} · 보증금 ${won(d.deposit)}`} right={d.addCharge > 0 ? <span style={{ color: C.danger }}>추가청구 {won(d.addCharge)}</span> : <span style={{ color: 'var(--green-text)' }}>반환 {won(d.refund)}</span>} />)}</Cards>
        </Sec>
      ) : null;
    },
  },

  {
    // 원본(계약서)·자금일보와 안 맞는 계약 → 실무자 확인 큐. 회사 스코프 = 현재 계약 차번으로 자동 필터.
    // JSON은 DocAuditSec 동적 청크 — 메인 번들 비대화 방지.
    id: 'r-integrity', label: '정합성 확인 (계약서·입금 대조)', group: '리스크',
    render: ({ contracts }, p) => (
      <DocAuditSec key="r-integrity" plates={contracts.map((c) => String(c.plate || ''))} {...p} />
    ),
  },

  /* ── 자산 (PART1 상태적응 카드) ── */
  {
    id: 'a-unreg', label: '미처리 차량', group: '자산',
    render: ({ asset }, p) => { const { unreg, ghost } = asset; return (
      <Sec key="a-unreg" id="a-unreg" title="미처리 차량" n={unreg.length + ghost.length} tone="danger" desc="등록·정보 빠짐 · 채우면 처리" right={<WorkPipe to="ingest" />} {...p}>
        {(unreg.length + ghost.length) === 0 ? <EmptyState variant="ok">미처리 차량 없음</EmptyState> :
          <Cards min={280}>{[
            ...ghost.slice(0, 8).map((pl, i) => <ObjCard key={'g' + i} onClick={() => openCar(pl)} rail="warn" badge="미등록" badgeTone="red" plate={String(pl)} sub="등록증 미수집 · 계약만 존재" />),
            ...unreg.slice(0, 8).map((r: any, i: number) => <ObjCard key={'u' + i} onClick={() => openCar(r.v.plate)} rail="warn" badge="빠진서류" badgeTone="amber" plate={String(r.v.plate)} carType={r.v.carName || undefined} sub={r.miss?.length ? `빠진 것: ${r.miss.join(', ')}` : '정보 보완'} />)]}</Cards>}
      </Sec>
    ); },
  },
  {
    id: 'a-idle', label: '쉬는 차', group: '자산',
    render: ({ asset }, p) => { const { idle, carTypeOf, idleFieldsOf, idleRight } = asset; return (
      <Sec key="a-idle" id="a-idle" title="쉬는 차" n={idle.length} tone={idle.length > 0 ? 'warn' : 'ink'} desc="세워둔 차 · 투입 대상 · 클릭 → 360" right={<WorkPipe to="dispatch" />} {...p}>
        {idle.length === 0 ? <EmptyState variant="ok">노는 차 없음</EmptyState> :
          <><Cards min={360}>{idle.slice(0, 40).map((r: any, i: number) => <ObjCard key={i} onClick={() => openCar(r.v.plate, 'deploy')} rail="mute" badge="쉬는" badgeTone="blue" co={String(r.v.companyId || '')} plate={String(r.v.plate)} carType={carTypeOf(r)} fields={idleFieldsOf(r)} right={idleRight(r)} />)}</Cards>
          {idle.length > 40 && <div style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>외 {idle.length - 40}대</div>}</>}
      </Sec>
    ); },
  },
  {
    id: 'a-manage', label: '관리 필요', group: '자산',
    render: ({ asset }, p) => { const { manage } = asset; return (
      <Sec key="a-manage" id="a-manage" title="관리 필요" n={manage.length} tone="warn" desc="정비·사고·검사만기·휴차" right={<WorkPipe to="repair" />} {...p}>
        {manage.length === 0 ? <EmptyState variant="ok">관리 이슈 없음</EmptyState> :
          <Cards min={280}>{manage.slice(0, 12).map((r: any, i: number) => { const reason = ['정비', '사고'].includes(r.status) ? r.status : IDLE.has(r.status) ? '휴차' : '검사만기'; return <ObjCard key={i} onClick={() => openCar(r.v.plate)} rail={reason === '검사만기' ? 'danger' : reason === '휴차' ? 'mute' : 'warn'} badge={reason} badgeTone={reason === '검사만기' ? 'red' : reason === '휴차' ? 'gray' : 'amber'} plate={String(r.v.plate)} carType={r.v.carName || undefined} sub={reason === '검사만기' ? `검사 ${r.v.inspectionTo}` : reason === '휴차' ? '투입 필요' : '처리 중'} />; })}</Cards>}
      </Sec>
    ); },
  },
  {
    id: 'a-running', label: '운행중', group: '자산',
    render: ({ asset }, p) => { const { running, termOf, carTypeOf, fieldsOf, runningRight, runningRail } = asset; return (
      <Sec key="a-running" id="a-running" title="운행중" n={running.length} tone="ok" desc="장기·단기 · 클릭 → 360" right={<WorkPipe to="dispatch" />} {...p}>
        {running.length === 0 ? <EmptyState variant="ok">운행 중인 차 없음</EmptyState> :
          /* 자르지 않는다 — 헤더가 102대라고 하는데 목록이 40개면 «분류가 틀린 것»으로 읽힌다.
             많으면 좌측 필터·검색으로 좁히는 게 이 화면의 사용법. */
          <Cards min={360}>{running.map((r: any, i: number) => { const t = termOf(r); return <ObjCard key={i} onClick={() => openCar(r.v.plate)} rail={runningRail(r)} badge={t.label} badgeTone={t.tone} co={String(r.v.companyId || '')} plate={String(r.v.plate)} carType={carTypeOf(r)} fields={fieldsOf(r)} right={runningRight(r)} />; })}</Cards>}
      </Sec>
    ); },
  },
  {
    id: 'a-other', label: '그 밖의 상태 (정비·사고)', group: '자산',
    render: ({ asset }, p) => { const { others, carTypeOf, repairFieldsOf } = asset; return others.length > 0 ? (
      <Sec key="a-other" id="a-other" title="그 밖의 상태" n={others.length} desc="정비·사고 등 · 언제 복귀" {...p}>
        <Cards min={360}>{others.slice(0, 40).map((r: any, i: number) => <ObjCard key={i} onClick={() => openCar(r.v.plate)} rail="warn" badge={r.status} badgeTone={vstone(r.status)} co={String(r.v.companyId || '')} plate={String(r.v.plate)} carType={carTypeOf(r)} fields={repairFieldsOf(r)} />)}</Cards>
      </Sec>
    ) : null; },
  },
  {
    id: 'a-out', label: '내보낸 차 (매각·말소)', group: '자산',
    render: ({ asset }, p) => { const { outCars, carTypeOf, soldFieldsOf, soldRight } = asset; return outCars.length > 0 ? (
      <Sec key="a-out" id="a-out" title="내보낸 차 (매각·말소)" n={outCars.length} desc="운영에서 빠진 차 · 생애 성과" {...p}>
        <Cards min={360}>{outCars.slice(0, 40).map((r: any, i: number) => <ObjCard key={i} onClick={() => openCar(r.v.plate)} badge={r.status} badgeTone="gray" co={String(r.v.companyId || '')} plate={String(r.v.plate)} carType={carTypeOf(r)} fields={soldFieldsOf(r)} right={soldRight(r)} />)}</Cards>
      </Sec>
    ) : null; },
  },
  {
    id: 'a-events', label: '자산 이벤트', group: '자산',
    render: ({ asset }, p) => { const { events, nameByPlate } = asset; return (
      <Sec key="a-events" id="a-events" title="자산 이벤트" n={events.length} desc="출고·반납·정비 · 최근순" {...p}>
        {events.length === 0 ? <EmptyState variant="ok">이벤트 없음</EmptyState> :
          <Cards min={250}>{events.map((e, i) => <ObjCard key={i} onClick={() => openCar(e.plate)} badge={e.kind} badgeTone={e.tone} plate={String(e.plate)} carType={nameByPlate.get(e.plate) || undefined} sub={`${e.date}${e.label ? ' · ' + e.label : ''}`} />)}</Cards>}
      </Sec>
    ); },
  },

  /* ── 고객 ── */
  {
    id: 'c-unpaid', label: '미수 고객', group: '고객',
    render: ({ customers, scopeAll }, p) => { const { unpaid } = customers; return (
      <Sec key="c-unpaid" id="c-unpaid" title="미수 고객" n={unpaid.length} tone="danger" desc="큰 금액순 · 추심 대상" right={<WorkPipe to="receivables" />} {...p}>
        {unpaid.length === 0 ? <EmptyState variant="ok">미수 고객 없음</EmptyState> : <Cards min={320}>{unpaid.slice(0, 30).map((c) => custCard(c, scopeAll))}</Cards>}
      </Sec>
    ); },
  },
  {
    id: 'c-active', label: '진행중 고객', group: '고객',
    render: ({ customers, scopeAll }, p) => { const { active } = customers; return (
      <Sec key="c-active" id="c-active" title="진행중 고객" n={active.length} desc="운행중 계약 보유" {...p}>
        {active.length === 0 ? <EmptyState variant="ok">없음</EmptyState> : <Cards min={320}>{active.slice(0, 40).map((c) => custCard(c, scopeAll))}</Cards>}
      </Sec>
    ); },
  },
  {
    id: 'c-past', label: '재계약 대상 (종료 고객)', group: '고객',
    render: ({ customers, scopeAll }, p) => { const { past } = customers; return (
      <Sec key="c-past" id="c-past" title="재계약 대상 (종료 고객)" n={past.length} desc="지난 고객 · 재계약 영업" {...p}>
        {past.length === 0 ? <EmptyState variant="ok">없음</EmptyState> : <Cards min={320}>{past.slice(0, 40).map((c) => custCard(c, scopeAll))}</Cards>}
      </Sec>
    ); },
  },
];

export const SECTION_MAP: Record<string, SectionDef> = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
export const DESK_GROUPS: DeskGroup[] = ['미결', '리스크', '자산', '자금', '고객'];
