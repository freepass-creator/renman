'use client';
/**
 * 계약 생성 패널 안 계약서 투입 — 라우팅 없이 OCR·매칭·저장.
 *   미완/실패 건은 그 줄 펼쳐 수기(임차인·차번·시작일). 파일 조용히 폐기 금지.
 *   과태료(components/work/PenaltyIntakePanel)와 같은 규격 — 한쪽만 바꾸지 말 것.
 */
import { useCallback, useEffect, useState } from 'react';
import FileDrop from '@/components/FileDrop';
import { Badge, Btn, Input, Message, Select, C } from '@/components/ui';
import { ALL_COMPANIES, COMPANIES, companyLabel } from '@/lib/companies';
import type { EntityRecord } from '@/lib/intake/entities';
import {
  CONTRACT_OCR_MAX,
  type ContractIntakeRow,
  buildContractSaveRecords,
  contractIntakeMissing,
  contractSavedToast,
  deriveContractMatch,
  isContractIntakeReady,
  makeContractIntakeRows,
  ocrContractFiles,
  saveContractRecords,
} from '@/lib/contract-intake';
import { NEED_COMPANY, resolveWriteCompany } from '@/lib/scope';
import { useSession } from '@/lib/session';
import { getStore } from '@/lib/store';
import { toast } from '@/lib/toast';

type ManualKey = 'contractorName' | 'plate' | 'startDate';

function statusLabel(row: ContractIntakeRow): { t: string; tone: 'gray' | 'green' | 'amber' | 'red' } {
  if (row.status === 'pending') return { t: 'OCR중', tone: 'gray' };
  if (row.status === 'failed') return { t: '실패', tone: 'red' };
  if (!isContractIntakeReady(row)) return { t: '완료·보정필요', tone: 'amber' };
  return { t: '완료', tone: 'green' };
}

function needsManual(row: ContractIntakeRow): boolean {
  return row.status === 'failed' || (row.status === 'done' && !isContractIntakeReady(row));
}

export function ContractIntakePanel({
  onDone,
  companyId: companyFromParent,
}: {
  onDone: () => void;
  /** 생성 패널 상단에서 이미 고른 회사. 있으면 아래 회사 선택 UI 숨김. */
  companyId?: string;
}) {
  const { companyId, scopeAll } = useSession();
  const parentCo = String(companyFromParent ?? '').trim();
  const lockedToParent = companyFromParent !== undefined;
  const [co, setCo] = useState(() => {
    if (lockedToParent) return parentCo;
    return companyId === ALL_COMPANIES ? '' : companyId;
  });
  const [rows, setRows] = useState<ContractIntakeRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vehicles, setVehicles] = useState<EntityRecord[]>([]);
  const [existing, setExisting] = useState<EntityRecord[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!lockedToParent) return;
    setCo(parentCo);
  }, [lockedToParent, parentCo]);

  useEffect(() => {
    if (!co) { setVehicles([]); setExisting([]); return; }
    const store = getStore();
    Promise.all([store.list('vehicle', co), store.list('contract', co)])
      .then(([vs, cs]) => { setVehicles(vs); setExisting(cs); }).catch(() => {});
  }, [co]);

  const derive = useCallback(
    (rec: EntityRecord) => deriveContractMatch(rec, vehicles, existing),
    [vehicles, existing],
  );

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const incoming = Array.from(fileList);
    const files = incoming.slice(0, CONTRACT_OCR_MAX);
    if (incoming.length > files.length) toast(`OCR는 한 번에 최대 ${CONTRACT_OCR_MAX}건까지 분석합니다.`, 'info');
    const base = makeContractIntakeRows(files);
    setRows((r) => [...r, ...base]);
    setBusy(true);
    const updated = await ocrContractFiles(files, base);
    setRows((prev) => {
      const copy = [...prev];
      for (const row of updated) {
        const idx = copy.findIndex((x) => x.id === row.id);
        if (idx >= 0) copy[idx] = row;
      }
      return copy;
    });
    const firstNeed = updated.find(needsManual);
    if (firstNeed) setOpenId(firstNeed.id);
    setBusy(false);
  }, []);

  const setField = useCallback((id: string, key: ManualKey, value: string) => {
    setRows((prev) => prev.map((row) => {
      if (row.id !== id) return row;
      const nextRec: EntityRecord = { ...row.rec, [key]: value };
      // 수기로 3필드 채우면 등록 가능 — failed도 done으로 올려 폐기 방지
      return { ...row, rec: nextRec, status: row.status === 'pending' ? row.status : 'done', error: undefined };
    }));
  }, []);

  const ready = rows.filter((row) => isContractIntakeReady(row) && !derive(row.rec).dup);
  const incomplete = rows.filter((row) => row.status !== 'pending' && !isContractIntakeReady(row));

  async function save() {
    if (!ready.length) return;
    const target = resolveWriteCompany(companyId, { companyId: co });
    if (!target) { toast(NEED_COMPANY, 'error'); return; }
    setSaving(true);
    try {
      const records = await buildContractSaveRecords(ready, target, derive);
      await saveContractRecords(target, records);
      toast(contractSavedToast(records.length, target), 'success');
      onDone();
    } catch (error) {
      toast(error instanceof Error ? error.message : '등록하지 못했습니다', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {scopeAll && !lockedToParent && (
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.sub }}>회사 <span style={{ color: C.danger }}>*</span></span>
          <Select size="sm" value={co} onChange={(e) => setCo(e.target.value)}>
            <option value="">— 회사 선택 —</option>
            {COMPANIES.map((c) => <option key={c} value={c}>{companyLabel(c)}</option>)}
          </Select>
        </label>
      )}
      {lockedToParent && !parentCo && (
        <Message variant="warning">위에서 회사를 먼저 선택하세요.</Message>
      )}

      <FileDrop
        multiple
        accept="image/*,application/pdf"
        onFiles={handleFiles}
        hint="계약서 이미지·PDF · 여러 장"
        note={busy ? 'OCR 분석 중…' : undefined}
      />

      {incomplete.length > 0 && (
        <Message variant="warning">
          미완 {incomplete.length}건은 임차인·차번·시작일을 수기 입력해야 등록됩니다.
        </Message>
      )}

      {rows.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {rows.map((r) => {
            const st = statusLabel(r);
            const name = String(r.rec.contractorName || '').trim();
            const plate = String(r.rec.plate || '').trim();
            const summary = [plate, name].filter(Boolean).join(' · ') || '—';
            const m = r.status === 'done' ? derive(r.rec) : null;
            const expandable = needsManual(r) || !isContractIntakeReady(r);
            const open = openId === r.id;
            const missing = contractIntakeMissing(r);
            return (
              <li
                key={r.id}
                style={{
                  display: 'grid', gap: 6,
                  fontSize: 12, padding: '6px 8px', border: `1px solid ${C.line}`, borderRadius: 'var(--radius)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Badge tone={st.tone}>{st.t}</Badge>
                  {m?.dup ? <Badge tone="red">중복</Badge> : null}
                  {m?.overlapWith ? <Badge tone="amber">기간겹침 · {m.overlapWith}</Badge> : null}
                  {m?.ghostPlate ? <Badge tone="amber">차량원장 없음</Badge> : null}
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.ink }} title={r.fileName}>
                    {r.fileName}
                  </span>
                  <span style={{ color: C.mute, whiteSpace: 'nowrap' }}>{summary}</span>
                  {expandable && r.status !== 'pending' ? (
                    <Btn size="sm" variant="ghost" onClick={() => setOpenId(open ? null : r.id)}>
                      {open ? '접기' : '수기입력'}
                    </Btn>
                  ) : null}
                </div>
                {open && expandable && r.status !== 'pending' ? (
                  <div style={{ display: 'grid', gap: 6, paddingTop: 2 }}>
                    {r.error ? <span style={{ color: C.danger, fontSize: 11 }}>{r.error}</span> : null}
                    {missing.length > 0 ? (
                      <span style={{ color: C.mute, fontSize: 11 }}>못 읽은 항목: {missing.join(' · ')}</span>
                    ) : null}
                    <label style={{ display: 'grid', gap: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.sub }}>임차인</span>
                      <Input
                        size="sm"
                        value={String(r.rec.contractorName || '')}
                        placeholder="홍길동"
                        onChange={(e) => setField(r.id, 'contractorName', e.target.value)}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.sub }}>차량번호</span>
                      <Input
                        size="sm"
                        value={String(r.rec.plate || '')}
                        placeholder="12가3456"
                        onChange={(e) => setField(r.id, 'plate', e.target.value)}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.sub }}>시작일</span>
                      <Input
                        size="sm"
                        type="date"
                        value={String(r.rec.startDate || '').slice(0, 10)}
                        onChange={(e) => setField(r.id, 'startDate', e.target.value)}
                      />
                    </label>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Btn
          size="sm"
          onClick={() => void save()}
          disabled={saving || busy || !ready.length || (lockedToParent && !parentCo)}
        >
          {saving ? '등록 중…' : `계약 ${ready.length}건 등록`}
        </Btn>
        {rows.length > 0 && (
          <Btn size="sm" variant="ghost" onClick={() => { setRows([]); setOpenId(null); }} disabled={saving}>
            비우기
          </Btn>
        )}
      </div>
    </div>
  );
}
