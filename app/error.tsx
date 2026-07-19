'use client';
// 라우트 에러 바운더리 — 렌더 경로 예외를 백지 대신 복구 카드로. 자기완결(외부 의존 최소=바운더리 자신이 안 죽게).
import { useEffect } from 'react';

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('route error:', error); }, [error]);
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 420, width: '100%', border: '1px solid #e2e2e0', borderRadius: 8, background: '#fff', padding: '28px 26px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#1a1a1a', marginBottom: 8 }}>문제가 발생했습니다</div>
        <div style={{ fontSize: 13, color: '#6b6b68', lineHeight: 1.7, marginBottom: 20 }}>이 화면을 그리는 중 오류가 났습니다. 다시 시도하거나 다른 메뉴로 이동해 주세요. 반복되면 데이터에 이상값이 있을 수 있습니다.</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button onClick={() => reset()} style={{ height: 38, padding: '0 18px', borderRadius: 6, border: 'none', background: '#1b2a4a', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>다시 시도</button>
          <button onClick={() => { window.location.href = '/'; }} style={{ height: 38, padding: '0 18px', borderRadius: 6, border: '1px solid #d5d5d2', background: '#fff', color: '#1a1a1a', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>홈으로</button>
        </div>
        {error?.digest && <div style={{ fontSize: 11, color: '#a3a3a0', marginTop: 14, fontFamily: 'monospace' }}>ref {error.digest}</div>}
      </div>
    </div>
  );
}
