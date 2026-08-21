/** 올리기 — 사진 한 장이 올바른 폴더로, 올바른 이름으로, 장부에 등록까지.
 *
 *  대표(2026-08-21): 「내가 여기서 erp 로 올리고 거기서 확인하게끔 할 수 있지??」
 *                    「직원들이 데이터센터에 올리는 것도 다 erp 에서 연동되게 하면 되겠다」
 *
 *  지금은 카톡으로 받아서 사람이 분류한다 — 그래서 빠진다.
 *  여기서 올리면 폴더·이름·장부가 한 번에 맞는다. 그러면 「계약서 없음 198대」가 줄어든다.
 *
 *  · **덮어쓰지 않는다.** 같은 이름이 있으면 뒤에 (2) 를 붙인다. 원본은 지우지 않는다
 *  · **어디에 넣을지 모르면 넣지 않는다.** 「어디에 넣을지 모름」으로 남기고 사람이 정한다
 */
import 'server-only';
import { getDriveClient } from '@/lib/google/client';
import { Readable } from 'node:stream';

const 대행 = () => process.env.GOOGLE_IMPERSONATE_USER || 'pyh@teamjpk.com';

/** 데이터센터 폴더 체계 — 법인 아래 갈래가 있다 (C1_계약서 · C2_자동차등록증 …) */
export const 갈래표 = [
  // 대표(2026-08-21): 「그냥 거기에 올리면 자동으로 구글드라이브 미분류로 회사 선택해서 들어가게끔」
  // → 무슨 서류인지 몰라도 «일단 들어간다». 분류는 나중에 해도 된다.
  //   못 넣고 들고 있는 것보다 미분류로라도 들어가 있는 게 낫다.
  { 갈래: '모르겠음', 폴더: '00_미분류자료', 설명: '나중에 분류' },
  { 갈래: '계약서', 폴더: 'C1_계약서', 설명: '렌터카 계약서' },
  { 갈래: '등록증', 폴더: 'C2_자동차등록증', 설명: '자동차등록증' },
  { 갈래: '상환스케줄', 폴더: 'C3_차량별 상환스케줄', 설명: '할부 상환표' },
  { 갈래: '보험증권', 폴더: 'C4_보험증권', 설명: '보험증권' },
  { 갈래: '보험가입증명', 폴더: 'C5_보험 가입증명서', 설명: '가입증명서' },
  { 갈래: '고지서', 폴더: 'C6_고지서_미처리', 설명: '과태료·범칙금' },
  { 갈래: '채권서류', 폴더: 'C8_채권·내용증명', 설명: '내용증명·지급명령' },
  { 갈래: '매각서류', 폴더: 'C9_매각·폐차', 설명: '매각·폐차·말소' },
] as const;

export type 갈래이름 = (typeof 갈래표)[number]['갈래'];

export const 법인표 = [
  { 코드: 'SW', 이름: '스위치플랜', 폴더앞: '02_스위치플랜' },
  { 코드: 'PR', 이름: '프라임구독', 폴더앞: '03_프라임구독' },
  { 코드: 'FP', 이름: '프리패스', 폴더앞: '04_프리패스' },
  { 코드: 'SO', 이름: '손오공', 폴더앞: '01_손오공' },
  { 코드: 'TJ', 이름: '팀제이피케이', 폴더앞: '05_팀제이피케이' },
] as const;

const 데이터센터 = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '';

async function 폴더찾기(drive: ReturnType<typeof getDriveClient>, 부모: string, 이름조각: string) {
  const q = `'${부모}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false and name contains '${이름조각.replace(/'/g, "\\'")}'`;
  const r = await drive.files.list({
    q, fields: 'files(id,name)', pageSize: 10,
    includeItemsFromAllDrives: true, supportsAllDrives: true,
  });
  return r.data.files?.[0] ?? null;
}

/** 이 파일이 갈 곳을 찾는다. 못 찾으면 null — 그러면 올리지 않는다 */
export async function 갈곳찾기(법인코드: string, 갈래: 갈래이름) {
  if (!데이터센터) return null;
  const drive = getDriveClient(대행());
  const 법인 = 법인표.find((x) => x.코드 === 법인코드);
  const 갈래정보 = 갈래표.find((x) => x.갈래 === 갈래);
  if (!법인 || !갈래정보) return null;

  const 법인폴더 = await 폴더찾기(drive, 데이터센터, 법인.폴더앞);
  if (!법인폴더?.id) return null;

  // 미분류는 법인 바로 아래에 있다 (C_차량 밑이 아니다)
  if (갈래 === '모르겠음') {
    const 미분류 = await 폴더찾기(drive, 법인폴더.id, '00_미분류자료');
    if (!미분류?.id) return null;
    return { id: 미분류.id, 이름: 미분류.name ?? '00_미분류자료', 경로: `${법인.폴더앞}/00_미분류자료` };
  }

  const 차량폴더 = await 폴더찾기(drive, 법인폴더.id, 'C_차량');
  if (!차량폴더?.id) return null;
  const 갈래폴더 = await 폴더찾기(drive, 차량폴더.id, 갈래정보.폴더);
  if (!갈래폴더?.id) return null;
  return { id: 갈래폴더.id, 이름: 갈래폴더.name ?? 갈래정보.폴더, 경로: `${법인.폴더앞}/C_차량/${갈래정보.폴더}` };
}

/** 파일 이름 규칙 — 차량번호가 앞에 온다. 그래야 장부가 차로 찾는다 */
export function 이름짓기(차량번호: string, 갈래: 갈래이름, 원래이름: string) {
  const 확장자 = (원래이름.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? '').toLowerCase();
  const 오늘 = new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10);
  // 차량번호를 모르면 원래 이름을 살린다 — 나중에 사람이 보고 분류해야 하니 단서를 지우면 안 된다
  if (!차량번호) {
    const 몸통 = 원래이름.replace(/\.[a-z0-9]{2,5}$/i, '').slice(0, 60) || '무제';
    return `${오늘} ${몸통}${확장자}`;
  }
  return `${차량번호} ${갈래} ${오늘}${확장자}`;
}

export type 올린결과 = { ok: true; 파일id: string; 이름: string; 경로: string } | { ok: false; 왜: string };

export async function 올리기(입력: {
  차량번호: string;
  법인코드: string;
  갈래: 갈래이름;
  파일이름: string;
  타입: string;
  내용: Buffer;
  올린사람: string;
}): Promise<올린결과> {
  const 차 = 입력.차량번호.replace(/\s+/g, '');
  // 차량번호는 «있으면» 맞아야 한다. 없어도 올라간다 — 미분류로 들어가 나중에 분류한다
  if (차 && !/^\d{2,3}[가-힣]\d{4}$/.test(차)) return { ok: false, 왜: '차량번호 모양이 아닙니다 (예: 12가3456)' };
  if (!입력.내용?.length) return { ok: false, 왜: '파일이 비었습니다' };

  const 갈곳 = await 갈곳찾기(입력.법인코드, 입력.갈래);
  if (!갈곳) return { ok: false, 왜: '데이터센터에서 넣을 폴더를 못 찾았습니다. 대표에게 말씀하세요' };

  const drive = getDriveClient(대행());
  const 이름 = 이름짓기(차, 입력.갈래, 입력.파일이름);

  // 같은 이름이 있으면 덮지 않고 뒤에 (2) 를 붙인다
  const 있나 = await drive.files.list({
    q: `'${갈곳.id}' in parents and name='${이름.replace(/'/g, "\\'")}' and trashed=false`,
    fields: 'files(id)', pageSize: 1, includeItemsFromAllDrives: true, supportsAllDrives: true,
  });
  const 최종이름 = 있나.data.files?.length
    ? 이름.replace(/(\.[a-z0-9]+)?$/i, (e) => ` (2)${e}`)
    : 이름;

  const res = await drive.files.create({
    requestBody: {
      name: 최종이름,
      parents: [갈곳.id],
      description: `${입력.올린사람}이 렌터카매니저에서 올림 · ${차 || '차량번호 없음'} · ${입력.갈래}`,
    },
    media: { mimeType: 입력.타입 || 'application/octet-stream', body: Readable.from(입력.내용) },
    fields: 'id,name',
    supportsAllDrives: true,
  });

  return { ok: true, 파일id: res.data.id!, 이름: res.data.name ?? 최종이름, 경로: 갈곳.경로 };
}
