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

/** 위에 걸리는 지표 — 지금 있는 자료에서만 뽑는다. 없는 건 «–» 로 둔다 */
export async function 지표(): Promise<{ 이름: string; 값: string; 곁?: string; 위험?: boolean }[]> {
  const 전부 = (await 할일읽기()).filter((t) => !t.완료);
  const 지연 = 전부.filter((t) => t.순서.startsWith('1')).length;

  // 업무내용에 적힌 금액을 모은다 — 「65건 (63,477,800원)」
  let 돈 = 0;
  let 건 = 0;
  for (const t of 전부) {
    const m = t.업무내용.match(/\(([\d,]+)원\)/);
    if (m) 돈 += Number(m[1].replace(/,/g, ''));
    const n = t.업무내용.match(/([\d,]+)건/);
    if (n) 건 += Number(n[1].replace(/,/g, ''));
  }

  const 억 = (v: number) => (v >= 1e8 ? `${(v / 1e8).toFixed(2)}억` : v >= 1e4 ? `${Math.round(v / 1e4).toLocaleString('ko-KR')}만` : String(v));

  return [
    { 이름: '해야 할 일', 값: String(전부.length), 곁: '건' },
    { 이름: '지연', 값: String(지연), 곁: '건', 위험: 지연 > 0 },
    { 이름: '걸린 돈', 값: 돈 ? 억(돈) : '–', 곁: 돈 ? '원' : '' },
    { 이름: '대상', 값: 건 ? 건.toLocaleString('ko-KR') : '–', 곁: 건 ? '건' : '' },
  ];
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
