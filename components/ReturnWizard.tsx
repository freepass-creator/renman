'use client';
// 반납(입고) 현장 스텝 위저드 — 모바일 풀스크린 시트(Modal). 인도의 거울 + 정산 미리보기.
//   저장은 전부 기존 SSOT: 상태전이=patchReturn(단일 writer→반납) · 타임라인=saveIntake('history',category:'반납',_kind:'activity')
//   · 정산=computeReturnSettlement(정산서와 동일 계산) · 증거=uploadDoc+pushDocVersion(type:'handover',reason:'반납…') 계약 _docs.
import { useMemo, useState } from 'react';
import { PenLine } from 'lucide-react';
import { patchReturn, computeContractView, computeReturnSettlement, effectiveEndDate } from '@/lib/contract-ops';
import { getStore } from '@/lib/store';
import { commitUpdate } from '@/lib/commit';
import { saveIntake } from '@/lib/intake';
import { SignaturePad, dataUrlToFile } from '@/components/SignaturePad';
import { uploadDoc, docPath, storageReady } from '@/lib/storage';
import { pushDocVersion } from '@/lib/docs';
import { useSession } from '@/lib/session';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { resolveWriteCompany, NEED_COMPANY } from '@/lib/scope';
import { FUEL_LEVELS } from '@/lib/domain/fuel';
import { Modal, Stepper, Btn, Message, won, C, toggleStyle, WizCard, WizField, WizPhotos, wizInput, type Step } from '@/components/ui';
import { type EntityRecord } from '@/lib/intake/entities';
import { todayKST as TODAY } from '@/lib/contracts/dates'; // KST 기준 오늘(반납일 기록)
const STEP_LABELS = ['확인', '주행·연료', '정산', '사진·서명', '확정'];

export function ReturnWizard({ contract, vehicle, onClose, onDone }: {
  contract: EntityRecord; vehicle?: EntityRecord | null; onClose: () => void; onDone: () => void;
}) {
  const { companyId, user } = useSession();
  const target = resolveWriteCompany(companyId, contract);   // 모호하면 null → 저장 차단(임의 폴백 금지)
  const [step, setStep] = useState(0);
  const [date, setDate] = useState(TODAY());
  const [mileage, setMileage] = useState('');
  const [fuel, setFuel] = useState<string>(FUEL_LEVELS[0]);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [sigData, setSigData] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const plate = String(contract.plate || '');
  const who = String(contract.contractorName || '—');
  const contractNo = String(contract._key || contract.contractNo || '');
  const carName = String(vehicle?.carName || vehicle?.model || contract.carName || '');
  const baseMileage = Number(contract.mileageOut) || 0;
  const baseFuel = String(contract.fuelOut || '');
  const eff = effectiveEndDate(contract);
  const dday = eff ? Math.round((new Date(eff).getTime() - new Date(date).getTime()) / 86400000) : null;

  // 정산 미리보기 = 반납일 what-if(computeContractView) → 공용 computeReturnSettlement(정산서와 동일).
  const settle = useMemo(() => {
    const v = computeContractView({ ...contract, returnedDate: date, status: '반납' }, date);
    return computeReturnSettlement(Number(contract.deposit) || 0, v);
  }, [contract, date]);
  const drove = mileage ? Number(mileage) - baseMileage : null;

  async function commit() {
    if (!contractNo) { toast('계약 식별 불가', 'error'); return; }
    if (!target) { toast(NEED_COMPANY, 'error'); return; }
    setSaving(true);
    // 최신 상태 재확인 — 다른 기기/스테일 목록에서의 중복 반납(returnedDate 덮어쓰기·정산컷 이동) 방지. 단일 writer 보호.
    const fresh = await getStore().get('contract', target, contractNo);
    if (fresh && (fresh.returnedDate || ['반납', '해지', '채권'].includes(String(fresh.status || '')))) {
      haptic.error(); toast('이미 반납/종료 처리된 계약입니다', 'error'); setSaving(false); return;
    }
    // ── 핵심 저장(상태전이 + 반납 이력). histKey 결정적 → 재시도해도 이력 중복 없음.
    try {
      const extra: EntityRecord = { fuelIn: fuel };   // 반납 연료 정본 키(스키마·Vehicle360 표시와 정합)
      if (mileage) extra.returnMileage = Number(mileage);
      if (note.trim()) extra.returnSettleNote = note.trim();
      await commitUpdate({
        entity: 'contract', sessionCompanyId: companyId, rec: contract, key: contractNo,
        patch: patchReturn(contract, date, extra),
      });
      await saveIntake('history', target, [{
        plate, category: '반납',
        title: `반납(입고)${mileage ? ` · ${mileage}km` : ''} · 연료 ${fuel}`,
        date, author: user.name, customer: who, contractNo,
        companyId: target, _kind: 'activity', histKey: `${contractNo || plate}|반납|${date}`,
      }], { notify: false });
    } catch {
      haptic.error();
      toast('반납 저장 실패 — 다시 시도', 'error');
      setSaving(false);
      return;
    }
    // ── 증거(사진·서명) — best-effort, 별도 가드. 실패/미설정이어도 반납은 이미 완료.
    try {
      const files: { f: File; reason: string }[] = [
        ...photos.map((f) => ({ f, reason: '반납 사진' })),
        ...(() => { const sf = sigData ? dataUrlToFile(sigData, `반납서명_${Date.now()}.png`) : null; return sf ? [{ f: sf, reason: '반납 서명' }] : []; })(),
      ];
      if (files.length) {
        if (storageReady()) {
          let rec: EntityRecord = { ...contract };
          for (const { f, reason } of files) {
            const url = await uploadDoc(f, docPath(target, 'contract', contractNo, f.name));
            if (url) rec = { ...rec, _docs: pushDocVersion(rec, { type: 'handover', url, reason, by: user.name }) };
          }
          if (rec._docs) {
            await commitUpdate({
              entity: 'contract', sessionCompanyId: companyId, rec: contract, key: contractNo,
              patch: { _docs: rec._docs },
            });
          }
        } else {
          toast('저장소(Storage) 미설정 — 사진·서명은 건너뜀', 'info');
        }
      }
    } catch {
      toast('사진·서명 저장 실패 — 반납은 완료됨', 'info');
    }
    haptic.success();
    toast(`반납 완료 · ${plate}`, 'success');
    setSaving(false);
    onDone();
  }

  const steps: Step[] = STEP_LABELS.map((label, i) => ({ label, state: i < step ? 'done' : i === step ? 'current' : 'todo' }));
  const last = step === STEP_LABELS.length - 1;

  return (
    <Modal title={`반납 처리 · ${plate}`} meta={`${who}${carName ? ` · ${carName}` : ''}`} onClose={onClose} lock
      footer={<>
        <Btn variant="ghost" size="lg" onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))} disabled={saving}>{step === 0 ? '취소' : '이전'}</Btn>
        <span style={{ flex: 1 }} />
        {last
          ? <Btn variant="solid" size="lg" onClick={commit} disabled={saving}>{saving ? '저장 중…' : '반납 확정'}</Btn>
          : <Btn variant="solid" size="lg" onClick={() => { haptic.nav(); setStep((s) => s + 1); }}>다음</Btn>}
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Stepper steps={steps} />

        {/* 0. 확인 */}
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Message variant="info">이 계약을 <b>반납(입고)</b> 처리합니다. 반납 계기판·연료를 기록하고 정산을 확인한 뒤 사진·서명을 남깁니다.</Message>
            <WizCard>
              <Row k="차량" v={`${plate}${carName ? ` · ${carName}` : ''}`} />
              <Row k="계약자" v={who} />
              {contractNo && <Row k="계약번호" v={contractNo} mono />}
              <Row k="계약기간" v={`${String(contract.startDate || '')} ~ ${eff || '미정'}`} />
              {dday != null && <Row k="반납 시점" v={dday < 0 ? `반납예정 ${-dday}일 경과` : dday === 0 ? '오늘 반납예정' : `반납예정 D-${dday}`} />}
            </WizCard>
          </div>
        )}

        {/* 1. 주행·연료 */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <WizField label="반납일">
              <input type="date" value={date} max={TODAY()} onChange={(e) => { const v = e.target.value; setDate(v && v > TODAY() ? TODAY() : v); }} style={wizInput} />
            </WizField>
            <WizField label={<>반납 주행거리 (계기판 km) {baseMileage ? <span style={{ color: C.faint, fontWeight: 400 }}>· 출고 {baseMileage.toLocaleString()}km</span> : null}</>}>
              <input inputMode="numeric" value={mileage} onChange={(e) => setMileage(e.target.value.replace(/[^\d]/g, ''))} placeholder={baseMileage ? `${baseMileage} 이상` : '예: 47250'} style={{ ...wizInput, fontFamily: 'var(--font-mono)' }} />
              {drove != null && <div style={{ marginTop: 6, fontSize: 12.5, color: drove < 0 ? C.danger : C.mute }}>{drove < 0 ? '출고보다 작음 — 확인 필요' : `주행 ${drove.toLocaleString()}km`}</div>}
            </WizField>
            <WizField label={<>반납 연료량 {baseFuel ? <span style={{ color: C.faint, fontWeight: 400 }}>· 출고 {baseFuel}</span> : null}</>}>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {FUEL_LEVELS.map((f) => (
                  <button key={f} type="button" data-ui="toggle" onClick={() => { setFuel(f); haptic.select(); }} aria-pressed={fuel === f} style={toggleStyle(fuel === f, 'lg')}>{f}</button>
                ))}
              </div>
            </WizField>
          </div>
        )}

        {/* 2. 정산 */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <WizCard gap={9}>
              <Row k="미납 대여료 (일할정산 반영)" v={won(settle.unpaid)} strong={settle.unpaid > 0} />
              <Row k="예치 보증금" v={won(settle.deposit)} />
              <Row k="보증금 충당" v={settle.offset ? `−${won(settle.offset)}` : won(0)} muted />
              <div style={{ borderTop: `2px solid ${C.ink}`, margin: '2px 0' }} />
              {settle.addCharge > 0
                ? <Row k="추가 청구액 (임차인 납부)" v={won(settle.addCharge)} strong danger />
                : <Row k="보증금 반환액 (임차인 환급)" v={won(settle.refund)} strong />}
            </WizCard>
            <WizField label="정산 특이사항 (손상·연료차액·과태료 등)">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 우측 도어 스크래치, 연료 1/4 부족" rows={3} style={{ ...wizInput, height: 'auto', padding: '10px 12px', fontFamily: 'inherit', resize: 'vertical' }} />
            </WizField>
            <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.6 }}>※ 정산서(출력)와 동일 계산입니다. 손상·연료차액·미회수 과태료는 특이사항에 남기면 별도 청구 근거가 됩니다.</div>
          </div>
        )}

        {/* 3. 사진·서명 */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {!storageReady() && <Message variant="warning">저장소(Storage)가 미설정이라 사진·서명은 저장되지 않습니다. 반납 처리·정산은 정상 완료됩니다.</Message>}
            <WizField label="입고 사진 (외관·계기판·손상부)">
              <WizPhotos files={photos} onChange={setPhotos} onTap={haptic.tap} />
            </WizField>
            <WizField label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><PenLine size={14} /> 반납 확인 서명 (고객)</span>}>
              <SignaturePad onChange={setSigData} height={170} label="고객이 여기에 서명" />
            </WizField>
          </div>
        )}

        {/* 4. 확정 */}
        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Message variant="info">아래 내용으로 반납을 확정하면 계약이 <b>반납</b> 상태로 전환되고 정산이 확정됩니다.</Message>
            <WizCard>
              <Row k="차량" v={`${plate}${carName ? ` · ${carName}` : ''}`} />
              <Row k="계약자" v={who} />
              <Row k="반납일" v={date} />
              <Row k="반납 주행거리" v={mileage ? `${Number(mileage).toLocaleString()} km${drove != null && drove >= 0 ? ` (주행 ${drove.toLocaleString()})` : ''}` : '미입력'} />
              <Row k="반납 연료" v={fuel} />
              <div style={{ borderTop: `1px solid ${C.line}`, margin: '2px 0' }} />
              {settle.addCharge > 0
                ? <Row k="추가 청구액" v={won(settle.addCharge)} strong danger />
                : <Row k="보증금 반환액" v={won(settle.refund)} strong />}
              <Row k="사진 / 서명" v={`${photos.length}장 / ${sigData ? '있음' : '없음'}`} />
            </WizCard>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Row({ k, v, mono, strong, danger, muted }: { k: string; v: string; mono?: boolean; strong?: boolean; danger?: boolean; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: strong ? 15 : 13.5, alignItems: 'baseline' }}>
      <span style={{ color: C.mute, minWidth: 92 }}>{k}</span>
      <span style={{ flex: 1 }} />
      <span style={{ color: danger ? C.danger : muted ? C.faint : C.ink, fontWeight: strong ? 800 : 700, fontFamily: mono ? 'var(--font-mono)' : 'inherit' }}>{v}</span>
    </div>
  );
}
