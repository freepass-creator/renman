'use client';
// 직원 · 접근 권한 콘솔 — 역할(본사/법인)·소속 법인·상태(활성/정지)를 관리. 평소 읽기전용, '수정'으로 편집.
//   로그인 계정 연결(초대메일·비번리셋)은 Firebase Auth 배선 시 활성 — 여기서는 email 로 매칭될 권한 대장을 관리한다.
import { useState } from 'react';
import { Plus, Trash2, Pencil, Check } from 'lucide-react';
import { staffDefs, addStaff, updateStaff, removeStaff, setStaffStatus, type StaffRole } from '@/lib/staff';
import { companyDefs, companyLabel } from '@/lib/companies';
import { Panel, Btn, Input, Select, Badge, C, useConfirm } from '@/components/ui';

const ROLES: StaffRole[] = ['본사', '법인'];

export function StaffConsole() {
  const confirm = useConfirm();
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const [edit, setEdit] = useState(false);
  const [nw, setNw] = useState<{ name: string; email: string; role: StaffRole; companyId: string; department: string; phone: string }>({ name: '', email: '', role: '법인', companyId: '', department: '', phone: '' });
  const rows = staffDefs();
  const companies = companyDefs();

  const del = async (id: string, name: string) => {
    if (await confirm({ message: `직원 "${name}"을(를) 명단에서 제거합니다. 계속?`, danger: true })) { removeStaff(id); rerender(); }
  };
  const add = () => {
    const id = addStaff({ name: nw.name, email: nw.email, role: nw.role, companyId: nw.role === '법인' ? nw.companyId : null, department: nw.department, phone: nw.phone });
    if (id) { setNw({ name: '', email: '', role: '법인', companyId: '', department: '', phone: '' }); rerender(); }
    else window.alert('이름·이메일을 확인하세요(이메일 중복 불가).');
  };

  return (
    <Panel title="직원 · 접근 권한" action={
      <Btn size="sm" variant={edit ? 'solid' : 'ghost'} onClick={() => setEdit((e) => !e)}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{edit ? <><Check size={13} /> 완료</> : <><Pencil size={13} /> 수정</>}</span>
      </Btn>
    }>
      <div style={{ padding: '10px 16px 14px' }}>
        <p style={{ fontSize: 12.5, color: C.mute, margin: '0 0 6px', lineHeight: 1.7 }}>
          {edit
            ? '편집 모드 — 역할·소속·상태. 정지는 다음 로그인부터 차단됩니다(명단 이메일 매칭). Auth 계정 비활성화는 Firebase 콘솔에서 별도.'
            : '직원별 역할·소속 법인 관리대장. 정지 시 동일 이메일 로그인이 차단됩니다.'}
        </p>

        {rows.map((s) => edit ? (
          // ── 편집 모드 ──
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderTop: '1px solid var(--border-soft)', flexWrap: 'wrap' }}>
            <Input defaultValue={s.name} onBlur={(e) => { updateStaff(s.id, { name: e.target.value }); rerender(); }} placeholder="이름" style={{ width: 110 }} />
            <Input defaultValue={s.email} onBlur={(e) => { updateStaff(s.id, { email: e.target.value }); rerender(); }} placeholder="이메일" style={{ flex: 1, minWidth: 160 }} />
            <Select size="sm" defaultValue={s.role} onChange={(e) => { updateStaff(s.id, { role: e.target.value as StaffRole }); rerender(); }} style={{ width: 76 }}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
            <Select size="sm" defaultValue={s.companyId || ''} disabled={s.role === '본사'} onChange={(e) => { updateStaff(s.id, { companyId: e.target.value }); rerender(); }} style={{ width: 120 }}>
              <option value="">{s.role === '본사' ? '전 법인' : '법인 선택'}</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
            <Btn size="sm" variant={s.status === '활성' ? 'ghost' : 'danger'} onClick={() => { setStaffStatus(s.id, s.status === '활성' ? '정지' : '활성'); rerender(); }}>{s.status === '활성' ? '정지' : '활성화'}</Btn>
            <button onClick={() => del(s.id, s.name)} title="삭제" style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.faint, display: 'inline-flex', padding: 4 }} onMouseEnter={(e) => (e.currentTarget.style.color = C.danger)} onMouseLeave={(e) => (e.currentTarget.style.color = C.faint)}><Trash2 size={15} /></button>
          </div>
        ) : (
          // ── 읽기 전용 ──
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderTop: '1px solid var(--border-soft)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, minWidth: 92 }}>{s.name}</span>
            <Badge tone={s.role === '본사' ? 'purple' : 'blue'}>{s.role}</Badge>
            <span style={{ fontSize: 12, color: C.mute, minWidth: 90 }}>{s.role === '본사' ? '전 법인' : companyLabel(s.companyId)}</span>
            <span style={{ flex: 1, minWidth: 140, fontSize: 11.5, color: C.faint, fontFamily: 'var(--font-mono)' }}>{s.email}</span>
            {s.department && <span style={{ fontSize: 11.5, color: C.faint }}>{s.department}</span>}
            <Badge tone={s.status === '활성' ? 'green' : 'red'}>{s.status}</Badge>
          </div>
        ))}

        {/* ── 직원 추가 ── */}
        {edit && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: `1px solid ${C.line}`, marginTop: 6, paddingTop: 12 }}>
            <Input value={nw.name} onChange={(e) => setNw((v) => ({ ...v, name: e.target.value }))} placeholder="이름" style={{ width: 110 }} />
            <Input value={nw.email} onChange={(e) => setNw((v) => ({ ...v, email: e.target.value }))} placeholder="이메일" style={{ flex: 1, minWidth: 160 }} />
            <Select size="sm" value={nw.role} onChange={(e) => setNw((v) => ({ ...v, role: e.target.value as StaffRole }))} style={{ width: 76 }}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
            <Select size="sm" value={nw.companyId} disabled={nw.role === '본사'} onChange={(e) => setNw((v) => ({ ...v, companyId: e.target.value }))} style={{ width: 120 }}>
              <option value="">{nw.role === '본사' ? '전 법인' : '법인 선택'}</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
            <Input value={nw.department} onChange={(e) => setNw((v) => ({ ...v, department: e.target.value }))} placeholder="부서(선택)" style={{ width: 100 }} />
            <Btn size="sm" onClick={add} disabled={!nw.name.trim() || !nw.email.trim() || (nw.role === '법인' && !nw.companyId)}><Plus size={13} /> 추가</Btn>
          </div>
        )}
      </div>
    </Panel>
  );
}
