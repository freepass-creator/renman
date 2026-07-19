'use client';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';

// jpkerp5에서 파일 그대로 복사한 컴포넌트를 v6에서 렌더 — "따다 쓰기" 실증 갤러리.
const TONES: BadgeTone[] = ['neutral', 'red', 'orange', 'amber', 'green', 'blue', 'indigo', 'purple', 'brand', 'gray'];

export default function Workbench() {
  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 24px' }}>
      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 600 }}>UI 워크벤치</h1>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-weak)', marginTop: 2 }}>
        jpkerp5 컴포넌트를 <b>파일 그대로 복사(개조 0)</b>해 v6에서 렌더 — 여기서 통과하면 jpkerp5에 그대로 이식.
      </p>

      <section style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 8 }}>StatusBadge <span style={{ color: 'var(--text-weak)', fontWeight: 400 }}>· components/ui/status-badge.tsx</span></h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          {TONES.map((t) => <StatusBadge key={t} tone={t}>{t}</StatusBadge>)}
        </div>
      </section>
    </main>
  );
}
