'use client';
/**
 * 고지서 등록(신규 입력) — 별도 페이지. 과태료·통행료 고지서 다중 드롭 → OCR → 위반일시로 계약(임차인) 자동매칭 → 검토 → 저장.
 *   로직 SSOT = lib/penalty-intake (패널과 공유). 저장 후 /work?group=과태료 복귀.
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import { ALL_COMPANIES, COMPANIES, companyLabel } from '@/lib/companies';
import { getStore } from '@/lib/store';
import { type EntityRecord } from '@/lib/intake/entities';
import { resolveWriteCompany, NEED_COMPANY } from '@/lib/scope';
import { toast } from '@/lib/toast';
import {
  PENALTY_OCR_MAX,
  type PenaltyIntakeRow,
  buildPenaltySaveRecords,
  derivePenaltyMatch,
  isPenaltyIntakeReady,
  makePenaltyIntakeRows,
  ocrPenaltyFiles,
  penaltySavedToast,
  savePenaltyRecords,
} from '@/lib/penalty-intake';
import { Page, Panel, Btn, Badge, Input, Select, C, th } from '@/components/ui';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { Trash2 } from 'lucide-react';
import FileDrop from '@/components/FileDrop';

export default function PenaltyUploadPage() {
  const router = useRouter();
  const { companyId } = useSession();
  const [co, setCo] = useState(companyId === ALL_COMPANIES ? '' : companyId);
  const [rows, setRows] = useState<PenaltyIntakeRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contracts, setContracts] = useState<EntityRecord[]>([]);
  const [existing, setExisting] = useState<EntityRecord[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);

  useEffect(() => {
    if (!co) { setContracts([]); setExisting([]); setContractsLoading(false); return; }
    let active = true;
    setContractsLoading(true);
    const store = getStore();
    Promise.all([store.list('contract', co), store.list('penalty', co)])
      .then(([cs, ps]) => {
        if (!active) return;
        setContracts(cs);
        setExisting(ps);
      })
      .catch(() => {})
      .finally(() => { if (active) setContractsLoading(false); });
    return () => { active = false; };
  }, [co]);

  const derive = useCallback(
    (rec: EntityRecord) => derivePenaltyMatch(rec, contracts, existing),
    [contracts, existing],
  );

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || !fileList.length) return;
    const incoming = Array.from(fileList);
    const files = incoming.slice(0, PENALTY_OCR_MAX);
    if (incoming.length > files.length) toast(`OCR는 한 번에 최대 ${PENALTY_OCR_MAX}건까지 분석합니다.`, 'info');
    const base = makePenaltyIntakeRows(files);
    setRows((r) => [...r, ...base]);
    setBusy(true);
    const updated = await ocrPenaltyFiles(files, base);
    setRows((prev) => {
      const copy = [...prev];
      for (const row of updated) {
        const idx = copy.findIndex((x) => x.id === row.id);
        if (idx >= 0) copy[idx] = row;
      }
      return copy;
    });
    setBusy(false);
  }, []);

  const setField = (id: string, key: string, val: unknown) =>
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, rec: { ...r.rec, [key]: val } } : r));
  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  const ready = rows.filter((row) => isPenaltyIntakeReady(row) && !derive(row.rec).dup);
  async function save() {
    if (!ready.length) return;
    const target = resolveWriteCompany(companyId, { companyId: co });
    if (!target) { toast(NEED_COMPANY, 'error'); return; }
    setSaving(true);
    try {
      const records = await buildPenaltySaveRecords(ready, target, derive);
      await savePenaltyRecords(target, records);
      toast(penaltySavedToast(records.length, target), 'success');
      router.push('/work?group=%EA%B3%BC%ED%83%9C%EB%A3%8C');
    } finally { setSaving(false); }
  }

  const okCount = rows.filter((r) => r.status === 'done').length;
  const matchCount = rows.filter((r) => derive(r.rec).renter).length;

  return (
    <Page
      title="고지서 등록"
      meta="과태료·통행료 고지서를 올리면 위반일시로 임차인을 자동매칭합니다"
      noCompany
      tools={
        <WorkbenchBar
          mid={<span style={{ fontSize: 12, color: C.faint, whiteSpace: 'nowrap' }}>{`${rows.length}건 · 분석완료 ${okCount} · 매칭 ${matchCount}${co ? ' · ' + companyLabel(co) : ''}`}</span>}
          actions={<>
            <Btn variant="ghost" href="/work?group=%EA%B3%BC%ED%83%9C%EB%A3%8C">← 과태료관리</Btn>
            <Btn onClick={save} disabled={saving || !ready.length}>{saving ? '저장 중…' : `${ready.length}건 등록`}</Btn>
          </>}
        />
      }
    >
      <Panel title="고지서 OCR 등록">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 11.5, color: C.mute, fontWeight: 700 }}>회사(법인)</label>
          <Select size="sm" value={co} onChange={(e) => setCo(e.target.value)}>
            {companyId === ALL_COMPANIES ? <option value="">— 회사 선택 —</option> : null}
            {COMPANIES.map((c) => <option key={c} value={c}>{companyLabel(c)}</option>)}
          </Select>
          {!co && companyId === ALL_COMPANIES ? <span style={{ fontSize: 11.5, color: C.warn }}>저장 전 회사를 선택하세요</span> : null}
          {co && contractsLoading && <span style={{ fontSize: 11.5, color: C.faint }}>계약 불러오는 중…</span>}
          {co && !contractsLoading && contracts.length === 0 && <span style={{ fontSize: 11.5, color: C.warn }}>이 회사 계약이 없어 매칭이 안 됩니다 — 운영현황에서 계약 먼저 등록</span>}
        </div>

        <FileDrop
          multiple accept="image/*,application/pdf"
          onFiles={handleFiles}
          hint="JPG · PNG · PDF · 여러 장 동시 · 자동으로 읽습니다"
          note={busy ? 'OCR 분석 중…' : undefined}
        />

        {rows.length > 0 && (
          <div style={{ marginTop: 12, overflowX: 'auto', border: `1px solid ${C.line}`, borderRadius: 'var(--radius)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 860 }}>
              <thead><tr style={{ background: C.head }}>
                {['상태', '차량번호', '위반일시', '위반내용', '금액', '실운전자(매칭)', '고지서', ''].map((h, i) => (
                  <th key={i} style={{ ...th, textAlign: i === 4 ? 'right' : 'left', padding: '7px 9px', fontSize: 11, borderRight: 'none', position: 'static' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {rows.map((r) => {
                  const d = derive(r.rec);
                  const st = r.status === 'pending'
                    ? { t: '분석중', tone: 'gray' as const }
                    : !isPenaltyIntakeReady(r)
                      ? { t: r.status === 'failed' ? '보정필요' : '확인필요', tone: 'red' as const }
                      : d.renter
                        ? { t: '매칭', tone: 'green' as const }
                        : { t: '미매칭', tone: 'amber' as const };
                  return (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${C.line2}` }}>
                      <td style={{ padding: '5px 9px', whiteSpace: 'nowrap' }}>
                        <Badge tone={st.tone}>{st.t}</Badge>
                        {r.crosscheck && r.crosscheck.level !== 'ok' && <span style={{ marginLeft: 4 }}><Badge tone="amber">OCR검토</Badge></span>}
                        {d.dup && <span style={{ marginLeft: 4 }}><Badge tone="red">중복·제외</Badge></span>}
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
          <div style={{ marginTop: 8, fontSize: 11.5, color: C.warn }}>일부 자동추출 실패(키 미설정 등) — 차량번호·위반일시·금액을 직접 입력하면 검증 후 등록할 수 있습니다.</div>
        )}
      </Panel>
    </Page>
  );
}
