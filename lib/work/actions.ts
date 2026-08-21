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
