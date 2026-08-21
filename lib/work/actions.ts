'use server';

import { 할일읽기, 할일쓰기, type 할일 } from './sheet';

/** 화면이 부르는 것 — 서버에서만 시트를 만진다 */
export async function 업무가져오기(담당?: string): Promise<할일[]> {
  return (await 할일읽기(담당)).filter((t) => !t.완료);
}

export async function 업무처리(행: number, 누가: string, { 완료, 의견 }: { 완료?: boolean; 의견?: string }) {
  if (!누가) throw new Error('누가 했는지 없이 쓸 수 없습니다');
  await 할일쓰기(행, { 완료, 의견 }, 누가);
}

/** 담당자별로 몇 건인가 — 대표 화면에서 쓴다 */
export async function 사람별건수(): Promise<{ 이름: string; 건수: number; 먼저: number }[]> {
  const 전부 = (await 할일읽기()).filter((t) => !t.완료);
  const m = new Map<string, { 이름: string; 건수: number; 먼저: number }>();
  for (const t of 전부) {
    const k = t.담당 || '(미배정)';
    const v = m.get(k) ?? { 이름: k, 건수: 0, 먼저: 0 };
    v.건수++;
    if (t.순서.startsWith('1')) v.먼저++;
    m.set(k, v);
  }
  return [...m.values()].sort((a, b) => b.건수 - a.건수);
}
