'use client';
/**
 * 경영관리 「직원」탭 — Auth 계정 주(主) + 대장(lib/staff) 보조 조인.
 * 선택 = 클릭/Shift/Ctrl · 우클릭 ContextMenu. 서버 성공 후에만 갱신.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Btn, C, ContextMenu, type ContextMenuItem, LedgerFrame, LedgerSelectionBar,
  Search, useConfirm, usePrompt,
} from '@/components/ui';
import { companyDefs } from '@/lib/companies';
import { staffDefs, setStaffStatus, type StaffDef } from '@/lib/staff';
import {
  STAFF_COLS, loginAge, staffCompanyLabel,
  type StaffKind, type StaffLiveStatus, type StaffSheetRow,
} from '@/lib/staff-cols';
import { apiAuthHeaders } from '@/lib/api-headers';
import { textMatch } from '@/lib/search-match';
import { toast } from '@/lib/toast';
import { useTableSelection } from '@/lib/use-table-selection';
import { useRowSelection, useCtrlASelectAll } from '@/lib/use-row-selection';
import { useIsMobile } from '@/lib/use-mobile';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';

type AuthUser = {
  uid: string;
  email: string;
  displayName: string;
  createdAt: string;
  lastSignInAt: string;
  disabled: boolean;
  provider: string;
  systemRole: 'hq' | 'tenant' | null;
  companyId: string | null;
};

function kindOf(role: AuthUser['systemRole']): StaffKind {
  if (role === 'hq') return '본사';
  if (role === 'tenant') return '법인';
  return '권한미부여';
}

function liveStatus(p: {
  hasAuth: boolean;
  disabled: boolean;
  days: number | null;
}): StaffLiveStatus {
  if (!p.hasAuth) return '계정없음';
  if (p.disabled) return '정지';
  if (p.days != null && p.days >= 90) return '미로그인';
  return '정상';
}

function buildRows(users: AuthUser[], roster: StaffDef[]): StaffSheetRow[] {
  const byEmail = new Map(roster.map((s) => [s.email.trim().toLowerCase(), s]));
  const seen = new Set<string>();
  const rows: StaffSheetRow[] = [];

  for (const u of users) {
    const email = (u.email || '').trim().toLowerCase();
    if (email) seen.add(email);
    const rosterHit = email ? byEmail.get(email) : undefined;
    const kind = kindOf(u.systemRole);
    const { days, label } = loginAge(u.lastSignInAt);
    const status = liveStatus({ hasAuth: true, disabled: u.disabled, days });
    rows.push({
      id: u.uid,
      uid: u.uid,
      email: u.email || '',
      name: rosterHit?.name || u.displayName || (u.email ? u.email.split('@')[0] : u.uid),
      department: rosterHit?.department || '',
      companyId: u.systemRole === 'hq' ? null : (u.companyId || rosterHit?.companyId || null),
      company: staffCompanyLabel(
        u.systemRole === 'hq' ? null : (u.companyId || rosterHit?.companyId || null),
        kind,
      ),
      kind,
      status,
      lastSignInAt: u.lastSignInAt || '',
      lastSignInLabel: label,
      daysSinceLogin: days,
      disabled: u.disabled,
      provider: u.provider,
      rosterId: rosterHit?.id || '',
      hasAuth: true,
    });
  }

  for (const s of roster) {
    const email = s.email.trim().toLowerCase();
    if (seen.has(email)) continue;
    const kind: StaffKind = s.role === '본사' ? '본사' : '법인';
    rows.push({
      id: `roster:${s.id}`,
      uid: '',
      email: s.email,
      name: s.name,
      department: s.department || '',
      companyId: s.companyId,
      company: staffCompanyLabel(s.companyId, kind),
      kind,
      status: '계정없음',
      lastSignInAt: '',
      lastSignInLabel: LEDGER_EMPTY.dash,
      daysSinceLogin: null,
      disabled: s.status === '정지',
      provider: '',
      rosterId: s.id,
      hasAuth: false,
    });
  }

  return rows.sort((a, b) => a.email.localeCompare(b.email, 'ko'));
}

export function StaffTab({ view }: { view: ReactNode }) {
  const mobile = useIsMobile();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rosterTick, setRosterTick] = useState(0);
  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 });

  const sel = useTableSelection();
  const { clear: clearSel } = sel;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/staff/list', { headers: await apiAuthHeaders() });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(res.status === 401 || res.status === 403 || out.error === 'unauthorized'
          ? '직원관리 권한이 없습니다. 본사 관리자 계정으로 다시 로그인해 주세요.'
          : out.error || '직원 목록을 불러오지 못했습니다');
        setUsers([]);
        return;
      }
      setUsers(Array.isArray(out.users) ? out.users : []);
    } catch (e) {
      setError((e as Error).message || '직원 목록 실패');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const on = () => setRosterTick((n) => n + 1);
    window.addEventListener('jpk:staff-change', on);
    return () => window.removeEventListener('jpk:staff-change', on);
  }, []);

  const roster = useMemo(() => {
    void rosterTick;
    return staffDefs();
  }, [rosterTick]);

  const allRows = useMemo(() => buildRows(users, roster), [users, roster]);
  const rows = useMemo(
    () => allRows.filter((r) => textMatch(q, r.name, r.email, r.company, r.kind, r.status, r.department)),
    [allRows, q],
  );
  const rowIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const rowSel = useRowSelection({ ids: rowIds, selection: sel });
  useCtrlASelectAll(rowSel, sel);

  useEffect(() => { clearSel(); }, [q, clearSel]);

  const selectedRows = useMemo(
    () => rows.filter((r) => sel.selectedIds.has(r.id)),
    [rows, sel.selectedIds],
  );
  const primary = selectedRows[0] || null;

  const api = async (url: string, init: RequestInit) => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        ...init,
        headers: await apiAuthHeaders({ 'Content-Type': 'application/json', ...(init.headers || {}) }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(out.error || '처리 실패', 'error');
        return null;
      }
      return out;
    } catch (e) {
      toast((e as Error).message || '처리 실패', 'error');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const syncRosterDisabled = (email: string, disabled: boolean) => {
    const s = roster.find((x) => x.email.trim().toLowerCase() === email.trim().toLowerCase());
    if (s) setStaffStatus(s.id, disabled ? '정지' : '활성');
  };

  const doSuspend = async (r: StaffSheetRow, suspend: boolean) => {
    if (!r.hasAuth || !r.uid) {
      toast('로그인 계정이 없습니다(대장에만 있음)', 'info');
      return;
    }
    if (suspend && !(await confirm({
      message: `"${r.name}"(${r.email}) 로그인을 차단합니다. 계정이 비활성화되고 기존 세션도 즉시 만료됩니다. 계속?`,
      danger: true,
    }))) return;
    const out = await api('/api/staff/suspend', {
      method: 'POST',
      body: JSON.stringify({ uid: r.uid, suspend }),
    });
    if (!out) return;
    syncRosterDisabled(r.email, suspend);
    toast(suspend ? `${r.name} 로그인 차단` : `${r.name} 활성화`, 'success');
    await load();
  };

  const doRole = async (r: StaffSheetRow, systemRole: 'hq' | 'tenant') => {
    if (!r.hasAuth || !r.uid) {
      toast('로그인 계정이 없습니다', 'info');
      return;
    }
    let companyId: string | undefined;
    if (systemRole === 'tenant') {
      const companies = companyDefs();
      const hint = companies.map((c) => c.id).join(', ');
      const typed = await prompt({
        message: `법인 코드 입력 (${hint})`,
        required: true,
        initial: r.companyId || '',
      });
      if (typed == null) return;
      if (!companies.some((c) => c.id === typed.trim())) {
        toast('알 수 없는 법인 코드', 'error');
        return;
      }
      companyId = typed.trim();
    } else if (!(await confirm({
      message: `"${r.name}"을(를) 본사(전 법인) 권한으로 올립니다. 계속?`,
    }))) return;

    const out = await api('/api/staff/role', {
      method: 'POST',
      body: JSON.stringify({ uid: r.uid, systemRole, companyId }),
    });
    if (!out) return;
    toast(`권한 변경: ${systemRole === 'hq' ? '본사' : `법인/${companyId}`}`, 'success');
    await load();
  };

  const doReset = async (r: StaffSheetRow) => {
    if (!r.email) {
      toast('이메일이 없습니다', 'info');
      return;
    }
    const out = await api('/api/staff/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email: r.email }),
    });
    if (!out?.link) return;
    await prompt({
      title: '비밀번호 재설정 링크',
      message: '아래 링크를 복사해 본인에게 전달하세요. (메일 발송 인프라 없음)',
      initial: String(out.link),
      confirmLabel: '닫기',
    });
    toast('재설정 링크 발급됨 — 복사해 전달하세요', 'success');
  };

  const doDelete = async (r: StaffSheetRow) => {
    if (!r.hasAuth || !r.uid) {
      toast('로그인 계정이 없습니다', 'info');
      return;
    }
    if (!(await confirm({
      message: `"${r.name}"(${r.email}) Auth 계정을 삭제합니다. 되돌릴 수 없습니다. 계속?`,
      danger: true,
    }))) return;
    const typed = await prompt({
      message: `확인: 이메일 "${r.email}" 을(를) 그대로 입력하세요.`,
      required: true,
    });
    if (typed == null) return;
    if (typed.trim().toLowerCase() !== r.email.trim().toLowerCase()) {
      toast('삭제 취소 — 이메일 불일치', 'info');
      return;
    }
    const out = await api('/api/staff/delete', {
      method: 'DELETE',
      body: JSON.stringify({ uid: r.uid }),
    });
    if (!out) return;
    toast(`${r.name} 계정 삭제됨`, 'success');
    clearSel();
    await load();
  };

  const ctxItems: ContextMenuItem[] = (() => {
    if (!primary) return [];
    const r = primary;
    const multi = selectedRows.length > 1;
    if (multi) {
      return [{ label: `${selectedRows.length}명 선택됨 — 단건 메뉴만`, disabled: true, onClick: () => {} }];
    }
    if (!r.hasAuth) {
      return [
        { label: '로그인 계정 없음(대장만)', disabled: true, onClick: () => {} },
      ];
    }
    return [
      {
        label: r.disabled ? '활성화' : '정지',
        danger: !r.disabled,
        disabled: busy,
        onClick: () => { void doSuspend(r, !r.disabled); },
      },
      { type: 'separator' },
      {
        label: '본사 권한',
        disabled: busy || r.kind === '본사',
        onClick: () => { void doRole(r, 'hq'); },
      },
      {
        label: '법인 권한…',
        disabled: busy,
        onClick: () => { void doRole(r, 'tenant'); },
      },
      { type: 'separator' },
      {
        label: '비밀번호 재설정 링크',
        disabled: busy || !r.email,
        onClick: () => { void doReset(r); },
      },
      {
        label: '계정 삭제…',
        danger: true,
        disabled: busy,
        onClick: () => { void doDelete(r); },
      },
    ];
  })();

  return (
    <>
      <LedgerFrame
        title="경영관리"
        meta="법인 · 계좌 · 임대차 · 직원"
        view={view}
        filters={(
          <Search
            size="sm"
            placeholder="이름·이메일·회사·상태"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: mobile ? 160 : 280, flexShrink: 0 }}
          />
        )}
        stats={(
          <span style={{ fontSize: 12.5, color: C.mute }}>
            {error ? <>원격 계정 조회 실패 · 로컬 대장 <b>{roster.length}</b>명</> : <>계정 <b>{rows.length}</b></>}
            {busy && <> · 처리 중…</>}
          </span>
        )}
        selectionBar={sel.size > 0 ? (
          <LedgerSelectionBar count={sel.size} onClear={clearSel} onSelectAll={() => sel.selectAll(rowIds)}>
            <Btn size="sm" variant="ghost" disabled={busy} onClick={() => { void load(); }}>새로고침</Btn>
          </LedgerSelectionBar>
        ) : null}
        loading={loading}
        error={error}
        empty="Auth 계정 없음"
        cols={STAFF_COLS}
        rows={rows}
        rowKey={(r) => r.id}
        selectedKeys={sel.selectedIds}
        onRowMouseDown={(e) => rowSel.onRowMouseDown(e)}
        onRowClickEvent={(e, r, idx) => { rowSel.onRowClick(e, r.id, idx); }}
        onRowContextMenu={(e, r, idx) => {
          rowSel.onRowContextMenu(e, r.id, idx, () => {
            setCtxMenu({ open: true, x: e.clientX, y: e.clientY });
          });
        }}
      />
      <ContextMenu
        open={ctxMenu.open}
        x={ctxMenu.x}
        y={ctxMenu.y}
        onClose={() => setCtxMenu((m) => ({ ...m, open: false }))}
        items={ctxItems}
      />
    </>
  );
}
