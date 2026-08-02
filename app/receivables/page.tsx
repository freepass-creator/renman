'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from '@/lib/session';
import { type EntityRecord } from '@/lib/intake/entities';
import { patchEngineLock } from '@/lib/contract-ops';
import { openCar, openCustomer } from '@/lib/ui-bus';
import { customerKey } from '@/lib/customers';
import { sendNoticeCert, sendNoticeCertBulk } from '@/lib/docs/send-notice';
import { useBusyAction } from '@/lib/use-busy-action';
import { safeUpdate } from '@/lib/safe-update';
import { selectedInDim } from '@/lib/lens-filters';
import { textMatch } from '@/lib/search-match';
import { Badge, Btn, C, LedgerFrame, LedgerRecordPanel, LedgerSelectionBar, Search, won, useConfirm, type LedgerColView } from '@/components/ui';
import { FacetRail } from '@/components/FacetRail';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { WorkHubBack } from '@/components/WorkHubTabs';
import { QuickLogForm } from '@/components/QuickLogForm';
import { NotifyDialog, type NotifyRecipient } from '@/components/NotifyDialog';
import { depositReceivedOf, notifyRecipient } from '@/lib/notify/recipients';
import { companyLabel } from '@/lib/companies';
import { toast } from '@/lib/toast';
import { TODAY } from '@/lib/dashboard-consts';
import { useEntityLists } from '@/lib/use-entity-lists';
import { computeReturnSettlement } from '@/lib/contracts/settlement';
import { commitUpdate } from '@/lib/commit';
import { resolveWriteCompany, NEED_COMPANY } from '@/lib/scope';
import { useSecOrder } from '@/lib/use-sec-order';
import {
  buildReceivablesWorkbench, countReceivableFacets, noticeTodoRows,
  type ReceivableRow,
} from '@/lib/receivables-ledger';
import { Check } from 'lucide-react';
import { useIsMobile } from '@/lib/use-mobile';
import {
  RECEIVABLE_BASIC_COLS, RECEIVABLE_DETAIL_SECTIONS, RECEIVABLE_EXPANDED_COLS,
  receivableContractState, receivableNextAction, receivableRowKey,
} from '@/lib/receivables-cols';
import { useTableSelection } from '@/lib/use-table-selection';
import { useCtrlASelectAll, useRowSelection } from '@/lib/use-row-selection';

const RECV_SECS = ['recv-status', 'recv-list'] as const;

// 미수 워크벤치 = 회수 파트의 "딱 여기만" 메인. 미수율이 핵심축. 자금(수납)과 연동돼 자동 갱신.
// 담당자가 어떻게 관리했는지(내용증명 발송·시동제어 여부·최근 연락)가 보이고, 그 자리에서 조치.
const STONE: Record<string, 'gray' | 'amber' | 'orange' | 'red' | 'purple'> = { 회수대기: 'gray', 경고: 'amber', 시동제어: 'orange', 내용증명: 'red', 채권화: 'purple' };

export default function ReceivablesPage() {
  const { companyId, scopeAll, user } = useSession();
  const mobile = useIsMobile();
  const { data: [cs = [], hs = []], loading, error: loadError, reload } = useEntityLists(['contract', 'history']);
  const [facets, setFacets] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [logKey, setLogKey] = useState<string | null>(null);
  const [notify, setNotify] = useState(false);
  const [selected, setSelected] = useState<ReceivableRow | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [colView, setColView] = useState<LedgerColView>('기본');
  const [, runBusy] = useBusyAction();
  const confirm = useConfirm();
  const toggleFacet = (label: string) => setFacets((s) => { const n = new Set(s); n.has(label) ? n.delete(label) : n.add(label); return n; });
  const resetFacets = () => setFacets(new Set());

  const D = useMemo(() => buildReceivablesWorkbench(cs, hs, TODAY), [cs, hs]);
  const counts = useMemo(() => countReceivableFacets(D.rows), [D.rows]);

  const stageSel = selectedInDim('미수', '연체단계', facets);
  const contractSel = selectedInDim('미수', '계약상태', facets);
  const overdueSel = selectedInDim('미수', '연체기간', facets);
  const actionSel = selectedInDim('미수', '조치', facets);
  const filtered = D.rows.filter((r) => {
    if (contractSel.length && !contractSel.includes(r.v.ended ? '계약종료' : '계약유지')) return false;
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
  const sel = useTableSelection();
  const { clear: clearSel } = sel;
  const rowIds = useMemo(() => filtered.map(receivableRowKey), [filtered]);
  const rowSel = useRowSelection({ ids: rowIds, selection: sel });
  useCtrlASelectAll(rowSel, sel);
  const rowById = useMemo(() => new Map(filtered.map((row) => [receivableRowKey(row), row])), [filtered]);
  const selectedRows = useMemo(
    () => [...sel.selectedIds].map((id) => rowById.get(id)).filter(Boolean) as ReceivableRow[],
    [sel.selectedIds, rowById],
  );
  useEffect(() => { clearSel(); }, [q, facets, companyId, scopeAll, clearSel]);
  useEffect(() => {
    if (selected && !rowById.has(receivableRowKey(selected))) {
      setSelected(null);
      setLogKey(null);
    }
  }, [rowById, selected]);
  const noticeTodoFiltered = noticeTodoRows(filtered);
  const recipients: NotifyRecipient[] = filtered.map((r) => {
    const dr = depositReceivedOf(r.rec);
    const refund = dr == null
      ? 0
      : computeReturnSettlement(dr, r.v, { contract: r.rec, asOf: TODAY }).refund;
    return notifyRecipient(r.rec, {
      net: r.v.net,
      unpaidCount: r.v.count,
      currentSeq: r.v.count,
      monthlyRent: r.v.monthlyRent,
      refund,
    });
  });
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
  const noticeTargets = noticeTodoRows(selectedRows);
  const sendNoticeBulk = async (recs: EntityRecord[]) => {
    if (recs.length === 0) return;
    const companies = new Set(recs.map((rec) => String(rec.companyId || companyId)).filter(Boolean));
    if (companies.size > 1) {
      toast('내용증명 일괄 처리는 한 법인씩 선택해 주세요', 'error');
      return;
    }
    if (!(await confirm({ message: `내용증명 ${recs.length}건을 일괄 발송(인쇄)·기록합니까?` }))) return;
    void runBusy(async () => {
      const r = await safeUpdate(() => sendNoticeCertBulk({
        recs,
        companyId: [...companies][0] || companyId,
        actor: user?.email || user?.name || '',
      }));
      if (r) {
        toast(`내용증명 일괄 ${r.count}건 · 청구합 ${won(r.totalClaim)}`, 'success');
        clearSel();
      }
      reload();
    });
  };
  const toggleEngine = async (r: ReceivableRow) => {
    const rec = r.rec;
    const who = String(rec.contractorName || '—'), plate = String(rec.plate || '');
    const actor = user?.email || user?.name || '';
    if (rec.engineDisabled) {
      if (!(await confirm({ message: `${who} · ${plate}\n입금이 확인되어 시동제어를 해제합니까?` }))) return;
      patch(rec, patchEngineLock(false, { today: TODAY, actor, reason: '' }));
      toast(`시동제어 해제 · ${plate}`);
    } else {
      if (!(await confirm({ message: `${who} · ${plate}\n미납 ${won(r.v.net)} · ${r.v.overdueDays}일 연체\n\n원격 시동제어를 겁니까?`, danger: true }))) return;
      patch(rec, patchEngineLock(true, { today: TODAY, actor, reason: `미납 ${won(r.v.net)} · ${r.v.overdueDays}일 연체` }));
      toast(`시동제어 적용 · ${plate}`, 'info');
    }
  };

  const selectedKey = selected ? receivableRowKey(selected) : null;
  const selectedImmob = !!selected?.rec.engineDisabled;
  const selectedNeedLock = !!selected && !selected.v.ended && !selectedImmob
    && (selected.st.stage === '시동제어' || selected.st.stage === '내용증명' || selected.st.stage === '채권화');
  const selectedLogOpen = !!selectedKey && logKey === selectedKey;

  return (
    <>
      <LedgerFrame
        title="미수관리"
        meta={`${scopeAll ? '전체 회사' : companyLabel(companyId)} · 미수 대상 ${D.count}건 · 총 ${won(D.totalUnpaid)}`}
        filters={(
          <>
            <Search
              size="sm"
              placeholder="고객·차량·계약·연체단계"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              style={{ width: mobile ? 180 : 280, flexShrink: 0 }}
            />
            <Btn size="sm" variant={filterOpen || facets.size ? 'solid' : 'ghost'} onClick={() => setFilterOpen((open) => !open)}>
              필터{facets.size ? ` ${facets.size}` : ''}
            </Btn>
          </>
        )}
        filterPanel={filterOpen && !loading ? (
          <FacetRail lensKey="미수" facets={facets} onToggle={toggleFacet} onReset={resetFacets} counts={counts} />
        ) : null}
        stats={(
          <span style={{ fontSize: 12.5, color: C.mute, whiteSpace: 'nowrap' }}>
            계약유지 <b style={{ color: D.misuActive ? C.danger : C.ink }}>{D.misuActiveCount}건 · {won(D.misuActive)}</b>
            {' · '}계약종료 <b style={{ color: D.misuReturned ? C.warn : C.ink }}>{D.misuReturnedCount}건 · {won(D.misuReturned)}</b>
            {' · '}유지 30일+ <b>{D.over30}</b>
            {' · '}내용증명 <b>{D.noticeTodo}</b>
            {D.endedLockReview ? <>{' · '}종료 후 잠금점검 <b style={{ color: C.danger }}>{D.endedLockReview}</b></> : null}
          </span>
        )}
        right={<Btn size="sm" onClick={() => setNotify(true)} disabled={smsCount === 0}>문자 발송{smsCount ? ` (${smsCount})` : ''}</Btn>}
        colView={colView}
        onColView={setColView}
        loading={loading}
        error={loadError}
        onRetry={reload}
        empty="해당 조건의 미수가 없습니다"
        cols={colView === '기본' ? RECEIVABLE_BASIC_COLS : RECEIVABLE_EXPANDED_COLS}
        rows={filtered}
        rowKey={receivableRowKey}
        selectedRowKey={selectedKey}
        selectedKeys={sel.selectedIds}
        onRowMouseDown={(event) => rowSel.onRowMouseDown(event)}
        onRowClickEvent={(event, row, index) => rowSel.onRowClick(event, receivableRowKey(row), index)}
        mobileCard={(row) => ({
          co: scopeAll ? String(row.rec.companyId || '') : undefined,
          badge: row.st.stage,
          badgeTone: STONE[row.st.stage] || 'gray',
          name: String(row.rec.contractorName || '—'),
          carType: String(row.rec.plate || ''),
          fields: [
            ['계약상태', receivableContractState(row)],
            ['다음조치', receivableNextAction(row)],
          ],
          right: won(row.v.net),
        })}
        selectionBar={(
          <div style={{ visibility: sel.size > 0 ? 'visible' : 'hidden', flexShrink: 0 }} aria-hidden={sel.size > 0 ? undefined : true}>
            <LedgerSelectionBar
              count={sel.size || 1}
              onSelectAll={() => sel.selectAll(noticeTodoFiltered.map(receivableRowKey))}
              onClear={clearSel}
            >
              <Btn
                size="sm"
                variant="danger"
                disabled={noticeTargets.length === 0 || scopeAll}
                onClick={() => void sendNoticeBulk(noticeTargets.map((row) => row.rec))}
              >
                {scopeAll ? '법인 선택 후 내용증명' : `내용증명 일괄${noticeTargets.length ? ` (${noticeTargets.length})` : ''}`}
              </Btn>
            </LedgerSelectionBar>
          </div>
        )}
        onRowDoubleClick={(row) => {
          setSelected(row);
          setLogKey(null);
        }}
        onCloseDetail={() => {
          setSelected(null);
          setLogKey(null);
        }}
        sidePanel={selected ? (
          <LedgerRecordPanel
            title={selected.v.ended ? '종료계약 잔존채권' : '계약유지 미수'}
            identity={`${String(selected.rec.contractorName || '—')} · ${String(selected.rec.plate || '—')}`}
            statusBadge={<Badge tone={STONE[selected.st.stage] || 'gray'}>{selected.st.stage}</Badge>}
            row={selected}
            cols={RECEIVABLE_EXPANDED_COLS}
            sections={RECEIVABLE_DETAIL_SECTIONS}
            onClose={() => {
              setSelected(null);
              setLogKey(null);
            }}
            actions={(
              <>
                <Btn size="sm" variant="danger" onClick={() => sendNotice(selected.rec)}>
                  {selected.rec.noticeSentDate ? '내용증명 재발송' : '내용증명 발송'}
                </Btn>
                <Btn size="sm" variant={selectedLogOpen ? 'solid' : 'ghost'} onClick={() => setLogKey(selectedLogOpen ? null : selectedKey)}>
                  {selectedLogOpen ? '연락기록 닫기' : '문자·연락 기록'}
                </Btn>
                {(selectedImmob || selectedNeedLock) ? (
                  <Btn size="sm" variant={selectedNeedLock ? 'danger' : 'ghost'} onClick={() => void toggleEngine(selected)}>
                    {selectedImmob ? '시동제어 해제' : '시동제어 전환'}
                  </Btn>
                ) : null}
                <Btn size="sm" variant="ghost" onClick={() => openCustomer(customerKey(selected.rec.contractorName, selected.rec.contractorPhone))}>고객</Btn>
                <Btn size="sm" variant="ghost" onClick={() => openCar(String(selected.rec.plate || ''), 'unpaid', selected.rec.companyId)}>수납·정산</Btn>
              </>
            )}
          >
            {selectedLogOpen ? (
              <QuickLogForm
                ctx={{
                  plate: String(selected.rec.plate || ''),
                  customer: String(selected.rec.contractorName || ''),
                  contractNo: String(selected.rec.contractNo || ''),
                  companyId: String(selected.rec.companyId || ''),
                }}
                onDone={() => setLogKey(null)}
                onCancel={() => setLogKey(null)}
              />
            ) : null}
          </LedgerRecordPanel>
        ) : null}
      />
      {notify && <NotifyDialog recipients={recipients} onClose={() => setNotify(false)} onSent={reload} />}
    </>
  );
}
