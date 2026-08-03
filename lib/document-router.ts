export type DocumentRouteEntity = 'vehicle' | 'contract' | 'insurance' | 'bank_tx' | 'inbox';

export type DocumentRoute = {
  kind: string;
  entity: DocumentRouteEntity;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
};

const rules: Array<{ words: string[]; kind: string; entity: DocumentRouteEntity; reason: string }> = [
  { words: ['자동차등록증', '차량등록증', '등록원부'], kind: '자동차등록증', entity: 'vehicle', reason: '파일명에서 차량 등록 문서를 식별' },
  { words: ['보험증권', '보험가입', '보험계약'], kind: '보험증권', entity: 'insurance', reason: '파일명에서 보험 문서를 식별' },
  { words: ['렌탈계약', '대여계약', '임대차계약', '계약서'], kind: '계약서', entity: 'contract', reason: '파일명에서 계약 문서를 식별' },
  { words: ['계좌거래', '거래내역', '입출금', '통장내역', 'bank'], kind: '계좌거래내역', entity: 'bank_tx', reason: '파일명에서 계좌 거래 자료를 식별' },
  { words: ['영수증', 'receipt', '세금계산서', '카드전표'], kind: '지출증빙', entity: 'bank_tx', reason: '파일명에서 자금 거래 증빙을 식별' },
  { words: ['서명', 'signature'], kind: '서명', entity: 'contract', reason: '파일명에서 서명 자료를 식별' },
];

const normalize = (value: unknown) => String(value || '').toLowerCase().replace(/[\s_.\-()[\]]/g, '');

/**
 * 원문 내용은 추측하지 않고 파일명·MIME·사용자 힌트만으로 1차 분류한다.
 * high여도 원장 자동 생성은 하지 않으며, 후속 파서/매칭의 입력 후보로만 사용한다.
 */
export function routeDocument(input: { filename?: string; mime?: string; hint?: string }): DocumentRoute {
  const haystack = normalize(`${input.filename || ''} ${input.hint || ''}`);
  for (const rule of rules) {
    if (rule.words.some((word) => haystack.includes(normalize(word)))) {
      return { kind: rule.kind, entity: rule.entity, confidence: 'high', reason: rule.reason };
    }
  }

  const mime = String(input.mime || '').toLowerCase();
  const filename = String(input.filename || '').toLowerCase();
  if (mime.includes('spreadsheet') || mime.includes('excel') || /\.(xlsx?|csv)$/.test(filename)) {
    return { kind: '표자료', entity: 'inbox', confidence: 'medium', reason: '표 형식 확인 · 업무 종류 판정 필요' };
  }
  if (mime.startsWith('image/')) {
    return { kind: input.hint && input.hint !== '기타' ? input.hint : '사진', entity: 'inbox', confidence: 'low', reason: '이미지 원본 · 내용 판독 필요' };
  }
  if (mime === 'application/pdf' || filename.endsWith('.pdf')) {
    return { kind: '문서', entity: 'inbox', confidence: 'low', reason: 'PDF 원본 · 내용 판독 필요' };
  }
  return { kind: input.hint && input.hint !== '기타' ? input.hint : '기타', entity: 'inbox', confidence: 'low', reason: '파일 메타정보만으로 종류를 판정할 수 없음' };
}
