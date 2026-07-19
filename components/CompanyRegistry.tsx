'use client';
// 법인 목록 관리 — 평소엔 고정 표시(읽기 전용). 헤더 '수정'을 눌러 편집 모드로 들어가야 바꿀 수 있음.
import { useState } from 'react';
import { Plus, Trash2, Pencil, Check } from 'lucide-react';
import { companyDefs, addCompany, updateCompany, removeCompany } from '@/lib/companies';
import { Panel, Btn, Input, C } from '@/components/ui';

export function CompanyRegistry() {
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const [edit, setEdit] = useState(false);
  const [nw, setNw] = useState({ label: '', short: '' });
  const defs = companyDefs();

  const del = (id: string, label: string) => {
    if (window.confirm(`법인 "${label}"을(를) 목록에서 제거합니다.\n(그 법인 데이터는 삭제되지 않지만 화면에서 사라집니다) 계속?`)) { removeCompany(id); rerender(); }
  };
  const add = () => { if (addCompany(nw.label, nw.short)) { setNw({ label: '', short: '' }); rerender(); } };

  return (
    <Panel title="법인 목록" action={
      <Btn size="sm" variant={edit ? 'solid' : 'ghost'} onClick={() => setEdit((e) => !e)}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{edit ? <><Check size={13} /> 완료</> : <><Pencil size={13} /> 수정</>}</span>
      </Btn>
    }>
      <div style={{ padding: '10px 16px 14px' }}>
        <p style={{ fontSize: 12.5, color: C.mute, margin: '0 0 4px', lineHeight: 1.7 }}>
          {edit
            ? '편집 모드 — 법인명·약칭을 바꾸고, 삭제하거나 새 법인을 추가할 수 있습니다. 추가하면 스위처·법인관리 페이지가 자동 생성됩니다.'
            : '확정된 법인 목록입니다. 바꾸려면 오른쪽 위 “수정”을 누르세요.'}
        </p>

        {defs.map((c) => edit ? (
          // 편집 모드 — 입력
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: `1px solid var(--border-soft)`, flexWrap: 'wrap' }}>
            <Input defaultValue={c.label} onBlur={(e) => { updateCompany(c.id, { label: e.target.value }); rerender(); }} placeholder="법인명" style={{ flex: 1, minWidth: 180 }} />
            <Input defaultValue={c.short || ''} onBlur={(e) => updateCompany(c.id, { short: e.target.value })} placeholder="약칭" style={{ width: 120 }} />
            <span style={{ fontSize: 11, color: C.faint, fontFamily: 'var(--font-mono)', minWidth: 70 }}>{c.id}</span>
            <button onClick={() => del(c.id, c.label)} title="삭제" style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.faint, display: 'inline-flex', padding: 4 }} onMouseEnter={(e) => (e.currentTarget.style.color = C.danger)} onMouseLeave={(e) => (e.currentTarget.style.color = C.faint)}><Trash2 size={15} /></button>
          </div>
        ) : (
          // 고정 표시(읽기 전용)
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderTop: `1px solid var(--border-soft)` }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: C.ink }}>{c.label}</span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: C.mute, background: 'var(--bg-card)', border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', padding: '2px 8px' }}>{c.short || '—'}</span>
            <span style={{ fontSize: 11, color: C.faint, fontFamily: 'var(--font-mono)', minWidth: 70 }}>{c.id}</span>
          </div>
        ))}

        {/* 법인 추가 — 편집 모드에서만 */}
        {edit && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: `1px solid ${C.line}`, marginTop: 6, paddingTop: 12 }}>
            <Input value={nw.label} onChange={(e) => setNw((v) => ({ ...v, label: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="새 법인명" style={{ flex: 1, minWidth: 180 }} />
            <Input value={nw.short} onChange={(e) => setNw((v) => ({ ...v, short: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="약칭(선택)" style={{ width: 120 }} />
            <Btn size="sm" onClick={add} disabled={!nw.label.trim()}><Plus size={13} /> 추가</Btn>
          </div>
        )}
      </div>
    </Panel>
  );
}
