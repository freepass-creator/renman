import { redirect } from 'next/navigation';

/** 마이페이지 → 홈 브리핑 */
export default function OpsRedirect() {
  redirect('/');
}
