'use client';
/**
 * 세션/계정 레이어 — role·법인(companyId)은 로그인 계정에서 파생 (자유 토글 X).
 *   · 한 회사가 법인 여러 개 보유. 본사 계정=전 법인 합본·전환. 직원=배정된 법인만.
 *   · firebaseReady() → Auth + users/{uid}. 미설정 → DEV_USERS + 시드.
 *   · 레거시 role '운영자'/'위탁사'는 로드 시 본사/법인으로 정규화(호환).
 */
import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { COMPANIES, ALL_COMPANIES } from './companies';
import { firebaseReady } from './firebase/client';
import { watchAuth, loadProfile, signInEmail, signOutUser, resetPassword, signup, normalizeRole, type Role } from './firebase/auth';
import { setAuditActor } from './audit';
import { startLiveSync } from './live-sync';
import { isStaffSuspended } from './staff';
import { withTimeout } from './async';
import { Spinner } from '@/components/Spinner';

export { COMPANIES, ALL_COMPANIES, normalizeRole };
export type { Role };
export type User = { uid: string; name: string; email: string; role: Role; companyId: string | null };

export function roleLabel(role: Role): string {
  return role === '본사' ? '본사 (전 법인)' : '법인 소속';
}

export const DEV_USERS: User[] = [
  { uid: 'op1', name: '본사 마스터', email: 'pyh@teamjpk.com', role: '본사', companyId: null },
  { uid: 'ws_prime', name: '프라임구독 직원', email: 'ceo@prime.co.kr', role: '법인', companyId: 'prime' },
  { uid: 'ws_sonogong', name: '손오공렌터카 직원', email: 'ceo@sonogong.co.kr', role: '법인', companyId: 'sonogong' },
];

type Ctx = {
  user: User;
  companyId: string;                  // 활성 스코프 (ALL_COMPANIES = 전 법인 합본)
  setCompanyId: (id: string) => void; // 본사만 — 법인 전환
  login: (uid: string) => void;       // DEV 모드 계정 전환
  logout: () => void;
  isOperator: boolean;                // 본사 권한 (전 법인). 이름 호환 유지.
  scopeAll: boolean;                  // 본사 + 합본 보기
};

const SessionContext = createContext<Ctx | null>(null);
const LS_UID = 'jpkerp6_uid';
const LS_CO = 'jpkerp6_company';
const SEED_KEY = 'jpkerp6:seed_version';
const SEED_VERSION = 'real-2026-07-12-bank';

function resolveCompany(user: User, stored: string | null): string {
  if (user.role === '법인') return user.companyId || '';
  return stored || ALL_COMPANIES; // 본사: 저장 선택 없으면 전 법인 합본
}

type Phase = 'boot' | 'ready' | 'signed-out' | 'no-profile' | 'no-backend' | 'suspended';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(DEV_USERS[0]);
  const [companyId, setCompanyState] = useState<string>(ALL_COMPANIES);
  const [phase, setPhase] = useState<Phase>('boot');

  useEffect(() => {
    // ── 프로덕션 안전 가드 — Firebase 미설정 시 로컬 폴백은 위험(무인증·데이터 유실). prod만 차단.
    if (!firebaseReady() && process.env.NODE_ENV === 'production') { setPhase('no-backend'); return; }

    // ── Firebase Auth ──
    if (firebaseReady()) {
      let alive = true;
      // Auth 콜백이 안 오면 boot 스피너 영구 → 로그인 화면으로.
      const bootTo = setTimeout(() => {
        if (alive) { console.error('Auth 부트 시간초과'); setPhase('signed-out'); }
      }, 10_000);
      const unsub = watchAuth(async (fb) => {
        clearTimeout(bootTo);
        if (!alive) return;
        if (!fb) { setPhase('signed-out'); return; }
        try {
          const prof = await withTimeout(loadProfile(fb.uid, fb.email), 8_000, '프로필 로드');
          if (!alive) return;
          if (!prof) { setPhase('no-profile'); return; }
          if (isStaffSuspended(prof.email)) {
            await signOutUser();
            setPhase('suspended');
            return;
          }
          setUser(prof);
          setCompanyState(resolveCompany(prof, localStorage.getItem(LS_CO)));
          setPhase('ready');
        } catch (e) { console.error('프로필 로드 실패', e); if (alive) setPhase('no-profile'); }
      });
      return () => { alive = false; clearTimeout(bootTo); unsub(); };
    }

    // ── 로컬 DEV ──
    const uid = localStorage.getItem(LS_UID);
    const u = DEV_USERS.find((x) => x.uid === uid) || DEV_USERS[0];
    setUser(u);
    setCompanyState(resolveCompany(u, localStorage.getItem(LS_CO)));
    if (localStorage.getItem(SEED_KEY) === SEED_VERSION) { setPhase('ready'); return; }
    let alive = true;
    (async () => {
      try {
        const { seedForScope, clearSampleData } = await import('./seed');
        for (const c of COMPANIES) clearSampleData(c);
        await withTimeout(seedForScope('', true), 12_000, '시드');
        localStorage.setItem(SEED_KEY, SEED_VERSION);
      } catch (e) { console.error('자동 시드 실패', e); }
      if (alive) setPhase('ready');
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => { setAuditActor({ uid: user.uid, name: user.name, email: user.email, role: user.role }); }, [user]);
  useEffect(() => startLiveSync(companyId), [companyId]);

  function login(uid: string) {
    if (firebaseReady()) return;
    const u = DEV_USERS.find((x) => x.uid === uid) || DEV_USERS[0];
    if (isStaffSuspended(u.email)) { setPhase('suspended'); return; }
    setUser(u);
    const co = resolveCompany(u, localStorage.getItem(LS_CO));
    setCompanyState(co);
    localStorage.setItem(LS_UID, u.uid);
    localStorage.setItem(LS_CO, co);
    setPhase('ready');
  }
  function logout() { if (firebaseReady()) void signOutUser(); }
  function setCompanyId(id: string) {
    if (user.role !== '본사') return; // 법인 소속 직원은 배정 법인 고정
    setCompanyState(id);
    localStorage.setItem(LS_CO, id);
  }

  const isOperator = user.role === '본사';
  return (
    <SessionContext.Provider value={{ user, companyId, setCompanyId, login, logout, isOperator, scopeAll: isOperator && companyId === ALL_COMPANIES }}>
      {phase === 'ready' ? children
        : phase === 'no-backend' ? <Gate title="서버가 연결되지 않았습니다" desc="Firebase 환경변수(NEXT_PUBLIC_FIREBASE_*)가 설정되지 않아 실제 저장소에 연결할 수 없습니다. 배포 환경변수를 확인하거나 관리자에게 문의하세요." />
          : phase === 'signed-out' ? <LoginScreen />
            : phase === 'suspended' ? <Gate title="이용이 정지된 계정입니다" desc="직원 명단에서 정지 처리되었습니다. 본사에 문의하세요." onLogout={logout} />
            : phase === 'no-profile' ? <Gate title="계정이 등록되지 않았습니다" desc="본사에서 계정에 법인·권한을 배정해야 이용할 수 있습니다." onLogout={logout} />
              : <Gate title="불러오는 중…" loading />}
    </SessionContext.Provider>
  );
}

type AuthMode = 'login' | 'signup' | 'reset';
function LoginScreen() {
  const [mode, setMode] = useState<AuthMode>('login');
  return (
    <div className="fp-login">
      <div className="login-page">
        <div className="login-brand">렌터카매니저</div>
        {mode === 'login' && <LoginForm onSignup={() => setMode('signup')} onReset={() => setMode('reset')} />}
        {mode === 'signup' && <SignupForm onBack={() => setMode('login')} />}
        {mode === 'reset' && <ResetForm onBack={() => setMode('login')} />}
      </div>
    </div>
  );
}

function LoginForm({ onSignup, onReset }: { onSignup: () => void; onReset: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await signInEmail(email, password); }
    catch (ex) {
      const m = String((ex as Error)?.message || '');
      setErr(m.includes('too-many') ? '시도가 너무 많습니다. 잠시 후 다시 시도하세요'
        : m.includes('user-disabled') ? '비활성화된 계정입니다'
          : '이메일 또는 비밀번호가 잘못되었습니다');
    }
    finally { setBusy(false); }
  }
  return (
    <form className={`login-card${busy ? ' is-loading' : ''}`} onSubmit={submit} noValidate aria-label="로그인">
      <header className="login-head">
        <h2 className="login-title">로그인</h2>
        <p className="login-sub">이메일과 비밀번호를 입력해주세요.</p>
      </header>
      <div className="login-form">
        <div className="login-field">
          <label htmlFor="login-email">이메일</label>
          <input id="login-email" type="email" autoComplete="username" placeholder="name@company.com" required
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="login-field">
          <label htmlFor="login-password">비밀번호</label>
          <input id="login-password" type="password" autoComplete="current-password" placeholder="비밀번호 입력" required
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button type="submit" className="login-submit" disabled={busy}>로그인</button>
      </div>
      <div className="login-links">
        <AuthLink onClick={onSignup}>계정 만들기</AuthLink>
        <span className="login-links-sep">·</span>
        <AuthLink onClick={onReset}>비밀번호 재설정</AuthLink>
      </div>
      {err && <p className="login-msg is-err" role="alert" aria-live="polite">{err}</p>}
    </form>
  );
}

function SignupForm({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  function validate(): string | null {
    if (!name.trim()) return '이름을 입력하세요';
    if (!email.trim()) return '이메일을 입력하세요';
    if (password.length < 6) return '비밀번호는 6자 이상이어야 합니다';
    if (password !== password2) return '비밀번호가 일치하지 않습니다';
    return null;
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setInfo('');
    const v = validate(); if (v) { setErr(v); return; }
    setBusy(true);
    try {
      const displayName = [name.trim(), department.trim() ? `(${department.trim()})` : ''].filter(Boolean).join(' ');
      await signup({ email, password, name: displayName, phone, department });
      setInfo('가입 완료 — 본사에서 법인·권한을 배정하면 이용할 수 있습니다.');
    } catch (ex) {
      const m = String((ex as Error)?.message || '');
      setErr(m.includes('email-already-in-use') ? '이미 가입된 이메일입니다'
        : m.includes('weak-password') ? '비밀번호가 너무 약합니다 (6자 이상)'
          : m.includes('invalid-email') ? '이메일 형식이 올바르지 않습니다'
            : '가입에 실패했습니다. 잠시 후 다시 시도하세요');
    } finally { setBusy(false); }
  }
  return (
    <form className={`login-card${busy ? ' is-loading' : ''}`} onSubmit={submit} noValidate aria-label="계정 만들기">
      <header className="login-head">
        <h2 className="login-title">계정 만들기</h2>
        <p className="login-sub">직원 계정을 만듭니다. 가입 후 본사가 소속 법인을 배정해야 데이터가 보입니다.</p>
      </header>
      <div className="login-form">
        <div className="login-field">
          <label htmlFor="su-name">이름</label>
          <input id="su-name" type="text" autoComplete="name" placeholder="홍길동" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="login-field">
          <label htmlFor="su-email">이메일</label>
          <input id="su-email" type="email" autoComplete="email" placeholder="name@company.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="login-field">
          <label htmlFor="su-phone">휴대폰 (선택)</label>
          <input id="su-phone" type="tel" autoComplete="tel" placeholder="010-0000-0000" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="login-field">
          <label htmlFor="su-dept">부서 (선택)</label>
          <input id="su-dept" type="text" placeholder="운영팀" value={department} onChange={(e) => setDepartment(e.target.value)} />
        </div>
        <div className="login-field">
          <label htmlFor="su-pw">비밀번호</label>
          <input id="su-pw" type="password" autoComplete="new-password" placeholder="6자 이상" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="login-field">
          <label htmlFor="su-pw2">비밀번호 확인</label>
          <input id="su-pw2" type="password" autoComplete="new-password" placeholder="비밀번호 다시 입력" required value={password2} onChange={(e) => setPassword2(e.target.value)} />
        </div>
        <button type="submit" className="login-submit" disabled={busy || !!info}>가입하기</button>
      </div>
      <div className="login-links"><AuthLink onClick={onBack}>로그인으로 돌아가기</AuthLink></div>
      {err && <p className="login-msg is-err" role="alert" aria-live="polite">{err}</p>}
      {info && <p className="login-msg is-ok" role="status" aria-live="polite">{info}</p>}
    </form>
  );
}

function ResetForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setInfo(''); setBusy(true);
    try {
      await resetPassword(email);
      setInfo('비밀번호 재설정 메일을 보냈습니다. 메일함을 확인하세요.');
    } catch {
      setErr('재설정 메일을 보내지 못했습니다. 이메일을 확인하세요.');
    } finally { setBusy(false); }
  }
  return (
    <form className={`login-card${busy ? ' is-loading' : ''}`} onSubmit={submit} noValidate aria-label="비밀번호 재설정">
      <header className="login-head">
        <h2 className="login-title">비밀번호 재설정</h2>
        <p className="login-sub">가입한 이메일로 재설정 링크를 보내드립니다.</p>
      </header>
      <div className="login-form">
        <div className="login-field">
          <label htmlFor="reset-email">이메일</label>
          <input id="reset-email" type="email" autoComplete="email" placeholder="name@company.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <button type="submit" className="login-submit" disabled={busy || !!info}>재설정 메일 전송</button>
      </div>
      <div className="login-links"><AuthLink onClick={onBack}>로그인으로 돌아가기</AuthLink></div>
      {err && <p className="login-msg is-err" role="alert" aria-live="polite">{err}</p>}
      {info && <p className="login-msg is-ok" role="status" aria-live="polite">{info}</p>}
    </form>
  );
}

function AuthLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button type="button" className="login-link" onClick={onClick}>{children}</button>;
}

function Gate({ title, desc, loading, onLogout }: { title: string; desc?: string; loading?: boolean; onLogout?: () => void }) {
  // 부트 로딩 = 깔끔한 스피너만(브랜드 박스·카드 없음). PageLoading과 동일 룩(로딩 표준 SSOT).
  if (loading) {
    return (
      <div role="status" aria-busy="true" aria-live="polite"
        style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: '#fff' }}>
        <Spinner size={28} stroke={2.5} color="#1B2A4A" />
        <div style={{ fontSize: 12.5, color: '#5f6368' }}>{title}</div>
      </div>
    );
  }
  // 계정 미등록 등 안내 상태 = ERP4 로그인 셸 + 카드
  return (
    <div className="fp-login">
      <div className="login-page">
        <div className="login-brand">렌터카매니저</div>
        <section className="login-card" style={{ textAlign: 'center' }}>
          <header className="login-head">
            <h2 className="login-title">{title}</h2>
            {desc && <p className="login-sub">{desc}</p>}
          </header>
          {onLogout && <button type="button" className="login-submit" onClick={onLogout}>로그아웃</button>}
        </section>
      </div>
    </div>
  );
}

export function useSession(): Ctx {
  const c = useContext(SessionContext);
  if (!c) throw new Error('useSession outside SessionProvider');
  return c;
}
