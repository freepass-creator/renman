'use client';
/**
 * 렌터카매니저 — 업무함.
 *
 * 대표(2026-08-21): 「이 정도 디자인은 나와줘야지」 (목업 제공)
 *                   「그 화면을 보고 세부내역 같은 거 보면서 해야지」
 *                   「독촉 5건이면 그걸 누르면 독촉 5건에 대한 업무가 나와서
 *                    각각 처리하고 후속 뭘 했다고 남겨야지」
 *
 * 그래서 화면은 세 걸음이다:
 *   ① 오더 목록 — 「스위치플랜 미납고객 독촉 65건」
 *   ② 대상 목록 — 그 65명이 한 줄씩
 *   ③ 한 건 처리 — 전화하고, 무엇을 했는지 남기고, 닫는다
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { watchAuth, signOutUser, type FbUser } from '@/lib/firebase/auth';
import { firebaseReady } from '@/lib/firebase/client';
import { 이름추정, 대표인가 } from '@/lib/work/people';
import type { 할일, 사람셈 } from '@/lib/work/types';
import { 업무가져오기, 사람별건수, 지표 } from '@/lib/work/actions';
import { Login } from '@/components/Login';
import { OrderDetail } from '@/components/OrderDetail';

type 지표항목 = { 이름: string; 값: string; 곁?: string; 위험?: boolean };

const 오늘글 = () => {
  const d = new Date();
  const 요일 = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${요일})`;
};

export default function Home() {
  const [user, setUser] = useState<FbUser | undefined>(undefined);
  const [갈래, 갈래쓰기] = useState('내 업무');
  const [찾기, 찾기쓰기] = useState('');
  const [목록, 목록쓰기] = useState<할일[] | null>(null);
  const [사람들, 사람들쓰기] = useState<사람셈[]>([]);
  const [칸, 칸쓰기] = useState<지표항목[]>([]);
  const [고른것, 고르기] = useState<할일 | null>(null);
  const [고침, 고치기] = useState(0);
  const [알림, 알림쓰기] = useState('');

  useEffect(() => {
    if (!firebaseReady()) { setUser(null); return; }
    let 왔다 = false;
    const 시계 = setTimeout(() => { if (!왔다) setUser(null); }, 3000);
    let 끄기 = () => {};
    try { 끄기 = watchAuth((u) => { 왔다 = true; clearTimeout(시계); setUser(u); }); }
    catch { 왔다 = true; clearTimeout(시계); setUser(null); }
    return () => { clearTimeout(시계); 끄기(); };
  }, []);

  const 나 = useMemo(() => 이름추정(user?.email), [user]);
  const 대표 = useMemo(() => 대표인가(user?.email), [user]);

  useEffect(() => { if (대표) 갈래쓰기('전체'); }, [대표]);

  useEffect(() => {
    if (!user) return;
    let 산다 = true;
    지표().then((r) => { if (산다) 칸쓰기(r); }).catch(() => {});
    if (대표) 사람별건수().then((r) => { if (산다) 사람들쓰기(r); }).catch(() => {});
    return () => { 산다 = false; };
  }, [user, 대표, 고침]);

  useEffect(() => {
    if (user === undefined || user === null) return;
    let 산다 = true;
    목록쓰기(null);
    const 누구 = 갈래 === '전체' ? undefined : 갈래 === '내 업무' ? 나 : 갈래;
    업무가져오기(누구)
      .then((r) => { if (산다) 목록쓰기(r); })
      .catch(() => { if (산다) 목록쓰기([]); });
    return () => { 산다 = false; };
  }, [user, 갈래, 나, 고침]);

  const 알리기 = useCallback((글: string) => {
    알림쓰기(글);
    setTimeout(() => 알림쓰기(''), 1800);
  }, []);

  if (user === undefined) return <중앙>불러오는 중…</중앙>;
  if (user === null) return <Login />;

  const q = 찾기.trim().toLowerCase();
  const 보일것 = (목록 ?? []).filter((t) =>
    !q || [t.업무분류, t.업무내용, t.회사명, t.담당, t.담당자의견].join(' ').toLowerCase().includes(q));
  const 지연수 = 보일것.filter((t) => t.순서.startsWith('1')).length;
  const 탭들 = 대표 ? ['전체', '내 업무', ...사람들.map((p) => p.이름).filter((n) => n !== 나)] : ['내 업무', '전체'];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900 text-white shadow-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-400/30 bg-indigo-600 text-[10px] font-bold tracking-widest">
              ERP
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-[13px] font-bold tracking-tight text-slate-100">{나} 님 업무함</h1>
                {대표 && (
                  <span className="rounded border border-indigo-800/80 bg-indigo-950 px-1.5 py-0.5 text-[10px] font-bold text-indigo-300">
                    전체 열람
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[10px] font-medium leading-none text-slate-400">{오늘글()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="/upload" className="rounded-lg border border-slate-700/80 bg-slate-800/90 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200">
              올리기
            </a>
            <button onClick={() => 고치기((n) => n + 1)} className="text-[11px] text-slate-400">새로 읽기</button>
            <button onClick={() => signOutUser()} className="text-[11px] text-slate-400">나가기</button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-2.5 px-3 py-3 sm:px-4">
        <div className="grid grid-cols-4 gap-1.5">
          {칸.map((k) => (
            <div key={k.이름} className="rounded-xl border border-slate-200/90 bg-white px-2.5 py-2 shadow-xxs">
              <div className="text-[10px] font-bold text-slate-400">{k.이름}</div>
              <div className={`mono text-[15px] leading-tight ${k.위험 ? 'text-rose-600' : 'text-slate-900'}`}>
                {k.값}
                {k.곁 && <span className="ml-0.5 text-[10px] font-medium text-slate-400">{k.곁}</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200/90 bg-white p-1.5 shadow-xxs">
          <input
            value={찾기}
            onChange={(e) => 찾기쓰기(e.target.value)}
            placeholder="업무·회사·차량번호·메모 검색"
            className="w-full rounded-lg border border-slate-200/70 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 placeholder:font-medium placeholder:text-slate-400 focus:border-indigo-600 focus:bg-white focus:outline-none"
          />
        </div>

        <div className="scroll-x flex items-center gap-1.5 pb-0.5">
          {탭들.map((g) => {
            const on = 갈래 === g;
            const c = 사람들.find((p) => p.이름 === g);
            return (
              <button
                key={g}
                onClick={() => { 갈래쓰기(g); 고르기(null); }}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition ${
                  on ? 'bg-indigo-600 text-white shadow-xxs' : 'border border-slate-200 bg-white text-slate-600'
                }`}
              >
                <span>{g}</span>
                {c && (
                  <span className={`mono rounded-full px-1.5 text-[10px] ${on ? 'bg-indigo-900 text-indigo-100' : 'bg-slate-200 text-slate-700'}`}>
                    {c.건수}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-b border-slate-200/60 px-1 pb-1 text-[11px] font-bold text-slate-500">
          <span>{갈래 === '전체' ? '전 직원 미완료 업무입니다.' : `${갈래 === '내 업무' ? 나 : 갈래} 담당 미완료 업무입니다.`}</span>
          <span className="mono font-extrabold text-indigo-600">
            총 {보일것.length}건{지연수 > 0 && <span className="ml-1.5 text-rose-600">지연 {지연수}</span>}
          </span>
        </div>

        {대표 && 갈래 === '전체' && 사람들.length > 0 && (
          <div className="scroll-x flex gap-1.5">
            {사람들.map((p) => (
              <button
                key={p.이름}
                onClick={() => 갈래쓰기(p.이름)}
                className="flex min-w-[112px] flex-col rounded-xl border border-slate-200/90 bg-white px-2.5 py-2 text-left shadow-xxs"
              >
                <span className="text-[11px] font-bold text-slate-700">{p.이름}</span>
                <span className="mono text-[13px] text-slate-900">
                  {p.건수}
                  <span className="ml-0.5 text-[10px] font-medium text-slate-400">건</span>
                  {p.먼저 > 0 && <span className="ml-1.5 text-[10px] text-rose-600">지연 {p.먼저}</span>}
                </span>
              </button>
            ))}
          </div>
        )}

        {목록 === null ? (
          <중앙>가져오는 중…</중앙>
        ) : 보일것.length === 0 ? (
          <div className="my-4 rounded-xl border border-slate-200/80 bg-white p-8 text-center shadow-xxs">
            <p className="text-xs font-bold text-slate-700">{q ? '찾는 업무가 없습니다.' : '처리할 미완료 업무가 없습니다.'}</p>
          </div>
        ) : (
          <div className="flex-1 space-y-2">
            {보일것.map((t) => <Card key={t.행} t={t} 남={갈래 !== '내 업무'} 열기={() => 고르기(t)} />)}
          </div>
        )}
      </main>

      {고른것 && (
        <OrderDetail
          t={고른것}
          나={나}
          닫기={() => 고르기(null)}
          끝냄={() => {
            const 행 = 고른것.행;
            목록쓰기((p) => (p ?? []).filter((x) => x.행 !== 행));
            고르기(null); 고치기((n) => n + 1); 알리기('완료 처리했습니다');
          }}
          알리기={알리기}
        />
      )}

      {알림 && (
        <div className="fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-2xl">
          <span className="text-emerald-400">✓</span>{알림}
        </div>
      )}
    </div>
  );
}

function Card({ t, 남, 열기 }: { t: 할일; 남: boolean; 열기: () => void }) {
  const 지연 = t.순서.startsWith('1');
  const 건수 = t.업무내용.match(/([\d,]+)건/)?.[1];
  const 금액 = t.업무내용.match(/\(([\d,]+)원\)/)?.[1];

  return (
    <button
      onClick={열기}
      className="relative w-full rounded-xl border border-slate-200/90 bg-white p-3 text-left shadow-xxs transition hover:border-indigo-500/80"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${
            지연 ? 'border-rose-200/80 bg-rose-50 text-rose-700' : 'border-sky-200/80 bg-sky-50 text-sky-700'
          }`}>
            {지연 ? '지연' : '진행'}
          </span>
          <span className="rounded border border-slate-200/60 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
            {t.회사명 || '전 법인'}
          </span>
        </div>
        {남 && t.담당 && <span className="text-[10px] font-bold text-slate-500">{t.담당}</span>}
      </div>

      <h4 className="mb-2 text-xs font-extrabold leading-snug text-slate-900">{t.업무분류}</h4>

      <div className="mb-2 grid grid-cols-2 gap-2 rounded-lg border border-slate-200/60 bg-slate-50/80 p-2">
        <div>
          <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">대상</span>
          <span className="mono block truncate text-[11px] text-slate-800">{건수 ? `${건수}건` : '–'}</span>
        </div>
        <div>
          <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">걸린 돈</span>
          <span className="mono block truncate text-[11px] text-slate-800">{금액 ? `${금액}원` : '–'}</span>
        </div>
      </div>

      <p className="truncate border-t border-slate-100 pt-1.5 text-[10px] font-medium text-slate-600">
        {t.담당자의견 || t.업무내용}
      </p>
    </button>
  );
}

function 중앙({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-20 text-center text-xs text-slate-500">{children}</p>;
}
