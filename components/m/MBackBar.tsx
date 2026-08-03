'use client';
/** /m 스택(상세·폼) 하단 이전 아이콘 바. (설계서 §7) */
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { C } from '@/components/ui';
import { haptic } from '@/lib/haptics';

export function MBackBar() {
  const router = useRouter();
  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 55,
      background: C.card, borderTop: `1px solid ${C.line}`, paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <button type="button" aria-label="이전" title="이전" onClick={() => { haptic.back(); router.back(); }} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%',
        height: 'var(--fp-bar-h)', border: 'none', background: 'transparent', color: C.mute,
        fontSize: 15, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
      }}>
        <ChevronLeft size={22} />
      </button>
    </div>
  );
}
