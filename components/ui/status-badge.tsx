'use client';

import type { ReactNode } from 'react';

/**
 * 도메인 무관 상태 배지 — site theme `.badge-base` + `.badge-{tone}` 클래스 사용.
 *   <StatusBadge tone="green" icon={<CheckCircle ... />}>활성</StatusBadge>
 *   <StatusBadge tone="red"   icon={<Crown ... />}>마스터</StatusBadge>
 *
 * 시스템 표준 — radius 0 / 10px 폰트 / soft tint + 동일톤 border.
 * 인라인 스타일 직접 사용 금지 — 이 컴포넌트로 통일.
 */
export type BadgeTone = 'neutral' | 'red' | 'orange' | 'amber' | 'green' | 'blue' | 'indigo' | 'purple' | 'brand' | 'gray';

type Props = {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  title?: string;
};

export function StatusBadge({ tone = 'neutral', icon, children, title }: Props) {
  return (
    <span className={`badge-base badge-${tone}`} title={title}>
      {icon}
      {children}
    </span>
  );
}
