'use client';
import { useRef, useState } from 'react';
import { UploadCloud, CheckCircle2 } from 'lucide-react';
import { C } from '@/components/ui';

export default function FileDrop({ onFile, accept, file, hint }: { onFile: (f: File) => void; accept?: string; file?: File | null; hint?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '22px 18px',
        border: `1.5px dashed ${over ? C.accent : file ? 'var(--green-border, #86efac)' : C.line}`,
        borderRadius: 'var(--radius)',
        background: over ? 'var(--bg-hover)' : file ? 'var(--green-bg, #f0fdf4)' : C.bg,
        cursor: 'pointer', textAlign: 'center', transition: 'all .12s', minWidth: 300,
      }}
    >
      <input ref={ref} type="file" accept={accept} style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      {file ? <CheckCircle2 size={26} color="var(--green-text)" /> : <UploadCloud size={26} color={C.faint} />}
      {file
        ? <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green-text)' }}>{file.name}</div>
        : <>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.mute }}>파일을 끌어다 놓거나 <span style={{ color: C.accent }}>클릭해서 선택</span></div>
            {hint && <div style={{ fontSize: 11, color: C.faint }}>{hint}</div>}
          </>}
    </div>
  );
}
