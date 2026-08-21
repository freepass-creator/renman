'use client';
/** 화면이 터졌을 때 흰 화면 대신 «무엇이 문제인지» 보여준다 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={{ padding: '48px 20px', maxWidth: 520, margin: '0 auto' }}>
      <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px' }}>화면이 열리지 않았습니다</p>
      <p className="note" style={{ margin: '0 0 14px' }}>아래 내용을 그대로 알려주시면 바로 고칩니다.</p>
      <pre style={{
        fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, padding: '11px 12px', margin: 0,
      }}>
        {error?.message || String(error)}
        {error?.digest ? `\n(${error.digest})` : ''}
      </pre>
      <button className="btn btn-key btn-wide" style={{ marginTop: 12 }} onClick={() => reset()}>다시 열기</button>
    </main>
  );
}
