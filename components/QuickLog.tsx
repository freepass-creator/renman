'use client';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui';
import { QuickLogForm, type QuickLogCtx } from '@/components/QuickLogForm';

// 전역 빠른 기록 폴백 — 'jpk:log' 오면 중앙 모달로. 맥락(차/고객) 화면은 이제 그 자리에서 인라인(QuickLogForm)으로
// 펼치므로 이 모달은 맥락 없는 전역 트리거(명령 팔레트 등) 폴백용. 폼·저장 로직은 QuickLogForm 단일 출처.
export function QuickLogHost() {
  const [ctx, setCtx] = useState<QuickLogCtx | null>(null);

  useEffect(() => {
    function on(e: Event) { setCtx(((e as CustomEvent).detail || {}) as QuickLogCtx); }
    window.addEventListener('jpk:log', on);
    return () => window.removeEventListener('jpk:log', on);
  }, []);

  if (!ctx) return null;
  const anchor = ctx.plate || ctx.customer || '';
  return (
    <Modal title="빠른 기록" meta={anchor ? `${anchor}에 남깁니다` : ''} onClose={() => setCtx(null)} width={480}>
      {/* 모달 안에서도 같은 인라인 폼(단일 출처). 폼 자체 헤더는 중복이라 style 없이 그대로. */}
      <QuickLogForm ctx={ctx} onDone={() => setCtx(null)} onCancel={() => setCtx(null)} style={{ border: 'none', background: 'none', boxShadow: 'none', padding: 0 }} />
    </Modal>
  );
}
