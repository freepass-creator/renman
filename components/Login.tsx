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
    <main className="flex min-h-dvh flex-col justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-[360px]">
        <div className="mb-6 flex h-13 w-13 items-center justify-center rounded-2xl bg-blue-600 text-2xl font-extrabold text-white"
             style={{ width: 52, height: 52 }}>
          렌
        </div>

        <h1 className="mb-1.5 text-[26px] font-bold tracking-tight">렌터카매니저</h1>
        <p className="mb-7 text-[14.5px] leading-relaxed text-neutral-500">
          오늘 할 일을 한 줄씩 처리합니다.<br />
          회사 계정으로 들어오면 내 업무와 전체 업무가 보입니다.
        </p>

        {!준비 ? (
          <p className="rounded-xl border border-neutral-200 bg-white px-4 py-3.5 text-[13.5px] leading-relaxed text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
            아직 로그인을 켜지 않았습니다. 파이어베이스 설정을 넣으면 이 자리에 로그인 칸이 나옵니다.
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              탈쓰기(''); 알림쓰기('');
              시작(async () => {
                try { await signInEmail(메일, 비번); }
                catch { 탈쓰기('메일이나 비밀번호가 맞지 않습니다.'); }
              });
            }}
            className="grid gap-2.5"
          >
            <input
              type="email" value={메일} onChange={(e) => 메일쓰기(e.target.value)}
              placeholder="회사 메일" autoComplete="username" required
              className="rounded-xl border border-neutral-200 bg-white px-3.5 py-3.5 text-[15px] dark:border-neutral-700 dark:bg-neutral-900"
            />
            <input
              type="password" value={비번} onChange={(e) => 비번쓰기(e.target.value)}
              placeholder="비밀번호" autoComplete="current-password" required
              className="rounded-xl border border-neutral-200 bg-white px-3.5 py-3.5 text-[15px] dark:border-neutral-700 dark:bg-neutral-900"
            />
            {탈 && <p className="text-[13.5px] text-orange-600 dark:text-orange-400">{탈}</p>}
            {알림 && <p className="text-[13.5px] text-green-700 dark:text-green-400">{알림}</p>}
            <button
              type="submit" disabled={보냄}
              className="rounded-xl bg-blue-600 py-3.5 text-[15.5px] font-bold text-white disabled:opacity-50"
            >
              {보냄 ? '들어가는 중…' : '들어가기'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!메일) { 탈쓰기('메일을 먼저 적어주세요.'); return; }
                시작(async () => {
                  try { await resetPassword(메일); 탈쓰기(''); 알림쓰기('비밀번호 재설정 메일을 보냈습니다.'); }
                  catch { 탈쓰기('재설정 메일을 못 보냈습니다.'); }
                });
              }}
              className="py-1 text-[13px] text-neutral-500"
            >
              비밀번호를 잊었습니다
            </button>
          </form>
        )}

        <p className="mt-7 text-center text-xs text-neutral-500">팀제이피케이</p>
      </div>
    </main>
  );
}
