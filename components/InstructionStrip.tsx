'use client';
/**
 * 지시문 스트립 — «무엇을 하라» 한 줄 + 건수 배지 + WorkPipe.
 *   표(어느 건)와 역할 분리. 0건이면 null(또는 emptyOk).
 */
import { Badge, C, EmptyState } from '@/components/ui';
import { WorkPipe } from '@/components/WorkPipe';
import type { InstructionOrder } from '@/lib/work-orders';

export function InstructionStrip({
  orders,
  title = '지시',
  desc = '무엇을 하라 — 눌러서 이동 · 아래 표는 어느 건',
  emptyOk = true,
}: {
  orders: InstructionOrder[];
  title?: string;
  desc?: string;
  /** true면 0건일 때 ok EmptyState. false면 null. */
  emptyOk?: boolean;
}) {
  if (!orders.length) {
    return emptyOk
      ? <EmptyState variant="ok">지금 처리할 지시 없음</EmptyState>
      : null;
  }
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.ink }}>{title}</div>
        <div style={{ fontSize: 11, color: C.mute, marginTop: 2 }}>{desc}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {orders.map((o) => (
          <div
            key={o.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              padding: '8px 10px',
              border: `1px solid ${C.line}`,
              borderLeft: `3px solid ${o.danger ? C.danger : C.warn}`,
              borderRadius: 'var(--radius)',
              background: C.card,
            }}
          >
            <Badge tone={o.danger ? 'red' : 'amber'}>{o.n}건</Badge>
            <span style={{ flex: 1, minWidth: 120, fontSize: 13, color: C.ink, lineHeight: 1.45 }}>{o.text}</span>
            <WorkPipe to={o.to} query={o.query} />
          </div>
        ))}
      </div>
    </section>
  );
}
