'use client';
import { useRef, useState } from 'react';
import { UploadCloud, CheckCircle2 } from 'lucide-react';
import { C } from '@/components/ui';

/**
 * 파일 드롭존 SSOT — 앱의 모든 파일 선택은 이걸 쓴다(손롤 `<input type="file">` 금지).
 *   단건    : onFile
 *   여러 장 : multiple + onFiles (과태료 고지서처럼 한 번에 N장 받는 곳)
 * 조립(OCR·업로드)까지 필요하면 `<DocUpload>`(components/ui/doc-upload)를 쓴다.
 */
export default function FileDrop({ onFile, onFiles, multiple, accept, file, hint, note }: {
  onFile?: (f: File) => void;
  onFiles?: (fs: FileList) => void;
  multiple?: boolean;
  accept?: string;
  file?: File | null;
  hint?: string;
  /** 진행 상태 등 부가 문구(예: 'OCR 분석 중…') */
  note?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const take = (fs: FileList | null) => {
    if (!fs || !fs.length) return;
    if (onFiles) onFiles(fs); else onFile?.(fs[0]);
  };
  return (
    <div
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '22px 18px',
        border: `1.5px dashed ${over ? C.accent : file ? 'var(--green-border)' : C.line}`,
        borderRadius: 'var(--radius)',
        background: over ? 'var(--bg-hover)' : file ? 'var(--green-bg)' : C.bg,
        cursor: 'pointer', textAlign: 'center', transition: 'all .12s', minWidth: 300,
      }}
    >
      <input ref={ref} type="file" accept={accept} multiple={multiple} style={{ display: 'none' }}
        onChange={(e) => { take(e.target.files); e.currentTarget.value = ''; }} />
      {file ? <CheckCircle2 size={26} color="var(--green-text)" /> : <UploadCloud size={26} color={C.faint} />}
      {file
        ? <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green-text)' }}>{file.name}</div>
        : <>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.mute }}>파일을 끌어다 놓거나 <span style={{ color: C.accent }}>클릭해서 선택</span></div>
            {hint && <div style={{ fontSize: 11, color: C.faint }}>{hint}</div>}
          </>}
      {note && <div style={{ fontSize: 11, color: C.accent, fontWeight: 700 }}>{note}</div>}
    </div>
  );
}
