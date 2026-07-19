'use client';
/**
 * 내 업무(MyDesk) 섹션 고르기 SSOT — localStorage + 설정 펼침.
 *   · 담은 id 배열 = 표시 순서. 마이페이지·홈 내업무 렌즈가 공유.
 *   · 편집 UI는 설정(`/settings`)만. MyDesk 본문은 렌더만.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@/lib/session';
import { useIsMobile } from '@/lib/use-mobile';
import { SECTIONS, SECTION_MAP, DESK_GROUPS } from '@/lib/section-registry';
import { moveBefore } from '@/lib/use-sec-order';
import { Btn, C, SPACE_M, toggleStyle } from '@/components/ui';

const EVENT = 'jpk:mydesk-change';

export function myDeskStoreKey(uid: string) {
  return `jpk:mydesk:${uid}`;
}

function readPicked(storeKey: string): string[] {
  try {
    const raw = localStorage.getItem(storeKey);
    return raw ? (JSON.parse(raw) as string[]).filter((id) => SECTION_MAP[id]) : [];
  } catch {
    return [];
  }
}

export function notifyMyDeskChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(EVENT));
}

/** 담은 섹션 id + 토글/순서. 설정·MyDesk 공용. */
export function useMyDeskPicked() {
  const { user } = useSession();
  const storeKey = myDeskStoreKey(user.uid);
  const [picked, setPicked] = useState<string[]>([]);

  const reload = useCallback(() => setPicked(readPicked(storeKey)), [storeKey]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    const on = () => reload();
    window.addEventListener(EVENT, on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener('storage', on); };
  }, [reload]);

  const save = useCallback((next: string[]) => {
    setPicked(next);
    try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch { /* 무시 */ }
    notifyMyDeskChange();
  }, [storeKey]);

  const toggle = useCallback((id: string) => {
    save(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  }, [picked, save]);

  const reorder = useCallback((fromId: string, toId: string) => {
    const next = moveBefore(picked, fromId, toId);
    if (next !== picked) save(next);
  }, [picked, save]);

  const clear = useCallback(() => save([]), [save]);
  const pickedSet = useMemo(() => new Set(picked), [picked]);

  return { picked, pickedSet, toggle, reorder, clear, save };
}

/** 설정 본문 — Panel 없이(설정 페이지 ListBox 펼침 안에서 씀). */
export function MyDeskSettings() {
  const mobile = useIsMobile();
  const { picked, pickedSet, toggle, reorder, clear } = useMyDeskPicked();
  const [dragId, setDragId] = useState<string | null>(null);
  const chipSize = mobile ? 'lg' : 'sm';

  return (
    <div style={{ padding: '4px 0 6px' }}>
      <p style={{ fontSize: 12.5, color: C.mute, margin: '0 0 10px', lineHeight: 1.7 }}>
        홈과 같은 섹션을 골라 마이페이지·홈「내 업무」에 모읍니다. 담은 순서가 표시 순서입니다.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE_M, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: C.faint }}>담은 섹션 · {picked.length}개</span>
        <span style={{ flex: 1 }} />
        <Btn size="sm" variant="ghost" onClick={clear} disabled={picked.length === 0}>비우기</Btn>
      </div>
      {picked.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE_M, marginBottom: 14, minHeight: 28 }}>
          {picked.map((id) => {
            const s = SECTION_MAP[id];
            if (!s) return null;
            return (
              <button
                key={id}
                type="button"
                draggable
                onDragStart={() => setDragId(id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragId) reorder(dragId, id); setDragId(null); }}
                onDragEnd={() => setDragId(null)}
                style={{ ...toggleStyle(true, chipSize), cursor: 'grab' }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      )}
      {DESK_GROUPS.map((g) => {
        const items = SECTIONS.filter((s) => s.group === g);
        if (!items.length) return null;
        return (
          <div key={g} style={{ marginTop: SPACE_M }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.sub, marginBottom: 7, letterSpacing: '0.02em' }}>{g}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE_M }}>
              {items.map((s) => {
                const on = pickedSet.has(s.id);
                return (
                  <button key={s.id} type="button" onClick={() => toggle(s.id)} aria-pressed={on} style={toggleStyle(on, chipSize)}>
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
