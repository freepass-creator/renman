'use client';
/**
 * 업무생성 패널 안 고지서 투입 — 라우팅 없이 OCR·매칭·저장.
 *   검토 표 없음. 파일별 한 줄 요약만. 보정은 과태료 탭에서.
 */
import { useCallback, useEffect, useState } from 'react';
import FileDrop from '@/components/FileDrop';
import { Badge, Btn, Select, C } from '@/components/ui';
import { ALL_COMPANIES, COMPANIES, companyLabel, companyShort } from '@/lib/companies';
import type { EntityRecord } from '@/lib/intake/entities';
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
import { NEED_COMPANY, resolveWriteCompany } from '@/lib/scope';
import { useSession } from '@/lib/session';
import { getStore } from '@/lib/store';
import { toast } from '@/lib/toast';

function statusLabel(row: PenaltyIntakeRow): { t: string; tone: 'gray' | 'green' | 'amber' | 'red' } {
  if (row.status === 'pending') return { t: 'OCR중', tone: 'gray' };
  if (row.status === 'failed') return { t: '실패', tone: 'red' };
  if (!isPenaltyIntakeReady(row)) return { t: '완료·보정필요', tone: 'amber' };
  return { t: '완료', tone: 'green' };
}

export function PenaltyIntakePanel({ onDone }: { onDone: () => void }) {
  const { companyId, scopeAll } = useSession();
  const [co, setCo] = useState(companyId === ALL_COMPANIES ? '' : companyId);
  const [rows, setRows] = useState<PenaltyIntakeRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contracts, setContracts] = useState<EntityRecord[]>([]);
  const [existing, setExisting] = useState<EntityRecord[]>([]);

  useEffect(() => {
    if (!co) { setContracts([]); setExisting([]); return; }
    const store = getStore();
    Promise.all([store.list('contract', co), store.list('penalty', co)])
      .then(([cs, ps]) => { setContracts(cs); setExisting(ps); }).catch(() => {});
  }, [co]);

  const derive = useCallback(
    (rec: EntityRecord) => derivePenaltyMatch(rec, contracts, existing),
    [contracts, existing],
  );

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList?.length) return;
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
      onDone();
    } catch (error) {
      toast(error instanceof Error ? error.message : '등록하지 못했습니다', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {scopeAll && (
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.sub }}>회사 <span style={{ color: C.danger }}>*</span></span>
          <Select size="sm" value={co} onChange={(e) => setCo(e.target.value)}>
            <option value="">— 회사 선택 —</option>
            {COMPANIES.map((c) => <option key={c} value={c}>{companyShort(c)} · {companyLabel(c)}</option>)}
          </Select>
        </label>
      )}

      <FileDrop
        multiple
        accept="image/*,application/pdf"
        onFiles={handleFiles}
        hint="고지서 이미지·PDF · 여러 장"
        note={busy ? 'OCR 분석 중…' : undefined}
      />

      {rows.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {rows.map((r) => {
            const st = statusLabel(r);
            const plate = String(r.rec.plate || '').trim();
            const vdate = String(r.rec.violationDate || '').trim();
            const summary = [plate, vdate].filter(Boolean).join(' · ') || '—';
            const dup = r.status === 'done' && derive(r.rec).dup;
            return (
              <li
                key={r.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                  fontSize: 12, padding: '6px 8px', border: `1px solid ${C.line}`, borderRadius: 'var(--radius)',
                }}
              >
                <Badge tone={st.tone}>{st.t}</Badge>
                {dup ? <Badge tone="red">중복</Badge> : null}
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.ink }} title={r.fileName}>
                  {r.fileName}
                </span>
                <span style={{ color: C.mute, whiteSpace: 'nowrap' }}>{summary}</span>
              </li>
            );
          })}
        </ul>
      )}

      <Btn size="sm" disabled={saving || busy || !ready.length || (scopeAll && !co)} onClick={() => { void save(); }}>
        {saving ? '등록 중…' : `${ready.length}건 등록`}
      </Btn>
    </div>
  );
}
