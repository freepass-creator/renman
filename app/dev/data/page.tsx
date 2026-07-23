'use client';
/**
 * 개발도구 — 회사별 데이터 적재/초기화. (실데이터는 회사마다 각자 소스로 나중에 추가)
 *   · 현재 실데이터 보유: switchplan(스위치플랜, 채권 시트 118대). 나머지는 샘플/미보유.
 *   · seedSampleData(회사) = 그 회사 pack 적재(중복 자동 제외). wipeCompany = 그 회사만 하드 삭제.
 *   · 본사(마스터) 전용. Firebase 모드면 Firestore, 아니면 로컬.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/lib/session';
import { getStore } from '@/lib/store';
import { wipeCompany, wipeAllData } from '@/lib/reset';
import { reflectCompany } from '@/lib/reflect';
import { type OperatingSummary } from '@/lib/operating-snapshot';
import { OperatingSummaryView } from '@/components/OperatingSummary';
import { COMPANIES, companyLabel, companyShort } from '@/lib/companies';
import { Page, Panel, Btn, C, LoadingOverlay, th, td, useConfirm, usePrompt } from '@/components/ui';

import { seedDemoData } from '@/lib/seed';

const REAL = new Set(['switchplan']); // 실데이터 보유 회사

export default function DevDataPage() {
  const { user, isOperator } = useSession();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [counts, setCounts] = useState<Record<string, { vehicle: number; contract: number; bank_tx: number; insurance: number } | null>>({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [snap, setSnap] = useState<{ companyId: string; summary: OperatingSummary } | null>(null);

  const load = useCallback(async () => {
    const store = getStore();
    const out: typeof counts = {};
    await Promise.all(COMPANIES.map(async (c) => {
      try {
        const [v, ct, bt, ins] = await Promise.all([store.list('vehicle', c), store.list('contract', c), store.list('bank_tx', c), store.list('insurance', c)]);
        out[c] = { vehicle: v.length, contract: ct.length, bank_tx: bt.length, insurance: ins.length };
      } catch { out[c] = null; }
    }));
    setCounts({ ...out });
  }, []);
  useEffect(() => { load(); }, [load]);

  async function loadCompany(c: string) {
    const cnt = counts[c];
    const hasData = !!cnt && (cnt.vehicle + cnt.contract + cnt.bank_tx + cnt.insurance) > 0;
    // 반영 = 깨끗한 최신 적재 + 운영 스냅샷 산출(공용 reflect 엔진). 옛 1930·미분류 잔존 방지.
    if (hasData && !(await confirm({ message: `${companyLabel(c)}의 기존 데이터를 지우고 최신 실데이터로 다시 반영합니다. 계속?`, danger: true }))) return;
    setBusy(c); setMsg('');
    try {
      const r = await reflectCompany(c);
      const p = r.loaded.perEntity;
      setMsg(`${companyLabel(c)} 반영 ${r.loaded.total}건 (차량 ${p.vehicle || 0}·계약 ${p.contract || 0}·계좌 ${p.bank_tx || 0}·보험 ${p.insurance || 0})`);
      setSnap({ companyId: c, summary: r.summary });
      await load();
    } catch (e) { setMsg(`${companyLabel(c)} 반영 실패: ${(e as Error).message}`); }
    finally { setBusy(''); }
  }
  async function clearCompany(c: string) {
    if (!(await confirm({ message: `${companyLabel(c)}의 모든 데이터를 지웁니다(하드, 되돌릴 수 없음). 계속?`, danger: true }))) return;
    const typed = await prompt({ message: `확인: 법인 코드 "${c}" 를 그대로 입력하세요.`, required: true });
    if (typed !== c) { setMsg('초기화 취소 — 법인 코드 불일치'); return; }
    setBusy(c); setMsg('');
    try { const r = await wipeCompany(c); setMsg(`${companyLabel(c)} 초기화 — ${r.deleted}건 삭제`); await load(); }
    catch (e) { setMsg(`${companyLabel(c)} 초기화 실패: ${(e as Error).message}`); }
    finally { setBusy(''); }
  }
  async function clearAll() {
    if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_ALLOW_HARD_WIPE !== '1') {
      setMsg('프로덕션 전체 초기화 차단 — NEXT_PUBLIC_ALLOW_HARD_WIPE=1 필요');
      return;
    }
    if (!(await confirm({ message: '전 회사 데이터를 완전히 지웁니다(하드). 계속?', danger: true }))) return;
    const typed = await prompt({ message: '확인: WIPE-ALL 을 입력하세요.', required: true });
    if (typed !== 'WIPE-ALL') { setMsg('전체 초기화 취소'); return; }
    setBusy('__all__'); setMsg('');
    try { const r = await wipeAllData(); setMsg(`전체 초기화 — ${r.deleted}건 삭제`); await load(); }
    catch (e) { setMsg(`실패: ${(e as Error).message}`); }
    finally { setBusy(''); }
  }
  async function loadDemoAll() {
    if (!(await confirm({ message: '전 법인 데이터를 비우고 데모 샘플(차량·계약·미수·과태료·미분류입금)을 넣습니다. 계속?', danger: true }))) return;
    setBusy('__demo__'); setMsg(''); setSnap(null);
    try {
      let total = 0;
      const parts: string[] = [];
      for (const c of COMPANIES) {
        await wipeCompany(c);
        const r = await seedDemoData(c);
        total += r.total;
        parts.push(`${companyShort(c) || c} ${r.total}`);
      }
      setMsg(`데모 샘플 ${total}건 적재 (${parts.join(' · ')})`);
      await load();
    } catch (e) { setMsg(`데모 적재 실패: ${(e as Error).message}`); }
    finally { setBusy(''); }
  }
  function checkBackend() { setMsg('저장 백엔드: ' + getStore().backend + ' (Firebase 설정 있으면 Firestore, 없으면 로컬)'); }

  if (!isOperator) return <Page title="개발도구" noCompany><div style={{ padding: 20, color: C.mute }}>본사(마스터) 전용입니다.</div></Page>;

  const num = (n: number | undefined) => <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{n ?? '—'}</span>;

  return (
    <Page title="개발도구" noCompany meta={`${user.name} · 본사 · 그때그때 필요한 관리 기능`}>
      {busy && <LoadingOverlay label={busy === '__all__' ? '전체 초기화 중…' : busy === '__demo__' ? '데모 샘플 넣는 중…' : `${companyLabel(busy)} 처리 중…`} />}
      <Panel title="회사별 데이터 적재 / 초기화" action={
        <span style={{ display: 'inline-flex', gap: 8 }}>
          <Btn onClick={loadDemoAll} disabled={!!busy}>데모 샘플 넣기</Btn>
          <Btn variant="danger" onClick={clearAll} disabled={!!busy}>전체 초기화</Btn>
        </span>
      }>
        <div style={{ padding: '4px 4px 10px' }}>
          <p style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.7, margin: '8px 12px 12px' }}>
            <b>데모 샘플 넣기</b> = 전 법인에 소량 샘플(미수·반납·과태료·미분류입금). UI 확인용.
            스위치플랜 <b>반영</b> = 실데이터(보유 많음). 프라임·손오공은 반영 시 데모 팩.
          </p>
          <div style={{ overflowX: 'auto', border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', margin: '0 12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead><tr>
                <th style={th}>회사</th>
                <th style={{ ...th, textAlign: 'right' }}>차량</th>
                <th style={{ ...th, textAlign: 'right' }}>계약</th>
                <th style={{ ...th, textAlign: 'right' }}>계좌거래</th>
                <th style={{ ...th, textAlign: 'right' }}>보험</th>
                <th style={{ ...th, width: 210 }}>작업</th>
              </tr></thead>
              <tbody>
                {COMPANIES.map((c) => {
                  const cnt = counts[c];
                  return (
                    <tr key={c}>
                      <td style={td}>
                        <b>{companyLabel(c)}</b> <span style={{ fontSize: 11, color: C.faint }}>{companyShort(c)}</span>
                        {REAL.has(c) && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: 'var(--green-text)', background: 'var(--bg-stripe)', padding: '1px 6px', borderRadius: 4 }}>실데이터</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>{num(cnt?.vehicle)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{num(cnt?.contract)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{num(cnt?.bank_tx)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{num(cnt?.insurance)}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Btn size="sm" onClick={() => loadCompany(c)} disabled={!!busy}>반영</Btn>
                          <Btn size="sm" variant="ghost" onClick={() => clearCompany(c)} disabled={!!busy}><span style={{ color: C.danger }}>비우기</span></Btn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {msg && <div style={{ margin: '12px', fontSize: 13, color: msg.includes('실패') ? C.danger : C.ok, fontWeight: 600 }}>{msg}</div>}
        </div>
      </Panel>

      {snap && (
        <Panel title={`반영 결과 — 운영 스냅샷 · ${companyLabel(snap.companyId)}`}>
          <div style={{ padding: '12px 14px' }}>
            <OperatingSummaryView s={snap.summary} />
            <p style={{ fontSize: 11, color: C.faint, margin: '10px 2px 0', lineHeight: 1.6 }}>
              홈·법인관리와 동일한 집계 엔진(operating-snapshot)으로 산출 — 어디서 보든 같은 숫자.
            </p>
          </div>
        </Panel>
      )}

      <Panel title="저장 백엔드">
        <div style={{ padding: '14px 16px' }}>
          <p style={{ fontSize: 12.5, color: C.mute, margin: '0 0 12px', lineHeight: 1.7 }}>
            Firebase 설정(.env.local)이 있으면 Firestore 실저장, 없으면 로컬(localStorage) 미리보기로 자동 전환됩니다.
          </p>
          <Btn variant="ghost" onClick={checkBackend}>현재 백엔드 확인</Btn>
        </div>
      </Panel>
    </Page>
  );
}
