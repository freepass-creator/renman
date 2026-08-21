import type { Metadata } from 'next';
import SimpleRentalManager from '../SimpleRentalManager';

export const metadata: Metadata = {
  title: '렌터카 매니저 · 신형 업무 화면',
  description: '검색과 예외 처리를 중심으로 다시 설계한 렌터카 업무 인박스',
};

export default function NextRentalWorkspacePage() {
  return <SimpleRentalManager variant="next" />;
}
