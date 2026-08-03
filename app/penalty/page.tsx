import { redirect } from 'next/navigation';

/** 레거시 — 과태료관리는 업무관리 과태료 뷰로 흡수 (CMS집금식). */
export default function PenaltyRedirect() {
  redirect('/work?group=%EA%B3%BC%ED%83%9C%EB%A3%8C');
}
