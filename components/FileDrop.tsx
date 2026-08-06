'use client';
import { useRef, useState } from 'react';
import { UploadCloud, CheckCircle2 } from 'lucide-react';
import { C } from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';

/**
 * 파일 드롭존 SSOT — 앱의 모든 파일 선택은 이걸 쓴다(손롤 `<input type="file">` 금지).
 *   단건    : onFile
 *   여러 장 : multiple + onFiles (과태료 고지서처럼 한 번에 N장 받는 곳)
 *   붙여넣기: 포커스 후 Ctrl+V (클립보드 이미지·파일)
 * 조립(OCR·업로드)까지 필요하면 `<DocUpload>`(components/ui/doc-upload)를 쓴다.
 */
export default function FileDrop({ onFile, onFiles, multiple, accept, file, hint, note, disabled, style }: {
  onFile?: (f: File) => void;
  onFiles?: (fs: FileList) => void;
  multiple?: boolean;
  accept?: string;
  file?: File | null;
  hint?: string;
  /** 진행 상태 등 부가 문구(예: 'OCR 분석 중…') — 박스 안에서 표시, 레이아웃 유지 */
  note?: string;
  /** 진행 중 재선택 차단 */
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const mobile = useIsMobile();
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const take = (fs: FileList | null) => {
    if (disabled || !fs || !fs.length) return;
    if (onFiles) onFiles(fs); else onFile?.(fs[0]);
  };
  const takeItems = (items: DataTransferItemList | undefined) => {
    if (disabled || !items?.length) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind !== 'file') continue;
      const f = it.getAsFile();
      if (f) files.push(f);
    }
    if (!files.length) return;
    if (onFiles) {
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(f);
      onFiles(dt.files);
    } else onFile?.(files[0]);
  };
  return (
    <div
      tabIndex={disabled ? -1 : 0}
      role="button"
      aria-label="파일 선택"
      aria-disabled={disabled || undefined}
      onClick={() => { if (!disabled) ref.current?.click(); }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          ref.current?.click();
        }
      }}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
      onPaste={(e) => { takeItems(e.clipboardData?.items); }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '22px 18px',
        border: `1.5px dashed ${over ? C.accent : file ? 'var(--green-border)' : C.line}`,
        borderRadius: 'var(--radius)',
        background: over ? 'var(--bg-hover)' : file ? 'var(--green-bg)' : C.bg,
        cursor: disabled ? 'default' : 'pointer', textAlign: 'center', transition: 'all .12s',
        minWidth: 0, minHeight: 120, boxSizing: 'border-box', outline: 'none',
        opacity: disabled ? 0.85 : 1,
        ...style,
      }}
    >
      <input ref={ref} type="file" accept={accept} multiple={multiple} disabled={disabled} style={{ display: 'none' }}
        onChange={(e) => { take(e.currentTarget.files); e.currentTarget.value = ''; }} />
      {file ? <CheckCircle2 size={26} color="var(--green-text)" /> : <UploadCloud size={26} color={C.faint} />}
      {file
        ? <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green-text)', wordBreak: 'break-all' }}>{file.name}</div>
        : <>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.mute }}>
              {mobile ? <span style={{ color: C.accent }}>사진 또는 파일 선택</span> : <>드래그 · <span style={{ color: C.accent }}>선택</span> · 붙여넣기</>}
            </div>
            {hint && <div style={{ fontSize: 11, color: C.faint }}>{hint}</div>}
          </>}
      {note && <div style={{ fontSize: 11, color: C.accent, fontWeight: 700 }}>{note}</div>}
    </div>
  );
}
