import type { Metadata } from 'next';
import SimpleRentalManager from './SimpleRentalManager';

export const metadata: Metadata = {
  title: '렌터카 매니저',
  description: '원본 자료와 원자데이터를 연결해 운영 예외를 처리하는 렌터카 업무 시스템',
};

export default function RebornRentalManagerPage() {
  return <SimpleRentalManager />;
}
