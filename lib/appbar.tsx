'use client';
// 컨텍스트 앱바 — 하나의 상단바가 화면(라우트)마다 내용을 바꿔 씀.
// 모바일 SSOT: 허브(홈·메뉴·탭)=메뉴·탭 / 뎁스(DetailShell)=←·제목·액션·하단탭없음.
// 웹: back/title/left/actions 상단 + (필요 시) 하단 이전·홈·액션.
// Page/FacetPage의 back prop은 웹·예외용 — 메뉴 진입 허브에는 붙이지 말 것(홈과 동일=메뉴).
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type AppBarSlots = {
  back?: () => void;
  /** 뎁스(360·상세) — 모바일 하단 탭 숨김. 이전은 상단←만. 허브 목록에는 쓰지 않음. */
  depth?: boolean;
  title?: ReactNode; left?: ReactNode; actions?: ReactNode; contentMax?: number; contentPad?: number;
};

const Ctx = createContext<{ slots: AppBarSlots; set: (s: AppBarSlots) => void }>({ slots: {}, set: () => {} });

export function AppBarProvider({ children }: { children: ReactNode }) {
  const [slots, set] = useState<AppBarSlots>({});
  return <Ctx.Provider value={{ slots, set }}>{children}</Ctx.Provider>;
}

export function useAppBarSlots(): AppBarSlots {
  return useContext(Ctx).slots;
}

// 페이지가 자신의 앱바 내용을 설정. deps 변경 시 갱신, 언마운트 시 비움. slots=null이면 관여 안 함(오버레이용).
export function useAppBar(slots: AppBarSlots | null, deps: unknown[]) {
  const { set } = useContext(Ctx);
  useEffect(() => {
    if (!slots) return;
    set(slots);
    return () => set({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
