'use client';
/**
 * 섹션 순서 공용 엔진 — 접힌 섹션 드래그앤드롭만. ↑↓ 버튼 없음.
 *   사용자별 localStorage(storeKey)에 순서 저장. 새 섹션은 뒤에 자동 병합.
 *   페이지는 이 훅을 따다 쓰기만 — 섹션 이동 로직을 손롤하지 않는다(규격통일).
 *   사용: const [order, reorder] = useSecOrder('jpk:order:xxx', ['s-a','s-b',...]);
 *         order.map(id => SECTION_MAP[id]?.render(ctx, { onReorder: reorder }))
 */
import { useEffect, useState } from 'react';

/** 배열에서 fromId를 빼 toId 앞에 삽입(드롭 위치). 순수 함수 — 훅과 마이데스크 등 재배열 손롤 공용 SSOT. */
export function moveBefore(arr: string[], fromId: string, toId: string): string[] {
  if (fromId === toId) return arr;
  const next = arr.filter((x) => x !== fromId);
  const idx = next.indexOf(toId);
  if (idx < 0) return arr;
  next.splice(idx, 0, fromId);
  return next;
}

export function useSecOrder(storeKey: string, defaults: string[]): [string[], (fromId: string, toId: string) => void] {
  const [order, setOrder] = useState<string[]>(defaults);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey);
      if (!raw) return;
      const saved: string[] = JSON.parse(raw);
      setOrder([...saved.filter((id) => defaults.includes(id)), ...defaults.filter((id) => !saved.includes(id))]);
    } catch { /* 무시 */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey]);
  const save = (next: string[]) => { try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch { /* 무시 */ } };
  // toId 앞에 fromId 삽입(드롭 위치) — 순수 로직은 moveBefore 공용
  const reorder = (fromId: string, toId: string) => setOrder((cur) => {
    const next = moveBefore(cur, fromId, toId);
    if (next !== cur) save(next);
    return next;
  });
  return [order, reorder];
}
