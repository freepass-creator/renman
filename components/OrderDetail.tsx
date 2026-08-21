'use client';
/**
 * 오더 하나를 열면 — 그 안의 «대상 한 줄씩». 눌러서 처리하고, 무엇을 했는지 남긴다.
 *
 * 대표(2026-08-21):
 *   「독촉 5건이면 그걸 누르면 독촉 5건에 대한 업무가 나와서 각각 처리하고 후속 뭘 했다고 남겨야지」
 *   「차량 데이터 확인하려고 하면 그거 원장 확인하게 해주기 — 이거 erp 네 뭐....」
 *
 * 세 걸음: 대상 목록 → 한 건 처리 → (차량번호를 누르면) 그 차 원장
 */
import { useEffect, useState, useTransition } from 'react';
import type { 할일 } from '@/lib/work/types';
import { 대상목록, 한건처리, 업무처리, 차량보기 } from '@/lib/work/actions';

type 대상 = { 키: string; 차량번호: string; 이름: string; 회사: string; 금액?: number; 곁?: string };
type 원장 = Awaited<ReturnType<typeof 차량보기>>;

const 돈 = (n?: number) => (n ? n.toLocaleString('ko-KR') : '–');

/** 무슨 일이냐에 따라 남길 결과가 다르다 */
function 결과들(분류: string) {
  if (/독촉|미납|통화/.test(분류)) return ['입금 약속 받음', '통화 안 됨', '분납 요청', '회수 합의', '이미 입금됨'];
  if (/회수/.test(분류)) return ['회수 합의', '거부', '통화 안 됨', '내용증명 필요'];
  if (/받기|자료|서류|증권|스케줄|계약서|등록증/.test(분류)) return ['받았음', '요청함', '없다고 함'];
  return ['처리함', '확인 필요', '막힘'];
}

export function OrderDetail({
  t, 나, 닫기, 끝냄, 알리기,
}: { t: 할일; 나: string; 닫기: () => void; 끝냄: () => void; 알리기: (s: string) => void }) {
  const [대상들, 대상들쓰기] = useState<대상[] | null>(null);
  const [고른, 고르기] = useState<대상 | null>(null);
  const [끝난것, 끝난것쓰기] = useState<Set<string>>(new Set());
  const [차원장, 차원장쓰기] = useState<원장 | null>(null);
  const [보냄, 시작] = useTransition();

  useEffect(() => {
    let 산다 = true;
    대상목록(t.회사명, t.업무분류)
      .then((r) => { if (산다) 대상들쓰기(r); })
      .catch(() => { if (산다) 대상들쓰기([]); });
    return () => { 산다 = false; };
  }, [t.회사명, t.업무분류]);

  const 남은 = (대상들 ?? []).filter((d) => !끝난것.has(d.키));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={닫기}>
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 머리 */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 p-3.5 text-white">
          <div className="flex min-w-0 items-center gap-2">
            {(고른 || 차원장) && (
              <button onClick={() => { 차원장 ? 차원장쓰기(null) : 고르기(null); }} className="text-slate-400">←</button>
            )}
            <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold ${t.순서.startsWith('1') ? 'bg-rose-500' : 'bg-indigo-600'}`}>
              {t.순서.startsWith('1') ? '지연' : '진행'}
            </span>
            <h3 className="truncate text-xs font-bold">
              {차원장 ? `${차원장.차량번호} 원장` : 고른 ? `${고른.차량번호} · ${고른.이름}` : `${t.회사명} · ${t.업무분류}`}
            </h3>
          </div>
          <button onClick={닫기} className="p-1 text-slate-400">✕</button>
        </div>

        {/* 몸통 */}
        <div className="flex-1 overflow-y-auto">
          {차원장 ? (
            <VehicleLedger 원장={차원장} />
          ) : 고른 ? (
            <One
              d={고른}
              분류={t.업무분류}
              나={나}
              보냄={보냄}
              차보기={() => 시작(async () => 차원장쓰기(await 차량보기(고른.차량번호)))}
              처리={(결과, 메모) =>
                시작(async () => {
                  await 한건처리({
                    회사: 고른.회사, 차량번호: 고른.차량번호, 이름: 고른.이름,
                    업무분류: t.업무분류, 결과, 메모, 누가: 나,
                  });
                  끝난것쓰기((s) => new Set([...s, 고른.키]));
                  고르기(null);
                  알리기(`${고른.차량번호} ${결과}`);
                })
              }
            />
          ) : (
            <List t={t} 대상들={대상들} 남은={남은} 끝난수={끝난것.size} 고르기={고르기} />
          )}
        </div>

        {/* 발 */}
        {!고른 && !차원장 && (
          <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 p-3">
            <span className="mono text-[11px] text-slate-500">
              {끝난것.size > 0 ? `${끝난것.size}건 처리함` : ''}
            </span>
            <button
              onClick={() => 시작(async () => { await 업무처리(t.행, 나, { 완료: true, 의견: t.담당자의견 }); 끝냄(); })}
              disabled={보냄}
              className="ml-auto rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
            >
              이 오더 전체 완료
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── ① 대상 목록 ─────────────────────────────── */
function List({ t, 대상들, 남은, 끝난수, 고르기 }:
  { t: 할일; 대상들: 대상[] | null; 남은: 대상[]; 끝난수: number; 고르기: (d: 대상) => void }) {
  return (
    <div className="space-y-2.5 p-3.5">
      <div className="space-y-1 rounded-xl border border-slate-800 bg-slate-900 p-3 text-white">
        <span className="block text-[10px] font-bold text-slate-400">해야 할 일</span>
        <p className="text-xs font-bold leading-relaxed text-slate-100">{t.업무내용}</p>
      </div>

      {대상들 === null ? (
        <p className="py-8 text-center text-xs text-slate-500">대상을 뽑는 중…</p>
      ) : 대상들.length === 0 ? (
        <div className="space-y-2">
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] font-medium leading-relaxed text-slate-600">
            이 업무는 아직 ERP 안에서 한 건씩 못 뽑습니다. 아래 화면에서 처리해 주세요.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {t.업무페이지 && <a className="rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-bold text-white" href={t.업무페이지} target="_blank" rel="noreferrer">{t.업무페이지이름}</a>}
            {t.백데이터 && <a className="rounded-lg border border-slate-300 px-3 py-2 text-[11px] font-bold text-slate-700" href={t.백데이터} target="_blank" rel="noreferrer">{t.백데이터이름}</a>}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between px-0.5 text-[11px] font-bold text-slate-500">
            <span>한 건씩 처리합니다</span>
            <span className="mono text-indigo-600">
              남은 {남은.length}{끝난수 > 0 && <span className="ml-1.5 text-emerald-600">처리 {끝난수}</span>}
            </span>
          </div>
          <div className="space-y-1.5">
            {남은.map((d) => (
              <button
                key={d.키}
                onClick={() => 고르기(d)}
                className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200/90 bg-white p-2.5 text-left shadow-xxs hover:border-indigo-500/80"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="mono text-[12px] text-slate-900">{d.차량번호}</span>
                    <span className="truncate text-[11px] font-bold text-slate-700">{d.이름}</span>
                  </div>
                  {d.곁 && <div className="mt-0.5 text-[10px] text-slate-500">{d.곁}</div>}
                </div>
                <span className="mono shrink-0 text-[12px] text-rose-600">{돈(d.금액)}</span>
              </button>
            ))}
            {남은.length === 0 && (
              <p className="py-6 text-center text-xs font-bold text-emerald-700">다 처리했습니다</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ── ② 한 건 처리 ─────────────────────────────── */
function One({ d, 분류, 나, 보냄, 처리, 차보기 }:
  { d: 대상; 분류: string; 나: string; 보냄: boolean; 처리: (결과: string, 메모: string) => void; 차보기: () => void }) {
  const [결과, 결과쓰기] = useState('');
  const [메모, 메모쓰기] = useState('');

  return (
    <div className="space-y-3 p-3.5">
      <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
        <div className="flex justify-between border-b border-slate-200 pb-1.5">
          <span className="font-medium text-slate-500">차량번호</span>
          <button onClick={차보기} className="mono text-indigo-600 underline">{d.차량번호}</button>
        </div>
        <div className="flex justify-between border-b border-slate-200 pb-1.5">
          <span className="font-medium text-slate-500">고객</span>
          <span className="font-bold text-slate-900">{d.이름}</span>
        </div>
        <div className="flex justify-between border-b border-slate-200 pb-1.5">
          <span className="font-medium text-slate-500">회사</span>
          <span className="font-bold text-slate-900">{d.회사}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-medium text-slate-500">{/과납/.test(분류) ? '더 받은 돈' : '밀린 돈'}</span>
          <span className="mono text-rose-600">{돈(d.금액)}원</span>
        </div>
      </div>

      <button onClick={차보기} className="w-full rounded-lg border border-slate-300 bg-white py-2 text-[11px] font-bold text-slate-700">
        이 차 원장 보기
      </button>

      <div>
        <p className="mb-1.5 text-[11px] font-bold text-slate-700">무엇을 했습니까</p>
        <div className="flex flex-wrap gap-1.5">
          {결과들(분류).map((r) => (
            <button
              key={r}
              onClick={() => 결과쓰기(r)}
              className={`rounded-lg px-3 py-2 text-[11px] font-bold ${
                결과 === r ? 'bg-indigo-600 text-white' : 'border border-slate-300 bg-white text-slate-700'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1 rounded-xl border border-amber-200/80 bg-amber-50/70 p-3">
        <span className="text-[11px] font-bold text-amber-900">남길 말</span>
        <textarea
          value={메모}
          onChange={(e) => 메모쓰기(e.target.value)}
          rows={2}
          placeholder="약속한 날짜·통화 내용"
          className="w-full resize-y rounded-lg border border-amber-200 bg-white p-2 text-xs font-medium text-slate-800 focus:border-amber-500 focus:outline-none"
        />
      </div>

      <button
        onClick={() => 처리(결과, 메모)}
        disabled={보냄 || !결과}
        className="w-full rounded-lg bg-emerald-600 py-2.5 text-xs font-bold text-white disabled:opacity-40"
      >
        {보냄 ? '남기는 중…' : '이 건 처리하고 다음'}
      </button>
      <p className="text-[10px] leading-relaxed text-slate-500">
        누르면 운영 원장에 「{나}가 무엇을 했다」로 한 줄 남습니다. 나중에 입금·회수가 이 줄과 짝이 맞습니다.
      </p>
    </div>
  );
}

/* ── ③ 차 한 대 원장 ─────────────────────────── */
function VehicleLedger({ 원장 }: { 원장: 원장 }) {
  return (
    <div className="space-y-3 p-3.5">
      <div>
        <p className="mb-1.5 text-[11px] font-bold text-slate-700">일어난 일 <span className="mono text-slate-400">{원장.행위.length}</span></p>
        {원장.행위.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-500">아직 기록이 없습니다.</p>
        ) : (
          <div className="space-y-1">
            {원장.행위.map((a, i) => (
              <div key={i} className="rounded-lg border border-slate-200/80 bg-white p-2 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="mono text-slate-500">{a.날}</span>
                  <span className="font-bold text-slate-900">{a.무엇}</span>
                  {a.상대 && <span className="ml-auto text-slate-500">{a.상대}</span>}
                </div>
                {a.속성 && <div className="mt-0.5 break-all text-[10px] text-slate-500">{a.속성}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-bold text-slate-700">돈 <span className="mono text-slate-400">{원장.돈.length}</span></p>
        {원장.돈.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-500">통장에서 이 차로 잡히는 줄이 없습니다.</p>
        ) : (
          <div className="space-y-1">
            {원장.돈.map((m, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-white p-2 text-[11px]">
                <span className="mono text-slate-500">{m.날}</span>
                <span className={`font-bold ${m.입출 === '입금' ? 'text-emerald-700' : 'text-slate-700'}`}>{m.입출}</span>
                <span className="mono ml-auto text-slate-900">{m.금액.toLocaleString('ko-KR')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
