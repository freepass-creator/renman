'use client';
// 직원 · 접근 권한 콘솔 — 역할(본사/법인)·소속 법인·상태(활성/정지)를 관리. 평소 읽기전용, '수정'으로 편집.
//   로그인 계정 연결(초대메일·비번리셋)은 Firebase Auth 배선 시 활성 — 여기서는 email 로 매칭될 권한 대장을 관리한다.
import { useState } from 'react';
import { Plus, Trash2, Pencil, Check } from 'lucide-react';
import { staffDefs, addStaff, updateStaff, removeStaff, setStaffStatus, type StaffRole } from '@/lib/staff';
import { companyDefs, companyLabel } from '@/lib/companies';
import { Panel, Btn, Input, Select, Badge, C, useConfirm } from '@/components/ui';
import { apiAuthHeaders } from '@/lib/api-headers';
import { toast } from '@/lib/toast';

const ROLES: StaffRole[] = ['본사', '법인'];

export function StaffConsole() {
  const confirm = useConfirm();
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const [edit, setEdit] = useState(false);
  const [busyId, setBusyId] = useState('');
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

  /**
   * ★정지·해제는 서버 조치 — Firebase Auth 계정 비활성화 + 리프레시 토큰 폐기.
   *   대장(localStorage)만 바꾸면 직원 브라우저에 전파되지 않아 실제로 차단되지 않는다(QA 긴급).
   *   서버 성공 후에만 대장 상태를 갱신한다.
   */
  const toggleSuspend = async (s: { id: string; name: string; email: string; status: string }) => {
    const suspend = s.status === '활성';
    if (suspend && !(await confirm({
      message: `"${s.name}"(${s.email}) 로그인을 차단합니다. 계정이 비활성화되고 기존 세션도 즉시 만료됩니다. 계속?`,
      danger: true,
    }))) return;
    setBusyId(s.id);
    try {
      const res = await fetch('/api/staff/suspend', {
        method: 'POST',
        headers: await apiAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ email: s.email, suspend }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { toast(out.error || '정지 처리 실패', 'error'); return; }
      setStaffStatus(s.id, suspend ? '정지' : '활성');
      toast(suspend ? `${s.name} 로그인 차단(계정 비활성·세션 만료)` : `${s.name} 활성화`, 'success');
      rerender();
    } catch (e) {
      toast(`정지 처리 실패: ${(e as Error).message}`, 'error');
    } finally { setBusyId(''); }
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
            ? '편집 모드 — 역할·소속은 관리대장(표시용), 실제 권한은 claims. «정지»는 서버 조치: Auth 계정 비활성 + 기존 세션 즉시 만료.'
            : '직원별 역할·소속 관리대장. «정지»는 로그인 계정을 비활성화하고 기존 세션도 만료시킵니다(서버 반영).'}
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
            <Btn size="sm" variant={s.status === '활성' ? 'ghost' : 'danger'} disabled={busyId === s.id} onClick={() => { void toggleSuspend(s); }}>{busyId === s.id ? '처리 중…' : (s.status === '활성' ? '정지' : '활성화')}</Btn>
            <Btn size="sm" variant="danger" iconOnly tip="직원 제거" onClick={() => del(s.id, s.name)}><Trash2 size={14} /></Btn>
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
