import { redirect } from 'next/navigation';

/** 옛 /m 현장 허브 — 입출고(/dispatch)로 흡수. 북마크 호환만. */
export default function MobileFieldRedirect() {
  redirect('/dispatch?tab=오늘');
}
