'use client';
import { Sec, Btn, Badge, EmptyState, Input, Select, KV, th, thR, td, tdR, won, C, type KVRow } from '@/components/ui';
import { computeContractView } from '@/lib/contract-ops';
import { openPrintDoc } from '@/lib/ui-bus';
import { TODAY } from '@/lib/dashboard-consts';
import { yy, scheduleTone } from '../useVehicleDetail';
import { fLab, fLl, PrintMenu, type PanelProps } from './shared';

export function SchedulePanel({ plate, vd }: PanelProps) {
  const {
    active, pastContracts, schedule, totalUnpaid, recMode, setRecMode, recForm, setRecForm, saveRecord,
  } = vd;
  if (!(active || pastContracts.length > 0)) return null;
  return (
    <Sec id="v-schedule" title="수납 스케줄" n={active ? schedule.length : pastContracts.length} desc={active ? '회차별 청구·미납 · 미수관리' : '이전 계약 수납 이력'}
      right={active ? <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <Btn onClick={() => setRecMode(recMode === 'pay' ? null : 'pay')}>+ 입금</Btn>
        <Btn variant="ghost" onClick={() => setRecMode(recMode === 'disc' ? null : 'disc')}>+ 청구할인</Btn>
        <PrintMenu items={[
          { label: '영수증', run: () => openPrintDoc('receipt', plate) },
          ...(totalUnpaid > 0 ? [{ label: '내용증명', run: () => openPrintDoc('notice', plate) }] : []),
        ]} />
      </span> : undefined}>
      {active && recMode ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', padding: '8px 0 12px', marginBottom: 4 }}>
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
            <div style={{ maxHeight: 460, overflow: 'auto' }}>
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
            </div>}
        </>
      ) : null}
      {pastContracts.length > 0 ? (
        <div style={{ marginTop: active ? 14 : 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: C.mute, marginBottom: 8 }}>이전 계약 수납</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {pastContracts.map((c) => {
              const pv = computeContractView(c, TODAY);
              return (
                <div key={String(c._key || c.contractNo)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
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
    </Sec>
  );
}

export function DepositPanel({ plate, vd }: PanelProps) {
  const { pendDeposit, settleDeposit } = vd;
  if (!pendDeposit) return null;
  return (
    <Sec id="v-deposit" title="보증금 정산" n={1} tone="warn" desc={`${String(pendDeposit.c.contractorName || '')} · 반납 ${String(pendDeposit.c.returnedDate || '')} · 미정산`}
      right={<span style={{ display: 'inline-flex', gap: 6 }}><Btn variant="ghost" onClick={() => openPrintDoc('settlement', plate)}>정산서</Btn><Btn onClick={settleDeposit}>보증금 반환 처리</Btn></span>}>
      <KV rows={[
        ['예치 보증금', '', won(pendDeposit.d.deposit)],
        ['미납 대여료(일할)', '', pendDeposit.d.unpaid ? won(pendDeposit.d.unpaid) : '—'],
        ['보증금 충당', '', pendDeposit.d.offset ? '-' + won(pendDeposit.d.offset) : '—'],
        pendDeposit.d.addCharge > 0
          ? ['추가 청구액', '', won(pendDeposit.d.addCharge)] as KVRow
          : ['반환액', '', won(pendDeposit.d.refund)] as KVRow,
      ] as KVRow[]} />
    </Sec>
  );
}

export function HandoverPanel({ plate, vd }: PanelProps) {
  const { hist, active, reco } = vd;
  if (!(hist.count > 0)) return null;
  return (
    <Sec id="v-handover" title="손바뀜 이력" n={hist.count}
      desc={hist.count >= 2 ? `${hist.count}손 · 첫 ${won(hist.firstRent)} → 현재 ${won(hist.lastRent)}${hist.totalDropPct > 0 ? ` · 누적 ${hist.totalDropPct}%↓` : ''}` : '첫 대여 · 손바뀜 없음'}
      right={hist.count > 1 ? <a href={`/contract-history?plate=${encodeURIComponent(plate)}`} style={{ fontSize: 11.5, color: C.accent, fontWeight: 700, textDecoration: 'none' }}>계약이력 →</a> : undefined}>
      {!active && reco ? <div style={{ marginBottom: 12, padding: '8px 0' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, color: C.accent, letterSpacing: '0.02em' }}>재렌트 추천</span>
          <span style={{ fontSize: 21, fontWeight: 800, color: C.ink, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{won(reco.recommended)}</span>
          <span style={{ fontSize: 12.5, color: C.mute }}>현재 {won(reco.currentRent)} · <b style={{ color: C.danger }}>{reco.dropPct}%↓</b></span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: C.faint, fontFamily: 'var(--font-mono)' }}>밴드 {won(reco.low)}~{won(reco.high)}</span>
        </div>
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 6 }}>{reco.basis}</div>
      </div> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {hist.steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', background: s.phase === '운행' ? undefined : 'var(--bg-stripe)' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: s.phase === '운행' ? C.accent : C.mute, minWidth: 26 }}>{s.seq}손</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.customer || '—'}</div>
              <div style={{ fontSize: 11, color: C.faint }}>{yy(s.start)}{s.phase === '운행' ? ' · 운행중' : ' · 종료'}{s.net > 0 ? ` · 미수 ${won(s.net)}` : ''}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{won(s.rent)}</div>
              {s.drop > 0 ? <div style={{ fontSize: 11, color: C.danger, fontWeight: 700 }}>-{won(s.drop)} · {s.dropPct}%↓</div> : <div style={{ fontSize: 11, color: C.faint }}>{i === 0 ? '첫 대여' : '동결'}</div>}
            </div>
          </div>
        ))}
      </div>
    </Sec>
  );
}
