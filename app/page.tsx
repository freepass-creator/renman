'use client';
/**
 * 렌터카매니저 — 홈은 「오늘 할 일」이다.
 *
 * 대표(2026-08-21):
 *   「이제 이거를 그냥 erp 처럼 ai 랑 쓸 수 있게 erp 화면 간단하게 구성해볼까?
 *    직원들한테 여기서 체크하고 링크 주고 이런 식으로??」
 *   「그래 이게 erp 다 이제....」 / 「핸드폰으로도 확인하기 쉽게 해주고」
 *   「로그인하면 «내 업무»랑 «전체 업무»가 보이게 하면 되잖아」
 *
 * 뒤는 시트(정본) · 앞은 이 화면. 직원이 손대는 칸은 «의견»과 «완료» 둘뿐이다.
 */
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { watchAuth, type FbUser } from '@/lib/firebase/auth';
import { firebaseReady } from '@/lib/firebase/client';
import { 이름추정 } from '@/lib/work/people';
import type { 할일 } from '@/lib/work/sheet';
import { 업무가져오기, 업무처리 } from '@/lib/work/actions';
import { Login } from '@/components/Login';

type 갈래 = '내 업무' | '전체 업무';

export default function Home() {
  const [user, setUser] = useState<FbUser | undefined>(undefined);   // undefined = 아직 모름
  const [갈래보기, 갈래쓰기] = useState<갈래>('내 업무');
  const [목록, 목록쓰기] = useState<할일[] | null>(null);
  const [고침, 고치기] = useState(0);

  useEffect(() => {
    if (!firebaseReady()) { setUser(null); return; }
    return watchAuth(setUser);
  }, []);

  const 나 = useMemo(() => 이름추정(user?.email), [user]);

  useEffect(() => {
    if (user === undefined || user === null) return;
    let 살아있음 = true;
    목록쓰기(null);
    업무가져오기(갈래보기 === '내 업무' ? 나 : undefined)
      .then((r) => { if (살아있음) 목록쓰기(r); })
      .catch(() => { if (살아있음) 목록쓰기([]); });
    return () => { 살아있음 = false; };
  }, [user, 갈래보기, 나, 고침]);

  const 빼기 = useCallback((행: number) => 목록쓰기((p) => (p ?? []).filter((x) => x.행 !== 행)), []);

  if (user === undefined) return <중앙>불러오는 중…</중앙>;
  if (user === null) return <Login />;

  const 급한것 = (목록 ?? []).filter((t) => t.순서.startsWith('1')).length;

  return (
    <main className="mx-auto w-full max-w-[760px] pb-20">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-baseline gap-2.5 px-4 pt-3.5">
          <strong className="text-[17px]">할 일</strong>
          <span className="text-sm text-neutral-500">{나}</span>
          <span className="ml-auto text-sm">
            <b>{목록?.length ?? '–'}</b>건
            {급한것 > 0 && <span className="ml-2 text-orange-600 dark:text-orange-400">먼저 {급한것}</span>}
          </span>
        </div>
        <div className="flex gap-1 px-3 pb-1 pt-2.5">
          {(['내 업무', '전체 업무'] as 갈래[]).map((g) => (
            <button
              key={g}
              onClick={() => 갈래쓰기(g)}
              className={
                'rounded-t-lg px-3.5 py-2 text-[14.5px] ' +
                (갈래보기 === g
                  ? 'border-b-2 border-blue-600 font-bold text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'text-neutral-500')
              }
            >
              {g}
            </button>
          ))}
        </div>
      </header>

      {목록 === null ? (
        <중앙>가져오는 중…</중앙>
      ) : 목록.length === 0 ? (
        <중앙>{갈래보기 === '내 업무' ? '내 할 일이 없습니다.' : '할 일이 없습니다.'}</중앙>
      ) : (
        <div className="grid gap-2.5 px-3 py-3">
          {목록.map((t) => (
            <Row key={t.행} t={t} 나={나} 남={갈래보기 === '전체 업무'} 끝냄={() => 빼기(t.행)} 다시={() => 고치기((n) => n + 1)} />
          ))}
        </div>
      )}
    </main>
  );
}

function Row({ t, 나, 남, 끝냄, 다시 }: { t: 할일; 나: string; 남: boolean; 끝냄: () => void; 다시: () => void }) {
  const [열림, 열기] = useState(false);
  const [의견, 의견쓰기] = useState(t.담당자의견);
  const [보냄, 시작] = useTransition();
  const 급함 = t.순서.startsWith('1');
  const 남의일 = 남 && t.담당 !== 나;

  return (
    <section
      className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
      style={{ opacity: 보냄 ? 0.5 : 1 }}
    >
      <button onClick={() => 열기(!열림)} className="block w-full px-3.5 py-3.5 text-left">
        <div className="mb-1 flex items-center gap-2">
          {급함 && (
            <span className="rounded border border-orange-600 px-1.5 text-[11px] font-bold leading-4 text-orange-600 dark:border-orange-400 dark:text-orange-400">
              먼저
            </span>
          )}
          <span className="text-[12.5px] text-neutral-500">{t.회사명}</span>
          {남 && t.담당 && (
            <span className="ml-auto text-[12.5px] text-neutral-500">{t.담당}</span>
          )}
        </div>
        <div className="text-base font-semibold leading-tight">{t.업무분류}</div>
        {!열림 && <div className="mt-1 truncate text-[13.5px] text-neutral-500">{t.업무내용}</div>}
      </button>

      {열림 && (
        <div className="px-3.5 pb-3.5">
          <p className="mb-3 text-[14.5px] leading-relaxed">{t.업무내용}</p>

          <div className="mb-3 flex flex-wrap gap-2">
            {t.업무페이지 && <A href={t.업무페이지} 강조>{t.업무페이지이름}</A>}
            {t.백데이터 && <A href={t.백데이터}>{t.백데이터이름}</A>}
            {!t.업무페이지 && !t.백데이터 && (
              <span className="text-[13px] text-neutral-500">어디서 할지 아직 안 정해졌습니다</span>
            )}
          </div>

          <textarea
            value={의견}
            onChange={(e) => 의견쓰기(e.target.value)}
            placeholder="통화 결과·약속한 날짜 같은 것을 적습니다"
            rows={2}
            className="w-full resize-y rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[15px] leading-snug dark:border-neutral-700 dark:bg-neutral-800"
          />

          <div className="mt-2.5 flex gap-2">
            <button
              onClick={() => 시작(async () => { await 업무처리(t.행, 나, { 의견 }); 다시(); })}
              disabled={보냄 || 의견 === t.담당자의견}
              className="flex-1 rounded-lg border border-neutral-200 bg-neutral-50 py-3 text-[15px] disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-800"
            >
              의견만 저장
            </button>
            <button
              onClick={() => 시작(async () => { await 업무처리(t.행, 나, { 완료: true, 의견 }); 끝냄(); })}
              disabled={보냄}
              className="flex-1 rounded-lg bg-green-700 py-3 text-[15px] font-bold text-white disabled:opacity-40"
            >
              완료
            </button>
          </div>
          <p className="mt-2 text-[11.5px] text-neutral-500">
            {남의일
              ? `${t.담당}님 일입니다. 대신 처리하면 그렇게 기록됩니다`
              : '완료를 누르면 증빙을 확인한 뒤에 진짜 끝난 것으로 잡힙니다'}
          </p>
        </div>
      )}
    </section>
  );
}

function A({ href, children, 강조 }: { href: string; children: React.ReactNode; 강조?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={
        강조
          ? 'rounded-lg bg-blue-600 px-3.5 py-2.5 text-sm font-semibold text-white'
          : 'rounded-lg border border-neutral-200 px-3.5 py-2.5 text-sm dark:border-neutral-700'
      }
    >
      {children}
    </a>
  );
}

function 중앙({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-20 text-center text-neutral-500">{children}</p>;
}
