import { redirect } from 'next/navigation';

/** 레거시 — 일정관리는 리스크관리(/risk)로 흡수. */
export default function DeskRedirect() {
  redirect('/risk');
}
