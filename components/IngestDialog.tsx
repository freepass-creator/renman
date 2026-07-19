'use client';
import { useState, useEffect } from 'react';
import { useSession } from '@/lib/session';
import { ALL_COMPANIES, COMPANIES, companyLabel } from '@/lib/companies';
import { getStore } from '@/lib/store';
import { saveIntake, resolveAnchor, normalizePlate } from '@/lib/intake';
import { ENTITIES, mapOcrToEntity, type EntityRecord, type Field } from '@/lib/intake/entities';
import { callOcrExtract, type OcrOriginal } from '@/lib/ocr-client';
import { uploadDoc, docPath, storageReady } from '@/lib/storage';
import { pushDocVersion } from '@/lib/docs';
import { Modal, FormGrid, Btn, Badge, StatusTag, OcrCrosscheck, ActionGrid, ActionTile, ListBox, ListRow, Input, Select, C } from '@/components/ui';
import { type CrosscheckResult } from '@/lib/ocr-crosscheck';
import { Car, FileText, ShieldCheck, Receipt, User, Wrench, UploadCloud, Wallet } from 'lucide-react';

// 문서 유형 = 엔티티. 실무자는 "무슨 서류를 담나"로 진입 → 전부 차(plate)에 붙음.
const DOC_TYPES = [
  { key: 'vehicle', label: '차량 등록', doc: '자동차등록증', Icon: Car },
  { key: 'contract', label: '계약', doc: '렌탈·구독 계약서', Icon: FileText },
  { key: 'insurance', label: '보험', doc: '자동차보험증권', Icon: ShieldCheck },
  { key: 'penalty', label: '과태료', doc: '과태료·통행료 고지서', Icon: Receipt },
  { key: 'customer', label: '손님', doc: '운전면허증', Icon: User },
  { key: 'history', label: '이력·비용', doc: '정비·검사·주유·통행료', Icon: Wrench },
  { key: 'bank_tx', label: '계좌 입출금', doc: '은행 거래내역 (회사·계좌번호)', Icon: Wallet },
];
// 차량(plate)에 꽂히는 유형 = 앵커 우선(차량번호 먼저 고르고 입력). 손님·계좌는 차에 안 붙음(앵커 없음).
const VEHICLE_ANCHORED = new Set(['vehicle', 'contract', 'insurance', 'penalty', 'history']);
// 빠른입력 필드(핵심만) — 40개 다 보이면 실무자가 질림. 나머지는 360에서 편집.
const QUICK: Record<string, string[]> = {
  vehicle: ['plate', 'carName', 'maker', 'status', 'firstReg', 'vin', 'displacement', 'fuel', 'acquisitionPrice', 'inspectionTo', 'insuranceCompany', 'insuranceExpiryDate'],
  contract: ['contractNo', 'contractorName', 'contractorPhone', 'contractorBirth', 'plate', 'carName', 'startDate', 'endDate', 'rentalMonths', 'monthlyRent', 'deposit', 'status'],
  insurance: ['policyNo', 'insurer', 'plate', 'startDate', 'endDate', 'driverAge', 'totalPremium', 'paidPremium'],
  penalty: ['docType', 'noticeNo', 'issuer', 'plate', 'violationDate', 'description', 'amount', 'dueDate'],
  customer: ['name', 'licenseNo', 'licenseType', 'birth', 'phone', 'address'],
  history: ['plate', 'date', 'category', 'title', 'vendor', 'cost', 'status'],
  bank_tx: ['account', 'txDate', 'counterparty', 'amount', 'withdraw', 'method'],
};

export function IngestDialog({ onClose, onSaved, presetPlate, presetType, editRec, editType }: { onClose: () => void; onSaved: () => void; presetPlate?: string; presetType?: string; editRec?: EntityRecord; editType?: string }) {
  const { companyId, user } = useSession();
  const editing = !!(editRec && editType && ENTITIES[editType]);   // 기존 레코드 정정 모드
  const [co, setCo] = useState<string>(editRec?.companyId ? String(editRec.companyId) : (companyId === ALL_COMPANIES ? COMPANIES[0] : companyId));
  const target = co; // 이 입력이 귀속될 법인
  const [type, setType] = useState<string | null>(editing ? editType! : (presetType && ENTITIES[presetType] ? presetType : null));
  const [form, setForm] = useState<EntityRecord>(editRec ? { ...editRec } : (presetPlate ? { plate: normalizePlate(presetPlate) } : {}));
  const [saving, setSaving] = useState(false);
  // 서류 첨부 → OCR 자동채움. 문서 유형(entity.ocrType 존재)만. 원본 파일 URL + OCR 스냅샷 보존.
  const [docBusy, setDocBusy] = useState(false);
  const [doc, setDoc] = useState<{ name: string; url: string; ocr?: Record<string, unknown>; ocrOriginal?: OcrOriginal; crosscheck?: CrosscheckResult; ok: boolean } | null>(null);
  // 앵커(차량) 우선 — 차량번호를 먼저 확정하면 입력칸이 열린다. presetPlate로 열리면 이미 확정.
  const [vehicles, setVehicles] = useState<EntityRecord[]>([]);
  const [anchorConfirmed, setAnchorConfirmed] = useState<boolean>(!!presetPlate || editing);
  const [plateQuery, setPlateQuery] = useState<string>(presetPlate || '');

  const entity = type ? ENTITIES[type] : null;
  const anchored = type ? VEHICLE_ANCHORED.has(type) : false;
  const hasCarName = !!entity?.fields.some((f) => f.key === 'carName');
  // 앵커 유형은 plate를 앵커 픽커가 소유 → 폼 필드에서 제외(중복 방지).
  const fields: Field[] = entity
    ? (QUICK[type!] || []).map((k) => entity.fields.find((f) => f.key === k)).filter(Boolean).filter((f) => !(anchored && (f as Field).key === 'plate')) as Field[]
    : [];

  // 앵커 유형이면 해당 회사 차량 로드(자동완성 소스). 회사·유형 바뀌면 재조회.
  useEffect(() => {
    if (!anchored) return;
    let alive = true;
    getStore().list('vehicle', target).then((vs) => { if (alive) setVehicles(vs); }).catch(() => {});
    return () => { alive = false; };
  }, [target, anchored]);

  // preset/확정된 앵커의 차명 프리필(폼에 carName 필드가 있고 비어 있을 때).
  useEffect(() => {
    if (!anchored || !anchorConfirmed || !hasCarName) return;
    const p = String(form.plate || ''); if (!p || form.carName) return;
    const hit = resolveAnchor(vehicles, p);
    if (hit?.carName) setForm((f) => (f.carName ? f : { ...f, carName: String(hit.carName) }));
  }, [vehicles, anchored, anchorConfirmed, hasCarName, form.plate, form.carName]);

  const qText = plateQuery.trim();
  const q = normalizePlate(plateQuery);
  const suggestions = (q ? vehicles.filter((v) => normalizePlate(v.plate).includes(q) || (qText && String(v.carName || '').includes(qText))) : vehicles).slice(0, 8);
  const exactMatch = resolveAnchor(vehicles, plateQuery);
  const anchorHit = resolveAnchor(vehicles, String(form.plate || ''));
  const anchorCarName = String(form.carName || anchorHit?.carName || '');

  function pickAnchor(v: EntityRecord) {
    const p = normalizePlate(v.plate);
    setForm((f) => ({ ...f, plate: p, ...(hasCarName && !f.carName && v.carName ? { carName: String(v.carName) } : {}) }));
    setPlateQuery(String(v.plate || ''));
    setAnchorConfirmed(true);
  }
  function newAnchor() {
    setForm((f) => ({ ...f, plate: normalizePlate(qText) }));
    setAnchorConfirmed(true);
  }

  // 서류 파일 선택 즉시 — Storage 업로드 + OCR 병렬 실행. OCR 성공 시 빈 칸만 자동채움(수기 보존).
  // 실패해도 조용히 수기 입력 가능. 원본 파일 URL·OCR 스냅샷은 저장 시 레코드에 영구 보존.
  async function onDocFile(f: File | null | undefined) {
    if (!f || !entity?.ocrType) return;
    setDocBusy(true); setDoc(null);
    const recordKey = String(form.plate || form[entity.idFrom] || 'new');
    const upP = uploadDoc(f, docPath(target, entity.key, recordKey, f.name)).catch(() => null);
    const ocrP = callOcrExtract(f, entity.ocrType);
    const [url, res] = await Promise.all([upP, ocrP]);
    if (res.ok && res.raw) {
      const mapped = mapOcrToEntity(entity.key, res.raw);
      setForm((cur) => {
        const next = { ...cur };
        for (const [k, val] of Object.entries(mapped)) {
          if (val != null && val !== '' && (next[k] == null || next[k] === '')) next[k] = val;
        }
        return next;
      });
    }
    setDoc({ name: f.name, url: url || '', ocr: res.ok ? res.raw : undefined, ocrOriginal: res.ocrOriginal, crosscheck: res.crosscheck, ok: res.ok });
    setDocBusy(false);
  }

  const canSave = !!entity && (!anchored || (anchorConfirmed && !!String(form.plate || '').trim()));

  async function save() {
    if (!entity || !canSave) return;
    setSaving(true);
    try {
      const rec: EntityRecord = { ...form, companyId: target };
      // 첨부·OCR한 서류가 있으면 원본 URL + OCR 스냅샷을 레코드에 실어 저장(원본 보존 · 고아 방지).
      if (doc) {
        rec._docs = pushDocVersion(editing ? editRec! : null, { type: entity.key, url: doc.url, ocr: doc.ocr, reason: editing ? '정정' : '등록', by: user.name });
        if (doc.ocrOriginal) rec._ocrOriginal = doc.ocrOriginal;
      }
      if (editing) {
        // 정정 = 기존 레코드 부분갱신(자연키·_key 보존, 감사는 store.update). 신규생성 아님.
        await getStore().update(entity.key, String(editRec!.companyId || target), String(editRec!._key || ''), rec);
      } else {
        // 단일 파이프라인 통과(정규화 균일). onSaved가 이미 반영(notifySaved) → 이중반영 방지로 notify:false.
        await saveIntake(entity.key, target, [rec], { notify: false });
      }
      onSaved(); onClose();
    } finally { setSaving(false); }
  }

  const anchorLabel = type === 'vehicle' ? '이 차량으로 등록됩니다' : '이 차에 꽂힙니다';

  return (
    <Modal title={editing ? `정정 — ${entity!.label}` : entity ? `입력 — ${entity.label}` : '입력 — 무엇을 등록할까요?'} meta={editing ? '기존 레코드 수정' : entity ? entity.source : '새 데이터를 시스템에 넣습니다'} onClose={onClose} width={entity ? 720 : 520}
      footer={entity ? <><Btn onClick={save} disabled={saving || !canSave}>{saving ? '저장 중…' : editing ? '정정 저장' : '저장'}</Btn>{!editing && <Btn variant="ghost" onClick={() => setType(null)}>← 유형</Btn>}<span style={{ flex: 1 }} /><span style={{ fontSize: 11.5, color: C.faint }}>{companyLabel(co)}{editing ? '' : '에 저장'}</span></> : undefined}>
      {!entity ? (
        <ActionGrid>
          {DOC_TYPES.map((d) => (
            <ActionTile key={d.key} icon={<d.Icon size={22} color={C.sub} strokeWidth={1.8} />} label={d.label} desc={d.doc} onClick={() => setType(d.key)} />
          ))}
        </ActionGrid>
      ) : (
        <>
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 11.5, color: C.mute, fontWeight: 700 }}>회사(법인)</label>
            <Select value={co} onChange={(e) => setCo(e.target.value)}>
              {COMPANIES.map((c) => <option key={c} value={c}>{companyLabel(c)}</option>)}
            </Select>
            <span style={{ fontSize: 11, color: C.faint }}>이 법인에 귀속됩니다</span>
          </div>

          {/* 앵커 우선 — 차량번호를 먼저 확정("어디에 꽂힐지 감안해서 입력"). 확정 전엔 입력칸이 안 열림. */}
          {anchored && !anchorConfirmed ? (
            <div>
              <label style={{ fontSize: 11.5, color: C.mute, fontWeight: 700, display: 'block', marginBottom: 5 }}>
                {type === 'vehicle' ? '차량번호 — 등록할 차 (기존이면 목록에서 선택)' : '차량번호 — 어디에 꽂을지 먼저 고르세요'}
              </label>
              <Input autoFocus value={plateQuery} onChange={(e) => setPlateQuery(e.target.value)}
                placeholder="차량번호 입력 (예: 24가1005) · 차명으로도 검색"
                style={{ width: '100%', borderColor: C.accent, fontSize: 15 }} />
              <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                <ListBox>
                  {suggestions.map((v) => (
                    <ListRow key={String(v.plate)} onClick={() => pickAnchor(v)}
                      main={<span style={{ fontFamily: 'var(--font-mono)' }}>{String(v.plate)}</span>}
                      sub={String(v.carName || '')}
                      right={<StatusTag value={v.status} />} />
                  ))}
                  {qText && !exactMatch ? (
                    <ListRow onClick={newAnchor} main={<span style={{ color: C.accent }}>+ 신규 차량으로 등록: {qText}</span>} />
                  ) : null}
                  {!suggestions.length && !qText ? (
                    <ListRow main={<span style={{ color: C.faint, fontWeight: 500 }}>이 회사에 등록된 차량이 없습니다 — 차량번호를 입력해 신규 등록</span>} />
                  ) : null}
                </ListBox>
              </div>
              <div style={{ marginTop: 8, fontSize: 11.5, color: C.faint }}>차량을 고르면 입력칸이 열립니다. 모든 기록이 이 <b>차량번호</b>로 연결됩니다.</div>
            </div>
          ) : (
            <>
              {anchored ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '11px 13px', border: `1px solid ${C.accent}`, borderRadius: 'var(--radius)', background: 'var(--bg-card)', boxShadow: '0 0 0 3px rgba(37,99,235,0.08)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>→ {anchorLabel}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 15, color: C.ink }}>{String(form.plate || '')}</span>
                  {anchorCarName ? <span style={{ color: C.mute, fontSize: 12.5 }}>{anchorCarName}</span> : null}
                  {anchorHit ? <Badge tone="blue">기존 차량</Badge> : <Badge tone="amber">신규 차량</Badge>}
                  <span style={{ flex: 1 }} />
                  <Btn variant="ghost" size="sm" onClick={() => setAnchorConfirmed(false)}>변경</Btn>
                </div>
              ) : null}
              {entity.ocrType ? (
                <>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 15px', border: `1.5px dashed ${doc?.ok ? C.accent : C.line}`, borderRadius: 'var(--radius)', background: 'var(--bg-card)', cursor: docBusy ? 'wait' : 'pointer', fontSize: 12.5, color: C.mute }}>
                  <UploadCloud size={17} color={C.sub} strokeWidth={1.8} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {docBusy
                      ? <b style={{ color: C.ink }}>분석 중… <span style={{ fontWeight: 400, color: C.faint }}>Storage 업로드 · OCR 추출</span></b>
                      : doc
                        ? <><b style={{ color: C.ink }}>{doc.name}</b> {doc.ok ? <span style={{ color: C.brand, fontWeight: 700 }}>· OCR 자동채움 완료</span> : <span style={{ color: C.warn }}>· OCR 실패 — 아래 직접입력</span>}</>
                        : <><b>{entity.source}</b> 첨부 → <b style={{ color: C.brand }}>OCR 자동채움</b> <span style={{ color: C.faint }}>· 올리면 바로 추출합니다</span></>}
                  </span>
                  {doc && !docBusy ? <Badge tone={doc.url ? 'green' : 'amber'}>{doc.url ? '첨부됨 ✓' : '파일 미첨부'}</Badge> : null}
                  <input type="file" accept="image/*,application/pdf" disabled={docBusy} onChange={(e) => onDocFile(e.target.files?.[0])} style={{ display: 'none' }} />
                </label>
                <OcrCrosscheck result={doc?.crosscheck} />
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', border: `1.5px dashed ${C.line}`, borderRadius: 'var(--radius)', background: 'var(--bg-card)', fontSize: 12.5, color: C.mute }}>
                  <FileText size={15} color={C.sub} /> <b>{entity.source}</b> <span style={{ color: C.faint }}>— 엑셀·직접입력으로 수집(이 유형은 OCR 없음)</span>
                </div>
              )}
              <div style={{ marginTop: 14 }}>
                <FormGrid fields={fields} form={form} onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))} cols={2} />
              </div>
              <div style={{ marginTop: 10, fontSize: 11.5, color: C.faint }}>핵심 필드만 표시 — 나머지 상세는 저장 후 360에서 편집. {anchored ? <>전부 <b>차량번호(plate)</b>로 연결됩니다.</> : null}</div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
