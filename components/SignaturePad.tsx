'use client';
/**
 * 서명패드 — 캔버스 기반 손서명(터치·마우스 공용, Pointer Events). 현장 증거(인도·반납 확인) 캡처 원자.
 *   onChange(dataUrl|null) 로 PNG dataURL 방출(비면 null). dataUrlToFile 로 File 변환 → uploadDoc 업로드.
 *   레티나 대응(dpr). 지우기 버튼 내장.
 */
import { useRef, useEffect, useState, useCallback } from 'react';
import { C, Btn } from '@/components/ui';

export function dataUrlToFile(dataUrl: string, filename: string): File | null {
  try {
    const [head, b64] = dataUrl.split(',');
    const mime = /data:(.*?);/.exec(head)?.[1] || 'image/png';
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new File([arr], filename, { type: mime });
  } catch { return null; }
}

export function SignaturePad({ onChange, height = 180, label = '여기에 서명해 주세요' }: { onChange?: (dataUrl: string | null) => void; height?: number; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [has, setHas] = useState(false);

  const ctxOf = useCallback(() => {
    const cv = ref.current; if (!cv) return null;
    const ctx = cv.getContext('2d'); if (!ctx) return null;
    return ctx;
  }, []);

  // 캔버스 크기 = 표시 크기 × dpr (선명하게)
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth, h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      const ctx = cv.getContext('2d'); if (!ctx) return;
      ctx.scale(dpr, dpr); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
    };
    resize();
  }, []);

  const pos = (e: React.PointerEvent) => {
    const cv = ref.current!; const r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent) => { e.preventDefault(); drawing.current = true; last.current = pos(e); ref.current?.setPointerCapture(e.pointerId); };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return; e.preventDefault();
    const ctx = ctxOf(); if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p;
    if (!has) setHas(true);
  };
  const up = () => {
    drawing.current = false; last.current = null;
    if (has && onChange) onChange(ref.current?.toDataURL('image/png') || null);
  };
  const clear = () => {
    const cv = ref.current, ctx = ctxOf(); if (!cv || !ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    setHas(false); onChange?.(null);
  };

  return (
    <div>
      <div style={{ position: 'relative', border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', background: C.taupeBg, overflow: 'hidden' }}>
        <canvas ref={ref} style={{ display: 'block', width: '100%', height, touchAction: 'none', cursor: 'crosshair' }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
        {!has && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', color: C.faint, fontSize: 13 }}>{label}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
        <Btn size="sm" variant="ghost" onClick={clear}>다시 서명</Btn>
      </div>
    </div>
  );
}
