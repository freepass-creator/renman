'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import { getStore } from '@/lib/store';
import { ENTITIES, type EntityRecord } from '@/lib/intake/entities';
import { companyLabel } from '@/lib/companies';
import { Page, DetailShell, Panel, Sec, Cards, Metric, FormGrid, Btn, EmptyState, Message, C, PageLoading, usePrompt } from '@/components/ui';
import { commitUpdate, commitRemove } from '@/lib/commit';

export default function DetailPage() {
  const params = useParams();
  const router = useRouter();
  const entityKey = String(params.entity);
  const id = decodeURIComponent(String(params.id));
  const { companyId } = useSession();
  const prompt = usePrompt();
  const entity = ENTITIES[entityKey];
  const [rec, setRec] = useState<EntityRecord | null>(null);
  const [form, setForm] = useState<EntityRecord>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!entity) return;
    getStore().get(entityKey, companyId, id).then((r) => { setRec(r); setForm(r || {}); setLoading(false); }).catch(() => setLoading(false));
  }, [entityKey, companyId, id, entity]);

  async function save() {
    setMsg('');
    try {
      await commitUpdate({ entity: entityKey, sessionCompanyId: companyId, rec, key: id, patch: form });
      setMsg('저장됨');
    } catch (e) { setMsg('저장 실패: ' + (e as Error).message); }
  }
  async function remove() {
    const reason = await prompt({ message: `${entity.label} 삭제 사유 (취소=중단)` });
    if (reason === null) return;
    try {
      await commitRemove({ entity: entityKey, sessionCompanyId: companyId, rec, key: id, reason });
      router.push(`/list/${entityKey}`);
    } catch (e) { setMsg('삭제 실패: ' + (e as Error).message); }
  }
  async function restore() {
    try { await getStore().restore(entityKey, companyId, id); const r = await getStore().get(entityKey, companyId, id); setRec(r); setForm(r || {}); setMsg('복원됨'); }
    catch (e) { setMsg('복원 실패: ' + (e as Error).message); }
  }

  if (!entity) return <Page title="알 수 없는 엔티티"><EmptyState>존재하지 않는 데이터 종류</EmptyState></Page>;
  if (loading) return <Page title={`${entityKey} 상세`}><PageLoading /></Page>;
  if (!rec) return <Page title={`${entity.label} 상세`}><EmptyState>레코드 없음 ({companyLabel(companyId)} · {id}) — <a href={`/list/${entityKey}`} style={{ color: C.accent }}>목록</a></EmptyState></Page>;

  const meta = `${companyLabel(companyId)} · 저장 ${String(rec.createdAt || '').slice(0, 16).replace('T', ' ')}${rec.updatedAt ? ' · 수정 ' + String(rec.updatedAt).slice(0, 16).replace('T', ' ') : ''}`;
  const deleted = !!rec.deletedAt;

  return (
    <DetailShell onBack={() => router.back()} title={`${entity.label} · ${id}`}>
      <div style={{ fontSize: 12, color: C.faint, marginBottom: 10 }}>{meta}</div>
      {deleted && <Message variant="danger">삭제된 항목입니다{rec.deletedReason ? ` · 사유: ${String(rec.deletedReason)}` : ''}. 편집하려면 먼저 복원하세요.</Message>}
      <Sec title="현황" desc="기본 정보">
        <Cards min={128} fit>
          <Metric label="엔티티" value={entity.label} tone="ink" />
          <Metric label="ID" value={id} tone="ok" />
          <Metric label="회사" value={companyLabel(companyId)} tone="ink" />
          <Metric label="상태" value={String(rec.status ?? '') || '—'} tone={rec.status ? 'warn' : 'ink'} />
        </Cards>
      </Sec>
      <Panel title="수정 정보">
        <FormGrid fields={entity.fields} form={form} onChange={(k, v) => setForm({ ...form, [k]: v })} />
      </Panel>

      <Panel title="액션">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {deleted ? (
            <Btn variant="solid" onClick={restore}>복원</Btn>
          ) : (
            <>
              <Btn variant="solid" onClick={save}>저장</Btn>
              <Btn variant="ghost" onClick={() => router.push(`/list/${entityKey}`)}>목록으로</Btn>
              <span style={{ flex: 1 }} />
              <Btn variant="danger" onClick={remove}>삭제 (소프트)</Btn>
            </>
          )}
          {msg && <span style={{ fontSize: 13, color: msg.includes('실패') ? C.danger : C.ok }}>{msg}</span>}
        </div>
      </Panel>

      {rec._ocrOriginal != null && (() => {
        const o = rec._ocrOriginal as { raw?: Record<string, unknown>; at?: string; source?: string };
        return (
          <details style={{ marginTop: 22, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
            <summary style={{ cursor: 'pointer', fontSize: 12.5, color: C.mute, fontWeight: 600 }}>
              원본 OCR 보존 ({o.source || ''} · {String(o.at || '').slice(0, 16).replace('T', ' ')}) — 수기 교정과 무관하게 영구 보존
            </summary>
            <pre style={{ background: C.bg, padding: 12, borderRadius: 6, fontSize: 11.5, overflow: 'auto', marginTop: 8 }}>
              {JSON.stringify(o.raw || {}, null, 2)}
            </pre>
          </details>
        );
      })()}
    </DetailShell>
  );
}
