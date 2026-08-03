import { redirect } from 'next/navigation';

/** 레거시 운영원장 → 자산관리 */
export default function SheetRedirect() {
  redirect('/asset');
}
