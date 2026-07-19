'use client';
// 루트(레이아웃) 예외 바운더리 — html/body 직접 렌더(전역 크래시 마지막 방어선).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#f6f6f4' }}>
          <div style={{ maxWidth: 420, width: '100%', border: '1px solid #e2e2e0', borderRadius: 8, background: '#fff', padding: '28px 26px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#1a1a1a', marginBottom: 8 }}>일시적인 오류가 발생했습니다</div>
            <div style={{ fontSize: 13, color: '#6b6b68', lineHeight: 1.7, marginBottom: 20 }}>앱을 다시 불러오면 대부분 해결됩니다. 반복되면 관리자에게 문의해 주세요.</div>
            <button onClick={() => reset()} style={{ height: 38, padding: '0 20px', borderRadius: 6, border: 'none', background: '#1b2a4a', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>다시 불러오기</button>
            {error?.digest && <div style={{ fontSize: 11, color: '#a3a3a0', marginTop: 14, fontFamily: 'monospace' }}>ref {error.digest}</div>}
          </div>
        </div>
      </body>
    </html>
  );
}
