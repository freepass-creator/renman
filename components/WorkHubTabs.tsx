/**
 * 업무 허브 뒤로가기 — 업무 페이지 tools에 붙임. 형제 탭 금지.
 */
'use client';
import { Btn } from '@/components/ui';
import { openWorkHub } from '@/lib/work-hub';

export function WorkHubBack() {
  return (
    <Btn variant="ghost" size="sm" onClick={openWorkHub}>← 업무현황</Btn>
  );
}

export { WORK_PAGES, isWorkPath as isWorkHubPath, PIPE, openPipe, openWorkHub } from '@/lib/work-hub';
export { WorkPipe } from '@/components/WorkPipe';
