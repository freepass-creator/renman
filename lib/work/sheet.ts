/** 업무 관제 — 업무내비게이션 시트를 읽고 쓴다.
 *
 *  대표(2026-08-21): 「어차피 구글시트처럼 니가 erp 로 제공해줘도 되잖아 더 나을 거 같은데??」
 *                    「그래 이게 erp 다 이제....」 / 「핸드폰으로도 확인하기 쉽게 해주고」
 *
 *  뒤는 시트(정본) · 앞은 이 화면. 시트를 버리지 않는다 —
 *  화면이 죽어도 일이 돌아가야 하고, 대표가 직접 열어 볼 수 있어야 한다.
 *  직원은 시트를 안 본다.
 */
import 'server-only';
import { getSheetsClient } from '@/lib/google/client';

export const 업무내비 = '1EO72KmCWKeZIcSAL2WAsmHMm2ZKy5imDqjWwyud2FSg';
export const 원장 = '1lXmUx65OMMr_K1e1rzaW1nMzbt2ZzCeJXmxaK-GrUxI';
const 할일탭 = '해야 할 일';

const 대행 = () => process.env.GOOGLE_IMPERSONATE_USER || 'pyh@teamjpk.com';

export type { 할일 } from './types';
import type { 할일 } from './types';

/** `=HYPERLINK("주소","이름")` 에서 주소와 이름을 뽑는다 */
function 링크풀기(f: string): { url: string; name: string } {
  const s = String(f ?? '').trim();
  const m = s.match(/HYPERLINK\(\s*"([^"]+)"\s*(?:,\s*"([^"]*)")?\s*\)/i);
  if (m) return { url: m[1], name: m[2] || '열기' };
  if (/^https?:\/\//.test(s)) return { url: s, name: '열기' };
  return { url: '', name: '' };
}

/** 담당을 주면 그 사람 것만, 안 주면 «전체 업무».
 *  대표(2026-08-21): 「로그인하면 «내 업무»랑 «전체 업무»가 보이게 하면 되잖아」 */
export async function 할일읽기(담당?: string): Promise<할일[]> {
  const api = getSheetsClient(대행());
  const [값, 수식] = await Promise.all([
    api.spreadsheets.values.get({ spreadsheetId: 업무내비, range: `'${할일탭}'!A1:Z300` }),
    api.spreadsheets.values.get({ spreadsheetId: 업무내비, range: `'${할일탭}'!A1:Z300`, valueRenderOption: 'FORMULA' }),
  ]);
  const v = (값.data.values || []) as string[][];
  const f = (수식.data.values || []) as string[][];
  if (v.length < 2) return [];
  const h = (v[1] || []).map((x) => String(x ?? '').trim());
  const i = (n: string) => h.indexOf(n);

  const out: 할일[] = [];
  v.slice(2).forEach((r, k) => {
    const g = (n: string) => { const c = i(n); return c < 0 ? '' : String(r[c] ?? '').trim(); };
    const gf = (n: string) => { const c = i(n); return c < 0 ? '' : String(f[k + 2]?.[c] ?? '').trim(); };
    if (!g('업무분류') && !g('업무내용')) return;
    if (담당 && g('담당') !== 담당) return;
    const p = 링크풀기(gf('업무페이지'));
    const b = 링크풀기(gf('백데이터'));
    out.push({
      행: k + 3,
      완료: String(r[i('완료')] ?? '').toUpperCase() === 'TRUE',
      순서: g('순서'), 회사명: g('회사명'), 업무분류: g('업무분류'),
      담당: g('담당'), 업무내용: g('업무내용'),
      업무페이지: p.url, 업무페이지이름: p.name || '명단 열기',
      백데이터: b.url, 백데이터이름: b.name || '근거 보기',
      담당자의견: g('담당자 의견'),
    });
  });
  return out.sort((a, b) => (a.순서 || 'z').localeCompare(b.순서 || 'z'));
}

const A = (n: number) => { let s = '', x = n + 1; while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = (x - r - 1) / 26; } return s; };

/** 직원이 쓰는 칸은 둘뿐이다 — 완료와 의견 (대표 2026-08-21) */
export async function 할일쓰기(행: number, { 완료, 의견 }: { 완료?: boolean; 의견?: string }, 누가: string) {
  const api = getSheetsClient(대행());
  const head = await api.spreadsheets.values.get({ spreadsheetId: 업무내비, range: `'${할일탭}'!A2:Z2` });
  const h = ((head.data.values || [[]])[0] || []).map((x) => String(x ?? '').trim());
  const data: { range: string; values: (string | boolean)[][] }[] = [];
  if (완료 !== undefined) { const c = h.indexOf('완료'); if (c >= 0) data.push({ range: `'${할일탭}'!${A(c)}${행}`, values: [[완료]] }); }
  if (의견 !== undefined) { const c = h.indexOf('담당자 의견'); if (c >= 0) data.push({ range: `'${할일탭}'!${A(c)}${행}`, values: [[의견]] }); }
  if (!data.length) return;

  await api.spreadsheets.values.batchUpdate({
    spreadsheetId: 업무내비,
    requestBody: { valueInputOption: 'USER_ENTERED', data },
  });

  // 화면에서 한 일도 사실이다 — 운영 원장에 남긴다
  const 이제 = new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 16).replace('T', ' ');
  try {
    const cur = await api.spreadsheets.values.get({ spreadsheetId: 원장, range: `'운영'!A:A` });
    const 끝 = (cur.data.values || []).length + 1;
    await api.spreadsheets.values.update({
      spreadsheetId: 원장, range: `'운영'!A${끝}`, valueInputOption: 'RAW',
      requestBody: { values: [[
        `EV-${이제.slice(0, 10).replace(/-/g, '')}-${String(끝).padStart(5, '0')}`, '', 이제.slice(0, 10), 이제, '',
        '업무', 완료 ? '오더완료' : '확인요청', '오더', `해야할일#${행}`, '', '', 완료 ? '완료' : '',
        의견 ? `의견=${의견.slice(0, 200)}` : '', `업무내비 ${행}행`, 누가, '성공', '',
      ]] },
    });
  } catch { /* 원장 기록이 실패해도 직원 작업은 살린다 */ }
}

/** 한 건을 처리했다 — 운영 원장에 «행위» 한 줄.
 *  대표(2026-08-21): 「각각 처리하고 후속 뭘 했다고 남겨야지」
 *  이 한 줄이 나중에 짝(독촉 → 입금·회수)을 닫는 근거가 된다.
 */
export async function 행위남기기(입력: {
  회사: string; 차량번호: string; 이름: string;
  업무분류: string; 결과: string; 메모: string; 누가: string;
}) {
  const api = getSheetsClient(대행());
  const 이제 = new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 16).replace('T', ' ');
  const 법인 = 입력.회사.startsWith('스위치') ? 'SW'
    : 입력.회사.startsWith('프라임') ? 'PR'
    : 입력.회사.startsWith('프리패스') ? 'FP'
    : 입력.회사.startsWith('손오공') ? 'SO' : 'CO';

  // 무슨 «행위» 인지 — 독촉은 통화, 자료는 수령
  const [분류, 종류] = /독촉|회수|미납|통화/.test(입력.업무분류)
    ? ['고객응대', '통화']
    : ['업무', '오더완료'];

  const cur = await api.spreadsheets.values.get({ spreadsheetId: 원장, range: `'운영'!A:A` });
  const 끝 = (cur.data.values || []).length + 1;

  await api.spreadsheets.values.update({
    spreadsheetId: 원장, range: `'운영'!A${끝}`, valueInputOption: 'RAW',
    requestBody: {
      values: [[
        `EV-${이제.slice(0, 10).replace(/-/g, '')}-${String(끝).padStart(5, '0')}`,
        '',                       // 묶음ID — 돈이 붙으면 그때 잇는다
        이제.slice(0, 10),        // 발생시각
        이제,                     // 기록시각
        법인, 분류, 종류,
        '차량;고객',
        `${입력.차량번호};${입력.이름}`,
        입력.이름,
        '', '',                   // 상태전·상태후
        `업무=${입력.업무분류};결과=${입력.결과}${입력.메모 ? `;메모=${입력.메모.slice(0, 200)}` : ''}`,
        '렌터카매니저에서 처리',
        입력.누가, '성공', '',
      ]],
    },
  });
  return { ok: true as const, 행: 끝 };
}

/** 차 한 대의 원장 — 그 차에 무슨 일이 있었나.
 *  대표(2026-08-21): 「차량 데이터 확인하려고 하면 그거 원장 확인하게 해주기 이거 erp 네 뭐....」
 */
export async function 차량원장(차량번호: string) {
  const api = getSheetsClient(대행());
  const 차 = 차량번호.replace(/\s+/g, '');

  const [운영, 자금] = await Promise.all([
    api.spreadsheets.values.get({ spreadsheetId: 원장, range: `'운영'!A1:Q5000` }).catch(() => null),
    api.spreadsheets.values.get({ spreadsheetId: 원장, range: `'자금'!A1:P8000` }).catch(() => null),
  ]);

  const 행위: { 날: string; 무엇: string; 상대: string; 속성: string; 근거: string }[] = [];
  const v = (운영?.data.values || []) as string[][];
  if (v.length > 1) {
    const h = v[0].map((x) => String(x ?? '').trim());
    const i = (n: string) => h.indexOf(n);
    for (const r of v.slice(1)) {
      if (!String(r[i('대상ID')] ?? '').replace(/\s+/g, '').includes(차)) continue;
      행위.push({
        날: String(r[i('발생시각')] ?? '').slice(0, 10),
        무엇: `${r[i('분류')] ?? ''}/${r[i('종류')] ?? ''}`,
        상대: String(r[i('상대')] ?? ''),
        속성: String(r[i('속성')] ?? ''),
        근거: String(r[i('근거')] ?? ''),
      });
    }
  }

  const 돈: { 날: string; 입출: string; 금액: number; 적요: string; 상대: string }[] = [];
  const w = (자금?.data.values || []) as string[][];
  if (w.length > 1) {
    const h = w[0].map((x) => String(x ?? '').trim());
    const i = (n: string) => h.indexOf(n);
    for (const r of w.slice(1)) {
      const 글 = `${r[i('적요')] ?? ''} ${r[i('상대')] ?? ''}`.replace(/\s+/g, '');
      if (!글.includes(차)) continue;
      돈.push({
        날: String(r[i('거래일시')] ?? '').slice(0, 10),
        입출: String(r[i('입출')] ?? ''),
        금액: Number(String(r[i('금액')] ?? '').replace(/[^0-9.-]/g, '')) || 0,
        적요: String(r[i('적요')] ?? ''),
        상대: String(r[i('상대')] ?? ''),
      });
    }
  }

  행위.sort((a, b) => b.날.localeCompare(a.날));
  돈.sort((a, b) => b.날.localeCompare(a.날));
  return { 차량번호: 차, 행위: 행위.slice(0, 60), 돈: 돈.slice(0, 60) };
}

/** 오늘 원장에 남은 행위 수 — 직원이 오늘 무엇을 얼마나 했나 */
export async function 오늘행위수(오늘: string): Promise<number> {
  const api = getSheetsClient(대행());
  const r = await api.spreadsheets.values.get({ spreadsheetId: 원장, range: `'운영'!D:D` });
  const v = (r.data.values || []) as string[][];
  return v.slice(1).filter((x) => String(x[0] ?? '').startsWith(오늘)).length;
}
