'use client';
// 운영 스냅샷 표시 원자 — computeDashboard.summary 를 헤드라인 카드로. 반영 결과·회사 요약 공용.
import { type CSSProperties } from 'react';
import { type OperatingSummary } from '@/lib/operating-snapshot';
import { won, C } from '@/components/ui';

const NUM = 'var(--font-mono)';
type Tone = 'ink' | 'ok' | 'danger' | 'warn' | 'mute';
const toneColor: Record<Tone, string> = { ink: C.ink, ok: C.ok, danger: C.danger, warn: C.warn, mute: C.mute };

function Stat({ label, value, sub, tone = 'ink' }: { label: string; value: string | number; sub?: string; tone?: Tone }) {
  const cell: CSSProperties = { border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', background: C.card, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 };
  return (
    <div style={cell}>
      <span style={{ fontSize: 11, color: C.mute, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 800, color: toneColor[tone], fontFamily: NUM, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{value}</span>
      {sub && <span style={{ fontSize: 10.5, color: C.faint, fontFamily: NUM, fontVariantNumeric: 'tabular-nums' }}>{sub}</span>}
    </div>
  );
}

export function OperatingSummaryView({ s }: { s: OperatingSummary }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
      <Stat label="전체 구매(자산)" value={`${s.totalVeh}대`} />
      <Stat label="현보유(운행가능)" value={`${s.held}대`} tone="ink" />
      <Stat label="매각·말소" value={`${s.sold}대`} tone="mute" />
      <Stat label="운행중 차량" value={`${s.running}대`} sub={`가동률 ${s.util}%`} tone="ok" />
      <Stat label="계약차량(운행중 계약)" value={`${s.activeContracts}건`} tone="ok" />
      <Stat label="반납·종료 계약" value={`${s.endedContracts}건`} tone="mute" />
      <Stat label="할부(상환)" value={`${s.loanCount}대`} tone="ink" />
      <Stat label="유휴(쉬는 차)" value={`${s.idle}대`} tone="mute" />
      <Stat label="현재 미수" value={won(s.misuActive)} sub={`${s.misuActiveCount}건 · 운행중`} tone={s.misuActive > 0 ? 'danger' : 'ink'} />
      <Stat label="계약종료 미수" value={won(s.misuReturned)} sub={`${s.misuReturnedCount}건 · 반납·해지 추심`} tone="mute" />
      <Stat label="자금 거래" value={`${s.txCount}건`} sub={`순증감 ${won(s.cashNet)}`} tone="ink" />
      <Stat label="자금 순증감" value={won(s.cashNet)} sub={`입 ${won(s.cashIn)} · 출 ${won(s.cashOut)}`} tone={s.cashNet >= 0 ? 'ok' : 'danger'} />
      <Stat label="자금 미분류" value={`${s.unclassified}건`} sub={`거래 ${s.txCount}건`} tone={s.unclassified ? 'warn' : 'ink'} />
    </div>
  );
}
