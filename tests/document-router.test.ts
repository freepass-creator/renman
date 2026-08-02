import { describe, expect, it } from 'vitest';
import { routeDocument } from '@/lib/document-router';

describe('데이터센터 원본 1차 라우터', () => {
  it('자동차등록증 파일은 차량 후보로 분류한다', () => {
    expect(routeDocument({ filename: '12가3456_자동차등록증.pdf', mime: 'application/pdf' })).toMatchObject({
      kind: '자동차등록증', entity: 'vehicle', confidence: 'high',
    });
  });

  it('계좌 거래 엑셀은 계좌거래 후보로 분류한다', () => {
    expect(routeDocument({ filename: '신한은행_입출금거래내역.xlsx' })).toMatchObject({
      kind: '계좌거래내역', entity: 'bank_tx', confidence: 'high',
    });
  });

  it('이름을 알 수 없는 엑셀은 임의 원장을 정하지 않는다', () => {
    expect(routeDocument({ filename: '8월자료.xlsx' })).toMatchObject({
      kind: '표자료', entity: 'inbox', confidence: 'medium',
    });
  });

  it('일반 PDF는 미분류 문서로 유지한다', () => {
    expect(routeDocument({ filename: 'scan_001.pdf', mime: 'application/pdf' })).toMatchObject({
      kind: '문서', entity: 'inbox', confidence: 'low',
    });
  });
});
