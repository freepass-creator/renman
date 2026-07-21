'use client';
/* 현장 스텝 위저드 공용 원자 — DeliveryWizard(인도)·ReturnWizard(반납)가 공유.
 *   두 위저드는 거울 관계라 라벨·큰입력·사진첨부 블록이 그대로 겹쳤다. 여기가 SSOT.
 *   현장 CTA 스케일(48)을 쓰는 유일한 구역 — CLAUDE.md "현장 CTA만 lg=48 유지" 예외.
 *   ※ 각 위저드의 Row(요약 행)는 정렬·필드폭이 서로 달라 의도적으로 합치지 않음. */
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { Camera, X } from 'lucide-react';
import { Btn } from './controls';
import { C, R, SH } from './tokens';

/** 현장 입력 라벨 — 모바일 가독 우선(12.5/700). */
export const wizLabel: CSSProperties = {
  fontSize: 12.5, fontWeight: 700, color: C.mute, marginBottom: 7, display: 'block',
};

/** 현장 큰 입력 — 장갑 낀 손·흔들리는 차 안 기준. 높이 48 = 현장 CTA 스케일. */
export const wizInput: CSSProperties = {
  width: '100%', height: 48, fontSize: 16, padding: '0 12px',
  border: `1px solid ${C.line}`, borderRadius: R, background: C.card,
  color: C.ink, boxSizing: 'border-box',
};

/** 요약 카드 — 확인·확정 스텝의 정보 블록. */
export function WizCard({ gap = 8, children }: { gap?: number; children: ReactNode }) {
  return (
    <div style={{
      border: `1px solid ${C.line}`, borderRadius: R, background: C.taupeBg,
      padding: '14px 16px', boxShadow: SH.rest,
      display: 'flex', flexDirection: 'column', gap,
    }}>{children}</div>
  );
}

/** 라벨 + 필드 한 묶음. */
export function WizField({ label, children }: { label: ReactNode; children: ReactNode }) {
  return <div><label style={wizLabel}>{label}</label>{children}</div>;
}

/**
 * 현장 사진 촬영·첨부 — 후면카메라 직행(capture=environment) · 칩으로 목록 · 개별 삭제.
 * 삭제 히트영역 40 = 모바일 md(터치 최소 보장).
 */
export function WizPhotos({ files, onChange, onTap }: {
  files: File[];
  onChange: (next: File[]) => void;
  /** 촬영·삭제 시 햅틱 등 부수효과. 원자는 haptic을 직접 모른다. */
  onTap?: () => void;
}) {
  const camRef = useRef<HTMLInputElement>(null);
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <input
        ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) { onChange([...files, f]); onTap?.(); }
          e.currentTarget.value = '';
        }}
      />
      <Btn variant="ghost" size="lg" onClick={() => camRef.current?.click()}><Camera size={17} /> 사진 촬영</Btn>
      {files.map((p, i) => (
        <span key={i} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12,
          padding: '4px 4px 4px 10px', borderRadius: R, border: `1px solid ${C.line}`,
          background: C.card, color: C.mute, minHeight: 40,
        }}>
          {p.name.slice(0, 12)}
          <button
            aria-label="사진 삭제"
            onClick={() => onChange(files.filter((_, j) => j !== i))}
            style={{
              border: 'none', background: 'none', cursor: 'pointer', color: C.faint,
              width: 40, height: 40, display: 'inline-flex', alignItems: 'center',
              justifyContent: 'center', WebkitTapHighlightColor: 'transparent',
            }}
          ><X size={16} /></button>
        </span>
      ))}
      {files.length > 0 && <span style={{ fontSize: 12, color: C.mute, fontWeight: 700 }}>{files.length}장</span>}
    </div>
  );
}
