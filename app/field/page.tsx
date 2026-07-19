import { redirect } from 'next/navigation';

/** 옛 /field — 입출고(/dispatch)로 흡수. 북마크·딥링크 호환. */
export default function FieldRedirect() {
  redirect('/dispatch?tab=오늘');
}
