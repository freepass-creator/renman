'use client';

import type { ButtonHTMLAttributes, SelectHTMLAttributes } from 'react';

/** 시트형 업무 화면 전용 클릭 원자. 시각 규격은 화면 CSS가 결정한다. */
export function SheetButton({ type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} {...props} />;
}

/** 시트형 업무 화면 전용 선택 원자. 네이티브 동작은 보존하고 화면별 CSS만 주입한다. */
export function SheetSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} />;
}
