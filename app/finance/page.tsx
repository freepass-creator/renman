import { redirect } from 'next/navigation';

/** 레거시 재무현황 → 자금관리 */
export default function FinanceRedirect() {
  redirect('/cash');
}
