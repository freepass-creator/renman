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
 * 인라인 스텝 패널 — Modal 풀스크린 대체(UIUX-SPEC 팝업 최소화).
 *   페이지 본문에 끼워 넣는 현장 위저드 껍데기. 헤더·본문·하단 CTA.
 */
export function WizPanel({ title, meta, onClose, footer, children }: {
  title: ReactNode; meta?: ReactNode; onClose: () => void; footer?: ReactNode; children: ReactNode;
}) {
  return (
    // overflow:hidden 제거 — sticky 푸터가 뷰포트(페이지 스크롤) 기준으로 붙게 하려면 조상에 overflow 없어야 함.
    //   대신 헤더 상단·푸터 하단에 라운딩을 개별 부여해 모서리 둥근 룩 보존(children div는 배경 없어 하단 노출 무해).
    <div style={{
      border: `1px solid ${C.line}`, borderRadius: R, background: C.card,
      boxShadow: SH.card,
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
        padding: '12px 16px', background: C.head,
        borderTopLeftRadius: R, borderTopRightRadius: R,
      }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{title}</span>
        {meta != null && <span style={{ fontSize: 12, color: C.mute }}>{meta}</span>}
        <span style={{ flex: 1 }} />
        <Btn variant="ghost" size="sm" onClick={onClose}>닫기</Btn>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
      {footer != null && (
        // 긴 현장 위저드(반납 5스텝) 스크롤 중 확정 CTA를 뷰포트 하단에 고정 — 오버레이 아님(문서 흐름 내 sticky).
        <div style={{
          position: 'sticky', bottom: 0, zIndex: 1,
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '12px 16px max(12px, env(safe-area-inset-bottom))', background: C.taupeBg,
          borderTop: `1px solid ${C.line}`, boxShadow: '0 -2px 8px rgba(0,0,0,0.06)',
          borderBottomLeftRadius: R, borderBottomRightRadius: R,
        }}>{footer}</div>
      )}
    </div>
  );
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
