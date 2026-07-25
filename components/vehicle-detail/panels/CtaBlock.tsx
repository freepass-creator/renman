'use client';
import { Btn, Input, Select, won, C } from '@/components/ui';
import { patchExtend, earlyTerminationFee } from '@/lib/contract-ops';
import { FUEL_LEVELS } from '@/lib/domain/fuel';
import { yy } from '../useVehicleDetail';
import { fLab, fLl, type PanelProps } from './shared';

/** 반납/연장/해지 · 인도 CTA + 폼 (레일 버튼용 / 작업면 폼용) */
export function CtaButtons({ focus, vd }: Pick<PanelProps, 'focus' | 'vd'>) {
  const { active, waiting, txMode, setTxMode, dlvOpen, setDlvOpen } = vd;
  if (active) {
    return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className={focus === 'return' ? 'attn-btn' : undefined}>
          <Btn variant={txMode === 'return' ? 'solid' : txMode ? 'ghost' : 'solid'} onClick={() => setTxMode(txMode === 'return' ? null : 'return')}>반납 처리</Btn>
        </span>
        <Btn variant={txMode === 'extend' ? 'solid' : 'ghost'} onClick={() => setTxMode(txMode === 'extend' ? null : 'extend')}>연장</Btn>
        <Btn variant={txMode === 'terminate' ? 'danger' : 'ghost'} onClick={() => setTxMode(txMode === 'terminate' ? null : 'terminate')}>중도해지</Btn>
      </div>
    );
  }
  if (waiting && !dlvOpen) {
    return <Btn onClick={() => setDlvOpen(true)}>인도(출고) 처리</Btn>;
  }
  return null;
}

export function CtaForms({ vd }: Pick<PanelProps, 'vd'>) {
  const {
    active, waiting, reco, txMode, setTxMode, txForm, setTxForm, commitTx,
    dlvOpen, setDlvOpen, dlvForm, setDlvForm, commitDeliver,
  } = vd;

  if (active && txMode) {
    return (
      <div style={{ padding: '8px 0 4px' }}>
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
      </div>
    );
  }

  if (waiting && dlvOpen) {
    return (
      <div style={{ padding: '8px 0 4px' }}>
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
    );
  }

  return null;
}
