'use client';
/** 로그인 — 회사 계정(이메일·비밀번호). 기존 파이어베이스 계정을 그대로 쓴다.
 *  대표(2026-08-21): 「renman 을 초기화하고 **파이어베이스 계정만** 쓰자」
 */
import { useState, useTransition } from 'react';
import { signInEmail, resetPassword } from '@/lib/firebase/auth';
import { firebaseReady } from '@/lib/firebase/client';

export function Login() {
  const [메일, 메일쓰기] = useState('');
  const [비번, 비번쓰기] = useState('');
  const [탈, 탈쓰기] = useState('');
  const [알림, 알림쓰기] = useState('');
  const [보냄, 시작] = useTransition();
  const 준비 = firebaseReady();

  return (
    <main style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px 20px' }}>
      <div style={{ width: '100%', maxWidth: 320 }}>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 3 }}>렌터카매니저</div>
        <p className="note" style={{ margin: '0 0 22px' }}>
          오늘 할 일을 한 줄씩 처리합니다
        </p>

        {!준비 ? (
          <p className="note" style={{ border: '1px solid var(--line)', background: 'var(--panel)', borderRadius: 'var(--r)', padding: '12px 13px' }}>
            아직 로그인을 켜지 않았습니다. 파이어베이스 설정을 넣으면 여기에 로그인 칸이 나옵니다.
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              탈쓰기(''); 알림쓰기('');
              시작(async () => {
                try { await signInEmail(메일, 비번); }
                catch { 탈쓰기('메일이나 비밀번호가 맞지 않습니다'); }
              });
            }}
            style={{ display: 'grid', gap: 6 }}
          >
            <input className="field" type="email" value={메일} onChange={(e) => 메일쓰기(e.target.value)}
                   placeholder="회사 메일" autoComplete="username" required />
            <input className="field" type="password" value={비번} onChange={(e) => 비번쓰기(e.target.value)}
                   placeholder="비밀번호" autoComplete="current-password" required />
            {탈 && <p style={{ fontSize: 12, color: 'var(--late)', margin: '2px 0 0' }}>{탈}</p>}
            {알림 && <p style={{ fontSize: 12, color: 'var(--done)', margin: '2px 0 0' }}>{알림}</p>}
            <button className="btn btn-key btn-wide" type="submit" disabled={보냄} style={{ marginTop: 2 }}>
              {보냄 ? '들어가는 중…' : '들어가기'}
            </button>
            <button
              type="button" className="note"
              style={{ padding: '4px 0', textAlign: 'center' }}
              onClick={() => {
                if (!메일) { 탈쓰기('메일을 먼저 적어주세요'); return; }
                시작(async () => {
                  try { await resetPassword(메일); 탈쓰기(''); 알림쓰기('재설정 메일을 보냈습니다'); }
                  catch { 탈쓰기('재설정 메일을 못 보냈습니다'); }
                });
              }}
            >
              비밀번호를 잊었습니다
            </button>
          </form>
        )}

        <p className="note" style={{ marginTop: 22, textAlign: 'center' }}>팀제이피케이</p>
      </div>
    </main>
  );
}
