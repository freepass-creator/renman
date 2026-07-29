'use client';
/**
 * 리스크관리 — 예외 통합 원장 (LedgerFrame).
 * 데이터 = lib/risk-ledger SSOT. 칩: 전체·미완료·미납·만기·휴차.
 * 상세 = RISK_DETAIL_SECTIONS · 미납 조치(내용증명·일괄).
 */
import { useMemo, useState } from 'react';
import { FileWarning } from 'lucide-react';
import { TODAY } from '@/lib/dashboard-consts';
import { useDashboardData } from '@/lib/use-dashboard-data';
import { textMatch } from '@/lib/search-match';
import { buildRiskSheetRows, type RiskSheetGroup, type RiskSheetRow } from '@/lib/risk-ledger';
import { RISK_BASIC_COLS, RISK_DETAIL_SECTIONS, RISK_EXPANDED_COLS } from '@/lib/risk-cols';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';
import { sendNoticeCert, sendNoticeCertBulk } from '@/lib/docs/send-notice';
import { useSession } from '@/lib/session';
import { toast } from '@/lib/toast';
import {
  Badge, Btn, C, FilterChips, LedgerActions, LedgerFrame, LedgerRecordPanel, PeriodBar, Search,
  useConfirm, won,
  type LedgerColView,
} from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';

const GROUPS: RiskSheetGroup[] = ['미완료', '미납', '만기', '휴차'];
type GroupFilter = '전체' | RiskSheetGroup;

export default function RiskPage() {
  const mobile = useIsMobile();
  const confirm = useConfirm();
  const { companyId } = useSession();
  const { contracts, vehicles, insurances, penalties, history, bankTx, loading } = useDashboardData();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<GroupFilter>('전체');
  const [range, setRange] = useState({ from: '', to: '' });
  const [colView, setColView] = useState<LedgerColView>('기본');
  const [selected, setSelected] = useState<RiskSheetRow | null>(null);
  const [noticeSel, setNoticeSel] = useState<Set<string>>(() => new Set());

  const allRows = useMemo(
    () => buildRiskSheetRows(vehicles, contracts, insurances, penalties, history, TODAY, bankTx),
    [vehicles, contracts, insurances, penalties, history, bankTx],
  );
  const searched = useMemo(() => allRows.filter((r) =>
    textMatch(q, r.company, r.group, r.kind, r.plate, r.customer, r.carName, r.status, r.due),
  ), [allRows, q]);
  const rows = useMemo(() => searched.filter((r) => {
    if (group !== '전체' && r.group !== group) return false;
    if (range.from || range.to) {
      if (!r.dueDate) return false;
      if (range.from && r.dueDate < range.from) return false;
      if (range.to && r.dueDate > range.to) return false;
    }
    return true;
  }), [searched, group, range.from, range.to]);

  const latest = useMemo(() => allRows.reduce((acc, r) => (r.dueDate > acc ? r.dueDate : acc), TODAY), [allRows]);
  const counts = useMemo(() => ({
    전체: searched.length,
    미완료: searched.filter((r) => r.group === '미완료').length,
    미납: searched.filter((r) => r.group === '미납').length,
    만기: searched.filter((r) => r.group === '만기').length,
    휴차: searched.filter((r) => r.group === '휴차').length,
  }), [searched]);

  const unpaidRows = useMemo(() => rows.filter((r) => r.group === '미납' && r.contractKey), [rows]);
  const noticeTargets = unpaidRows.filter((r) => noticeSel.has(r.id));

  const contractByKey = useMemo(() => {
    const m = new Map(contracts.map((c) => [String(c._key || ''), c]));
    return m;
  }, [contracts]);

  async function sendOne(row: RiskSheetRow) {
    const rec = row.contractKey ? contractByKey.get(row.contractKey) : undefined;
    if (!rec) { toast('계약 키 없음', 'error'); return; }
    const r = await sendNoticeCert({ rec, companyId });
    toast(`내용증명 ${r.docNo} · 청구 ${won(r.claim)}`, 'success');
  }

  async function sendBulk() {
    const recs = noticeTargets
      .map((r) => (r.contractKey ? contractByKey.get(r.contractKey) : undefined))
      .filter(Boolean) as typeof contracts;
    if (!recs.length) return;
    if (!(await confirm({ message: `내용증명 ${recs.length}건을 일괄 생성(인쇄)·기록합니까?` }))) return;
    const r = await sendNoticeCertBulk({ recs, companyId });
    toast(`내용증명 일괄 ${r.count}건 · 청구합 ${won(r.totalClaim)}`, 'success');
    setNoticeSel(new Set());
  }

  return (
    <LedgerFrame
      title="리스크관리"
      meta="챙길 예외·미완료·미납·만기·휴차"
      tools={(
        <LedgerActions aria-label="문서">
          {(group === '미납' || group === '전체') && unpaidRows.length > 0 && (
            <Btn
              size="sm"
              variant="ghost"
              onClick={() => setNoticeSel(new Set(unpaidRows.map((r) => r.id)))}
            >
              미납 전체선택
            </Btn>
          )}
          <Btn
            size="sm"
            variant="danger"
            disabled={noticeTargets.length === 0}
            onClick={() => void sendBulk()}
          >
            <FileWarning size={14} /> 내용증명 일괄{noticeTargets.length ? ` (${noticeTargets.length})` : ''}
          </Btn>
        </LedgerActions>
      )}
      filters={(
        <>
          <Search
            size="sm"
            placeholder="구분·차번·대상·차명·상태"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: mobile ? '100%' : 240 }}
          />
          <FilterChips
            value={group}
            onChange={(v) => { if (v) setGroup(v); }}
            options={[
              { key: '전체' as const, label: '전체', count: counts.전체 || undefined },
              ...GROUPS.map((key) => ({ key, label: key, count: counts[key] || undefined })),
            ]}
          />
          <PeriodBar latest={latest || TODAY} initial="전체" size="sm" onRange={setRange} />
        </>
      )}
      stats={(
        <span style={{ fontSize: 12.5, color: C.mute, whiteSpace: 'nowrap' }}>
          미완료 <b style={{ color: counts.미완료 ? C.danger : C.ok }}>{counts.미완료}</b>
          {' · '}미납 <b style={{ color: counts.미납 ? C.danger : C.ink }}>{counts.미납}</b>
          {' · '}만기 <b style={{ color: counts.만기 ? C.warn : C.ink }}>{counts.만기}</b>
          {' · '}휴차 <b>{counts.휴차}</b>
        </span>
      )}
      colView={colView}
      onColView={setColView}
      loading={loading}
      empty={group === '전체' ? '지금 챙길 위험이 없습니다' : `${group} 없음`}
      cols={colView === '기본' ? RISK_BASIC_COLS : RISK_EXPANDED_COLS}
      rows={rows}
      rowKey={(r) => r.id}
      selectedRowKey={selected?.id ?? null}
      onRowDoubleClick={(r) => setSelected(r)}
      onCloseDetail={() => setSelected(null)}
      sidePanel={selected ? (
        <LedgerRecordPanel
          title={selected.kind || selected.group}
          identity={`${selected.plate || LEDGER_EMPTY.unassigned} · ${selected.customer || LEDGER_EMPTY.none}`}
          statusBadge={<Badge tone={selected.badgeTone}>{selected.status}</Badge>}
          row={selected}
          cols={RISK_EXPANDED_COLS}
          sections={RISK_DETAIL_SECTIONS}
          onClose={() => setSelected(null)}
          actions={(
            <>
              {selected.group === '미납' && selected.contractKey && (
                <>
                  <Btn size="sm" variant="danger" onClick={() => void sendOne(selected)}>내용증명</Btn>
                  <Btn
                    size="sm"
                    variant="ghost"
                    onClick={() => setNoticeSel((prev) => {
                      const next = new Set(prev);
                      if (next.has(selected.id)) next.delete(selected.id);
                      else next.add(selected.id);
                      return next;
                    })}
                  >
                    {noticeSel.has(selected.id) ? '일괄 선택 해제' : '일괄 선택'}
                  </Btn>
                </>
              )}
            </>
          )}
        />
      ) : null}
    />
  );
}
