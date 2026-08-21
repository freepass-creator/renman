'use client';
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '48px 20px', margin: 0 }}>
        <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>화면이 열리지 않았습니다</p>
        <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {error?.message || String(error)}
        </pre>
        <button onClick={() => reset()} style={{ marginTop: 12, padding: '10px 14px' }}>다시 열기</button>
      </body>
    </html>
  );
}
