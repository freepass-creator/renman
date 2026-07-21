'use client';
import { Fragment, useMemo, useState } from 'react';
import { useSession } from '@/lib/session';
import { companyLabel } from '@/lib/companies';
import { ENTITIES } from '@/lib/intake/entities';
import { AUDIT_ACTION_LABEL, type AuditLog } from '@/lib/audit';
import { FacetPage, Sec, EmptyState, Badge, Btn, C, th, td, type BadgeTone, PageLoading } from '@/components/ui';
import { FacetRail } from '@/components/FacetRail';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { useIsMobile } from '@/lib/use-mobile';
import { textMatch } from '@/lib/search-match';
import { useEntityList } from '@/lib/use-entity-lists';

const ACTION_TONE: Record<string, BadgeTone> = {
  create: 'green', import: 'green', update: 'blue', delete: 'red',
  restore: 'amber', match: 'teal', unmatch: 'orange', login: 'gray', logout: 'gray',
};
const fmtAt = (iso: string) => (iso || '').slice(0, 16).replace('T', ' ');
const entLabel = (k: string) => ENTITIES[k]?.label || k;

export default function AuditPage() {
  const { companyId, scopeAll } = useSession();
  const mobile = useIsMobile();
  const { rows: raw, loading, reload } = useEntityList('audit_logs');
  const rows = useMemo(
    () => (raw as AuditLog[]).slice().sort((a, b) => (b.at || '').localeCompare(a.at || '')),
    [raw],
  );
  const [facets, setFacets] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const toggleFacet = (label: string) => setFacets((s) => { const n = new Set(s); n.has(label) ? n.delete(label) : n.add(label); return n; });
  const resetFacets = () => setFacets(new Set());

  // 필터 축: 행위 + 대상. 각 축은 rows에 실제 존재하는 값으로 동적 생성 → 좌측 FacetRail.
  const actionChips = useMemo(() => {
    const c = new Map<string, number>();
    rows.forEach((r) => c.set(r.action, (c.get(r.action) || 0) + 1));
    return [...c.keys()].map((k) => ({ key: k, label: AUDIT_ACTION_LABEL[k as keyof typeof AUDIT_ACTION_LABEL] || k }));
  }, [rows]);
  const entityChips = useMemo(() => {
    const c = new Map<string, number>();
    rows.forEach((r) => c.set(r.entityType, (c.get(r.entityType) || 0) + 1));
    return [...c.keys()].map((k) => ({ key: k, label: entLabel(k) }));
  }, [rows]);
  const groups = useMemo(() => [
    { dim: '행위', chips: actionChips.map((c) => ({ label: c.label })) },
    { dim: '대상', chips: entityChips.map((c) => ({ label: c.label })) },
  ], [actionChips, entityChips]);

  // 라벨 Set(facets) → 축별 선택 키. 축 안은 멀티셀렉트(OR), 축 간은 AND.
  const actionSel = actionChips.filter((c) => facets.has(c.label)).map((c) => c.key);
  const entitySel = entityChips.filter((c) => facets.has(c.label)).map((c) => c.key);
  const filtered = rows.filter((r) =>
    (actionSel.length === 0 || actionSel.includes(r.action)) &&
    (entitySel.length === 0 || entitySel.includes(r.entityType)) &&
    textMatch(q, r.label, r.by, r.byEmail, entLabel(r.entityType), AUDIT_ACTION_LABEL[r.action], r.entityId));

  return (
    <FacetPage
      title="감사 로그"
      meta={`${scopeAll ? '전체 회사' : companyLabel(companyId)} · ${filtered.length}건`}
      tools={<WorkbenchBar search={{ value: q, onChange: setQ, placeholder: '요약·행위자·대상' }} actions={<Btn variant="ghost" onClick={reload}>새로고침</Btn>} />}
      rail={!loading ? <FacetRail groups={groups} facets={facets} onToggle={toggleFacet} onReset={resetFacets} /> : null}
    >
      <Sec title="변경 이력" n={filtered.length} desc="등록·수정·삭제·복구 append-only 트레일 — 행 클릭 시 상세" hideable={false}>
        {loading ? <PageLoading />
          : filtered.length === 0 ? <EmptyState>기록된 변경 이력이 없습니다{rows.length === 0 ? ' (변경이 발생하면 여기 쌓입니다)' : ''}</EmptyState>
            : (
              <div style={{ overflowX: 'auto', border: `1px solid ${C.line}`, borderRadius: 'var(--radius)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                  <thead><tr>
                    <th style={{ ...th, width: 128 }}>시각</th>
                    <th style={{ ...th, width: 62 }}>행위</th>
                    <th style={{ ...th, width: 72 }}>대상</th>
                    <th style={th}>요약</th>
                    <th style={{ ...th, width: 100 }}>행위자</th>
                    {scopeAll && <th style={{ ...th, width: 84 }}>회사</th>}
                  </tr></thead>
                  <tbody>
                    {filtered.map((r) => {
                      const open = openId === r.id;
                      return (
                        <Fragment key={r.id}>
                          <tr onClick={() => setOpenId(open ? null : r.id)} style={{ cursor: 'pointer', background: open ? 'var(--bg-stripe)' : undefined }}>
                            <td style={{ ...td, fontFamily: 'var(--font-mono)', color: C.mute, whiteSpace: 'nowrap' }}>{fmtAt(r.at)}</td>
                            <td style={td}><Badge tone={ACTION_TONE[r.action] || 'gray'}>{AUDIT_ACTION_LABEL[r.action] || r.action}</Badge></td>
                            <td style={{ ...td, color: C.mute }}>{entLabel(r.entityType)}</td>
                            <td style={td}>{r.label}</td>
                            <td style={{ ...td, color: C.mute }}>{r.by}</td>
                            {scopeAll && <td style={{ ...td, color: C.faint, fontSize: 11 }}>{companyLabel(r.companyId)}</td>}
                          </tr>
                          {open && (
                            <tr>
                              <td style={{ ...td, background: 'var(--bg-stripe)' }} colSpan={scopeAll ? 6 : 5}>
                                <Diff before={r.before} after={r.after} />
                                <div style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>{r.byEmail || r.byUid} · {r.at?.slice(0, 19).replace('T', ' ')} · id {r.entityId || '—'}</div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
      </Sec>
    </FacetPage>
  );
}

/** before/after 변경 상세 — 값이 바뀐 키만(수정) / 스냅샷(등록·삭제). */
function Diff({ before, after }: { before?: Record<string, unknown> | null; after?: Record<string, unknown> | null }) {
  const keys = [...new Set([...(before ? Object.keys(before) : []), ...(after ? Object.keys(after) : [])])]
    .filter((k) => !['createdBy', 'createdByUid', 'createdAt', 'updatedBy', 'updatedByUid', 'updatedAt', '_key', 'companyId'].includes(k))
    .slice(0, 20);
  if (keys.length === 0) return <div style={{ fontSize: 12, color: C.faint }}>상세 스냅샷 없음</div>;
  const show = (v: unknown) => (v == null || v === '' ? '—' : String(v));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(90px,auto) 1fr', gap: '4px 14px', fontSize: 12 }}>
      {keys.map((k) => {
        const b = before?.[k], a = after?.[k];
        const changed = before && after && String(b ?? '') !== String(a ?? '');
        return (
          <Fragment key={k}>
            <div style={{ color: C.faint, fontWeight: 600 }}>{k}</div>
            <div style={{ color: C.ink }}>
              {before && after
                ? (changed ? <span><span style={{ color: C.mute, textDecoration: 'line-through' }}>{show(b)}</span> <span style={{ color: C.faint }}>→</span> <b>{show(a)}</b></span> : <span style={{ color: C.mute }}>{show(a)}</span>)
                : <span>{show(a ?? b)}</span>}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
