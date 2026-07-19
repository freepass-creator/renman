'use client';
/** 전역 토스트 렌더러 — 'jpk:toast' 이벤트를 우상단 스택으로. 자동 소멸(3.8초)·클릭 닫기. */
import { useEffect, useState } from 'react';

type T = { id: string; message: string; kind: 'success' | 'error' | 'info' };

const STYLE: Record<T['kind'], { bg: string; fg: string; icon: string }> = {
  success: { bg: '#132a1e', fg: '#d1fae5', icon: '✓' },
  error: { bg: '#3a1418', fg: '#fecaca', icon: '!' },
  info: { bg: '#1e293b', fg: '#e2e8f0', icon: 'ℹ' },
};

export default function ToastHost() {
  const [toasts, setToasts] = useState<T[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as T;
      if (!d?.message) return;
      setToasts((ts) => [...ts.slice(-4), d]);
      setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== d.id)), 3800);
    };
    window.addEventListener('jpk:toast', on);
    return () => window.removeEventListener('jpk:toast', on);
  }, []);
  const dismiss = (id: string) => setToasts((ts) => ts.filter((t) => t.id !== id));

  return (
    <div style={{ position: 'fixed', top: 58, right: 16, zIndex: 300, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none', maxWidth: '92vw' }}>
      {toasts.map((t) => {
        const s = STYLE[t.kind] || STYLE.info;
        return (
          <div key={t.id} onClick={() => dismiss(t.id)} role="status"
            style={{ pointerEvents: 'auto', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: s.bg, color: s.fg,
              padding: '11px 15px', borderRadius: 9, boxShadow: '0 8px 28px rgba(0,0,0,0.22)', fontSize: 13.5, fontWeight: 600, maxWidth: 400,
              animation: 'toastIn .18s ease-out' }}>
            <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', background: 'rgba(255,255,255,0.16)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{s.icon}</span>
            <span style={{ lineHeight: 1.4 }}>{t.message}</span>
          </div>
        );
      })}
      <style dangerouslySetInnerHTML={{ __html: '@keyframes toastIn{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:none}}' }} />
    </div>
  );
}
