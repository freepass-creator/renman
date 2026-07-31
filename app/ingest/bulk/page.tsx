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
import { matchDocumentToVehicle } from '@/lib/document-consistency';
import { companyLabel } from '@/lib/companies';
import { Page, Panel, Btn, Badge, EmptyState, DataTable, IconSeg, C, SPACE_M, won, type Col } from '@/components/ui';
import FileDrop from '@/components/FileDrop';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { toast } from '@/lib/toast';
import { getStore } from '@/lib/store';
import { buildAtomicEvent } from '@/lib/domain/atomic-event';

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
  status: '매칭' | '검토' | '신규' | '실패';
  matchScore: number;
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
        const judged = matchDocumentToVehicle(rec, vs);
        const match = judged.target || (plate ? byPlate.get(plate) ?? null : null);
        const status: Row['status'] = !r.ok ? '실패'
          : judged.decision === 'auto' ? '매칭'
          : match ? '검토'
          : '신규';
        return { file: files[i], rec, plate: String(rec.plate || ''), match, status, matchScore: judged.score };
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
      const updateEvents: EntityRecord[] = [];
      let updated = 0;
      let plateSkipped = 0;   // OCR 번호가 기존 차량과 다른데 갱신하지 않은 건수
      for (const r of okRows) {
        const key = String(r.rec.plate || r.rec.policyNo || 'new');
        // 원본 파일 저장(Firebase + 회사 Drive 미러) → 레코드에 첨부.
        const url = await uploadDoc(r.file, docPath(target, kind, key, r.file.name));
        const current = kind === 'vehicle'
          ? r.match
          : r.rec.policyNo ? await getStore().get('insurance', target, String(r.rec.policyNo)) : null;
        const merged = url
          ? { ...r.rec, _docs: pushDocVersion(current || r.rec, { type: kind, url, reason: '대량 자동매칭', by: String(user?.name || '') }) }
          : r.rec;
        if (current?._key) {
          /* ★차량번호(plate)는 자동 갱신 대상에서 제외한다.
             VIN·차명 등으로 같은 차로 매칭됐더라도 OCR 이 번호를 오독하면 그 값이 그대로 저장되고,
             번호변경 승계(carryPlateHistory)가 작동해 «오독 번호»가 이력에 영구 박제된다
             (그 뒤로는 별칭 조인이 잘못된 번호까지 같은 차로 인식한다 = 되돌리기 어려움).
             번호 변경은 사람이 차량 상세에서 눈으로 확인하고 바꿔야 한다. */
          const patch = kind === 'vehicle'
            ? (() => { const { plate: _ocrPlate, ...rest } = merged as Record<string, unknown>; return rest as EntityRecord; })()
            : merged;
          if (kind === 'vehicle' && r.plate && normPlate(r.plate) !== normPlate(current.plate)) plateSkipped++;
          await getStore().update(kind, target, String(current._key), patch);
          updateEvents.push(buildAtomicEvent({
            entityType: kind, companyId: target, record: { ...current, ...merged }, source: 'ocr',
          }));
          updated++;
        } else {
          recs.push(merged);
        }
      }
      const res = recs.length
        ? await saveIntake(kind, target, recs, { context: { source: 'ocr' } })
        : { save: { saved: 0, duplicates: 0, backend: getStore().backend } };
      if (updateEvents.length) await getStore().save('atomic_event', target, updateEvents);
      toast(
        `${res.save.saved + updated}건 반영 (${KIND[kind].label} · ${companyLabel(target)})${updated ? ` · 기존 갱신 ${updated}` : ''}`
        + (plateSkipped ? ` · ★차량번호 불일치 ${plateSkipped}건은 번호를 바꾸지 않았습니다(차량 상세에서 확인)` : ''),
        plateSkipped ? 'info' : 'success',
      );
      reset();
    } catch (e) {
      toast('반영 실패: ' + (e as Error).message, 'error');
    } finally { setBusy(false); }
  };

  const cols: Col<Row>[] = [
    { key: 'file', label: '파일', render: (r) => <span style={{ fontSize: 12, color: C.mute }}>{r.file.name}</span> },
    { key: 'plate', label: '번호판(OCR)', render: (r) => r.plate || <span style={{ color: C.danger }}>미인식</span> },
    {
      key: 'match', label: '매칭 차량',
      render: (r) => {
        if (!r.match) return '—';
        const label = `${String(r.match.plate || '')} · ${String(r.match.carName || '')}`;
        // OCR 번호와 기존 차량번호가 다르면 «번호는 갱신하지 않는다»는 사실을 미리 알린다.
        const mismatch = !!r.plate && normPlate(r.plate) !== normPlate(r.match.plate);
        return mismatch
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{label}<Badge tone="amber">번호 불일치 · 미갱신</Badge></span>
          : label;
      },
    },
    {
      key: 'status', label: '처리', render: (r) => {
        const tone = r.status === '실패' ? 'red' : r.status === '신규' || r.status === '검토' ? 'amber' : 'green';
        const label = r.status === '매칭' ? `자동 매칭 ${r.matchScore}`
          : r.status === '검토' ? `교차검토 ${r.matchScore}`
          : r.status === '신규' ? '신규 등록' : 'OCR 실패';
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
