'use client';
/**
 * 업로드 섹션 — 현장에서 폰으로 사진·파일·서명을 수집함에 올림. 마이페이지 최상단(모바일 첫 화면).
 *   공용 uploadToInbox(SSOT) 사용 — 수집함 페이지와 동일 파이프라인. 매칭은 수집함에서.
 */
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import { uploadToInbox } from '@/lib/inbox-upload';
import { storageReady } from '@/lib/storage';
import { toast } from '@/lib/toast';
import { Sec, Btn, C } from '@/components/ui';
import { SignaturePad, dataUrlToFile } from '@/components/SignaturePad';
import { Camera, Paperclip, PenLine } from 'lucide-react';

export function UploadSection() {
  const { companyId, user } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [sign, setSign] = useState(false);
  const [signData, setSignData] = useState<string | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function up(file: File, kind: string) {
    setBusy(true);
    const r = await uploadToInbox(file, kind, companyId, String(user.name || ''));
    setBusy(false);
    if (!r.ok) { toast(r.reason === 'unconfigured' ? '저장소(Storage) 미설정 — 업로드 불가' : '업로드 실패', 'error'); return; }
    toast(`${kind} 업로드 — 수집함 대기`, 'success');
  }
  async function saveSig() { if (signData) { const f = dataUrlToFile(signData, `서명_${Date.now()}.png`); if (f) await up(f, '서명'); } setSign(false); setSignData(null); }

  return (
    <Sec title="업로드" desc="현장에서 촬영·업로드 → 수집함에서 차량·계약·자금에 매칭"
      right={<button type="button" onClick={() => router.push('/inbox')} style={{ border: 'none', background: 'none', color: C.accent, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>수집함 →</button>}>
      <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) up(f, '사진'); e.currentTarget.value = ''; }} />
      <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) up(f, '문서'); e.currentTarget.value = ''; }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Btn onClick={() => camRef.current?.click()} disabled={busy}><Camera size={15} /> 사진 촬영</Btn>
        <Btn variant="ghost" onClick={() => fileRef.current?.click()} disabled={busy}><Paperclip size={15} /> 파일</Btn>
        <Btn variant="ghost" onClick={() => setSign(true)} disabled={busy}><PenLine size={15} /> 서명</Btn>
        {busy && <span style={{ fontSize: 12.5, color: C.mute, alignSelf: 'center' }}>업로드 중…</span>}
      </div>
      {!storageReady() && <div style={{ marginTop: 8, fontSize: 11.5, color: C.warn }}>※ 저장소(Firebase Storage) 미설정 시 업로드 불가</div>}
      {sign && (
        <div onClick={() => { setSign(false); setSignData(null); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.taupeBg, border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)', width: '100%', maxWidth: 420, padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.ink, marginBottom: 10 }}>서명</div>
            <SignaturePad onChange={setSignData} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <Btn variant="ghost" onClick={() => { setSign(false); setSignData(null); }}>취소</Btn>
              <Btn onClick={saveSig} disabled={!signData || busy}>업로드</Btn>
            </div>
          </div>
        </div>
      )}
    </Sec>
  );
}
