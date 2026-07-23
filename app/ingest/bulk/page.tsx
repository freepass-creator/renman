'use client';
/**
 * 대량 자동매칭 — 등록증·보험증권 여러 장을 한 번에 올리면 OCR → 번호판으로 기존 차량과 자동매칭 → 검토 → 일괄 반영.
 *   · 등록증(vehicle_reg): 번호판 자연키로 차량 upsert(있으면 정보 갱신, 없으면 신규).
 *   · 보험(insurance_policy): 증권번호 자연키로 보험 upsert, 번호판으로 차량 연결 표시.
 *   팝업 아닌 페이지. 파일 원본은 저장 계층(Firebase + 회사 Drive 미러)로.
 */
import { useMemo, useState } from 'react';
import { UploadCloud, Car, ShieldCheck } from 'lucide-react';
import { useSession } from '@/lib/session';
import { useEntityLists } from '@/lib/use-entity-lists';
import { type EntityRecord } from '@/lib/intake/entities';
import { ocrBatch, mapOcrToEntity } from '@/lib/ocr-client';
import { saveIntake } from '@/lib/intake';
import { uploadDoc, docPath } from '@/lib/storage';
import { pushDocVersion } from '@/lib/docs';
import { resolveWriteCompany, NEED_COMPANY } from '@/lib/scope';
import { normPlate } from '@/lib/plate';
import { companyLabel } from '@/lib/companies';
import { Page, Panel, Btn, Badge, EmptyState, DataTable, IconSeg, C, SPACE_M, won, type Col } from '@/components/ui';
import FileDrop from '@/components/FileDrop';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { toast } from '@/lib/toast';

type DocKind = 'vehicle' | 'insurance';
const KIND: Record<DocKind, { label: string; ocrType: string }> = {
  vehicle: { label: '등록증', ocrType: 'vehicle_reg' },
  insurance: { label: '보험증권', ocrType: 'insurance_policy' },
};

type Row = {
  file: File;
  rec: EntityRecord;
  plate: string;
  match: EntityRecord | null;   // 매칭된 기존 차량
  status: '매칭' | '신규' | '실패';
};

export default function BulkMatchPage() {
  const { companyId, scopeAll, user } = useSession();
  const { data: [vs = []] } = useEntityLists(['vehicle']);
  const [kind, setKind] = useState<DocKind>('vehicle');
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  const byPlate = useMemo(() => {
    const m = new Map<string, EntityRecord>();
    for (const v of vs) { const p = normPlate(v.plate); if (p) m.set(p, v); }
    return m;
  }, [vs]);

  const reset = () => { setFiles([]); setRows(null); };

  const analyze = async () => {
    if (!files.length) return;
    setBusy(true);
    try {
      const results = await ocrBatch(files, KIND[kind].ocrType);
      setRows(results.map((r, i): Row => {
        const rec = r.ok && r.raw ? mapOcrToEntity(kind, r.raw) : {};
        const plate = normPlate(rec.plate);
        const match = plate ? byPlate.get(plate) ?? null : null;
        return { file: files[i], rec, plate: String(rec.plate || ''), match, status: !r.ok ? '실패' : match ? '매칭' : '신규' };
      }));
    } catch (e) {
      toast('OCR 실패: ' + (e as Error).message, 'error');
    } finally { setBusy(false); }
  };

  const commit = async () => {
    const target = resolveWriteCompany(companyId, null);
    if (!target) { toast(NEED_COMPANY + ' — 상단에서 회사를 선택하세요', 'error'); return; }
    const okRows = (rows || []).filter((r) => r.status !== '실패');
    if (!okRows.length) { toast('반영할 건이 없습니다', 'error'); return; }
    setBusy(true);
    try {
      const recs: EntityRecord[] = [];
      for (const r of okRows) {
        const key = String(r.rec.plate || r.rec.policyNo || 'new');
        // 원본 파일 저장(Firebase + 회사 Drive 미러) → 레코드에 첨부.
        const url = await uploadDoc(r.file, docPath(target, kind, key, r.file.name));
        recs.push(url ? { ...r.rec, _docs: pushDocVersion(r.rec, { type: kind, url, reason: '대량 자동매칭', by: String(user?.name || '') }) } : r.rec);
      }
      const res = await saveIntake(kind, target, recs);
      toast(`${res.save.saved}건 반영 (${KIND[kind].label} · ${companyLabel(target)})${res.save.duplicates ? ` · 갱신 ${res.save.duplicates}` : ''}`, 'success');
      reset();
    } catch (e) {
      toast('반영 실패: ' + (e as Error).message, 'error');
    } finally { setBusy(false); }
  };

  const cols: Col<Row>[] = [
    { key: 'file', label: '파일', render: (r) => <span style={{ fontSize: 12, color: C.mute }}>{r.file.name}</span> },
    { key: 'plate', label: '번호판(OCR)', render: (r) => r.plate || <span style={{ color: C.danger }}>미인식</span> },
    { key: 'match', label: '매칭 차량', render: (r) => r.match ? `${String(r.match.plate || '')} · ${String(r.match.carName || '')}` : '—' },
    {
      key: 'status', label: '처리', render: (r) => {
        const tone = r.status === '실패' ? 'red' : r.status === '신규' ? 'amber' : 'green';
        const label = r.status === '매칭' ? '기존 갱신' : r.status === '신규' ? '신규 등록' : 'OCR 실패';
        return <Badge tone={tone}>{label}</Badge>;
      },
    },
  ];
  if (kind === 'insurance') {
    cols.splice(2, 0, { key: 'ins', label: '보험사·증권', render: (r) => `${String(r.rec.insurer || '')} ${String(r.rec.policyNo || '')}`.trim() || '—' });
  }

  const ok = (rows || []).filter((r) => r.status !== '실패');
  const fail = (rows || []).filter((r) => r.status === '실패');

  return (
    <Page
      title="대량 자동매칭"
      tools={<WorkbenchBar actions={
        <IconSeg value={kind} onChange={(k) => { setKind(k as DocKind); reset(); }} options={[
          { key: 'vehicle', label: '등록증', icon: <Car size={15} /> },
          { key: 'insurance', label: '보험증권', icon: <ShieldCheck size={15} /> },
        ]} />
      } />}
    >
      <Panel title={`${KIND[kind].label} 대량 업로드`}>
        <p style={{ fontSize: 12.5, color: C.mute, margin: '0 0 10px', lineHeight: 1.6 }}>
          여러 장을 한 번에 올리면 OCR로 <b>번호판</b>을 읽어 기존 차량과 자동으로 맞춥니다. 검토 후 <b>반영</b>하면 원장에 upsert.
          {scopeAll && <span style={{ color: C.warn }}> · 상단에서 대상 회사를 먼저 선택하세요.</span>}
        </p>
        <FileDrop
          multiple
          accept="image/*,application/pdf"
          onFiles={(fs) => { setFiles(Array.from(fs)); setRows(null); }}
          hint={files.length ? `${files.length}장 선택됨` : `${KIND[kind].label} 이미지/PDF 여러 장`}
          note="드래그하거나 클릭해 선택"
        />
        <div style={{ display: 'flex', gap: SPACE_M, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Btn onClick={analyze} disabled={!files.length || busy}><UploadCloud size={15} /> {busy && !rows ? 'OCR 분석 중…' : `${files.length || ''}장 분석`}</Btn>
          {files.length ? <Btn variant="ghost" onClick={reset} disabled={busy}>비우기</Btn> : null}
        </div>
      </Panel>

      {rows && (
        <Panel title={`검토 — 매칭 ${ok.filter((r) => r.status === '매칭').length} · 신규 ${ok.filter((r) => r.status === '신규').length}${fail.length ? ` · 실패 ${fail.length}` : ''}`}>
          {rows.length === 0 ? <EmptyState>결과 없음</EmptyState>
            : <>
              <DataTable cols={cols} rows={rows} />
              <div style={{ display: 'flex', gap: SPACE_M, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <Btn onClick={commit} disabled={busy || !ok.length}>{busy ? '반영 중…' : `${ok.length}건 반영`}</Btn>
                {fail.length ? <span style={{ fontSize: 12, color: C.danger }}>OCR 실패 {fail.length}건은 제외됩니다(개별 담기로 재시도).</span> : null}
              </div>
            </>}
        </Panel>
      )}
    </Page>
  );
}
