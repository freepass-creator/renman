/** 오더 하나 안의 «개별 대상» 을 뽑는다.
 *
 *  대표(2026-08-21): 「독촉 5건이면 그걸 누르면 독촉 5건에 대한 업무가 나와서
 *                     각각 처리하고 후속 뭘 했다고 남겨야지」
 *
 *  「스위치플랜 미납고객 독촉 65건」은 오더다. 실제 일은 그 65명 한 사람씩이다.
 *  여기서 그 명단을 뽑아 화면에 한 줄씩 준다. 처리하면 운영 원장에 한 줄이 남는다.
 *
 *  · 시트를 «있는 그대로» 읽는다. 판정 기준을 여기서 새로 만들지 않는다
 *  · 못 뽑는 분류는 빈 목록을 준다 — 그러면 화면이 「시트에서 보세요」로 넘긴다
 */
import 'server-only';
import { getSheetsClient } from '@/lib/google/client';

const SS_ID: Record<string, string> = {
  스위치플랜: '1KEKm4j0oQ39Jk-0IgaydeMF_IpW7-_evOfeP_pyBkgM',
  프라임구독: '13QQTz1W0FlBk5V8lggVw93EhDwIgjFF4mRb2BOiKSPk',
};
const 대행 = () => process.env.GOOGLE_IMPERSONATE_USER || 'pyh@teamjpk.com';

export type 대상 = {
  키: string;
  차량번호: string;
  이름: string;          // 코드명(임차인)
  회사: string;
  금액?: number;
  곁?: string;           // 한 줄 곁들이는 말 (청구/결제·기간 같은 것)
};

const 숫자 = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** 머리줄을 찾아 열 위치를 준다 — 시트마다 머리가 몇 째 줄인지 다르다 */
function 머리찾기(v: string[][]) {
  const i = v.findIndex((r) => (r || []).some((c) => String(c ?? '').trim() === '차량번호'));
  const hi = i < 0 ? 0 : i;
  const h = (v[hi] || []).map((x) => String(x ?? '').trim());
  return { hi, h, 열: (name: string) => h.indexOf(name) };
}

/**
 * 이 오더의 대상 명단.
 * @param 회사명   「스위치플랜」·「프라임구독」·「스위치·프라임」
 * @param 업무분류 「미납고객 독촉」·「차량회수」·「과납 환불」 …
 */
export async function 대상뽑기(회사명: string, 업무분류: string): Promise<대상[]> {
  const 회사들 = Object.keys(SS_ID).filter((c) => 회사명.includes(c.slice(0, 2)) || 회사명 === c || /전 법인|3사/.test(회사명));
  const 볼회사 = 회사들.length ? 회사들 : Object.keys(SS_ID);
  const 돈일 = /미납|독촉|회수|과납|수납|청구/.test(업무분류);
  if (!돈일) return [];   // 아직 명단을 못 뽑는 분류 — 화면이 시트로 넘긴다

  const api = getSheetsClient(대행());
  const 나온것: 대상[] = [];

  for (const 회사 of 볼회사) {
    let v: string[][] = [];
    try {
      const r = await api.spreadsheets.values.get({ spreadsheetId: SS_ID[회사], range: `'수납'!A1:AZ3000` });
      v = (r.data.values || []) as string[][];
    } catch { continue; }
    if (!v.length) continue;

    const { hi, 열 } = 머리찾기(v);
    const c = {
      차: 열('차량번호'), 이름: 열('코드명'), 청구: 열('청구금액'), 결제: 열('결제금액'),
      시작: 열('시작'), 종료: 열('종료'), 대여료: 열('대여료'),
    };
    if (c.차 < 0) continue;

    for (const r of v.slice(hi + 1)) {
      const 차 = String(r[c.차] ?? '').replace(/\s+/g, '');
      if (!/^\d{2,3}[가-힣]\d{4}$/.test(차)) continue;
      const 청구 = c.청구 >= 0 ? 숫자(r[c.청구]) : 0;
      const 결제 = c.결제 >= 0 ? 숫자(r[c.결제]) : 0;
      const 이름 = String(r[c.이름] ?? '').trim();

      let 걸림: { 금액: number; 곁: string } | null = null;
      if (/미납|독촉|회수/.test(업무분류)) {
        if (청구 > 0 && 결제 === 0) 걸림 = { 금액: 청구, 곁: '한 푼도 안 들어옴' };
        else if (청구 > 0 && 결제 > 0 && 결제 < 청구) 걸림 = { 금액: 청구 - 결제, 곁: `일부만 (${결제.toLocaleString('ko-KR')}원)` };
      } else if (/과납/.test(업무분류)) {
        if (결제 > 청구 && 청구 > 0) 걸림 = { 금액: 결제 - 청구, 곁: '더 받음' };
      } else if (/청구/.test(업무분류)) {
        if (청구 === 0 && c.대여료 >= 0 && 숫자(r[c.대여료]) > 0) 걸림 = { 금액: 숫자(r[c.대여료]), 곁: '청구가 비었음' };
      }
      if (!걸림) continue;

      나온것.push({
        키: `${회사}|${차}`,
        차량번호: 차,
        이름: 이름 || '(이름 없음)',
        회사,
        금액: 걸림.금액,
        곁: 걸림.곁,
      });
    }
  }

  // 큰 것부터 — 돈이 큰 게 먼저다
  return 나온것.sort((a, b) => (b.금액 ?? 0) - (a.금액 ?? 0));
}
