'use client';
// 인도(출차) 현장 스텝 위저드 — 모바일 풀스크린 시트(Modal). 계기판·연료·사진·서명을 단계로 받아 인도 확정.
//   저장은 전부 기존 SSOT로: 상태전이=patchDeliver(단일 writer) · 타임라인=saveIntake('history',_kind:'activity')
//   · 증거=uploadDoc+pushDocVersion(type:'handover') 계약 _docs 첨부. 새 저장로직(손롤) 없음.
import { useState } from 'react';
import { PenLine } from 'lucide-react';
import { patchDeliver } from '@/lib/contract-ops';
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
import { Modal, Stepper, Btn, Message, C, toggleStyle, WizCard, WizField, WizPhotos, wizLabel, wizInput, type Step } from '@/components/ui';
import { type EntityRecord } from '@/lib/intake/entities';
import { todayKST as TODAY } from '@/lib/contracts/dates'; // KST 기준 오늘(인도일 기록)
const STEP_LABELS = ['확인', '주행·연료', '사진·서명', '확정'];

export function DeliveryWizard({ contract, vehicle, onClose, onDone }: {
  contract: EntityRecord; vehicle?: EntityRecord | null; onClose: () => void; onDone: () => void;
}) {
  const { companyId, user } = useSession();
  const target = resolveWriteCompany(companyId, contract);   // 모호하면 null → 저장 차단(임의 폴백 금지 = 타 법인 오배치 방지)
  const [step, setStep] = useState(0);
  const [date, setDate] = useState(TODAY());
  const [mileage, setMileage] = useState('');
  const [fuel, setFuel] = useState<string>(FUEL_LEVELS[0]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [sigData, setSigData] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const plate = String(contract.plate || '');
  const who = String(contract.contractorName || '—');
  const contractNo = String(contract._key || contract.contractNo || '');
  const carName = String(vehicle?.carName || vehicle?.model || contract.carName || '');
  const period = [contract.startDate, contract.endDate].filter(Boolean).join(' ~ ');

  async function commit() {
    if (!contractNo) { toast('계약 식별 불가', 'error'); return; }
    if (!target) { toast(NEED_COMPANY, 'error'); return; }
    setSaving(true);
    // 최신 상태 재확인 — 다른 기기/스테일 목록에서의 중복 인도 방지. 단일 writer 보호.
    const fresh = await getStore().get('contract', target, contractNo);
    if (fresh && (fresh.deliveredDate || ['운행', '반납', '해지', '채권'].includes(String(fresh.status || '')))) {
      haptic.error(); toast('이미 인도 처리된 계약입니다', 'error'); setSaving(false); return;
    }
    // ── 핵심 저장(상태전이 + 인도 이력) — 이것만 실패 시 전체 실패로 보고. histKey가 결정적이라 재시도해도 이력 중복 없음.
    try {
      const extra: EntityRecord = { fuelOut: fuel };
      if (mileage) extra.mileageOut = Number(mileage);
      await commitUpdate({
        entity: 'contract', sessionCompanyId: companyId, rec: contract, key: contractNo,
        patch: patchDeliver(contract, date, extra),
      });
      await saveIntake('history', target, [{
        plate, category: '인도',
        title: `출고(인도)${mileage ? ` · ${mileage}km` : ''} · 연료 ${fuel}`,
        date, author: user.name, customer: who, contractNo,
        companyId: target, _kind: 'activity', histKey: `${contractNo || plate}|인도|${date}`,
      }], { notify: false });
    } catch {
      haptic.error();
      toast('인도 저장 실패 — 다시 시도', 'error');
      setSaving(false);
      return;
    }
    // ── 증거(사진·서명) — best-effort, 별도 가드. 실패/미설정이어도 인도는 이미 완료(전체 실패로 보고·재시도 유도 안 함).
    try {
      const files: { f: File; reason: string }[] = [
        ...photos.map((f) => ({ f, reason: '인도 사진' })),
        ...(() => { const sf = sigData ? dataUrlToFile(sigData, `인도서명_${Date.now()}.png`) : null; return sf ? [{ f: sf, reason: '인수 서명' }] : []; })(),
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
      toast('사진·서명 저장 실패 — 인도는 완료됨', 'info');
    }
    haptic.success();
    toast(`인도 완료 · ${plate}`, 'success');
    setSaving(false);
    onDone();
  }

  const steps: Step[] = STEP_LABELS.map((label, i) => ({ label, state: i < step ? 'done' : i === step ? 'current' : 'todo' }));
  const last = step === STEP_LABELS.length - 1;

  return (
    <Modal title={`인도 처리 · ${plate}`} meta={`${who}${carName ? ` · ${carName}` : ''}`} onClose={onClose} lock
      footer={<>
        <Btn variant="ghost" size="lg" onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))} disabled={saving}>{step === 0 ? '취소' : '이전'}</Btn>
        <span style={{ flex: 1 }} />
        {last
          ? <Btn variant="solid" size="lg" onClick={commit} disabled={saving}>{saving ? '저장 중…' : '인도 확정'}</Btn>
          : <Btn variant="solid" size="lg" onClick={() => { haptic.nav(); setStep((s) => s + 1); }}>다음</Btn>}
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Stepper steps={steps} />

        {/* 0. 확인 */}
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Message variant="info">이 계약을 <b>인도(출차)</b> 처리합니다. 계기판·연료를 기록하고 사진·서명을 남기면 반납 정산의 기준이 됩니다.</Message>
            <WizCard>
              <Row k="차량" v={`${plate}${carName ? ` · ${carName}` : ''}`} />
              <Row k="계약자" v={who} />
              {contractNo && <Row k="계약번호" v={contractNo} mono />}
              {period && <Row k="계약기간" v={period} />}
            </WizCard>
          </div>
        )}

        {/* 1. 주행·연료 */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <WizField label="인도일">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={wizInput} />
            </WizField>
            <WizField label="출고 주행거리 (계기판 km)">
              <input inputMode="numeric" value={mileage} onChange={(e) => setMileage(e.target.value.replace(/[^\d]/g, ''))} placeholder="예: 43120" style={{ ...wizInput, fontFamily: 'var(--font-mono)' }} />
            </WizField>
            <WizField label="출고 연료량">
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {FUEL_LEVELS.map((f) => (
                  <button key={f} type="button" data-ui="toggle" onClick={() => { setFuel(f); haptic.select(); }} aria-pressed={fuel === f} style={toggleStyle(fuel === f, 'lg')}>{f}</button>
                ))}
              </div>
            </WizField>
          </div>
        )}

        {/* 2. 사진·서명 */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {!storageReady() && <Message variant="warning">저장소(Storage)가 미설정이라 사진·서명은 저장되지 않습니다. 인도 처리(계기판·연료)는 정상 완료됩니다.</Message>}
            <WizField label="출차 사진 (외관·계기판)">
              <WizPhotos files={photos} onChange={setPhotos} onTap={haptic.tap} />
            </WizField>
            <WizField label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><PenLine size={14} /> 인수 확인 서명 (고객)</span>}>
              <SignaturePad onChange={setSigData} height={170} label="고객이 여기에 서명" />
            </WizField>
          </div>
        )}

        {/* 3. 확정 */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Message variant="info">아래 내용으로 인도를 확정하면 계약이 <b>운행</b> 상태로 전환됩니다.</Message>
            <WizCard>
              <Row k="차량" v={`${plate}${carName ? ` · ${carName}` : ''}`} />
              <Row k="계약자" v={who} />
              <Row k="인도일" v={date} />
              <Row k="출고 주행거리" v={mileage ? `${Number(mileage).toLocaleString()} km` : '미입력'} />
              <Row k="출고 연료" v={fuel} />
              <Row k="사진" v={`${photos.length}장`} />
              <Row k="서명" v={sigData ? '있음' : '없음'} />
            </WizCard>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: 13.5 }}>
      <span style={{ color: C.mute, minWidth: 84 }}>{k}</span>
      <span style={{ color: C.ink, fontWeight: 700, fontFamily: mono ? 'var(--font-mono)' : 'inherit' }}>{v}</span>
    </div>
  );
}
