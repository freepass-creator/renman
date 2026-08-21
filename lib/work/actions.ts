'use server';

import { 할일읽기, 할일쓰기 } from './sheet';
import type { 할일, 사람셈 } from './types';

/** 화면이 부르는 것 — 서버에서만 시트를 만진다 */
export async function 업무가져오기(담당?: string): Promise<할일[]> {
  return (await 할일읽기(담당)).filter((t) => !t.완료);
}

export async function 업무처리(행: number, 누가: string, { 완료, 의견 }: { 완료?: boolean; 의견?: string }) {
  if (!누가) throw new Error('누가 했는지 없이 쓸 수 없습니다');
  await 할일쓰기(행, { 완료, 의견 }, 누가);
}

/** 담당자별로 몇 건인가 — 대표 화면에서 쓴다 */
export async function 사람별건수(): Promise<사람셈[]> {
  const 전부 = (await 할일읽기()).filter((t) => !t.완료);
  const m = new Map<string, 사람셈>();
  for (const t of 전부) {
    const k = t.담당 || '(미배정)';
    const v = m.get(k) ?? { 이름: k, 건수: 0, 먼저: 0 };
    v.건수++;
    if (t.순서.startsWith('1')) v.먼저++;
    m.set(k, v);
  }
  return [...m.values()].sort((a, b) => b.건수 - a.건수);
}

/** 위에 거는 지표 — 지금 있는 자료에서만 뽑는다. 없는 건 «–» 로 둔다.
 *  대표(2026-08-21): 「야 걸린 돈이 뭐냐 ㅋㅋㅋ」 → 조어를 쓰지 않는다. «미수» 가 표준어다.
 */
export async function 지표(): Promise<{ 이름: string; 값: string; 곁?: string; 위험?: boolean }[]> {
  const 전부 = (await 할일읽기()).filter((t) => !t.완료);
  const 지연 = 전부.filter((t) => t.순서.startsWith('1')).length;

  // 미수 = 못 받은 돈. 미납·독촉·회수 오더에 적힌 금액만 더한다(과납은 우리가 돌려줄 돈이라 뺀다)
  let 미수 = 0;
  let 미수건 = 0;
  for (const t of 전부) {
    if (!/미납|독촉|회수/.test(t.업무분류)) continue;
    const m = t.업무내용.match(/\(([\d,]+)원\)/);
    if (m) 미수 += Number(m[1].replace(/,/g, ''));
    const n = t.업무내용.match(/([\d,]+)건/);
    if (n) 미수건 += Number(n[1].replace(/,/g, ''));
  }

  const 억 = (v: number) =>
    v >= 1e8 ? `${(v / 1e8).toFixed(1)}억`
    : v >= 1e4 ? `${Math.round(v / 1e4).toLocaleString('ko-KR')}만`
    : v.toLocaleString('ko-KR');

  const 오늘 = new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10);
  let 오늘처리 = 0;
  try { 오늘처리 = await 오늘한일(오늘); } catch { /* 원장을 못 읽어도 화면은 뜬다 */ }

  return [
    { 이름: '할 일', 값: String(전부.length), 곁: '건' },
    { 이름: '지연', 값: String(지연), 곁: '건', 위험: 지연 > 0 },
    { 이름: '미수', 값: 미수 ? 억(미수) : '–', 곁: 미수 ? `원 · ${미수건}건` : '', 위험: 미수 > 0 },
    { 이름: '오늘 처리', 값: String(오늘처리), 곁: '건' },
  ];
}

/** 오늘 원장에 남은 처리 건수 — 직원이 오늘 얼마나 했나 */
async function 오늘한일(오늘: string): Promise<number> {
  const { 오늘행위수 } = await import('./sheet');
  return 오늘행위수(오늘);
}

/** 오더 하나 안의 개별 대상 — 「독촉 65건」의 그 65명 */
export async function 대상목록(회사명: string, 업무분류: string) {
  const { 대상뽑기 } = await import('./targets');
  return 대상뽑기(회사명, 업무분류);
}

/** 한 건을 처리했다 — 운영 원장에 행위 한 줄로 남긴다 */
export async function 한건처리(입력: {
  회사: string; 차량번호: string; 이름: string;
  업무분류: string; 결과: string; 메모: string; 누가: string;
}) {
  const { 행위남기기 } = await import('./sheet');
  return 행위남기기(입력);
}

/** 차 한 대 원장 — 화면에서 차량번호를 누르면 */
export async function 차량보기(차량번호: string) {
  const { 차량원장 } = await import('./sheet');
  return 차량원장(차량번호);
}
