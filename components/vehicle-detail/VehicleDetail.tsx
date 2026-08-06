'use client';
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import {
  ActionMenu, Btn, TextLink, Badge, KV, EmptyState, Message, Input, Select,
  SectionLabel, Disclosure, th, thR, td, tdR, won, C, SH, PageLoading, SPACE_GROUP_M, type KVRow,
} from '@/components/ui';
import { InfoDoc } from '@/components/InfoDoc';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';
import { docHistory, latestDoc } from '@/lib/docs';
import { effectiveEndDate, patchExtend, earlyTerminationFee, computeContractView } from '@/lib/contract-ops';
import { isProductReady } from '@/lib/freepass/product-sync';
import { FUEL_LEVELS } from '@/lib/domain/fuel';
import { isComm, matchesContract } from '@/lib/activity-match';
import { matchDriver, penaltyStatus, penaltyTone } from '@/lib/penalty-reassign';
import { companyLabel } from '@/lib/companies';
import { openIngest, openPrintDoc } from '@/lib/ui-bus';
import { toast } from '@/lib/toast';
import { QuickLogForm } from '@/components/QuickLogForm';
import { WorkForm } from '@/components/WorkForm';
import { workSummary, workCategoryTone, workStatusTone } from '@/lib/work-ops';
import { NEED_COMPANY } from '@/lib/scope';
import { commitUpdate } from '@/lib/commit';
import { TODAY, dday } from '@/lib/dashboard-consts';
import type { EntityRecord } from '@/lib/intake/entities';
import { useVehicleDetail, yy, remainText, scheduleTone } from './useVehicleDetail';
import { paymentTimingOf } from '@/lib/schema/contract';

function PrintMenu({ items }: { items: { label: string; run: () => void }[] }) {
  if (!items.length) return null;
  if (items.length === 1) return <Btn size="sm" variant="ghost" onClick={items[0].run}>{items[0].label}</Btn>;
  return <ActionMenu label="출력" menuLabel="출력 문서 선택" items={items.map((item) => ({ key: item.label, label: item.label, onClick: item.run }))} />;
}

/**
 * 차량360 섹션 = **원장 우측 상세패널과 같은 껍데기**(사장님 확정 2026-08-06).
 *   `details.ledger-record-panel__section` + 셰브론 + 건수 배지 — LedgerRecordPanel 이 쓰는 그 마크업이다.
 *   `Sec`(눈 아이콘·드래그·그룹라벨)은 원장 페이지용이라 상세 화면에는 쓰지 않는다.
 * 섹션별 액션(수정·서류 등록·+기록…)은 제목줄 오른쪽에 그대로 둔다 — 여기서만 할 수 있는 일이라 숨기면 안 된다.
 */
function PanelSec({
  id, title, desc, n, right, tone, open = false, children,
}: {
  id?: string; title: ReactNode; desc?: ReactNode; n?: number;
  right?: ReactNode; /** 'ok'=편집 중 등 상태 강조. 제목 색으로만(박스·틴트 금지). */ tone?: string;
  open?: boolean; children: ReactNode;
}) {
  return (
    <details id={id} className="ledger-record-panel__section" open={open || tone === 'ok'}>
      <summary>
        <ChevronRight className="ledger-record-panel__chevron" size={14} aria-hidden="true" />
        <span style={{ fontWeight: 800, color: tone === 'ok' ? C.accent : C.ink }}>{title}</span>
        {desc ? <span style={{ marginLeft: 6, fontSize: 11, color: C.faint, fontWeight: 400 }}>{desc}</span> : null}
        {n != null ? <span className="ledger-record-panel__count">{n}건</span> : null}
        {/* 액션은 제목줄 오른쪽에 붙인다 — 별도 줄로 빼면 버튼만 툭 튀어나온다.
            summary 안이라 클릭이 접기로 새지 않게 여기서 멈춘다. */}
        {right ? (
          <span
            style={{ marginLeft: n != null ? 8 : 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            {right}
          </span>
        ) : null}
      </summary>
      <div style={{ padding: '0 12px 12px' }}>{children}</div>
    </details>
  );
}

const fLab: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 };
const fLl: CSSProperties = { fontSize: 11, color: C.mute };
const Add = ({ type, plate, label }: { type: string; plate: string; label: string }) => (
  <Btn size="sm" variant="ghost" onClick={() => openIngest(type, plate)}>{label}</Btn>
);

/** freepass-style 차량 상세 — 고정 스크롤 레이아웃(DnD/순서 없음). embed=원장 우측 패널. */
export function VehicleDetail({ plate, focus, embed, companyId: targetCompanyId }: { plate: string; focus?: string; embed?: boolean; companyId?: string }) {
  const {
    loading, companyId, v, contracts, penalties, history, active, waiting, totalUnpaid, d, schedule,
    master, status, statusTone, loan, loanSum, lastReturn, idleDays, loc, locStr, target, workList,
    curIns, olderIns, econ, tax, pendDeposit, engineLocked, reco, issues, pastContracts, hist,
    editInfo, form, recMode, setRecMode, recForm, setRecForm, editIns, setEditIns, prodBusy,
    insForm, logOpen, setLogOpen, workOpen, setWorkOpen, txMode, setTxMode, txForm, setTxForm,
    dlvOpen, setDlvOpen, dlvForm, setDlvForm, loanOpen, setLoanOpen,
    delVehicle, commitTx, commitDeliver, logIgnition, settleDeposit, chg, startEdit, cancelEdit,
    saveInfo, registerProduct, insChg, startEditIns, saveIns, onReplaceReg, onReplaceIns,
    saveRecord, goSec, doTransition,
  } = useVehicleDetail(plate, focus, targetCompanyId);

  /* 전부 펼치기/접기 — 섹션이 12개라 하나씩 여는 건 일이다.
     `details.open` 을 직접 세팅한다: 각 섹션이 자기 상태를 들고 있어(InfoDoc 은 자체 접기까지)
     React state 로 끌어올리면 그 상태와 두 벌이 된다. DOM 하나만 보는 쪽이 어긋날 여지가 없다. */
  const rootRef = useRef<HTMLDivElement>(null);
  const setAllSections = (open: boolean) => {
    rootRef.current?.querySelectorAll<HTMLDetailsElement>('details.ledger-record-panel__section')
      .forEach((el) => { el.open = open; });
    // 등록증·보험(InfoDoc)은 details 가 아니라 자체 상태 — 이벤트로 같이 움직인다.
    window.dispatchEvent(new CustomEvent('jpk:sections-toggle', { detail: { open } }));
  };

  if (loading) return <PageLoading />;

  return (
    /* ★`Page frame` 은 창 스크롤을 잠그고 main 을 overflow:hidden 으로 고정한다(layout.tsx).
       그래서 **안쪽이 스스로 스크롤해야** 한다 — 안 그러면 아래 섹션이 잘린 채 스크롤이 안 된다.
       embed(원장 우측 패널)일 때는 패널이 이미 스크롤하므로 건드리지 않는다. */
    <div ref={rootRef} style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      ...(embed ? null : { flex: 1, minHeight: 0, overflowY: 'auto' as const, paddingBottom: 24 }),
    }}>
      {/* 신분 행 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Badge tone={statusTone}>{status}</Badge>
        {v?.carName ? <span style={{ fontSize: 13.5, fontWeight: 800, color: C.ink }}>{String(v.carName)}</span> : null}
        {(() => {
          const yr = String(v?.modelYear || v?.yearMonth || (v?.firstReg ? String(v.firstReg).slice(0, 4) + '년식' : ''));
          return yr ? <span style={{ fontSize: 12.5, color: C.mute }}>{yr}</span> : null;
        })()}
        {v?.companyId ? <span style={{ fontSize: 12.5, color: C.faint }}>{companyLabel(String(v.companyId))}</span> : null}
        <span style={{ flex: 1 }} />
        <Btn variant="ghost" size="sm" iconOnly tip="전부 펼치기" onClick={() => setAllSections(true)}>
          <ChevronsUpDown size={14} />
        </Btn>
        <Btn variant="ghost" size="sm" iconOnly tip="전부 접기" onClick={() => setAllSections(false)}>
          <ChevronsDownUp size={14} />
        </Btn>
        <Btn variant="ghost" size="sm" onClick={() => { setLogOpen(true); goSec('v-history'); }}>통화·기록</Btn>
      </div>

      {/* 미결 · 리스크 칩 */}
      {issues.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
            <span className="attn-dot" />
            <span style={{ fontSize: 12.5, fontWeight: 800, color: C.ink }}>미결 · 리스크</span>
            <span style={{ fontSize: 12, color: C.faint }}>{issues.length}건</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {issues.map((it, i) => (
              <button key={i} type="button" onClick={it.go} disabled={!it.go} title={it.go ? '눌러서 처리로 이동' : undefined}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: 'none', background: 'transparent', padding: '4px 4px', cursor: it.go ? 'pointer' : 'default', WebkitTapHighlightColor: 'transparent' }}>
                <Badge tone={it.tone === 'red' ? 'red' : it.tone === 'amber' ? 'amber' : 'gray'}>{it.label}</Badge>
                <span style={{ fontSize: 12, color: C.mute }}>{it.detail}</span>
                {it.go && <ChevronRight size={14} strokeWidth={2.2} aria-hidden style={{ flexShrink: 0, color: C.faint }} />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* CTA: 반납/연장/해지 OR 인도 */}
      {active ? <>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className={focus === 'return' ? 'attn-btn' : undefined}>
            <Btn variant={txMode === 'return' ? 'solid' : txMode ? 'ghost' : 'solid'} onClick={() => setTxMode(txMode === 'return' ? null : 'return')}>반납 처리</Btn>
          </span>
          <Btn variant={txMode === 'extend' ? 'solid' : 'ghost'} onClick={() => setTxMode(txMode === 'extend' ? null : 'extend')}>연장</Btn>
          <span style={{ flex: 1 }} />
          <Btn variant={txMode === 'terminate' ? 'danger' : 'ghost'} onClick={() => setTxMode(txMode === 'terminate' ? null : 'terminate')}>중도해지</Btn>
        </div>
        {txMode && <div style={{ padding: 12, border: `1px solid ${C.accent}`, borderRadius: 'var(--radius)', background: 'var(--bg-card)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{txMode === 'return' ? '반납 처리' : txMode === 'extend' ? '연장 처리' : '중도해지'}</span>
            <span style={{ flex: 1 }} />
            <Btn size="sm" variant="ghost" onClick={() => setTxMode(null)}>닫기</Btn>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {txMode === 'return' && <>
              <label style={fLab}><span style={fLl}>반납일</span><Input type="date" value={txForm.date} onChange={(e) => setTxForm((f) => ({ ...f, date: e.target.value }))} /></label>
              <label style={fLab}><span style={fLl}>주행거리(km)</span><Input inputMode="numeric" value={txForm.mileage} onChange={(e) => setTxForm((f) => ({ ...f, mileage: e.target.value.replace(/[^\d]/g, '') }))} placeholder="예: 45000" style={{ width: 110 }} /></label>
              <label style={fLab}><span style={fLl}>연료</span><Select value={txForm.fuel} onChange={(e) => setTxForm((f) => ({ ...f, fuel: e.target.value }))}>{FUEL_LEVELS.map((x) => <option key={x} value={x}>{x}</option>)}</Select></label>
              <label style={{ ...fLab, flex: 1, minWidth: 170 }}><span style={fLl}>정산 메모(연체·손상·환급 등)</span><Input value={txForm.settleNote} onChange={(e) => setTxForm((f) => ({ ...f, settleNote: e.target.value }))} placeholder="예: 스크래치 2건, 미납 1회차 정산" /></label>
              {reco ? <div style={{ flexBasis: '100%', fontSize: 12, color: C.mute, paddingTop: 2 }}>반납 후 다음 임차인 추천 대여료 <b style={{ color: C.ink, fontFamily: 'var(--font-mono)' }}>{won(reco.recommended)}</b> <span style={{ color: C.faint }}>(현재 {won(reco.currentRent)} · 함대 손바뀜 {reco.dropPct}%↓ · 밴드 {won(reco.low)}~{won(reco.high)})</span></div> : null}
            </>}
            {txMode === 'extend' && <>
              <label style={fLab}><span style={fLl}>연장 개월</span><Input inputMode="numeric" value={txForm.months} onChange={(e) => setTxForm((f) => ({ ...f, months: e.target.value.replace(/[^\d]/g, '') }))} style={{ width: 80 }} /></label>
              <div style={{ fontSize: 12.5, color: C.mute, paddingBottom: 7 }}>종료일 <b style={{ color: C.faint }}>{yy(active.endDate)}</b> → <b style={{ color: C.ink }}>{yy(patchExtend(active, Number(txForm.months) || 0).endDate)}</b><span style={{ marginLeft: 8, color: C.faint }}>총 {(Number(active.rentalMonths) || 0) + (Number(txForm.months) || 0)}개월</span></div>
            </>}
            {txMode === 'terminate' && <>
              <label style={fLab}><span style={fLl}>해지일</span><Input type="date" value={txForm.date} onChange={(e) => setTxForm((f) => ({ ...f, date: e.target.value }))} /></label>
              <label style={fLab}><span style={fLl}>사유</span><Select value={txForm.reason} onChange={(e) => setTxForm((f) => ({ ...f, reason: e.target.value }))}>{['고객요청', '연체', '차량회수', '사고전손', '기타'].map((x) => <option key={x} value={x}>{x}</option>)}</Select></label>
              <label style={{ ...fLab, flex: 1, minWidth: 170 }}><span style={fLl}>정산 메모</span><Input value={txForm.penaltyNote} onChange={(e) => setTxForm((f) => ({ ...f, penaltyNote: e.target.value }))} placeholder="예: 손상·미납 정산" /></label>
              {(() => {
                const et = earlyTerminationFee(active, txForm.date);
                return (
                  <div style={{ flexBasis: '100%', fontSize: 12.5, color: C.mute, paddingTop: 2 }}>중도해지 위약금 {et.isEarly ? <>잔여 <b style={{ color: C.ink }}>{et.remainingMonths}개월</b> × 월 {won(et.monthlyRent)} × <b style={{ color: C.ink }}>{et.rate}%</b> = <b style={{ color: et.fee > 0 ? C.danger : C.ink, fontFamily: 'var(--font-mono)' }}>{won(et.fee)}</b></> : <b style={{ color: C.ink }}>만기 도래 · 위약금 없음</b>}{!active.earlyTerminationRate ? <span style={{ marginLeft: 8, color: C.faint }}>(요율 미설정 — 계약조건에서 입력)</span> : null}</div>
                );
              })()}
            </>}
            <Btn variant={txMode === 'terminate' ? 'danger' : 'solid'} onClick={commitTx}>{txMode === 'return' ? '반납 확정' : txMode === 'extend' ? '연장 확정' : '해지 확정'}</Btn>
          </div>
        </div>}
      </> : waiting ? (
        !dlvOpen
          ? <Btn onClick={() => setDlvOpen(true)}>인도(출고) 처리</Btn>
          : <div style={{ padding: 12, border: `1px solid ${C.accent}`, borderRadius: 'var(--radius)', background: 'var(--bg-card)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>인도(출고) 처리</span>
                <span style={{ fontSize: 11.5, color: C.faint }}>출고 시점 원점 — 반납 정산·손상판정의 기준</span>
                <span style={{ flex: 1 }} />
                <Btn size="sm" variant="ghost" onClick={() => setDlvOpen(false)}>닫기</Btn>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label style={fLab}><span style={fLl}>인도일</span><Input type="date" value={dlvForm.date} onChange={(e) => setDlvForm((f) => ({ ...f, date: e.target.value }))} /></label>
                <label style={fLab}><span style={fLl}>출고 주행거리(km)</span><Input inputMode="numeric" value={dlvForm.mileage} onChange={(e) => setDlvForm((f) => ({ ...f, mileage: e.target.value.replace(/[^\d]/g, '') }))} placeholder="계기판 km" style={{ width: 120 }} /></label>
                <label style={fLab}><span style={fLl}>출고 연료</span><Select value={dlvForm.fuel} onChange={(e) => setDlvForm((f) => ({ ...f, fuel: e.target.value }))}>{FUEL_LEVELS.map((x) => <option key={x} value={x}>{x}</option>)}</Select></label>
                <Btn onClick={commitDeliver}>인도 확정</Btn>
              </div>
            </div>
      ) : null}

      {/* 편집 배너 */}
      {editInfo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '9px 12px', border: `1px solid ${C.accent}`, borderRadius: 'var(--radius)', background: 'var(--bg-card)' }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: C.ink }}>기본정보 편집 중</span>
          <span style={{ fontSize: 11.5, color: C.mute }}>차량정보 · 등록증 · 매입/할부를 함께 저장합니다</span>
          <span style={{ flex: 1 }} />
          <Btn onClick={saveInfo}>저장</Btn>
          <Btn variant="ghost" onClick={cancelEdit}>취소</Btn>
        </div>
      )}

      {/* ── 지금 ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        
        <PanelSec id="v-status" title="현황" desc="한눈 요약 · 계약 조건"
          right={active
            ? <span style={{ display: 'inline-flex', gap: 6 }}><Btn variant="ghost" size="sm" onClick={() => openPrintDoc('contract', plate)}>계약서 출력</Btn><Add type="contract" plate={plate} label="수정" /></span>
            : <Add type="contract" plate={plate} label="+ 계약" />}>
          {/* ★현황도 KV 표 — 상세 규격은 「접히는 섹션 + 그 안에 표」 하나다(사장님 확정 2026-08-06).
              Metric 카드로 두면 같은 화면 안에서 「차량 정보」(KV)와 몸집이 달라 규격이 섞인다.
              신호는 값의 색으로만 준다(카드 톤 대신) — 행 틴트·박스 금지 규격과도 맞는다. */}
          <KV rows={((): [string, string | null, ReactNode][] => {
            const warnColor = (tone: 'danger' | 'warn' | null, node: ReactNode): ReactNode => (tone
              ? <span style={{ color: tone === 'danger' ? C.danger : C.warn, fontWeight: 700 }}>{node}</span>
              : node);
            if (active) {
              return [
                ['계약자', null, String(active.contractorName || '') || '—'],
                ['반납예정', null, warnColor(d != null && d < 0 ? 'danger' : d != null && d <= 7 ? 'warn' : null,
                  remainText(effectiveEndDate(active), TODAY))],
                ['미수', null, warnColor(totalUnpaid > 0 ? 'danger' : null, won(totalUnpaid))],
              ];
            }
            const workTone = loc.work === '정비' || loc.work === '사고' ? 'warn' as const : null;
            const idleTone = idleDays != null && idleDays > 180 ? 'danger' as const
              : idleDays != null && idleDays > 60 ? 'warn' as const : null;
            const insp = v?.inspectionTo ? dday(v.inspectionTo) : null;
            return [
              ['상태', null, warnColor(workTone, String(v?.status || (loc.work && loc.work !== '대기' ? loc.work : '휴차')))],
              ['계약', null, '계약 없음'],
              ['위치', null, warnColor(workTone, locStr)],
              ['대기 일수', null, warnColor(idleTone, idleDays != null ? `${idleDays}일` : '—')],
              ['최종 반납', null, lastReturn ? yy(lastReturn) : '—'],
              ...(v?.inspectionTo
                ? [['검사만기', null, warnColor(insp != null && insp < 0 ? 'danger' : insp != null && insp <= 30 ? 'warn' : null, yy(v.inspectionTo))]] as [string, string | null, ReactNode][]
                : []),
              ...(totalUnpaid > 0
                ? [['미수(과거 채권)', null, warnColor('danger', won(totalUnpaid))]] as [string, string | null, ReactNode][]
                : []),
            ];
          })()} />
          {active ? (
            <div id="v-contract" style={{ marginTop: 14 }}>
              <SectionLabel mt={0} mb={8}>계약 조건</SectionLabel>
              <KV rows={[
                ['계약번호', null, String(active.contractNo ?? '')],
                ['임차인', null, `${String(active.contractorName ?? '')}${active.contractorPhone ? ' · ' + String(active.contractorPhone) : ''}`],
                ['면허', null, `${String(active.contractorLicenseNo ?? '')}${active.licenseType ? ' (' + String(active.licenseType) + ')' : ''}`],
                ['추가운전자', null, String(active.additionalDrivers ?? '')],
                ['계약기간', null, `${active.startDate || ''} ~ ${effectiveEndDate(active) || '미정'}${active.rentalMonths ? `  (${active.rentalMonths}개월)` : ''}`],
                ['인수/반환장소', null, `${String(active.pickupPlace ?? '')}${active.returnPlace ? ' → ' + String(active.returnPlace) : ''}`],
                ['월 대여료', null, active.monthlyRent ? won(active.monthlyRent) : ''],
                ['자동이체일', null, active.paymentDay ? `매월 ${active.paymentDay}일 · ${paymentTimingOf(active.paymentTiming)}` : ''],
                ['보증금 / 예약금', null, `${active.deposit ? won(active.deposit) : '—'}${active.reservationFee ? ' / ' + won(active.reservationFee) : ''}`],
                ['자차보험(CDW)', null, `${String(active.cdw ?? '')}${active.deductible ? ' · 면책 ' + won(active.deductible) : ''}${active.superCover === '있음' ? ' · 완전면책' : ''}`],
                ['지연손해금율', null, active.lateFeeRate ? `${active.lateFeeRate}%` : ''],
                ['중도해지 위약금율', null, active.earlyTerminationRate ? `${active.earlyTerminationRate}%` : ''],
                ['기사포함', null, String(active.withDriver ?? '')],
                ['연료(인수→반납)', null, (active.fuelOut || active.fuelIn) ? `${active.fuelOut || '?'} → ${active.fuelIn || '?'}` : ''],
                ['주행거리(출고→반납)', null, (active.mileageOut || active.returnMileage) ? `${active.mileageOut || '?'} → ${active.returnMileage || '?'} km` : ''],
              ] as [string, string | null, ReactNode][]} />
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, flexWrap: 'wrap' }}>
                <span style={{ color: C.mute }}>납부시기</span>
                {(['선납', '후납'] as const).map((tm) => {
                  const on = paymentTimingOf(active.paymentTiming) === tm;
                  return (
                    <Btn key={tm} size="sm" variant={on ? 'solid' : 'ghost'}
                      onClick={() => { if (!on) void doTransition({ paymentTiming: tm }, String(active._key), active); }}>{tm}</Btn>
                  );
                })}
                <span style={{ color: C.faint, fontSize: 11 }}>선납=1회차 인도 시 납부(1회차 미수 없음) · 후납=1회차부터 미수 가능</span>
              </div>
              {(() => {
                const hd = docHistory(active, 'handover');
                return hd.length ? (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: C.mute, marginBottom: 6 }}>인도·반납 증거 (사진·서명)</div>
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                      {hd.map((d, i) => d.url ? (
                        <Btn key={i} size="sm" variant="ghost" onClick={() => window.open(d.url, '_blank')}>
                          {d.reason || '인도 증거'} · {String(d.uploadedAt || '').slice(0, 10)} 열기
                        </Btn>
                      ) : null)}
                    </div>
                  </div>
                ) : null;
              })()}
            </div>
          ) : (
            <div id="v-contract" style={{ marginTop: 12 }}>
              <EmptyState variant="sec">진행 중 계약 없음 · “+ 계약” 버튼으로 담기</EmptyState>
            </div>
          )}
        </PanelSec>

        {v && (v.gpsDeviceId || v.gpsProvider) ? (
          <PanelSec id="v-gps" title="GPS · 관제" desc="미납 원격 시동제어 연동" right={active ? <span style={{ display: 'inline-flex', gap: 6 }}><Btn size="sm" variant="danger" onClick={() => logIgnition('제어')} disabled={engineLocked}>시동 제어</Btn><Btn size="sm" variant="ghost" onClick={() => logIgnition('해제')} disabled={!engineLocked}>시동 해제</Btn></span> : null}>
            <KV rows={[
              ['공급사', null, String(v.gpsProvider ?? '')],
              ['단말번호', null, String(v.gpsDeviceId ?? '')],
              ['설치일', null, String(v.gpsInstalledDate ?? '')],
              ['장비 시동제어', null, String(v.gpsControl ?? '—')],
              ['계약 시동제어', null, engineLocked ? `적용중 (${String(active?.engineDisabledAt || '').slice(0, 10)})` : '—'],
            ] as [string, string | null, ReactNode][]} />
          </PanelSec>
        ) : null}
      </div>

      {/* ── 이 차 ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!v && <Message variant="warning">등록증이 아직 안 들어왔습니다. 계약·보험·과태료만 표시. <b>정보 담기</b>로 등록하세요.</Message>}

        <PanelSec id="v-info" title={editInfo ? '차량 정보 · 편집 중' : '차량 정보'} tone={editInfo ? 'ok' : undefined} desc="제조사 제공 — 5단계·선택옵션·색상" right={
          editInfo
            ? <span style={{ fontSize: 11.5, color: C.faint }}>함께 편집 중</span>
            : <Btn variant="ghost" onClick={startEdit}>{v ? '수정' : '+ 등록'}</Btn>
        }>
          {(v || editInfo)
            ? <KV editing={editInfo} form={form} onChange={chg} rows={[
                ['제조사', 'maker', String(v?.maker ?? '')],
                ['모델', 'modelLine', String(v?.modelLine ?? '')],
                ['세부모델', 'subModel', String(v?.subModel ?? '')],
                ['파워트레인', 'variant', String(v?.variant ?? '')],
                ['세부트림', 'trim', String(v?.trim ?? '')],
                ['선택옵션', 'optionList', String(v?.optionList ?? '')],
                ['외부색상', 'exteriorColor', String(v?.exteriorColor ?? '')],
                ['내부색상', 'interiorColor', String(v?.interiorColor ?? '')],
                ['구동방식', 'driveType', String(v?.driveType ?? '')],
                ['변속기', 'transmission', String(v?.transmission ?? '')],
              ] as KVRow[]} />
            : <EmptyState variant="sec">차량 미등록</EmptyState>}
        </PanelSec>

        <InfoDoc id="v-reg" title="등록증" desc="자동차등록증상 정보 그대로 · 원본과 한 몸"
          editing={editInfo} hideSaveCancel form={form} onChange={chg}
          onEditToggle={() => (editInfo ? cancelEdit() : startEdit())} onSave={saveInfo}
          docType="vehicle" docLabel="자동차등록증" docs={docHistory(v, 'vehicle')}
          companyId={target} recordKey={plate} onReplaceDoc={onReplaceReg}
          fields={[
            ['차량번호', null, plate],
            ['차대번호(VIN)', 'vin', String(v?.vin ?? '')],
            ['차명', 'carName', String(v?.carName ?? '')],
            ['차종', 'vehicleType', String(v?.vehicleType ?? '')],
            ['용도', 'usage', String(v?.usage ?? '')],
            ['연식', 'modelYear', String(v?.modelYear ?? '')],
            ['제작연월', 'yearMonth', String(v?.yearMonth ?? '')],
            ['최초등록일', 'firstReg', String(v?.firstReg ?? '')],
            ['배기량(cc)', 'displacement', String(v?.displacement ?? '')],
            ['연료', 'fuel', String(v?.fuel ?? '')],
            ['승차정원', 'seats', String(v?.seats ?? '')],
            ['주행거리(km)', 'mileage', String(v?.mileage ?? '')],
            ['검사만기', 'inspectionTo', String(v?.inspectionTo ?? '')],
            ['소유자', 'ownerName', String(v?.ownerName ?? '')],
            ['법인번호', null, String(master.bizNo ?? '')],
          ] as KVRow[]} />

        <>
          <InfoDoc id="v-insurance" title="보험" desc={curIns ? `${String(curIns.insurer || '')} ${String(curIns.policyNo || '')}`.trim() || '자동차보험 증권' : '자동차보험 증권'}
            editing={editIns} form={insForm} onChange={insChg}
            onEditToggle={() => (editIns ? setEditIns(false) : startEditIns())} onSave={saveIns}
            docType="insurance" docLabel="자동차보험증권" docs={docHistory(curIns, 'insurance')}
            companyId={target} recordKey={String(curIns?._key || curIns?.policyNo || '')} onReplaceDoc={onReplaceIns}
            fields={[
              ['보험사', 'insurer', String(curIns?.insurer ?? '')],
              ['상품명', 'productName', String(curIns?.productName ?? '')],
              ['증권번호', 'policyNo', String(curIns?.policyNo ?? '')],
              ['계약자', 'contractor', String(curIns?.contractor ?? '')],
              ['피보험자', 'insured', String(curIns?.insured ?? '')],
              ['시작일', 'startDate', String(curIns?.startDate ?? '')],
              ['만기일', 'endDate', String(curIns?.endDate ?? '')],
              ['운전범위', 'driverScope', String(curIns?.driverScope ?? '')],
              ['운전연령', 'driverAge', String(curIns?.driverAge ?? '')],
              ['물적할증(만원)', 'deductibleMan', String(curIns?.deductibleMan ?? '')],
              ['총보험료(원)', 'totalPremium', String(curIns?.totalPremium ?? '')],
              ['납입보험료(원)', 'paidPremium', String(curIns?.paidPremium ?? '')],
              ['자동이체 은행', 'autoDebitBank', String(curIns?.autoDebitBank ?? '')],
            ] as KVRow[]} />
          {curIns ? (() => {
            const covs: [string, string][] = ([
              ['대인Ⅰ', curIns.cov_personal_1], ['대인Ⅱ', curIns.cov_personal_2], ['대물', curIns.cov_property],
              ['자손/자상', curIns.cov_self_accident], ['무보험', curIns.cov_uninsured], ['자차', curIns.cov_self_vehicle], ['긴급출동', curIns.cov_emergency],
            ] as [string, unknown][]).map(([l, val]) => [l, String(val ?? '')] as [string, string]).filter(([, val]) => val);
            return covs.length ? <div style={{ marginTop: 10, padding: '10px 12px', border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', background: 'var(--bg-card)' }}>
              <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 7, fontWeight: 700 }}>가입담보 · 보상한도</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '5px 14px' }}>
                {covs.map(([l, val]) => <div key={l} style={{ display: 'flex', gap: 6, fontSize: 12, minWidth: 0 }}><span style={{ color: C.mute, flex: '0 0 70px' }}>{l}</span><span style={{ color: C.ink, flex: 1, minWidth: 0 }}>{val}</span></div>)}
              </div>
            </div> : null;
          })() : null}
          {olderIns.length > 0 ? <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 6 }}>이전 증권 ({olderIns.length})</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                <thead><tr>
                  <th style={th}>보험사</th><th style={th}>증권번호</th><th style={th}>기간</th>
                  <th style={thR}>보험료</th><th style={th}>만기</th>
                </tr></thead>
                <tbody>
                  {olderIns.map((ins, i) => {
                    const id = dday(ins.endDate);
                    return (
                      <tr key={i}>
                        <td style={td}>{String(ins.insurer || '') || LEDGER_EMPTY.dash}</td>
                        <td style={td}>{String(ins.policyNo || '') || LEDGER_EMPTY.dash}</td>
                        <td style={td}>{`${ins.startDate || ''}~${ins.endDate || ''}`.trim() || LEDGER_EMPTY.dash}</td>
                        <td style={tdR}>{ins.totalPremium ? won(ins.totalPremium) : LEDGER_EMPTY.dash}</td>
                        <td style={td}>{id == null ? LEDGER_EMPTY.dash : <span style={{ color: C.faint }}>{id < 0 ? `만료 ${-id}일` : `D-${id}`}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div> : null}
        </>

        {(v || editInfo) ? <PanelSec id="v-purchase" title="취득 · 구입" desc="소비자가·개소세 · 취득·매입 · 할부" tone={editInfo ? 'ok' : undefined} right={
          editInfo
            ? <span style={{ fontSize: 11.5, color: C.faint }}>함께 편집 중</span>
            : <Btn variant="ghost" onClick={startEdit}>수정</Btn>
        }>
          <KV editing={editInfo} form={form} onChange={chg} rows={[
            ['소비자가격', 'consumerPrice', v?.consumerPrice ? won(v.consumerPrice) : ''],
            ['옵션가', 'optionPrice', v?.optionPrice ? won(v.optionPrice) : ''],
            ['옵션할인', 'optionDiscount', v?.optionDiscount ? won(v.optionDiscount) : ''],
            ['과세/면세', 'taxExempt', String(v?.taxExempt ?? '')],
            ...(tax ? ([
              ['· 공급가액', null, won(tax.supplyPrice)],
              ['· 개소세', null, won(tax.exciseTax)],
              ['· 교육세', null, won(tax.eduTax)],
              ['· 부가세', null, won(tax.vat)],
              ['· 취득가액', null, won(tax.acquisitionBase)],
              ['· 취득세', null, won(tax.acquisitionTax)],
              ['· 취득원가', null, won(tax.totalAcquisitionCost)],
            ] as KVRow[]) : []),
            ['취득일', 'acquisitionDate', String(v?.acquisitionDate ?? '')],
            ['취득가·매입가', 'acquisitionPrice', v?.acquisitionPrice ? won(v.acquisitionPrice) : ''],
            ['매입완료일', 'purchasedDate', String(v?.purchasedDate ?? '')],
            ['매입처', 'supplier', String(v?.supplier ?? '')],
            ['할부사·리스사', 'loanCompany', String(v?.loanCompany ?? '')],
            ['할부원금', 'loanPrincipal', v?.loanPrincipal ? won(v.loanPrincipal) : ''],
            ['연이율(%)', 'loanRate', String(v?.loanRate ?? '')],
            ['할부개월', 'loanMonths', String(v?.loanMonths ?? '')],
            ['잔여원금', 'loanRemainingPrincipal', v?.loanRemainingPrincipal ? won(v.loanRemainingPrincipal) : ''],
          ] as KVRow[]} />
          {loan.length > 0 ? (
            <div id="v-loan" style={{ marginTop: 4 }}>
              <Disclosure
                open={loanOpen}
                onOpenChange={setLoanOpen}
                title={`할부 상환 스케줄 · ${String(v?.loanCompany || '')} · 월 ${won(loanSum?.monthlyPayment || 0)} · 잔여 ${won(loanSum?.remainPrincipal || 0)} · ${loanSum?.remainSeq || 0}회`}
              >
                <div style={{ border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', overflow: 'hidden', background: C.card }}>
                  <div style={{ maxHeight: 400, overflowY: 'auto', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                      <thead><tr><th style={th}>회차</th><th style={th}>상환일</th><th style={thR}>원금</th><th style={thR}>이자</th><th style={thR}>상환액</th><th style={thR}>잔액</th></tr></thead>
                      <tbody>{loan.map((l) => <tr key={l.seq} style={{ background: loanSum && l.seq <= loanSum.paidSeq ? 'var(--bg-stripe)' : undefined }}>
                        <td style={td}>{l.seq}</td><td style={td}>{l.date}</td><td style={tdR}>{won(l.principal)}</td><td style={tdR}>{won(l.interest)}</td><td style={tdR}>{won(l.payment)}</td><td style={tdR}>{won(l.balance)}</td>
                      </tr>)}</tbody>
                    </table>
                  </div>
                </div>
              </Disclosure>
            </div>
          ) : null}
        </PanelSec> : null}

        {(v || editInfo) ? <PanelSec id="v-product" title="상품 정보" desc="대여료·보증금·보험 — 프리패스 매물 등록" tone={editInfo ? 'ok' : undefined} right={
          editInfo ? <span style={{ fontSize: 11.5, color: C.faint }}>함께 편집 중</span> : <Btn variant="ghost" onClick={startEdit}>수정</Btn>
        }>
          <KV editing={editInfo} form={form} onChange={chg} rows={[
            ['대여료(월)', 'listRent', v?.listRent ? won(v.listRent) : ''],
            ['보증금', 'listDeposit', v?.listDeposit ? won(v.listDeposit) : ''],
            ['기준 기간(개월)', 'listTerm', String(v?.listTerm ?? '')],
            ['보험료', 'insuranceIncluded', String(v?.insuranceIncluded ?? '')],
          ] as KVRow[]} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Btn onClick={registerProduct} disabled={prodBusy || !v}>{prodBusy ? '등록 중…' : '프리패스 상품 등록'}</Btn>
            <span style={{ fontSize: 11.5, color: C.faint }}>{isProductReady(v) ? '상태 상품대기 — 저장 시 자동 등록' : '상태를 «상품대기»로 두면 자동 등록'}</span>
          </div>
        </PanelSec> : null}

        {econ ? <PanelSec id="v-econ" title="자산 손익" desc="이 차가 벌어온 돈 · 회수율">
          <KV rows={[
            ['수입(수금)', '', won(econ.revenue)],
            ['감가', '', won(econ.depreciation)],
            ['보험료', '', won(econ.insuranceCost)],
            ['정비·수리', '', won(econ.maintCost)],
            ['할부이자', '', won(econ.loanInterest)],
            ['손익', '', won(econ.profit)],
            ...(econ.acquisition ? ([['회수율', '', `${Math.round(econ.recoveryRate * 100)}%`]] as KVRow[]) : []),
            ...(econ.bookValue != null ? ([['장부가', '', won(econ.bookValue)]] as KVRow[]) : []),
          ] as KVRow[]} />
        </PanelSec> : null}
      </div>

      {/* ── 수납 · 정산 ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        

        {(active || pastContracts.length > 0) ? <PanelSec id="v-schedule" title="수납 스케줄" n={active ? schedule.length : pastContracts.length} desc={active ? '회차별 청구·미납 · 미수관리' : '이전 계약 수납 이력'}
          right={active ? <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Btn onClick={() => setRecMode(recMode === 'pay' ? null : 'pay')}>+ 입금</Btn>
            <Btn variant="ghost" onClick={() => setRecMode(recMode === 'disc' ? null : 'disc')}>+ 청구할인</Btn>
            <PrintMenu items={[
              { label: '영수증', run: () => openPrintDoc('receipt', plate) },
              ...(totalUnpaid > 0 ? [{ label: '내용증명', run: () => openPrintDoc('notice', plate) }] : []),
            ]} />
          </span> : undefined}>
          {active && recMode ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', padding: '10px 12px', border: `1px solid ${C.accent}`, borderRadius: 'var(--radius)', background: 'var(--bg-card)', marginBottom: 10 }}>
            <label style={fLab}><span style={fLl}>회차</span><Select value={recForm.seq} onChange={(e) => setRecForm((r) => ({ ...r, seq: e.target.value }))}>{schedule.map((s) => <option key={s.seq} value={s.seq}>{s.seq} · {s.dueDate}</option>)}</Select></label>
            <label style={fLab}><span style={fLl}>일자</span><Input type="date" value={recForm.date} onChange={(e) => setRecForm((r) => ({ ...r, date: e.target.value }))} /></label>
            <label style={fLab}><span style={fLl}>금액</span><Input type="number" value={recForm.amount} onChange={(e) => setRecForm((r) => ({ ...r, amount: e.target.value }))} placeholder="0" /></label>
            {recMode === 'pay'
              ? <label style={fLab}><span style={fLl}>수단</span><Select value={recForm.method} onChange={(e) => setRecForm((r) => ({ ...r, method: e.target.value }))}>{['계좌', 'CMS', '카드', '현금', '수동'].map((m) => <option key={m} value={m}>{m}</option>)}</Select></label>
              : <label style={fLab}><span style={fLl}>사유</span><Select value={recForm.reason} onChange={(e) => setRecForm((r) => ({ ...r, reason: e.target.value }))}>{['자가조치', '보상', '사은품', '캠페인', '기타'].map((m) => <option key={m} value={m}>{m}</option>)}</Select></label>}
            <Btn onClick={saveRecord}>{recMode === 'pay' ? '입금 저장' : '할인 저장'}</Btn>
            <Btn variant="ghost" onClick={() => setRecMode(null)}>취소</Btn>
          </div> : null}
          {active ? (
            <>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: C.mute, marginBottom: 8 }}>현재 계약</div>
              {schedule.length === 0 ? <EmptyState variant="sec">스케줄 없음 (계약기간·월대여료 확인)</EmptyState> :
                <div style={{ border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', overflow: 'hidden', background: C.card }}>
                  <div style={{ maxHeight: 460, overflowY: 'auto', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                      <thead><tr>
                        <th style={th}>회차</th><th style={th}>납부기일</th><th style={thR}>청구</th><th style={thR}>할인</th><th style={thR}>납부</th><th style={thR}>미납</th><th style={th}>납부일</th><th style={th}>수단</th><th style={{ ...th, textAlign: 'center' }}>상태</th>
                      </tr></thead>
                      <tbody>
                        {schedule.map((s) => (
                          <tr key={s.seq}>
                            <td style={td}>{s.seq}</td>
                            <td style={td}>{s.dueDate}</td>
                            <td style={tdR}>{won(s.amount)}</td>
                            <td style={tdR}>{s.discount > 0 ? <span style={{ color: C.warn }}>-{won(s.discount)}</span> : '—'}</td>
                            <td style={tdR}>{s.paid > 0 ? <span style={{ color: 'var(--green-text)' }}>{won(s.paid)}</span> : '—'}</td>
                            <td style={tdR}>{s.balance > 0 ? <span style={{ color: C.danger, fontWeight: 700 }}>{won(s.balance)}</span> : '—'}</td>
                            <td style={td}>{s.paidAt || '—'}</td>
                            <td style={td}>{s.method || '—'}</td>
                            <td style={{ ...td, textAlign: 'center' }}><Badge tone={scheduleTone(String(s.status))}>{String(s.status)}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>}
            </>
          ) : null}
          {pastContracts.length > 0 ? (
            <div style={{ marginTop: active ? 14 : 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: C.mute, marginBottom: 8 }}>이전 계약 수납</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pastContracts.map((c) => {
                  const pv = computeContractView(c, TODAY);
                  return (
                    <div key={String(c._key || c.contractNo)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 'var(--radius)', border: `1px solid ${C.line}`, background: C.card }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{String(c.contractorName || '—')}</div>
                        <div style={{ fontSize: 11.5, color: C.faint }}>{yy(c.startDate)} ~ {yy(c.returnedDate || c.endDate)}</div>
                      </div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: pv.net > 0 ? C.danger : C.mute, fontVariantNumeric: 'tabular-nums' }}>
                        {pv.net > 0 ? `미수 ${won(pv.net)}` : '정산됨'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </PanelSec> : null}

        {pendDeposit ? <PanelSec id="v-deposit" title="보증금 정산" n={1} tone="warn" desc={`${String(pendDeposit.c.contractorName || '')} · 반납 ${String(pendDeposit.c.returnedDate || '')} · 미정산`}
          right={<span style={{ display: 'inline-flex', gap: 6 }}><Btn size="sm" variant="ghost" onClick={() => openPrintDoc('settlement', plate)}>정산서</Btn><Btn size="sm" onClick={settleDeposit}>보증금 반환 처리</Btn></span>}>
          <KV rows={[
            ['예치 보증금', '', won(pendDeposit.d.deposit)],
            ['미납 대여료(일할)', '', pendDeposit.d.unpaid ? won(pendDeposit.d.unpaid) : '—'],
            ['보증금 충당', '', pendDeposit.d.offset ? '-' + won(pendDeposit.d.offset) : '—'],
            pendDeposit.d.addCharge > 0
              ? ['추가 청구액', '', won(pendDeposit.d.addCharge)] as KVRow
              : ['반환액', '', won(pendDeposit.d.refund)] as KVRow,
          ] as KVRow[]} />
        </PanelSec> : null}

        {hist.count > 0 ? <PanelSec id="v-handover" title="손바뀜 이력" n={hist.count}
          desc={hist.count >= 2 ? `${hist.count}손 · 첫 ${won(hist.firstRent)} → 현재 ${won(hist.lastRent)}${hist.totalDropPct > 0 ? ` · 누적 ${hist.totalDropPct}%↓` : ''}` : '첫 대여 · 손바뀜 없음'}
          right={hist.count > 1 ? <a href={`/contract-history?plate=${encodeURIComponent(plate)}`} style={{ fontSize: 11.5, color: C.accent, fontWeight: 700, textDecoration: 'none' }}>계약이력 →</a> : undefined}>
          {!active && reco ? <div style={{ marginBottom: 12, padding: '12px 14px', border: `1px solid ${C.accent}`, borderRadius: 'var(--radius)', background: 'var(--bg-card)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: C.accent, letterSpacing: '0.02em' }}>재렌트 추천</span>
              <span style={{ fontSize: 21, fontWeight: 800, color: C.ink, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{won(reco.recommended)}</span>
              <span style={{ fontSize: 12.5, color: C.mute }}>현재 {won(reco.currentRent)} · <b style={{ color: C.danger }}>{reco.dropPct}%↓</b></span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: C.faint, fontFamily: 'var(--font-mono)' }}>밴드 {won(reco.low)}~{won(reco.high)}</span>
            </div>
            <div style={{ fontSize: 11.5, color: C.faint, marginTop: 6 }}>{reco.basis}</div>
          </div> : null}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
              <thead><tr>
                <th style={th}>손</th><th style={th}>계약자</th><th style={th}>개시</th>
                <th style={th}>상태</th><th style={thR}>월 대여료</th><th style={thR}>하락</th><th style={thR}>미수</th>
              </tr></thead>
              <tbody>
                {hist.steps.map((s, i) => (
                  <tr key={i}>
                    <td style={td}><b>{s.seq}손</b></td>
                    <td style={td}>{s.customer || LEDGER_EMPTY.dash}</td>
                    <td style={td}>{yy(s.start)}</td>
                    <td style={td}>{s.phase === '운행' ? <Badge tone="green">운행중</Badge> : <Badge tone="gray">종료</Badge>}</td>
                    <td style={tdR}>{won(s.rent)}</td>
                    <td style={tdR}>{s.drop > 0
                      ? <span style={{ color: C.danger, fontWeight: 700 }}>-{won(s.drop)} · {s.dropPct}%↓</span>
                      : <span style={{ color: C.faint }}>{i === 0 ? '첫 대여' : '동결'}</span>}</td>
                    <td style={tdR}>{s.net > 0 ? <span style={{ color: C.danger, fontWeight: 700 }}>{won(s.net)}</span> : LEDGER_EMPTY.dash}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelSec> : null}
      </div>

      {/* ── 이력 ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        

        <PanelSec id="v-penalty" title="과태료 · 변경부과" n={penalties.length} right={<span style={{ display: 'inline-flex', gap: 6 }}>{penalties.length ? <Btn size="sm" variant="ghost" onClick={() => openPrintDoc('penalty', plate)}>변경부과 공문</Btn> : null}<Add type="penalty" plate={plate} label="+ 추가" /></span>}>
          {penalties.length ? <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
              <thead><tr>
                <th style={th}>위반일</th><th style={th}>내용</th><th style={th}>실운전자</th>
                <th style={th}>기한</th><th style={thR}>금액</th><th style={th}>처리상태</th><th style={th}>다음</th>
              </tr></thead>
              <tbody>
                {penalties.map((p, i) => {
                  const drv = matchDriver(p, contracts); const st = penaltyStatus(p);
                  const NEXT: Record<string, string | null> = { '접수': '임차인확인', '임차인확인': '변경부과신청', '변경부과신청': '변경부과완료', '변경부과완료': '종결', '종결': null };
                  const next = NEXT[st] || null;
                  const advance = async () => {
                    if (!p._key) return;
                    const patch: EntityRecord = { reassignStatus: next };
                    if (next === '임차인확인' && drv) { patch.driverName = drv.contractorName; patch.driverPhone = drv.contractorPhone; patch.billedToRenter = true; patch.reassignDate = TODAY; }
                    try {
                      await commitUpdate({ entity: 'penalty', sessionCompanyId: companyId, rec: p, key: String(p._key), patch });
                    } catch { toast(NEED_COMPANY, 'error'); }
                  };
                  return (
                    <tr key={i}>
                      <td style={td}>{String(p.violationDate || '') || LEDGER_EMPTY.dash}</td>
                      <td style={td}>{String(p.description || p.docType || '과태료')}</td>
                      <td style={td}>{drv ? String(drv.contractorName || '') || LEDGER_EMPTY.dash : <span style={{ color: C.warn }}>미매칭</span>}</td>
                      <td style={td}>{String(p.dueDate || '') || LEDGER_EMPTY.dash}</td>
                      <td style={tdR}>{p.amount ? won(p.amount) : LEDGER_EMPTY.dash}</td>
                      <td style={td}><Badge tone={penaltyTone(st)}>{st}</Badge></td>
                      <td style={td}>{next ? <Btn size="sm" variant="ghost" onClick={advance}>{next} →</Btn> : LEDGER_EMPTY.dash}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div> : <EmptyState variant="sec">과태료 없음</EmptyState>}
        </PanelSec>

        <PanelSec id="v-work" title="차량 수선 · 정비·사고" n={workList.length} tone={workOpen ? 'ok' : undefined}
          desc="정비·사고수리·상품화·세차 — 휴차는 작업상태가 휴차 워크벤치에 자동 반영"
          right={<Btn size="sm" variant="ghost" onClick={() => setWorkOpen((o) => !o)}>{workOpen ? '닫기' : '+ 수선/작업'}</Btn>}>
          {workOpen ? <WorkForm plate={plate} companyId={target} vehicle={v} idle={!active} onDone={() => setWorkOpen(false)} onCancel={() => setWorkOpen(false)} style={{ marginBottom: 12 }} /> : null}
          {workList.length ? <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
              <thead><tr>
                <th style={th}>일자</th><th style={th}>구분</th><th style={th}>내용</th><th style={th}>업체</th>
                <th style={thR}>금액</th><th style={th}>상태</th><th style={th}>후속</th><th style={th}>서류</th>
              </tr></thead>
              <tbody>
                {workList.map((h, i) => {
                  const cat = String(h.category || '수선'); const ws = String(h.work_status || '');
                  const doc = latestDoc(h); const amt = Number(h.amount) || 0;
                  const followUp = cat === '사고수리' && h.repair_out_date ? `출고 ${yy(h.repair_out_date)}`
                    : cat === '정비' && h.next_maint_date ? `다음정비 ${yy(h.next_maint_date)}` : '';
                  return (
                    <tr key={i}>
                      <td style={td}>{yy(h.date)}</td>
                      <td style={td}><Badge tone={workCategoryTone(cat)}>{cat}</Badge></td>
                      <td style={td}>{workSummary(h)}</td>
                      <td style={td}>{String(h.vendor || '') || LEDGER_EMPTY.dash}</td>
                      <td style={tdR}>{amt > 0 ? won(amt) : LEDGER_EMPTY.dash}</td>
                      <td style={td}>{ws ? <Badge tone={workStatusTone(ws)}>{ws}</Badge> : LEDGER_EMPTY.dash}</td>
                      <td style={td}>{followUp ? <span style={{ color: C.warn, fontWeight: 700 }}>{followUp}</span> : LEDGER_EMPTY.dash}</td>
                      <td style={td}>{doc
                        ? (doc.url
                          ? <TextLink onClick={() => window.open(doc.url, '_blank')}>{doc.type || '서류'} 열기</TextLink>
                          : <span style={{ color: C.faint }}>미첨부</span>)
                        : <span style={{ color: C.faint }}>미첨부</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div> : <EmptyState variant="sec">수선/작업 이력 없음 · “+ 수선/작업” 버튼으로 남기세요</EmptyState>}
        </PanelSec>

        <PanelSec id="v-history" title="활동 · 이력" n={history.length} tone={logOpen ? 'ok' : undefined} right={<Btn size="sm" variant="ghost" onClick={() => setLogOpen((o) => !o)}>{logOpen ? '닫기' : '+ 기록'}</Btn>}>
          {logOpen ? <QuickLogForm
            ctx={{ plate, ...(active ? { contractNo: String(active.contractNo || active._key || ''), customer: String(active.contractorName || '') } : {}) }}
            onDone={() => setLogOpen(false)} onCancel={() => setLogOpen(false)} style={{ marginBottom: 12 }} /> : null}
          {history.length ? <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
              <thead><tr>
                <th style={th}>일자</th><th style={th}>구분</th><th style={th}>내용</th>
                <th style={th}>상대</th><th style={th}>작성·업체</th><th style={thR}>금액</th><th style={th}>후속</th>
              </tr></thead>
              <tbody>
                {history.map((h, i) => {
                  const cat = String(h.category || '이력');
                  const tone = (cat === '사고' ? 'red' : cat === '이동' ? 'blue' : (cat === '통화' || cat === '문자') ? 'green' : (cat === '방문' || cat === '상담') ? 'purple' : cat === '메모' ? 'gray' : cat === '검사' ? 'teal' : 'amber') as 'red' | 'blue' | 'green' | 'purple' | 'gray' | 'teal' | 'amber';
                  const who = isComm(h) ? (contracts.find((c) => matchesContract(h, c))?.contractorName || h.customer || '') : '';
                  return (
                    <tr key={i}>
                      <td style={td}>{String(h.date || '') || LEDGER_EMPTY.dash}</td>
                      <td style={td}><Badge tone={tone}>{cat}</Badge></td>
                      <td style={td}>{String(h.title || '') || LEDGER_EMPTY.dash}</td>
                      <td style={td}>{String(who || '') || LEDGER_EMPTY.dash}</td>
                      <td style={td}>{String(h.author || h.vendor || '') || LEDGER_EMPTY.dash}</td>
                      <td style={tdR}>{h.cost ? won(h.cost) : LEDGER_EMPTY.dash}</td>
                      <td style={td}>{h.nextDate ? <span style={{ color: C.warn, fontWeight: 700 }}>{String(h.nextDate)}</span> : LEDGER_EMPTY.dash}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div> : <EmptyState variant="sec">기록 없음 · “+ 기록” 버튼으로 남기세요</EmptyState>}
        </PanelSec>
      </div>

      {/* footer — 차량 삭제만 */}
      <div style={{ paddingTop: 14, borderTop: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: C.faint }}>매각·처분은 상태로 · 삭제는 휴지통 복구 가능</span>
        <Btn size="sm" variant="danger" onClick={delVehicle}>차량 삭제</Btn>
      </div>
    </div>
  );
}
