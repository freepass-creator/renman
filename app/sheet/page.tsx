'use client';
/**
 * 운영원장 — LedgerFrame(재무원장과 동일 틀) + 자산·계약 1대=1행.
 *   표식: 회사명 → 차량번호. 행→Vehicle360. FacetRail/WebPage E-grid 폐기.
 */
import { useMemo, useState } from 'react';
import { Upload, Plus, Zap, HandCoins } from 'lucide-react';
import { TODAY } from '@/lib/dashboard-consts';
import { linkFleet } from '@/lib/domain/model';
import { buildFleetRows, statusRank, type FleetRow } from '@/lib/sheet-rows';
import { FLEET_BASIC_COLS, FLEET_EXPANDED_COLS } from '@/lib/sheet-cols';
import { useEntityLists } from '@/lib/use-entity-lists';
import { textMatch } from '@/lib/search-match';
import { openCar, openIngest, openReceivables } from '@/lib/ui-bus';
import { QuickInput } from '@/components/QuickInput';
import {
  LedgerFrame, Btn, Search, PillTabs, Message, won, C, toggleStyle, type LedgerColView,
} from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';

type OwnLens = '보유' | '전체' | '매각';

const STATUS_OPTS = [
  { key: '인도예정', rank: 0 },
  { key: '만기경과', rank: 1 },
  { key: '휴차', rank: 2 },
  { key: '마감임박', rank: 3 },
  { key: '운행중', rank: 4 },
] as const;

export default function OpsLedgerPage() {
  const mobile = useIsMobile();
  const { data: [vs = [], cs = [], ins = [], hs = []], loading } = useEntityLists(['vehicle', 'contract', 'insurance', 'history']);
  const allRows = useMemo(() => {
    const f = linkFleet(vs, cs, TODAY);
    return buildFleetRows(f.vehicles, ins, f.contracts, hs, TODAY);
  }, [vs, cs, ins, hs]);

  const [colView, setColView] = useState<LedgerColView>('기본');
  const [own, setOwn] = useState<OwnLens>('보유');
  const [q, setQ] = useState('');
  const [statusSel, setStatusSel] = useState<Set<string>>(new Set());
  const [quickOpen, setQuickOpen] = useState(false);

  const rows = useMemo(() => {
    const rankSel = new Set<number>(STATUS_OPTS.filter((s) => statusSel.has(s.key)).map((s) => s.rank));
    return allRows.filter((r) => {
      const held = r.ownership !== '처분완료';
      if (own === '보유' && !held) return false;
      if (own === '매각' && held) return false;
      if (rankSel.size && !rankSel.has(statusRank(r))) return false;
      if (!textMatch(q, r.plate, r.company, r.customer, r.carName, r.maker, r.subModel, r.phone)) return false;
      return true;
    }).sort((a, b) => statusRank(a) - statusRank(b) || a.plate.localeCompare(b.plate, 'ko'));
  }, [allRows, own, statusSel, q]);

  const heldCnt = rows.filter((r) => r.ownership !== '처분완료').length;
  const idleCnt = rows.filter((r) => r.util === '휴차').length;
  const net = rows.reduce((s, r) => s + Math.max(0, r.net), 0);
  const cols = colView === '기본' ? FLEET_BASIC_COLS : FLEET_EXPANDED_COLS;

  const toggleStatus = (k: string) => setStatusSel((s) => {
    const n = new Set(s);
    n.has(k) ? n.delete(k) : n.add(k);
    return n;
  });

  return (
    <LedgerFrame
      title="운영원장"
      meta="표시명 · 차량번호 · 자산+계약"
      right={
        <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
          <Btn size="sm" variant={quickOpen ? 'solid' : 'ghost'} onClick={() => setQuickOpen((o) => !o)}>
            <Zap size={14} /> 빠른입력
          </Btn>
          <Btn size="sm" variant="ghost" onClick={() => openIngest('vehicle')}><Plus size={14} /> 자산등록</Btn>
          {net > 0 && (
            <Btn size="sm" variant="ghost" onClick={() => openReceivables()}>
              <HandCoins size={14} /> 미수 {won(net)}
            </Btn>
          )}
          <Btn size="sm" variant="ghost" onClick={() => openIngest()}><Upload size={14} /> 데이터센터</Btn>
        </span>
      }
      hint={
        quickOpen ? (
          <QuickInput
            onDone={() => setQuickOpen(false)}
            onCancel={() => setQuickOpen(false)}
          />
        ) : (
          <Message variant="info">
            자산·계약 마스터. 행 클릭 → 360. 빠른입력=차번 + 텍스트·파일.
          </Message>
        )
      }
      colView={colView}
      onColView={setColView}
      filters={
        <>
          <Search
            size="sm"
            placeholder="회사·차번·사용처·차명"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: mobile ? '100%' : 220 }}
          />
          <PillTabs
            size="sm"
            value={own}
            onChange={setOwn}
            tabs={[
              { key: '보유', label: '보유' },
              { key: '전체', label: '전체' },
              { key: '매각', label: '매각' },
            ]}
          />
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
            {STATUS_OPTS.map((s) => (
              <button
                key={s.key}
                type="button"
                data-ui="toggle"
                aria-pressed={statusSel.has(s.key)}
                onClick={() => toggleStatus(s.key)}
                style={toggleStyle(statusSel.has(s.key), 'sm', mobile)}
              >
                {s.key}
              </button>
            ))}
            {statusSel.size > 0 && <Btn variant="ghost" size="sm" onClick={() => setStatusSel(new Set())}>상태 해제</Btn>}
          </span>
        </>
      }
      stats={
        <span style={{ fontSize: 12.5, whiteSpace: 'nowrap', display: 'inline-flex', gap: 12 }}>
          <span>보유 <b>{heldCnt}</b></span>
          <span>휴차 <b>{idleCnt}</b></span>
          {net > 0 && <span>미수 <b style={{ color: C.danger }}>{won(net)}</b></span>}
        </span>
      }
      loading={loading}
      empty="표시할 차량이 없습니다. 「자산등록」또는「데이터센터」에서 넣으세요."
      cols={cols}
      rows={rows}
      rowKey={(r) => r.plate}
      onRow={(r) => openCar(r.plate)}
    />
  );
}
