'use client';
/**
 * 원장 버튼 자리·무리·형태 SSOT.
 *
 * ┌─ 제목줄 ───────────────────────────────────────────── right(쓰기) ─┐
 * │ 단건 solid 1 · 대량/보조 ghost                                         │
 * └───────────────────────────────────────────────────────────────────────┘
 * ┌─ 필터줄 ──────────────────────────────────────────────────────────────┐
 * │ 회사 · 검색 · 세부필터 · 범위 · 빠른칩 · 기간                           │
 * │                              …spacer…                                  │
 * │                    stats · 기본/전체 · tools(워크플로 ghost…)           │
 * └───────────────────────────────────────────────────────────────────────┘
 * ┌─ 패널 footer ──────────────────────── hint … 취소ghost · 저장solid ─┐
 *
 * 분류:
 *   쓰기     = 레코드 생성/입력          → Page.right · solid≤1
 *   워크플로 = 다른 화면으로 일 넘기기    → tools · 전부 ghost · 맨 우측
 *   필터     = 목록 거르기               → filters · Search/Select/toggle
 *   보기     = 열 밀도                   → PillTabs 기본/전체
 *   통계     = 숫자 한눈                 → stats 텍스트 (버튼 아님)
 *
 * 금지: 필터줄에 쓰기·워크플로 섞기 · tools에 solid · zone당 solid>1
 *
 * tools 반복액션 = `<Btn iconOnly tip="설명" variant="ghost">` (아이콘+호버설명).
 * Page.right solid 쓰기 = 라벨 유지(또는 아이콘+짧은 라벨).
 */
import React, { type ReactNode } from 'react';

export function LedgerActions({
  children,
  'aria-label': ariaLabel,
}: {
  children: ReactNode;
  'aria-label'?: string;
}) {
  return (
    <span
      role="group"
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

export function LedgerPanelFooter({
  hint,
  children,
}: {
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <footer className="ledger-panel-footer">
      <span>{hint ?? null}</span>
      <div>{children}</div>
    </footer>
  );
}
