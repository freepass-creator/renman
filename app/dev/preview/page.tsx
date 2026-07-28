'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Home, RotateCw } from 'lucide-react';
import { Btn, C } from '@/components/ui';

/**
 * /dev/preview — 모바일 미리보기(디바이스 프리뷰). (구 /m 프리뷰 이전)
 *   데스크톱에서 앱을 폰 폭 iframe으로 감싸 본다. 기본은 모바일 전용 트리(/m).
 *   실제 폰(좁은 뷰포트)에선 프레임 무의미 → /m 으로. ?to=/m/ops 처럼 특정 경로 미리보기.
 */
const MOBILE_BP = 760;
const MONO = 'var(--font-mono)';
const DEVICES = [
  { key: 'an', label: '안드로이드', w: 360, h: 800 },
  { key: 'ip', label: 'iPhone', w: 390, h: 844 },
  { key: 'mx', label: 'Max', w: 430, h: 932 },
] as const;
type Device = (typeof DEVICES)[number];

export default function MobilePreview() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [dev, setDev] = useState<Device>(DEVICES[1]);
  const [nonce, setNonce] = useState(0);
  const [src, setSrc] = useState('/m');
  const [path, setPath] = useState('/m');
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (window.innerWidth < MOBILE_BP) { router.replace('/m'); return; }
    const to = new URLSearchParams(location.search).get('to');
    const initial = to && to.startsWith('/') ? to : '/m';
    setSrc(initial);
    setPath(initial);
    setMounted(true);
  }, [router]);

  const reload = useCallback(() => {
    try { iframeRef.current?.contentWindow?.location.reload(); }
    catch { setNonce((n) => n + 1); }
  }, []);
  const home = useCallback(() => { setSrc('/m'); setPath('/m'); setNonce((n) => n + 1); }, []);
  const onLoad = useCallback(() => {
    try {
      const w = iframeRef.current?.contentWindow;
      if (w) setPath(w.location.pathname + w.location.search);
    } catch { /* 동일 출처 — 무시 */ }
  }, []);

  if (!mounted) return <div style={{ minHeight: '60vh' }} />;

  const frameH = `min(${dev.h}px, calc(100dvh - 190px))`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '18px 16px 40px', minHeight: '100dvh', boxSizing: 'border-box' }}>
      <div style={{ width: '100%', maxWidth: 620, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>모바일 미리보기</div>
          <div style={{ fontSize: 12, color: C.faint }}>폰 폭으로 /m 전용 화면 그대로 · 프레임 안에서 탐색 가능</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {DEVICES.map((d) => (
            <Btn key={d.key} size="sm" variant={d.key === dev.key ? 'solid' : 'ghost'} onClick={() => setDev(d)}>{d.label}</Btn>
          ))}
          <Btn size="sm" variant="ghost" iconOnly tip="새로고침" onClick={reload}><RotateCw size={14} /></Btn>
          <Btn size="sm" variant="ghost" onClick={() => router.push('/')}>데스크톱으로</Btn>
        </div>
      </div>

      <div style={{ width: dev.w, maxWidth: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999, background: C.taupeBg, border: `1px solid ${C.line}`, boxSizing: 'border-box' }}>
        <button type="button" onClick={home} title="프레임 홈(/m)" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.mute, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}><Home size={14} strokeWidth={2.2} aria-hidden /></button>
        <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: C.mute, fontFamily: MONO, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{path}</div>
        <span style={{ fontSize: 11, color: C.faint }}>{dev.w}×{dev.h}</span>
      </div>

      <div style={{ position: 'relative', width: dev.w + 20, maxWidth: '100%', padding: 10, borderRadius: 48, background: '#0b0b0f', boxShadow: '0 24px 60px -20px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.04) inset', boxSizing: 'border-box' }}>
        <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', width: 96, height: 6, borderRadius: 999, background: 'rgba(255,255,255,.14)', zIndex: 2, pointerEvents: 'none' }} />
        <iframe
          key={`${src}#${nonce}`}
          ref={iframeRef}
          src={src}
          onLoad={onLoad}
          title="모바일 미리보기"
          style={{ display: 'block', width: dev.w, maxWidth: '100%', height: frameH, border: 'none', borderRadius: 38, background: C.bg, colorScheme: 'normal' }}
        />
      </div>

      <div style={{ fontSize: 11, color: C.faint, textAlign: 'center', maxWidth: 420 }}>
        프레임 안은 실제 모바일 뷰포트({dev.w}px)입니다. /m 트리를 폰과 동일하게 봅니다.
      </div>
    </div>
  );
}
