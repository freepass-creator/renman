/**
 * Promise 대기 상한 — Firestore/Auth/시드가 멈추면 UI 스피너가 영구 고정되는 걸 막는다.
 * store·session·대시보드가 같은 원자 하나만 씀 (손롤 setTimeout race 금지).
 */
export function withTimeout<T>(p: Promise<T>, ms = 8000, label = 'timeout'): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timed = new Promise<T>((_, rej) => {
    t = setTimeout(() => rej(new Error(`${label} ${ms}ms`)), ms);
  });
  return Promise.race([p, timed]).finally(() => { if (t) clearTimeout(t); });
}
