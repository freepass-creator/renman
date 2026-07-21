'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/lib/session';
import { ALL_COMPANIES, COMPANIES, companyLabel } from '@/lib/companies';
import { normPlate } from '@/lib/plate';
import { getStore } from '@/lib/store';
import { type EntityRecord } from '@/lib/intake/entities';
import { ocrBatch, mapOcrToEntity } from '@/lib/ocr-client';
import { uploadDoc, docPath } from '@/lib/storage';
import { saveIntake } from '@/lib/intake';
import { resolveWriteCompany, NEED_COMPANY } from '@/lib/scope';
import { toast } from '@/lib/toast';
import { matchPenalty } from '@/lib/penalty-match';
import { Modal, Btn, Badge, Input, Select, C, won } from '@/components/ui';
import { UploadCloud, Trash2 } from 'lucide-react';
// 과태료 업무의 시작 = 고지서 업로드. 다중 드롭 → OCR(자동) → 위반일시로 계약(임차인) 자동매칭 → 검토 → 저장.
// GEMINI_API_KEY 없으면 자동추출 실패 → 각 행 수기입력으로 진행(플로우는 동일).
type Row = { id: string; fileName: string; file: File; status: 'pending' | 'done' | 'failed'; rec: EntityRecord; ocrOriginal?: unknown; error?: string };

export function PenaltyUpload({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { companyId } = useSession();
  const [co, setCo] = useState(companyId === ALL_COMPANIES ? '' : companyId);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState(false);
  const [contracts, setContracts] = useState<EntityRecord[]>([]);
  const [existing, setExisting] = useState<EntityRecord[]>([]);

  useEffect(() => {
    if (!co) { setContracts([]); setExisting([]); return; }
    const store = getStore();
    Promise.all([store.list('contract', co), store.list('penalty', co)])
      .then(([cs, ps]) => { setContracts(cs); setExisting(ps); }).catch(() => {});
  }, [co]);

  const derive = useCallback((rec: EntityRecord) => {
    const plate = normPlate(rec.plate), vdate = String(rec.violationDate || '');
    const m = matchPenalty(rec, contracts);
    const samePlate = contracts.filter((k) => normPlate(k.plate) === plate);
    const outOfRange = !!plate && !!vdate && samePlate.length > 0 && !m;
    const dup = existing.some((e) =>
      (rec.noticeNo && String(e.noticeNo) === String(rec.noticeNo)) ||
      (plate && vdate && normPlate(e.plate) === plate && String(e.violationDate).slice(0, 10) === vdate.slice(0, 10)));
    return { renter: m ? m.renter : null, contractNo: m ? String(m.contract.contractNo || '') : null, outOfRange, dup };
  }, [contracts, existing]);

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || !fileList.length) return;
    const files = Array.from(fileList);
    const base: Row[] = files.map((f, i) => ({ id: `pen-${Date.now()}-${i}`, fileName: f.name, file: f, status: 'pending', rec: {} }));
    setRows((r) => [...r, ...base]);
    setBusy(true);
    const results = await ocrBatch(files, 'penalty');
    setRows((prev) => {
      const copy = [...prev];
      for (let i = 0; i < files.length; i++) {
        const idx = copy.findIndex((x) => x.id === base[i].id); if (idx < 0) continue;
        const res = results[i];
        copy[idx] = res.ok && res.raw
          ? { ...copy[idx], status: 'done', rec: mapOcrToEntity('penalty', res.raw), ocrOriginal: res.ocrOriginal }
          : { ...copy[idx], status: 'failed', error: res.error };
      }
      return copy;
    });
    setBusy(false);
  }, []);

  const setField = (id: string, key: string, val: unknown) =>
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, rec: { ...r.rec, [key]: val } } : r));
  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  const ready = rows.filter((r) => String(r.rec.plate || '').trim());
  async function save() {
    if (!ready.length) return;
    const target = resolveWriteCompany(companyId, { companyId: co });
    if (!target) { toast(NEED_COMPANY, 'error'); return; }
    setSaving(true);
    try {
      const records = await Promise.all(ready.map(async (r) => {
        const { renter } = derive(r.rec);
        let fileUrl = '';
        try { fileUrl = (await uploadDoc(r.file, docPath(target, 'penalty', String(r.rec.noticeNo || r.id), r.fileName))) || ''; } catch { /* Firebase 미설정 시 스킵 */ }
        return { ...r.rec, companyId: target, reassignStatus: '접수', ...(renter ? { driverName: renter } : {}), ...(fileUrl ? { fileUrl } : {}), _ocrOriginal: r.ocrOriginal };
      }));
      await saveIntake('penalty', target, records as EntityRecord[]);
      onSaved(); onClose();
    } finally { setSaving(false); }
  }

  const okCount = rows.filter((r) => r.status === 'done').length;
  const matchCount = rows.filter((r) => derive(r.rec).renter).length;

  return (
    <Modal title="고지서 등록 (자동 OCR)" meta="과태료·통행료 고지서를 올리면 위반일시로 임차인을 자동매칭합니다" onClose={onClose} width={980}
      footer={<>
        <Btn onClick={save} disabled={saving || !ready.length}>{saving ? '저장 중…' : `과태료 ${ready.length}건 등록`}</Btn>
        <Btn variant="ghost" onClick={onClose}>닫기</Btn>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: C.faint }}>{rows.length}건 · 분석완료 {okCount} · 매칭 {matchCount} · {companyLabel(co)}에 저장</span>
      </>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 11.5, color: C.mute, fontWeight: 700 }}>회사(법인)</label>
        <Select size="sm" value={co} onChange={(e) => setCo(e.target.value)}>
          {companyId === ALL_COMPANIES ? <option value="">— 회사 선택 —</option> : null}
          {COMPANIES.map((c) => <option key={c} value={c}>{companyLabel(c)}</option>)}
        </Select>
        {!co && companyId === ALL_COMPANIES ? <span style={{ fontSize: 11.5, color: C.warn }}>저장 전 회사를 선택하세요</span> : null}
        {contracts.length === 0 && <span style={{ fontSize: 11.5, color: C.warn }}>이 회사 계약이 없어 매칭이 안 됩니다 — 운영현황에서 계약 먼저 등록</span>}
      </div>

      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '22px 16px', border: `1.5px dashed ${drag ? C.accent : C.line}`, borderRadius: 'var(--radius)', background: drag ? 'var(--bg-hover)' : 'var(--bg-card)', cursor: 'pointer', textAlign: 'center' }}>
        <UploadCloud size={26} color={C.sub} strokeWidth={1.7} />
        <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>고지서 파일을 끌어다 놓거나 클릭해서 선택</div>
        <div style={{ fontSize: 11.5, color: C.faint }}>JPG · PNG · PDF · 여러 장 동시 · {busy ? 'OCR 분석 중…' : 'Gemini가 자동으로 읽습니다'}</div>
        <input type="file" accept="image/*,application/pdf" multiple onChange={(e) => handleFiles(e.target.files)} style={{ display: 'none' }} />
      </label>

      {rows.length > 0 && (
        <div style={{ marginTop: 12, overflowX: 'auto', border: `1px solid ${C.line}`, borderRadius: 'var(--radius)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 860 }}>
            <thead><tr style={{ background: C.head }}>
              {['상태', '차량번호', '위반일시', '위반내용', '금액', '실운전자(매칭)', '고지서', ''].map((h, i) => (
                <th key={i} style={{ textAlign: i === 4 ? 'right' : 'left', padding: '7px 9px', fontSize: 11, color: '#33415a', fontWeight: 700, borderBottom: `2px solid #c4ccd8`, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const d = derive(r.rec);
                const st = r.status === 'pending' ? { t: '분석중', tone: 'gray' as const } : r.status === 'failed' ? { t: '오류', tone: 'red' as const } : d.renter ? { t: '매칭', tone: 'green' as const } : { t: '미매칭', tone: 'amber' as const };
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${C.line2}` }}>
                    <td style={{ padding: '5px 9px', whiteSpace: 'nowrap' }}>
                      <Badge tone={st.tone}>{st.t}</Badge>{d.dup && <span style={{ marginLeft: 4 }}><Badge tone="red">중복</Badge></span>}
                    </td>
                    <td style={{ padding: '5px 9px', minWidth: 110 }}><Input size="sm" value={String(r.rec.plate || '')} onChange={(e) => setField(r.id, 'plate', e.target.value)} placeholder="차량번호" style={{ width: '100%' }} /></td>
                    <td style={{ padding: '5px 9px', minWidth: 130 }}><Input size="sm" value={String(r.rec.violationDate || '')} onChange={(e) => setField(r.id, 'violationDate', e.target.value)} placeholder="YYYY-MM-DD" style={{ width: '100%', borderColor: d.outOfRange ? C.danger : undefined }} /></td>
                    <td style={{ padding: '5px 9px', minWidth: 120 }}><Input size="sm" value={String(r.rec.description || '')} onChange={(e) => setField(r.id, 'description', e.target.value)} placeholder="위반내용" style={{ width: '100%' }} /></td>
                    <td style={{ padding: '5px 9px', minWidth: 100 }}><Input size="sm" type="number" value={String(r.rec.amount ?? '')} onChange={(e) => setField(r.id, 'amount', Number(e.target.value) || 0)} placeholder="0" style={{ width: '100%', textAlign: 'right' }} /></td>
                    <td style={{ padding: '5px 9px', whiteSpace: 'nowrap' }}>
                      {d.renter ? <span style={{ color: C.ok, fontWeight: 700 }}>{d.renter}{d.contractNo ? <span style={{ color: C.faint, fontWeight: 400 }}> ({d.contractNo})</span> : null}</span>
                        : d.outOfRange ? <span style={{ color: C.danger }}>기간 밖 · 회사 부담</span>
                          : <span style={{ color: C.faint }}>미매칭 · 회사 부담</span>}
                    </td>
                    <td style={{ padding: '5px 9px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.faint, fontSize: 11 }} title={r.fileName}>{r.fileName}</td>
                    <td style={{ padding: '5px 9px' }}><Btn size="sm" variant="ghost" onClick={() => removeRow(r.id)}><Trash2 size={14} /></Btn></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows.some((r) => r.status === 'failed') && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: C.warn }}>일부 자동추출 실패(키 미설정 등) — 해당 행은 차량번호·위반일시를 직접 입력하면 저장됩니다.</div>
      )}
    </Modal>
  );
}
