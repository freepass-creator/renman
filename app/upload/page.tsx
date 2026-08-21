'use client';
/** 올리기 — 회사만 고르면 데이터센터로 들어간다.
 *
 * 대표(2026-08-21):
 *   「내가 여기서 erp 로 올리고 거기서 확인하게끔 할 수 있지??」
 *   「직원들이 데이터센터에 올리는 것도 다 erp 에서 연동되게 하면 되겠다」
 *   「그냥 거기에 올리면 자동으로 구글드라이브 미분류로 회사 선택해서 들어가게끔」
 */
import { useEffect, useState, useTransition } from 'react';
import { watchAuth, type FbUser } from '@/lib/firebase/auth';
import { firebaseReady } from '@/lib/firebase/client';
import { 이름추정 } from '@/lib/work/people';
import { 파일올리기 } from './actions';
import { Login } from '@/components/Login';

const 갈래들 = ['모르겠음', '계약서', '등록증', '보험증권', '보험가입증명', '상환스케줄', '고지서', '채권서류', '매각서류'] as const;
const 법인들 = [
  { 코드: 'SW', 이름: '스위치플랜' },
  { 코드: 'PR', 이름: '프라임구독' },
  { 코드: 'FP', 이름: '프리패스' },
  { 코드: 'SO', 이름: '손오공' },
];

export default function Upload() {
  const [user, setUser] = useState<FbUser | undefined>(undefined);
  const [차, 차쓰기] = useState('');
  const [법인, 법인쓰기] = useState('SW');
  const [갈래, 갈래쓰기] = useState<string>('모르겠음');
  const [파일, 파일쓰기] = useState<File | null>(null);
  const [결과, 결과쓰기] = useState<{ ok: boolean; 글: string } | null>(null);
  const [보냄, 시작] = useTransition();

  useEffect(() => {
    if (!firebaseReady()) { setUser(null); return; }
    let 왔다 = false;
    const 시계 = setTimeout(() => { if (!왔다) setUser(null); }, 3000);
    let 끄기 = () => {};
    try {
      끄기 = watchAuth((u) => { 왔다 = true; clearTimeout(시계); setUser(u); });
    } catch { 왔다 = true; clearTimeout(시계); setUser(null); }
    return () => { clearTimeout(시계); 끄기(); };
  }, []);

  if (user === undefined) return <p className="empty">불러오는 중…</p>;
  if (user === null) return <Login />;

  const 나 = 이름추정(user.email);
  const 차입력 = 차.replace(/\s+/g, '');
  const 차정상 = !차입력 || /^\d{2,3}[가-힣]\d{4}$/.test(차입력);
  const 보낼수있나 = 차정상 && !!파일 && !보냄;

  return (
    <main className="wrap" style={{ maxWidth: 520, paddingBottom: 48 }}>
      <div className="bar">
        <div className="bar-row">
          <span className="bar-title">올리기</span>
          <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{나}</span>
          <a href="/" style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--key)', fontWeight: 600 }}>할 일</a>
        </div>
      </div>

      <div style={{ padding: 12 }}>
        <p className="note" style={{ marginTop: 0, marginBottom: 14 }}>
          회사만 고르면 올라갑니다. 차 번호와 서류를 알면 제자리로, 모르면 그 회사 미분류자료로 들어갑니다.
        </p>

        <label className="label">회사</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
          {법인들.map((c) => (
            <button key={c.코드} className="chip" data-on={법인 === c.코드 ? '1' : '0'}
                    onClick={() => { 법인쓰기(c.코드); 결과쓰기(null); }}>
              {c.이름}
            </button>
          ))}
        </div>

        <label className="label">차량번호 <span className="hint">모르면 비워 두세요</span></label>
        <input className="field" value={차} placeholder="12가3456"
               onChange={(e) => { 차쓰기(e.target.value); 결과쓰기(null); }} />
        {차 && !차정상 && (
          <p style={{ fontSize: 12, color: 'var(--late)', margin: '4px 0 0' }}>차량번호 모양이 아닙니다 (예: 12가3456)</p>
        )}

        <label className="label" style={{ marginTop: 14 }}>서류 <span className="hint">모르면 그대로 두세요</span></label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
          {갈래들.map((g) => (
            <button key={g} className="chip" data-on={갈래 === g ? '1' : '0'}
                    onClick={() => { 갈래쓰기(g); 결과쓰기(null); }}>
              {g}
            </button>
          ))}
        </div>

        <label className="label">사진 또는 파일</label>
        <input className="field" type="file" accept="image/*,application/pdf"
               onChange={(e) => { 파일쓰기(e.target.files?.[0] ?? null); 결과쓰기(null); }}
               style={{ padding: '8px 10px', fontSize: 13 }} />

        <button
          className="btn btn-key btn-wide"
          style={{ marginTop: 14 }}
          disabled={!보낼수있나}
          onClick={() =>
            시작(async () => {
              const fd = new FormData();
              fd.set('차량번호', 차입력);
              fd.set('법인코드', 법인);
              fd.set('갈래', 갈래);
              fd.set('올린사람', 나);
              fd.set('파일', 파일!);
              const r = await 파일올리기(fd);
              결과쓰기(r.ok ? { ok: true, 글: `${r.이름} → ${r.경로}` } : { ok: false, 글: r.왜 });
              if (r.ok) 파일쓰기(null);
            })
          }
        >
          {보냄 ? '올리는 중…' : '올리기'}
        </button>

        {결과 && (
          <p style={{
            marginTop: 10, fontSize: 12.5, lineHeight: 1.5,
            border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '9px 11px',
            color: 결과.ok ? 'var(--done)' : 'var(--late)',
          }}>
            {결과.ok ? '올렸습니다 — ' : ''}{결과.글}
          </p>
        )}

        <p className="note" style={{ marginTop: 16 }}>
          같은 이름이 있으면 덮지 않고 (2)를 붙입니다. 넣을 곳을 못 찾으면 올리지 않고 알려드립니다.
        </p>
      </div>
    </main>
  );
}
