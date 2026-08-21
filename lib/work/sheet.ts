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

export type 할일 = {
  행: number;
  완료: boolean;
  순서: string;
  회사명: string;
  업무분류: string;
  담당: string;
  업무내용: string;
  업무페이지: string;
  업무페이지이름: string;
  백데이터: string;
  백데이터이름: string;
  담당자의견: string;
};

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
