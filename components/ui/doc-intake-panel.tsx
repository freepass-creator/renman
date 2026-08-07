'use client';
/**
 * 문서 투입 패널 — 원장 생성 패널 안에서 라우팅 없이 OCR·매칭·저장.
 *   과태료(고지서)·계약(계약서)·차량(등록증)이 **이 화면 하나**를 쓴다.
 *   원장은 규격(DocIntakeSpec)만 준다 — lib/doc-intake.
 *
 * 지키는 규칙(원장이 바꿀 수 없다):
 *   · 미완·실패 건을 조용히 버리지 않는다 — 그 줄을 펼쳐 수기로 채운다.
 *   · 수기로 필수칸을 채우면 실패 건도 done 으로 올라가 등록 대상이 된다.
 *   · 중복은 등록에서 빼되 목록에는 남긴다(왜 안 들어갔는지 보이게).
 */
import { useCallback, useEffect, useState } from 'react';
import FileDrop from '@/components/FileDrop';
import { Badge, Btn, Input, Message, Select, C } from './index';
import { ALL_COMPANIES, COMPANIES, companyLabel } from '@/lib/companies';
import type { EntityRecord } from '@/lib/intake/entities';
import {
  type DocIntakeRow,
  type DocIntakeSpec,
  isDocIntakeReady,
  makeDocIntakeRows,
  ocrDocFiles,
} from '@/lib/doc-intake';
import { NEED_COMPANY, resolveWriteCompany } from '@/lib/scope';
import { useSession } from '@/lib/session';
import { getStore } from '@/lib/store';
import { toast } from '@/lib/toast';

function statusLabel(spec: DocIntakeSpec, row: DocIntakeRow): { t: string; tone: 'gray' | 'green' | 'amber' | 'red' } {
  if (row.status === 'pending') return { t: 'OCR중', tone: 'gray' };
  if (row.status === 'failed') return { t: '실패', tone: 'red' };
  if (!isDocIntakeReady(spec, row)) return { t: '완료·보정필요', tone: 'amber' };
  return { t: '완료', tone: 'green' };
}

export function DocIntakePanel({
  spec,
  onDone,
  companyId: companyFromParent,
}: {
  spec: DocIntakeSpec;
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
  const [rows, setRows] = useState<DocIntakeRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refs, setRefs] = useState<EntityRecord[][]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!lockedToParent) return;
    setCo(parentCo);
  }, [lockedToParent, parentCo]);

  const refKey = spec.refEntities.join(',');
  useEffect(() => {
    if (!co) { setRefs([]); return; }
    const store = getStore();
    const keys = refKey ? refKey.split(',') : [];
    Promise.all(keys.map((k) => store.list(k, co)))
      .then(setRefs)
      .catch(() => setRefs([]));
  }, [co, refKey]);

  const derive = useCallback((rec: EntityRecord) => spec.derive(rec, refs), [spec, refs]);
  const isReady = useCallback((row: DocIntakeRow) => isDocIntakeReady(spec, row), [spec]);
  const needsManual = useCallback(
    (row: DocIntakeRow) => row.status === 'failed' || (row.status === 'done' && !isReady(row)),
    [isReady],
  );

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const incoming = Array.from(fileList);
    const files = incoming.slice(0, spec.max);
    if (incoming.length > files.length) toast(`OCR는 한 번에 최대 ${spec.max}건까지 분석합니다.`, 'info');
    const base = makeDocIntakeRows(files, spec.entityKey);
    setRows((r) => [...r, ...base]);
    setBusy(true);
    const updated = await ocrDocFiles(spec, files, base);
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
  }, [spec, needsManual]);

  const setField = useCallback((id: string, key: string, value: string) => {
    setRows((prev) => prev.map((row) => {
      if (row.id !== id) return row;
      // 수기로 필수칸을 채우면 실패 건도 done 으로 — 파일 폐기 방지.
      return {
        ...row,
        rec: { ...row.rec, [key]: value },
        status: row.status === 'pending' ? row.status : 'done',
        error: undefined,
      };
    }));
  }, []);

  const ready = rows.filter((row) => isReady(row) && !derive(row.rec).dup);
  const incomplete = rows.filter((row) => row.status !== 'pending' && !isReady(row));

  async function save() {
    if (!ready.length) return;
    const target = resolveWriteCompany(companyId, { companyId: co });
    if (!target) { toast(NEED_COMPANY, 'error'); return; }
    setSaving(true);
    try {
      const records = await spec.build(ready, target, refs);
      await spec.save(target, records);
      toast(spec.savedToast(records.length, target), 'success');
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
        hint={spec.hint}
        note={busy ? 'OCR 분석 중…' : undefined}
      />

      {incomplete.length > 0 && (
        <Message variant="warning">{spec.incompleteNote(incomplete.length)}</Message>
      )}

      {rows.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {rows.map((r) => {
            const st = statusLabel(spec, r);
            const verdict = r.status === 'done' ? derive(r.rec) : null;
            const expandable = needsManual(r) || !isReady(r);
            const open = openId === r.id;
            const missing = spec.missing(r.rec);
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
                  {verdict?.dup ? <Badge tone="red">중복</Badge> : null}
                  {verdict?.badges.map((b) => <Badge key={b.t} tone={b.tone}>{b.t}</Badge>)}
                  <span
                    style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.ink }}
                    title={r.fileName}
                  >
                    {r.fileName}
                  </span>
                  <span style={{ color: C.mute, whiteSpace: 'nowrap' }}>{spec.summary(r.rec) || '—'}</span>
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
                    {spec.manual.map((f) => (
                      <label key={f.key} style={{ display: 'grid', gap: 2 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.sub }}>{f.label}</span>
                        <Input
                          size="sm"
                          type={f.type === 'date' ? 'date' : 'text'}
                          placeholder={f.placeholder}
                          value={f.type === 'date'
                            ? String(r.rec[f.key] || '').slice(0, 10)
                            : String(r.rec[f.key] ?? '')}
                          onChange={(e) => setField(r.id, f.key, e.target.value)}
                        />
                      </label>
                    ))}
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
          {saving ? '등록 중…' : spec.saveLabel(ready.length)}
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
