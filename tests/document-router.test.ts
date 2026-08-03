import { describe, expect, it } from 'vitest';
import { routeDocument } from '@/lib/document-router';
import { ENTITIES } from '@/lib/intake/entities';

describe('데이터센터 원본 1차 라우터', () => {
  it('자동차등록증 파일은 차량 후보로 분류한다', () => {
    expect(routeDocument({ filename: '12가3456_자동차등록증.pdf', mime: 'application/pdf' })).toMatchObject({
      kind: '자동차등록증', entity: 'vehicle', confidence: 'high',
    });
  });

  it('보험증권은 실제 보험 원장 후보로 분류한다', () => {
    expect(routeDocument({ filename: '12가3456_자동차보험증권.pdf', mime: 'application/pdf' })).toMatchObject({
      kind: '보험증권', entity: 'insurance', confidence: 'high',
    });
  });

  it('영수증·세금계산서는 자금 거래 증빙 후보로 분류한다', () => {
    expect(routeDocument({ filename: '정비비_세금계산서.pdf', mime: 'application/pdf' })).toMatchObject({
      kind: '지출증빙', entity: 'bank_tx', confidence: 'high',
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

  it('분류 결과는 실제 데이터센터 엔티티만 가리킨다', () => {
    const samples = [
      '자동차등록증.pdf', '보험증권.pdf', '렌탈계약서.pdf',
      '계좌거래내역.xlsx', '정비비_영수증.pdf', 'scan.pdf',
    ];
    for (const filename of samples) {
      const route = routeDocument({ filename, mime: filename.endsWith('.pdf') ? 'application/pdf' : '' });
      expect(ENTITIES[route.entity], `${filename} → ${route.entity}`).toBeDefined();
    }
  });
});
