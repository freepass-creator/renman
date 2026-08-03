'use client';
// 법인 목록 관리 — 평소엔 고정 표시(읽기 전용). 헤더 '수정'을 눌러 편집 모드로 들어가야 바꿀 수 있음.
import { useState } from 'react';
import { Plus, Trash2, Pencil, Check } from 'lucide-react';
import { companyDefs, addCompany, updateCompany, removeCompany, companyRegisteredName } from '@/lib/companies';
import { useSession } from '@/lib/session';
import { Panel, Btn, Input, C, useConfirm } from '@/components/ui';

export function CompanyRegistry() {
  const { isOperator, companyId } = useSession();
  const confirm = useConfirm();
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const [edit, setEdit] = useState(false);
  const [nw, setNw] = useState({ label: '' });
  const defs = companyDefs().filter((c) => isOperator || c.id === companyId);

  const del = async (id: string, label: string) => {
    if (await confirm({ message: `법인 "${label}"을(를) 목록에서 제거합니다.\n(그 법인 데이터는 삭제되지 않지만 화면에서 사라집니다) 계속?`, danger: true })) { removeCompany(id); rerender(); }
  };
  const add = () => { if (addCompany(nw.label)) { setNw({ label: '' }); rerender(); } };

  return (
    <Panel title="법인 목록" action={isOperator ? (
      <Btn size="sm" variant={edit ? 'solid' : 'ghost'} onClick={() => setEdit((e) => !e)}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{edit ? <><Check size={13} /> 완료</> : <><Pencil size={13} /> 수정</>}</span>
      </Btn>
    ) : undefined}>
      <div style={{ padding: '10px 16px 14px' }}>
        <p style={{ fontSize: 12.5, color: C.mute, margin: '0 0 4px', lineHeight: 1.7 }}>
          {edit && isOperator
            ? '편집 모드 — ERP에서 관리할 회사를 추가·수정·제거합니다. 사업자등록증 상호를 입력하세요.'
            : isOperator
              ? '현재 ERP에서 관리하는 회사 목록입니다. 고정된 회사가 아니며 수정에서 범위를 바꿀 수 있습니다.'
              : '현재 계정에서 조회할 수 있는 회사 목록입니다. 관리 범위 변경은 본사 운영자 권한이 필요합니다.'}
        </p>

        {defs.map((c) => edit && isOperator ? (
          // 편집 모드 — 입력
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: `1px solid var(--border-soft)`, flexWrap: 'wrap' }}>
            <Input defaultValue={c.label} onBlur={(e) => { updateCompany(c.id, { label: e.target.value }); rerender(); }} placeholder="사업자등록증 상호" style={{ flex: 1, minWidth: 180 }} />
            <span style={{ fontSize: 11, color: C.faint, fontFamily: 'var(--font-mono)', minWidth: 70 }}>{c.id}</span>
            <Btn size="sm" variant="danger" iconOnly tip="회사 제거" onClick={() => del(c.id, c.label)}><Trash2 size={14} /></Btn>
          </div>
        ) : (
          // 고정 표시(읽기 전용)
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderTop: `1px solid var(--border-soft)` }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: C.ink }}>{companyRegisteredName(c.label)}</span>
            <span style={{ fontSize: 11, color: C.faint, fontFamily: 'var(--font-mono)', minWidth: 70 }}>{c.id}</span>
          </div>
        ))}

        {/* 법인 추가 — 편집 모드에서만 */}
        {edit && isOperator && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: `1px solid ${C.line}`, marginTop: 6, paddingTop: 12 }}>
            <Input value={nw.label} onChange={(e) => setNw({ label: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="새 회사 · 사업자등록증 상호" style={{ flex: 1, minWidth: 180 }} />
            <Btn size="sm" onClick={add} disabled={!nw.label.trim()}><Plus size={13} /> 추가</Btn>
          </div>
        )}
      </div>
    </Panel>
  );
}
