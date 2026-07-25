'use client';
/**
 * 재무원장 — 계좌·CMS 같이 반영, 매칭은 자동+수동.
 *   · CMS 업로드 → CMS미연결 로 원장 표시(계좌 입금과 별도, 이중합산 X)
 *   · 통장 CMS집금 → CMS집금·미매칭 / 매칭 후 하위행 CMS연결
 *   · 집금 또는 미연결 클릭 → 수동 매칭 패널
 */
import { useMemo, useState, useCallback } from 'react';
import { Upload, X, Link2, Unlink, Banknote, HandCoins } from 'lucide-react';
import { buildCashLedger, withCmsItemRows, type CashRow } from '@/lib/finance/cash-ledger';
import { CASH_BASIC_COLS, CASH_EXPANDED_COLS } from '@/lib/finance/cash-cols';
import { isUnclassified } from '@/lib/payments/ledger-subjects';
import { useCashLedgerLists } from '@/lib/use-cash-ledger-lists';
import { textMatch } from '@/lib/search-match';
import { openIngest, openPayments, openReceivables, notifySaved } from '@/lib/ui-bus';
import { companyDisplay } from '@/lib/companies';
import { TODAY } from '@/lib/dashboard-consts';
import { type EntityRecord } from '@/lib/intake/entities';
import {
  listUnmatchedCmsItems,
  manualLinkCmsSettlement,
  manualUnlinkCmsSettlement,
} from '@/lib/payments/auto-settle';
import { useSession } from '@/lib/session';
import { resolveWriteCompany, NEED_COMPANY } from '@/lib/scope';
import { toast } from '@/lib/toast';
import {
  LedgerFrame, Btn, Search, PillTabs, PeriodBar, Badge, Message, ListBox, ListRow,
  C, SPACE_M, toggleStyle, type LedgerColView,
} from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';

type Flow = '전체' | '입금' | '출금' | '미분류';
const amt = (n: number) => (n ? n.toLocaleString('ko-KR') : '—');
/** 표 DOM 폭주 방지 — 24·25 CMS미연결 수백건이면 페이지가 죽음 */
const ROW_DISPLAY_CAP = 200;

const CMS_DEP_BG = 'color-mix(in srgb, var(--brand) 10%, var(--bg-card))';
const CMS_ITEM_BG = 'color-mix(in srgb, var(--brand) 5%, var(--bg-stripe))';

function CmsMatchPanel({
  dep, bank, companyId, initialItemKeys, onClose, onDone,
}: {
  dep: CashRow;
  bank: EntityRecord[];
  companyId: string;
  /** CMS미연결 행에서 넘어온 사전선택 키 */
  initialItemKeys?: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const sid = String(dep.raw.settlementId || '');
  const linked = bank.filter((b) => sid && String(b.settlementId || '') === sid && String(b.settlementRole || '') === 'item');
  const unmatched = listUnmatchedCmsItems(bank);
  const near = unmatched
    .map((b) => {
      const lag = Math.abs((new Date(String(b.txDate || '')).getTime() - new Date(dep.date).getTime()) / 86400000);
      return { b, lag };
    })
    .filter((x) => Number.isFinite(x.lag) && x.lag <= 14)
    .sort((a, b) => a.lag - b.lag);

  const [sel, setSel] = useState<Set<string>>(() => {
    const s = new Set(linked.map((b) => String(b._key)));
    for (const k of initialItemKeys || []) s.add(k);
    return s;
  });
  const [busy, setBusy] = useState(false);

  const toggle = (k: string) => setSel((s) => {
    const n = new Set(s);
    n.has(k) ? n.delete(k) : n.add(k);
    return n;
  });

  const selectedSum = [...sel].reduce((s, k) => {
    const r = bank.find((b) => String(b._key) === k);
    return s + (Number(r?.amount) || 0);
  }, 0);
  const fee = Math.max(0, selectedSum - dep.inAmt);

  async function save() {
    const co = resolveWriteCompany(companyId, dep.raw);
    if (!co) { toast(NEED_COMPANY, 'error'); return; }
    setBusy(true);
    try {
      if (sel.size === 0) {
        const r = await manualUnlinkCmsSettlement(co, dep.recKey);
        if (!r.ok) { toast(r.error || '해제 실패', 'error'); return; }
        toast('CMS 정산 해제', 'info');
      } else {
        const r = await manualLinkCmsSettlement(co, dep.recKey, [...sel]);
        if (!r.ok) { toast(r.error || '연결 실패', 'error'); return; }
        toast(`CMS 수동매칭 ${sel.size}건`, 'success');
      }
      notifySaved();
      onDone();
    } finally { setBusy(false); }
  }

  async function unlinkAll() {
    const co = resolveWriteCompany(companyId, dep.raw);
    if (!co) { toast(NEED_COMPANY, 'error'); return; }
    setBusy(true);
    try {
      const r = await manualUnlinkCmsSettlement(co, dep.recKey);
      if (!r.ok) { toast(r.error || '해제 실패', 'error'); return; }
      toast('CMS 정산 해제', 'info');
      notifySaved();
      onDone();
    } finally { setBusy(false); }
  }

  const pool = [
    ...linked.map((b) => ({ b, tag: '연결됨' as const })),
    ...near.map(({ b }) => ({ b, tag: '후보' as const })),
  ];
  // dedupe by key (linked first)
  const seen = new Set<string>();
  const list = pool.filter(({ b }) => {
    const k = String(b._key);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return (
    <div style={{ padding: '12px 14px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.ink }}>CMS 수동 매칭</span>
        <Badge tone="blue">CMS집금</Badge>
        <span style={{ fontSize: 12.5, color: C.mute }}>{dep.date} · {amt(dep.inAmt)}</span>
        <span style={{ flex: 1 }} />
        {sid && (
          <Btn size="sm" variant="ghost" disabled={busy} onClick={unlinkAll}><Unlink size={14} /> 정산 해제</Btn>
        )}
        <Btn size="sm" variant="ghost" onClick={onClose}><X size={14} /> 닫기</Btn>
      </div>

      <Message variant="info">
        계좌 CMS집금 ↔ 업로드 CMS 성공분을 연결합니다. 입력·업로드 시 자동매칭되고, 안 붙거나 틀린 건 여기서 고칩니다.
      </Message>

      <div style={{ display: 'flex', gap: 16, fontSize: 12.5, margin: '10px 0', flexWrap: 'wrap' }}>
        <span>선택 <b>{sel.size}</b>건</span>
        <span>합계 <b style={{ color: C.ok }}>{amt(selectedSum)}</b></span>
        <span>집금 <b>{amt(dep.inAmt)}</b></span>
        <span>수수료 <b>{amt(fee)}</b></span>
      </div>

      <ListBox>
        {list.length === 0 ? (
          <div style={{ padding: 12, color: C.mute, fontSize: 13 }}>근처에 미연결 CMS 성공분이 없습니다.</div>
        ) : list.map(({ b, tag }) => {
          const k = String(b._key);
          const on = sel.has(k);
          return (
            <ListRow
              key={k}
              badge={tag}
              badgeTone={tag === '연결됨' ? 'green' : 'gray'}
              main={`${String(b.txDate || '—')} · ${String(b.counterparty || '(적요없음)')}`}
              sub={String(b.memo || '') || undefined}
              right={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: C.ok }}>{amt(Number(b.amount) || 0)}</span>
                  <input type="checkbox" checked={on} onChange={() => toggle(k)} onClick={(e) => e.stopPropagation()} />
                </span>
              }
              onClick={() => toggle(k)}
            />
          );
        })}
      </ListBox>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <Btn size="sm" variant="ghost" disabled={busy} onClick={onClose}>취소</Btn>
        <Btn size="sm" disabled={busy} onClick={save}>
          <Link2 size={14} /> {busy ? '저장 중…' : sel.size ? `${sel.size}건 연결` : '연결 없이 저장(해제)'}
        </Btn>
      </div>
    </div>
  );
}

export default function CashLedgerPage() {
  const mobile = useIsMobile();
  const { companyId } = useSession();
  const { bank, card, loading, reload } = useCashLedgerLists();

  const allRows = useMemo(() => {
    const base = buildCashLedger(bank, card)
      .slice()
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.id.localeCompare(b.id));
    return withCmsItemRows(base, bank);
  }, [bank, card]);

  const latest = useMemo(
    () => allRows.filter((r) => r.nest !== 'cms-item').reduce((m, r) => (r.date > m ? r.date : m), TODAY),
    [allRows],
  );

  const [colView, setColView] = useState<LedgerColView>('기본');
  const [flow, setFlow] = useState<Flow>('전체');
  const [q, setQ] = useState('');
  const [srcSel, setSrcSel] = useState<Set<string>>(new Set());
  const [range, setRange] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const onRange = useCallback((r: { from: string; to: string }) => {
    setRange((prev) => (prev.from === r.from && prev.to === r.to ? prev : r));
  }, []);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [preSelItems, setPreSelItems] = useState<string[]>([]);

  const rows = useMemo(() => {
    const isAll = !range.from && !range.to;
    const pass = (r: CashRow) => {
      if (!isAll) {
        if (range.from && r.date < range.from) return false;
        if (range.to && r.date > range.to) return false;
      }
      if (flow === '입금' && !(r.inAmt > 0)) return false;
      if (flow === '출금' && !(r.outAmt > 0)) return false;
      if (flow === '미분류' && !isUnclassified(r.category)) return false;
      if (srcSel.size && !srcSel.has(r.source)) return false;
      if (!textMatch(q, r.party, r.account, r.category, r.memo, r.date, companyDisplay(r.companyId), r.companyId)) return false;
      return true;
    };
    const out: CashRow[] = [];
    for (let i = 0; i < allRows.length; i++) {
      const r = allRows[i];
      if (r.nest === 'cms-item') continue;
      if (!pass(r)) continue;
      out.push(r);
      let j = i + 1;
      while (j < allRows.length && allRows[j].nest === 'cms-item' && allRows[j].parentId === r.id) {
        out.push(allRows[j]);
        j++;
      }
    }
    return out;
  }, [allRows, flow, srcSel, q, range.from, range.to]);

  const matchRow = matchId ? rows.find((r) => r.id === matchId && r.nest === 'cms-dep') || null : null;
  /** 통장 현금흐름만(입금·출금 합계). CMS미연결은 별도. */
  const bankRows = rows.filter((r) => r.nest !== 'cms-item' && r.nest !== 'cms-pending');
  const pendingCms = rows.filter((r) => r.nest === 'cms-pending');
  const inSum = bankRows.reduce((s, r) => s + r.inAmt, 0);
  const outSum = bankRows.reduce((s, r) => s + r.outAmt, 0);
  const cmsPendingSum = pendingCms.reduce((s, r) => s + r.inAmt, 0);
  const unclN = bankRows.filter((r) => isUnclassified(r.category)).length;
  const rowMore = Math.max(0, rows.length - ROW_DISPLAY_CAP);
  const displayRows = rowMore > 0 ? rows.slice(0, ROW_DISPLAY_CAP) : rows;
  const cols = colView === '기본' ? CASH_BASIC_COLS : CASH_EXPANDED_COLS;
  const sources = useMemo(
    () => [...new Set(allRows.filter((r) => r.nest !== 'cms-item').map((r) => r.source))],
    [allRows],
  );

  const toggleSrc = (k: string) => setSrcSel((s) => {
    const n = new Set(s);
    n.has(k) ? n.delete(k) : n.add(k);
    return n;
  });

  const onDoneMatch = useCallback(() => {
    setMatchId(null);
    setPreSelItems([]);
    reload();
  }, [reload]);

  function openMatchForDeposit(depId: string, itemKeys: string[] = []) {
    setPreSelItems(itemKeys);
    setMatchId((id) => (id === depId && !itemKeys.length ? null : depId));
  }

  /** CMS미연결 클릭 → 날짜 가까운 CMS집금 행을 열어 이 건을 사전선택 */
  function openMatchFromPending(pending: CashRow) {
    const deps = rows.filter((r) => r.nest === 'cms-dep');
    if (!deps.length) {
      toast('연결할 CMS집금(계좌 입금)이 없습니다 — 「데이터센터」에서 계좌를 먼저 넣으세요', 'info');
      return;
    }
    const t = new Date(pending.date).getTime();
    const nearest = [...deps].sort((a, b) =>
      Math.abs(new Date(a.date).getTime() - t) - Math.abs(new Date(b.date).getTime() - t),
    )[0];
    openMatchForDeposit(nearest.id, [pending.recKey]);
  }

  return (
    <LedgerFrame
      title="재무원장"
      meta="계좌·CMS 담기 → 자금일보에서 대여료 매칭 → 미수 반영"
      right={
        <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
          <Btn size="sm" onClick={() => openIngest('bank_tx')}><Upload size={14} /> 계좌·CMS</Btn>
          <Btn size="sm" variant="ghost" onClick={() => openPayments()}><Banknote size={14} /> 자금일보</Btn>
          <Btn size="sm" variant="ghost" onClick={() => openReceivables()}><HandCoins size={14} /> 미수</Btn>
        </span>
      }
      colView={colView}
      onColView={setColView}
      filters={
        <>
          <Search
            size="sm"
            placeholder="회사·계좌·상대·과목·내용"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: mobile ? '100%' : 180 }}
          />
          <PillTabs
            size="sm"
            value={flow}
            onChange={setFlow}
            tabs={[
              { key: '전체', label: '전체' },
              { key: '입금', label: '입금' },
              { key: '출금', label: '출금' },
              { key: '미분류', label: '미분류', badge: unclN || undefined },
            ]}
          />
          <PeriodBar latest={latest} initial="월간" onRange={onRange} />
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
            {sources.map((s) => (
              <button
                key={s}
                type="button"
                data-ui="toggle"
                aria-pressed={srcSel.has(s)}
                onClick={() => toggleSrc(s)}
                style={toggleStyle(srcSel.has(s), 'sm', mobile)}
              >
                {s}
              </button>
            ))}
            {srcSel.size > 0 && <Btn variant="ghost" size="sm" onClick={() => setSrcSel(new Set())}>출처 해제</Btn>}
          </span>
        </>
      }
      hint={rowMore > 0 ? (
        <Message variant="warning">
          표는 상위 {ROW_DISPLAY_CAP}건만 표시합니다 (외 {rowMore.toLocaleString('ko-KR')}건). 월간·검색으로 좁히면 전부 볼 수 있습니다.
        </Message>
      ) : undefined}
      stats={
        <span style={{ fontSize: 12.5, whiteSpace: 'nowrap', display: 'inline-flex', gap: 12, flexWrap: 'wrap' }}>
          <span>계좌 <b>{bankRows.length}</b></span>
          <span>입금 <b style={{ color: C.ok }}>{amt(inSum)}</b></span>
          <span>출금 <b>{amt(outSum)}</b></span>
          {pendingCms.length > 0 && (
            <span>CMS미연결 <b style={{ color: C.brand }}>{pendingCms.length}</b>·<b style={{ color: C.brand }}>{amt(cmsPendingSum)}</b></span>
          )}
        </span>
      }
      loading={loading}
      empty="표시할 거래가 없습니다. 기간을 바꾸거나「데이터센터」에서 넣으세요."
      cols={cols}
      rows={displayRows}
      rowKey={(r) => r.id}
      rowStyle={(r) => {
        if (r.nest === 'cms-dep') return { background: CMS_DEP_BG };
        if (r.nest === 'cms-item') return { background: CMS_ITEM_BG };
        if (r.nest === 'cms-pending') return { background: 'color-mix(in srgb, var(--orange-text) 8%, var(--bg-card))' };
        return undefined;
      }}
      rowClickable={(r) => r.nest !== 'cms-item'}
      onRow={(r) => {
        if (r.nest === 'cms-dep') { openMatchForDeposit(r.id); return; }
        if (r.nest === 'cms-pending') { openMatchFromPending(r); return; }
        setMatchId(null);
        setPreSelItems([]);
      }}
      detail={matchRow ? (
        <CmsMatchPanel
          key={`${matchRow.id}:${preSelItems.join(',')}`}
          dep={matchRow}
          bank={bank}
          companyId={companyId}
          initialItemKeys={preSelItems}
          onClose={() => { setMatchId(null); setPreSelItems([]); }}
          onDone={onDoneMatch}
        />
      ) : null}
    />
  );
}
