'use client';
/** 올리기 — 차 고르고 사진 찍어 올리면 끝.
 *
 * 대표(2026-08-21): 「내가 여기서 erp 로 올리고 거기서 확인하게끔 할 수 있지??」
 *                   「직원들이 데이터센터에 올리는 것도 다 erp 에서 연동되게 하면 되겠다」
 *
 * 폰에서 쓰는 화면이다 — 차 번호 찍고, 무슨 서류인지 고르고, 사진.
 */
import { useEffect, useState, useTransition } from 'react';
import { watchAuth, type FbUser } from '@/lib/firebase/auth';
import { firebaseReady } from '@/lib/firebase/client';
import { 이름추정 } from '@/lib/work/people';
import { 파일올리기 } from './actions';
import { Login } from '@/components/Login';

const 갈래들 = ['계약서', '등록증', '보험증권', '보험가입증명', '상환스케줄', '고지서', '채권서류', '매각서류'] as const;
const 법인들 = [
  { 코드: 'SW', 이름: '스위치플랜' },
  { 코드: 'PR', 이름: '프라임구독' },
  { 코드: 'FP', 이름: '프리패스' },
  { 코드: 'SO', 이름: '손오공' },
];

export default function Upload() {
  const [user, setUser] = useState<FbUser | undefined>(undefined);
  const [차, 차쓰기] = useState('');
  const [법인, 법인쓰기] = useState('SW');
  const [갈래, 갈래쓰기] = useState<string>('계약서');
  const [파일, 파일쓰기] = useState<File | null>(null);
  const [결과, 결과쓰기] = useState<{ ok: boolean; 글: string } | null>(null);
  const [보냄, 시작] = useTransition();

  useEffect(() => {
    if (!firebaseReady()) { setUser(null); return; }
    return watchAuth(setUser);
  }, []);

  if (user === undefined) return <p className="px-5 py-20 text-center text-neutral-500">불러오는 중…</p>;
  if (user === null) return <Login />;

  const 나 = 이름추정(user.email);
  const 차정상 = /^\d{2,3}[가-힣]\d{4}$/.test(차.replace(/\s+/g, ''));
  const 보낼수있나 = 차정상 && !!파일 && !보냄;

  return (
    <main className="mx-auto w-full max-w-[520px] px-4 pb-20 pt-4">
      <header className="mb-4 flex items-baseline gap-2.5">
        <strong className="text-[17px]">올리기</strong>
        <span className="text-sm text-neutral-500">{나}</span>
        <a href="/" className="ml-auto text-sm text-blue-600 dark:text-blue-400">할 일</a>
      </header>

      <p className="mb-4 text-[13.5px] leading-relaxed text-neutral-500">
        차 번호와 무슨 서류인지만 고르면 데이터센터 제자리로 들어갑니다.
        이름도 규칙대로 붙습니다.
      </p>

      <label className="mb-1.5 block text-[13px] font-semibold">차량번호</label>
      <input
        value={차}
        onChange={(e) => { 차쓰기(e.target.value); 결과쓰기(null); }}
        placeholder="12가3456"
        inputMode="text"
        className="mb-1 w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-3.5 text-[17px] tracking-wide dark:border-neutral-700 dark:bg-neutral-900"
      />
      {차 && !차정상 && (
        <p className="mb-3 text-[13px] text-orange-600 dark:text-orange-400">
          차량번호 모양이 아닙니다 (예: 12가3456)
        </p>
      )}

      <label className="mb-1.5 mt-4 block text-[13px] font-semibold">어느 회사</label>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {법인들.map((c) => (
          <button
            key={c.코드}
            onClick={() => { 법인쓰기(c.코드); 결과쓰기(null); }}
            className={
              'rounded-lg px-3 py-2 text-[14px] ' +
              (법인 === c.코드
                ? 'bg-blue-600 font-semibold text-white'
                : 'border border-neutral-200 dark:border-neutral-700')
            }
          >
            {c.이름}
          </button>
        ))}
      </div>

      <label className="mb-1.5 block text-[13px] font-semibold">무슨 서류</label>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {갈래들.map((g) => (
          <button
            key={g}
            onClick={() => { 갈래쓰기(g); 결과쓰기(null); }}
            className={
              'rounded-lg px-3 py-2 text-[14px] ' +
              (갈래 === g
                ? 'bg-neutral-800 font-semibold text-white dark:bg-neutral-200 dark:text-neutral-900'
                : 'border border-neutral-200 dark:border-neutral-700')
            }
          >
            {g}
          </button>
        ))}
      </div>

      <label className="mb-1.5 block text-[13px] font-semibold">사진 또는 파일</label>
      <input
        type="file"
        accept="image/*,application/pdf"
        onChange={(e) => { 파일쓰기(e.target.files?.[0] ?? null); 결과쓰기(null); }}
        className="mb-4 w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-3 text-[14px] dark:border-neutral-700 dark:bg-neutral-900"
      />

      <button
        disabled={!보낼수있나}
        onClick={() =>
          시작(async () => {
            const fd = new FormData();
            fd.set('차량번호', 차.replace(/\s+/g, ''));
            fd.set('법인코드', 법인);
            fd.set('갈래', 갈래);
            fd.set('올린사람', 나);
            fd.set('파일', 파일!);
            const r = await 파일올리기(fd);
            결과쓰기(r.ok
              ? { ok: true, 글: `${r.이름} → ${r.경로}` }
              : { ok: false, 글: r.왜 });
            if (r.ok) 파일쓰기(null);
          })
        }
        className="w-full rounded-xl bg-blue-600 py-4 text-[16px] font-bold text-white disabled:opacity-40"
      >
        {보냄 ? '올리는 중…' : '올리기'}
      </button>

      {결과 && (
        <p
          className={
            'mt-3 rounded-xl border px-3.5 py-3 text-[13.5px] leading-relaxed ' +
            (결과.ok
              ? 'border-green-700/30 text-green-700 dark:text-green-400'
              : 'border-orange-600/30 text-orange-600 dark:text-orange-400')
          }
        >
          {결과.ok ? '올렸습니다 — ' : ''}
          {결과.글}
        </p>
      )}

      <p className="mt-5 text-[12px] leading-relaxed text-neutral-500">
        같은 이름이 이미 있으면 덮지 않고 뒤에 (2)를 붙입니다.
        어디에 넣을지 못 찾으면 올리지 않고 알려드립니다.
      </p>
    </main>
  );
}
