'use client';
import { useMemo, useState } from 'react';
import { useSession } from '@/lib/session';
import { type EntityRecord } from '@/lib/intake/entities';
import { computeContractView, patchEngineLock } from '@/lib/contract-ops';
import { collectionStage } from '@/lib/collection';
import { openCar, openCustomer } from '@/lib/ui-bus';
import { customerKey } from '@/lib/customers';
import { sendNoticeCert, sendNoticeCertBulk } from '@/lib/docs/send-notice';
import { useBusyAction } from '@/lib/use-busy-action';
import { safeUpdate } from '@/lib/safe-update';
import { selectedInDim } from '@/lib/lens-filters';
import { textMatch } from '@/lib/search-match';
import { FacetPage, Sec, Cards, Metric, ObjCard, Btn, EmptyState, won, C, SPACE_M, PageLoading } from '@/components/ui';
import { FacetRail } from '@/components/FacetRail';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { WorkHubBack } from '@/components/WorkHubTabs';
import { QuickLogForm } from '@/components/QuickLogForm';
import { NotifyDialog, type NotifyRecipient } from '@/components/NotifyDialog';
import { companyLabel } from '@/lib/companies';
import { toast } from '@/lib/toast';
import { TODAY } from '@/lib/dashboard-consts';
import { selectReceivables } from '@/lib/snapshot/selectors';
import { useEntityLists } from '@/lib/use-entity-lists';
import { commitUpdate } from '@/lib/commit';
import { resolveWriteCompany, NEED_COMPANY } from '@/lib/scope';

// 미수 워크벤치 = 회수 파트의 "딱 여기만" 메인. 미수율이 핵심축. 자금(수납)과 연동돼 자동 갱신.
// 담당자가 어떻게 관리했는지(내용증명 발송·시동제어 여부·최근 연락)가 보이고, 그 자리에서 조치.
const STONE: Record<string, 'gray' | 'amber' | 'orange' | 'red' | 'purple'> = { 정상: 'gray', 경고: 'amber', 시동제어: 'orange', 내용증명: 'red', 채권화: 'purple' };
const CONTACT_KINDS = ['통화', '문자', '방문', '독촉'];

export default function ReceivablesPage() {
  const { companyId, scopeAll, user } = useSession();
  const { data: [cs = [], hs = []], loading, reload } = useEntityLists(['contract', 'history']);
  const [facets, setFacets] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [logKey, setLogKey] = useState<string | null>(null); // 연락 기록 펼친 행. 그 자리에서 인라인(팝업 X)
  const [notify, setNotify] = useState(false); // 문자 발송 다이얼로그
  const [noticeSel, setNoticeSel] = useState<Set<string>>(new Set());
  const [, runBusy] = useBusyAction();
  const toggleFacet = (label: string) => setFacets((s) => { const n = new Set(s); n.has(label) ? n.delete(label) : n.add(label); return n; });
  const resetFacets = () => setFacets(new Set());

  const D = useMemo(() => {
    const lastContact = new Map<string, EntityRecord>();
    for (const h of hs) { if (!CONTACT_KINDS.includes(String(h.category))) continue; const p = String(h.plate || ''); const cur = lastContact.get(p); if (!cur || String(h.date || '') > String(cur.date || '')) lastContact.set(p, h); }
    const rows = cs.map((c) => { const v = computeContractView(c, TODAY); return { rec: c, v, st: collectionStage(v.overdueDays), contact: lastContact.get(String(c.plate || '')) || null }; })
      .filter((r) => r.v.net > 0)
      .sort((a, b) => b.v.net - a.v.net);
    const recv = selectReceivables(cs, TODAY);
    return {
      rows, totalUnpaid: recv.total, count: recv.unpaidCount,
      misuActive: recv.misuActive, misuActiveCount: recv.misuActiveCount,
      misuReturned: recv.misuReturned, misuReturnedCount: recv.misuReturnedCount,
      rate: recv.rate,
      over30: recv.over30,
      over90: recv.over90,
      noticeTodo: rows.filter((r) => (r.st.stage === '내용증명' || r.st.stage === '채권화') && !r.rec.noticeSentDate).length,
      immob: rows.filter((r) => r.rec.engineDisabled).length,
      lockTodo: rows.filter((r) => !r.v.ended && !r.rec.engineDisabled && (r.st.stage === '시동제어' || r.st.stage === '내용증명' || r.st.stage === '채권화')).length,
    };
  }, [cs, hs]);

  const stageSel = selectedInDim('미수', '연체단계', facets);
  const overdueSel = selectedInDim('미수', '연체기간', facets);
  const actionSel = selectedInDim('미수', '조치', facets);
  const filtered = D.rows.filter((r) => {
    if (stageSel.length && !stageSel.includes(r.st.stage)) return false;
    if (overdueSel.length) {
      const d = r.v.overdueDays;
      const hit = (overdueSel.includes('1~29일') && d >= 1 && d <= 29)
        || (overdueSel.includes('30~89일') && d >= 30 && d <= 89)
        || (overdueSel.includes('90일+') && d >= 90);
      if (!hit) return false;
    }
    if (actionSel.length) {
      const notice = !!r.rec.noticeSentDate;
      const immob = !!r.rec.engineDisabled;
      const hit = (actionSel.includes('미조치') && !notice && !immob)
        || (actionSel.includes('내용증명발송') && notice)
        || (actionSel.includes('시동제어중') && immob);
      if (!hit) return false;
    }
    return textMatch(q, r.rec.contractorName, r.rec.plate, r.rec.contractNo, r.rec.contractorPhone, r.st.stage);
  });
  // 좌측 FacetRail — LENS_FILTERS['미수'] SSOT (연체단계 × 연체기간 × 조치)

  // 문자 발송 대상 — 현재 필터된 미수 계약(연락처 보유)
  const recipients: NotifyRecipient[] = filtered.map((r) => ({
    contractKey: String(r.rec._key || ''), companyId: String(r.rec.companyId || ''),
    name: String(r.rec.contractorName || ''), plate: String(r.rec.plate || ''),
    phone: String(r.rec.contractorPhone || ''), contractNo: String(r.rec.contractNo || ''),
    unpaidAmount: r.v.net, unpaidSeqCount: r.v.count, currentSeq: r.v.count, monthlyRent: r.v.monthlyRent,
    depositDue: Number(r.rec.deposit || 0), depositReceived: 0, depositUnreceived: 0, depositRefund: r.v.refund,
  }));
  const smsCount = recipients.filter((r) => r.phone).length;

  async function patch(rec: EntityRecord, p: Record<string, unknown>) {
    try {
      await commitUpdate({ entity: 'contract', sessionCompanyId: companyId, rec, key: String(rec._key || ''), patch: p });
    } catch { toast(NEED_COMPANY, 'error'); }
  }
  const sendNotice = (rec: EntityRecord) => {
    void runBusy(async () => {
      const co = resolveWriteCompany(companyId, rec);
      if (!co) { toast(NEED_COMPANY, 'error'); return; }
      const r = await safeUpdate(() => sendNoticeCert({
        rec,
        companyId: co,
        actor: user?.email || user?.name || '',
      }));
      if (r) toast(`내용증명 ${r.docNo} · 청구 ${won(r.claim)}`, 'success');
      reload();
    });
  };
  const toggleNoticeSel = (key: string) => setNoticeSel((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const noticeTargets = filtered.filter((r) => noticeSel.has(String(r.rec._key || '')));
  const noticeTodoFiltered = filtered.filter((r) => (r.st.stage === '내용증명' || r.st.stage === '채권화') && !r.rec.noticeSentDate);
  const sendNoticeBulk = (recs: EntityRecord[]) => {
    if (recs.length === 0) return;
    if (!window.confirm(`내용증명 ${recs.length}건을 일괄 발송(인쇄)·기록합니까?`)) return;
    void runBusy(async () => {
      const r = await safeUpdate(() => sendNoticeCertBulk({
        recs,
        companyId,
        actor: user?.email || user?.name || '',
      }));
      if (r) {
        toast(`내용증명 일괄 ${r.count}건 · 청구합 ${won(r.totalClaim)}`, 'success');
        setNoticeSel(new Set());
      }
      reload();
    });
  };
  // 시동제어 전환 — "물어보고"(확인) 걸고, engineDisabled 원자(patchEngineLock SSOT)에 사유·시각·담당 기록.
  const toggleEngine = (r: { rec: EntityRecord; v: { net: number; overdueDays: number } }) => {
    const rec = r.rec;
    const who = String(rec.contractorName || '—'), plate = String(rec.plate || '');
    const actor = user?.email || user?.name || '';
    if (rec.engineDisabled) {
      if (!window.confirm(`${who} · ${plate}\n입금이 확인되어 시동제어를 해제합니까?`)) return;
      patch(rec, patchEngineLock(false, { today: TODAY, actor, reason: '' }));
      toast(`시동제어 해제 · ${plate}`);
    } else {
      if (!window.confirm(`${who} · ${plate}\n미납 ${won(r.v.net)} · ${r.v.overdueDays}일 연체\n\n원격 시동제어를 겁니까?`)) return;
      patch(rec, patchEngineLock(true, { today: TODAY, actor, reason: `미납 ${won(r.v.net)} · ${r.v.overdueDays}일 연체` }));
      toast(`시동제어 적용 · ${plate}`, 'info');
    }
  };

  return (
    <FacetPage
      title="미수관리"
      meta={`${scopeAll ? '전체 회사' : companyLabel(companyId)} · 미수 ${D.count}건`}
      tools={<WorkbenchBar mid={<WorkHubBack />} search={{ value: q, onChange: setQ, placeholder: '손님·차량·계약' }} stat={<span style={{ fontSize: 13, fontWeight: 800, color: D.totalUnpaid > 0 ? C.danger : C.ok, whiteSpace: 'nowrap' }}>미수 {won(D.totalUnpaid)}</span>} />}
      rail={!loading ? <FacetRail lensKey="미수" facets={facets} onToggle={toggleFacet} onReset={resetFacets} /> : null}
    >
      <Sec title="현황" desc="미수율 · 연체 분포 · 회수 조치 대상">
        <Cards min={128} fit>
          <Metric label="운행중 미수" value={won(D.misuActive)} tone={D.misuActive ? 'danger' : 'ink'} />
          <Metric label="반납 미수(별도)" value={won(D.misuReturned)} tone={D.misuReturned ? 'warn' : 'ink'} />
          <Metric label="미수 계약" value={`${D.misuActiveCount}건`} tone={D.misuActiveCount ? 'warn' : 'ink'} />
          <Metric label="미수율(계약)" value={`${D.rate}%`} tone={D.rate >= 20 ? 'danger' : D.rate >= 10 ? 'warn' : 'ok'} />
          <Metric label="30일+ 연체" value={`${D.over30}건`} tone={D.over30 ? 'warn' : 'ink'} />
          <Metric label="90일+ 연체" value={`${D.over90}건`} tone={D.over90 ? 'danger' : 'ink'} />
          <Metric label="내용증명 대상" value={`${D.noticeTodo}건`} tone={D.noticeTodo ? 'danger' : 'ink'} />
          <Metric label="시동제어 필요" value={`${D.lockTodo}대`} tone={D.lockTodo ? 'danger' : 'ink'} hint="미납 심화·미제어" />
          <Metric label="시동제어 중" value={`${D.immob}대`} tone={D.immob ? 'warn' : 'ink'} />
        </Cards>
      </Sec>

      <Sec title="미수 목록" n={filtered.length} desc="금액 큰 순 · 체크 후 내용증명 일괄 · 자리에서 단건·시동제어·연락"
        right={<span style={{ display: 'inline-flex', gap: SPACE_M, flexWrap: 'wrap' }}>
          <Btn variant="ghost" onClick={() => setNoticeSel(new Set(noticeTodoFiltered.map((r) => String(r.rec._key || ''))))} disabled={noticeTodoFiltered.length === 0}>대상 선택 ({noticeTodoFiltered.length})</Btn>
          <Btn variant="danger" onClick={() => sendNoticeBulk(noticeTargets.map((r) => r.rec))} disabled={noticeTargets.length === 0}>내용증명 일괄{noticeTargets.length ? ` (${noticeTargets.length})` : ''}</Btn>
          <Btn onClick={() => setNotify(true)} disabled={smsCount === 0}>문자 발송{smsCount ? ` (${smsCount})` : ''}</Btn>
        </span>}>
        {loading ? <PageLoading /> : filtered.length === 0 ? <EmptyState variant="sec">해당 미수 없음</EmptyState> :
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_M }}>
            {filtered.map((r, i) => { const rec = r.rec; const immob = !!rec.engineDisabled; const needLock = !r.v.ended && !immob && (r.st.stage === '시동제어' || r.st.stage === '내용증명' || r.st.stage === '채권화'); const rowId = String(rec._key ?? `row-${i}`); const logOn = logKey === rowId; const checked = noticeSel.has(rowId); return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: SPACE_M }}>
                <div style={{ display: 'flex', gap: SPACE_M, alignItems: 'flex-start' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, flexShrink: 0, marginTop: 4, cursor: 'pointer' }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleNoticeSel(rowId)}
                      style={{ width: 16, height: 16, cursor: 'pointer' }}
                      aria-label="내용증명 일괄 선택" />
                  </label>
                  <div style={{ flex: 1, minWidth: 0 }}>
                <ObjCard
                  badge={r.st.stage}
                  badgeTone={STONE[r.st.stage] || 'gray'}
                  co={scopeAll ? String(rec.companyId || '') : undefined}
                  name={String(rec.contractorName || '—')}
                  carType={String(rec.plate || '')}
                  fields={[
                    ['내용증명', rec.noticeSentDate ? `✓ ${String(rec.noticeSentDate)}` : '미발송'],
                    ['시동제어', immob ? `적용중 (${String(rec.engineDisabledAt || '').slice(0, 10)})` : needLock ? '전환 필요' : '—'],
                    ['최근 연락', r.contact ? `${String(r.contact.category)} · ${String(r.contact.date)}` : '없음'],
                    ...(r.st.nextAction ? [['다음', r.st.nextAction] as [string, string]] : []),
                  ]}
                  right={<span style={{ color: C.danger }}>{won(r.v.net)} · {r.v.overdueDays}일</span>}
                  onClick={() => openCar(String(rec.plate || ''), 'unpaid')}
                />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: SPACE_M, flexWrap: 'wrap', paddingLeft: 28 }}>
                  <Btn variant="danger" onClick={() => sendNotice(rec)}>내용증명 발송</Btn>
                  <Btn variant={logOn ? 'solid' : 'ghost'} onClick={() => setLogKey((k) => k === rowId ? null : rowId)}>{logOn ? '닫기' : '문자·연락 기록'}</Btn>
                  <Btn variant={needLock ? 'danger' : 'ghost'} onClick={() => toggleEngine(r)}>{immob ? '시동제어 해제' : needLock ? '시동제어 전환' : '시동제어'}</Btn>
                  <Btn variant="ghost" onClick={() => openCustomer(customerKey(rec.contractorName, rec.contractorPhone))}>손님</Btn>
                  <Btn variant="ghost" onClick={() => openCar(String(rec.plate || ''), 'unpaid')}>360 · 수납</Btn>
                </div>
                {logOn ? <div style={{ paddingLeft: 28 }}><QuickLogForm ctx={{ plate: String(rec.plate || ''), customer: String(rec.contractorName || ''), contractNo: String(rec.contractNo || ''), companyId: String(rec.companyId || '') }} onDone={() => setLogKey(null)} onCancel={() => setLogKey(null)} /></div> : null}
              </div>
            ); })}
          </div>}
      </Sec>
      {notify && <NotifyDialog recipients={recipients} onClose={() => setNotify(false)} onSent={reload} />}
    </FacetPage>
  );
}
