'use server';

import { 올리기, type 갈래이름 } from '@/lib/work/upload';
import { 할일쓰기 } from '@/lib/work/sheet';

/** 화면에서 올린 파일 하나 — 폴더·이름·기록까지 한 번에 */
export async function 파일올리기(폼: FormData) {
  const 차량번호 = String(폼.get('차량번호') ?? '');
  const 법인코드 = String(폼.get('법인코드') ?? '');
  const 갈래 = String(폼.get('갈래') ?? '') as 갈래이름;
  const 올린사람 = String(폼.get('올린사람') ?? '');
  const f = 폼.get('파일');
  if (!(f instanceof File)) return { ok: false as const, 왜: '파일이 없습니다' };
  if (!올린사람) return { ok: false as const, 왜: '누가 올리는지 없습니다' };

  const 내용 = Buffer.from(await f.arrayBuffer());
  return 올리기({ 차량번호, 법인코드, 갈래, 파일이름: f.name, 타입: f.type, 내용, 올린사람 });
}
