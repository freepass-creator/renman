'use client';
import type { ReactNode } from 'react';
import { Sec, Cards, Metric, Btn, KV, EmptyState, SectionLabel, Input, Select, Badge, won, C, type KVRow } from '@/components/ui';
import { docHistory } from '@/lib/docs';
import { effectiveEndDate } from '@/lib/contract-ops';
import { openPrintDoc } from '@/lib/ui-bus';
import { TODAY, dday } from '@/lib/dashboard-consts';
import { useDeskTier } from '@/lib/use-mobile';
import { penaltyStatus } from '@/lib/penalty-reassign';
import { yy, remainText, scheduleTone } from '../useVehicleDetail';
import { fLab, fLl, Add, type PanelProps } from './shared';
import { paymentTimingOf } from '@/lib/schema/contract';

/** 한눈 필수정보 + 그 자리 입력(입금·반납은 상단 CTA) */
export function StatusPanel({ plate, vd }: PanelProps) {
  const tier = useDeskTier();
  const wide = tier === 'wide' || tier === 'ultra';
  const {
    v, active, totalUnpaid, d, loc, locStr, idleDays, lastReturn, engineLocked,
    doTransition, logIgnition, curIns, schedule, pendDeposit, loanSum,
    penalties, startEdit, startEditIns, setRecMode, recMode, recForm, setRecForm, saveRecord,
    goSec,
  } = vd;

  const inspD = dday(v?.inspectionTo);
  const insExp = curIns?.endDate || v?.insuranceExpiryDate;
  const insD = dday(insExp);
  const openPen = penalties.filter((p) => penaltyStatus(p) !== '변경부과완료' && penaltyStatus(p) !== '종결');
  const nextDue = schedule.find((s) => String(s.status) !== '완료') || schedule[schedule.length - 1];
  const overdueN = schedule.filter((s) => String(s.status) === '연체' || (Number(s.balance) > 0 && String(s.status) !== '완료')).length;

  const metrics = (
    <Cards min={110} fit>
      {active ? (
        <>
          <Metric label="계약자" value={String(active.contractorName || '—')} onClick={() => goSec('v-contract')} />
          <Metric label="반납예정" value={remainText(effectiveEndDate(active), TODAY)} tone={d != null && d < 0 ? 'danger' : d != null && d <= 7 ? 'warn' : 'ink'} onClick={() => vd.setTxMode('return')} />
          <Metric label="미수" value={won(totalUnpaid)} tone={totalUnpaid > 0 ? 'danger' : 'ink'} onClick={active ? () => setRecMode(recMode === 'pay' ? null : 'pay') : undefined} />
          <Metric label="월대여료" value={active.monthlyRent ? won(active.monthlyRent) : '—'} />
          {nextDue ? <Metric label="다음 회차" value={`${nextDue.seq} · ${yy(nextDue.dueDate)}`} hint={String(nextDue.status)} tone={scheduleTone(String(nextDue.status)) === 'red' ? 'danger' : scheduleTone(String(nextDue.status)) === 'amber' ? 'warn' : 'ink'} onClick={() => setRecMode('pay')} /> : null}
        </>
      ) : (
        <>
          <Metric label="상태" value={String(v?.status || (loc.work && loc.work !== '대기' ? loc.work : '휴차'))} tone={loc.work === '정비' || loc.work === '사고' ? 'warn' : 'ink'} />
          <Metric label="위치" value={locStr} tone={loc.work === '정비' || loc.work === '사고' ? 'warn' : 'ink'} />
          <Metric label="대기" value={idleDays != null ? `${idleDays}일` : '—'} tone={idleDays != null && idleDays > 180 ? 'danger' : idleDays != null && idleDays > 60 ? 'warn' : 'ink'} />
          <Metric label="최종 반납" value={lastReturn ? yy(lastReturn) : '—'} />
          {totalUnpaid > 0 ? <Metric label="미수(과거)" value={won(totalUnpaid)} tone="danger" onClick={() => goSec('v-schedule')} /> : null}
        </>
      )}
      <Metric
        label="검사만기"
        value={v?.inspectionTo ? yy(v.inspectionTo) : '—'}
        hint={inspD == null ? undefined : inspD < 0 ? `${-inspD}일 지남` : `D-${inspD}`}
        tone={inspD != null && inspD < 0 ? 'danger' : inspD != null && inspD <= 30 ? 'warn' : 'ink'}
        onClick={() => { startEdit(); goSec('v-reg'); }}
      />
      <Metric
        label="보험만기"
        value={insExp ? yy(insExp) : '—'}
        hint={curIns ? String(curIns.insurer || '') : undefined}
        tone={insD != null && insD < 0 ? 'danger' : insD != null && insD <= 30 ? 'warn' : 'ink'}
        onClick={() => { startEditIns(); goSec('v-insurance'); }}
      />
      {loanSum ? <Metric label="할부잔여" value={won(loanSum.remainPrincipal)} hint={`${loanSum.remainSeq || 0}회`} onClick={() => goSec('v-purchase')} /> : null}
      {pendDeposit ? <Metric label="보증금" value={won(pendDeposit.d.refund || pendDeposit.d.addCharge)} tone="warn" hint="미정산" onClick={() => goSec('v-deposit')} /> : null}
      {openPen.length ? <Metric label="과태료" value={`${openPen.length}건`} tone="warn" onClick={() => goSec('v-penalty')} /> : null}
      {engineLocked ? <Metric label="시동제어" value="잠금" tone="warn" onClick={() => goSec('v-gps')} /> : null}
    </Cards>
  );

  const contractKv = active ? (
    <div id="v-contract">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <SectionLabel mt={0} mb={0}>계약</SectionLabel>
        <span style={{ flex: 1 }} />
        <Btn variant="ghost" size="sm" onClick={() => openPrintDoc('contract', plate)}>출력</Btn>
        <Add type="contract" plate={plate} label="수정" />
      </div>
      <KV rows={[
        ['임차인', null, `${String(active.contractorName ?? '')}${active.contractorPhone ? ' · ' + String(active.contractorPhone) : ''}`],
        ['기간', null, `${yy(active.startDate)} ~ ${yy(effectiveEndDate(active))}${active.rentalMonths ? ` · ${active.rentalMonths}개월` : ''}`],
        ['월 대여료', null, active.monthlyRent ? won(active.monthlyRent) : ''],
        ['이체일', null, active.paymentDay ? `매월 ${active.paymentDay}일 · ${paymentTimingOf(active.paymentTiming)}` : ''],
        ['보증금', null, active.deposit ? won(active.deposit) : '—'],
        ['CDW', null, `${String(active.cdw ?? '')}${active.deductible ? ' · 면책 ' + won(active.deductible) : ''}`],
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
      </div>
      {(() => {
        const hd = docHistory(active, 'handover');
        return hd.length ? (
          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {hd.map((d, i) => d.url ? (
              <Btn key={i} size="sm" variant="ghost" onClick={() => window.open(d.url, '_blank')}>
                {d.reason || '인도 증거'} · {String(d.uploadedAt || '').slice(0, 10)}
              </Btn>
            ) : null)}
          </div>
        ) : null;
      })()}
    </div>
  ) : (
    <div id="v-contract">
      <SectionLabel mt={0} mb={8}>계약</SectionLabel>
      <EmptyState variant="sec">진행 중 계약 없음</EmptyState>
      <div style={{ marginTop: 8 }}><Add type="contract" plate={plate} label="+ 계약 담기" /></div>
    </div>
  );

  const assetKv = (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <SectionLabel mt={0} mb={0}>자산</SectionLabel>
        <span style={{ flex: 1 }} />
        <Btn variant="ghost" size="sm" onClick={() => { startEdit(); goSec('v-info'); }}>수정</Btn>
      </div>
      <KV rows={[
        ['차명', null, String(v?.carName ?? '—')],
        ['연식', null, String(v?.modelYear || v?.yearMonth || '—')],
        ['VIN', null, String(v?.vin ?? '—')],
        ['주행거리', null, v?.mileage != null && v?.mileage !== '' ? `${Number(v.mileage).toLocaleString('ko-KR')} km` : '—'],
        ['연료·정원', null, [v?.fuel, v?.seats ? `${v.seats}인` : ''].filter(Boolean).join(' · ') || '—'],
        ['검사만기', null, v?.inspectionTo ? yy(v.inspectionTo) : '—'],
      ] as KVRow[]} />
    </div>
  );

  const insKv = (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <SectionLabel mt={0} mb={0}>보험</SectionLabel>
        <span style={{ flex: 1 }} />
        <Btn variant="ghost" size="sm" onClick={() => { startEditIns(); goSec('v-insurance'); }}>{curIns ? '수정' : '+ 등록'}</Btn>
      </div>
      {curIns ? (
        <KV rows={[
          ['보험사', null, String(curIns.insurer ?? '—')],
          ['증권', null, String(curIns.policyNo ?? '—')],
          ['기간', null, `${yy(curIns.startDate)} ~ ${yy(curIns.endDate)}`],
          ['보험료', null, curIns.totalPremium ? won(curIns.totalPremium) : '—'],
          ['운전범위', null, String(curIns.driverScope ?? '—')],
        ] as KVRow[]} />
      ) : <EmptyState variant="sec">보험 미등록</EmptyState>}
    </div>
  );

  const payInline = active && recMode ? (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', padding: '4px 0 8px' }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, width: '100%' }}>{recMode === 'pay' ? '입금 입력' : '청구할인'}</span>
      <label style={fLab}><span style={fLl}>회차</span><Select value={recForm.seq} onChange={(e) => setRecForm((r) => ({ ...r, seq: e.target.value }))}>{schedule.map((s) => <option key={s.seq} value={s.seq}>{s.seq} · {s.dueDate}</option>)}</Select></label>
      <label style={fLab}><span style={fLl}>일자</span><Input type="date" value={recForm.date} onChange={(e) => setRecForm((r) => ({ ...r, date: e.target.value }))} /></label>
      <label style={fLab}><span style={fLl}>금액</span><Input type="number" value={recForm.amount} onChange={(e) => setRecForm((r) => ({ ...r, amount: e.target.value }))} placeholder="0" /></label>
      {recMode === 'pay'
        ? <label style={fLab}><span style={fLl}>수단</span><Select value={recForm.method} onChange={(e) => setRecForm((r) => ({ ...r, method: e.target.value }))}>{['계좌', 'CMS', '카드', '현금', '수동'].map((m) => <option key={m} value={m}>{m}</option>)}</Select></label>
        : <label style={fLab}><span style={fLl}>사유</span><Select value={recForm.reason} onChange={(e) => setRecForm((r) => ({ ...r, reason: e.target.value }))}>{['자가조치', '보상', '사은품', '캠페인', '기타'].map((m) => <option key={m} value={m}>{m}</option>)}</Select></label>}
      <Btn onClick={saveRecord}>{recMode === 'pay' ? '입금 저장' : '할인 저장'}</Btn>
      <Btn variant="ghost" onClick={() => setRecMode(null)}>취소</Btn>
    </div>
  ) : null;

  const schedulePeek = active && schedule.length > 0 ? (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <SectionLabel mt={0} mb={0}>수납</SectionLabel>
        {overdueN > 0 ? <Badge tone="red">미결 {overdueN}</Badge> : null}
        <span style={{ flex: 1 }} />
        <Btn size="sm" onClick={() => setRecMode(recMode === 'pay' ? null : 'pay')}>+ 입금</Btn>
        <Btn size="sm" variant="ghost" onClick={() => setRecMode(recMode === 'disc' ? null : 'disc')}>할인</Btn>
        <Btn size="sm" variant="ghost" onClick={() => goSec('v-schedule')}>전체 ›</Btn>
      </div>
      {payInline}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {schedule.filter((s) => String(s.status) !== '완료' || Number(s.balance) > 0).slice(0, wide ? 6 : 4).map((s) => (
          <button
            key={s.seq}
            type="button"
            onClick={() => { setRecForm((r) => ({ ...r, seq: String(s.seq), amount: s.balance > 0 ? String(s.balance) : '' })); setRecMode('pay'); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
              border: 'none', background: 'transparent', padding: '6px 0', cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: C.mute, minWidth: 28 }}>{s.seq}</span>
            <span style={{ fontSize: 12.5, color: C.ink, minWidth: 64 }}>{yy(s.dueDate)}</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: s.balance > 0 ? C.danger : C.mute }}>
              {s.balance > 0 ? won(s.balance) : won(s.paid)}
            </span>
            <Badge tone={scheduleTone(String(s.status))}>{String(s.status)}</Badge>
          </button>
        ))}
        {schedule.every((s) => String(s.status) === '완료') ? (
          <span style={{ fontSize: 12, color: C.faint }}>전 회차 완료</span>
        ) : null}
      </div>
    </div>
  ) : active ? (
    <div>
      <SectionLabel mt={0} mb={8}>수납</SectionLabel>
      <EmptyState variant="sec">스케줄 없음</EmptyState>
    </div>
  ) : null;

  const gpsBlock = v && (v.gpsDeviceId || v.gpsProvider) ? (
    <div id="v-gps" style={{ marginTop: wide ? 0 : 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <SectionLabel mt={0} mb={0}>GPS</SectionLabel>
        <span style={{ flex: 1 }} />
        {active ? (
          <span style={{ display: 'inline-flex', gap: 6 }}>
            <Btn size="sm" variant="danger" onClick={() => logIgnition('제어')} disabled={engineLocked}>시동 제어</Btn>
            <Btn size="sm" variant="ghost" onClick={() => logIgnition('해제')} disabled={!engineLocked}>해제</Btn>
          </span>
        ) : null}
      </div>
      <KV rows={[
        ['공급사', null, String(v.gpsProvider ?? '—')],
        ['단말', null, String(v.gpsDeviceId ?? '—')],
        ['시동제어', null, engineLocked ? `잠금 (${String(active?.engineDisabledAt || '').slice(0, 10)})` : String(v.gpsControl ?? '—')],
      ] as KVRow[]} />
    </div>
  ) : null;

  return (
    <Sec id="v-status" title="현황" desc="필수정보 · 그 자리에서 입금·반납·수정"
      right={
        <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
          {active ? <Btn size="sm" onClick={() => setRecMode(recMode === 'pay' ? null : 'pay')}>입금</Btn> : null}
          <Btn size="sm" variant="ghost" onClick={() => { startEdit(); goSec('v-info'); }}>차량수정</Btn>
        </span>
      }>
      {metrics}

      {wide ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: tier === 'ultra' ? '1.1fr 1fr 1fr 1fr' : '1.15fr 1fr 1fr',
          columnGap: tier === 'ultra' ? 28 : 24,
          rowGap: 8,
          alignItems: 'start',
          marginTop: 14,
        }}>
          {contractKv}
          {assetKv}
          {insKv}
          {tier === 'ultra' ? schedulePeek : null}
          {tier !== 'ultra' && schedulePeek ? <div style={{ gridColumn: '1 / -1' }}>{schedulePeek}</div> : null}
          {gpsBlock ? <div style={{ gridColumn: tier === 'ultra' ? 'auto' : '1 / -1' }}>{gpsBlock}</div> : null}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
          {contractKv}
          {assetKv}
          {insKv}
          {schedulePeek}
          {gpsBlock}
        </div>
      )}
    </Sec>
  );
}
