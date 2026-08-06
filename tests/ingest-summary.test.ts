import { describe, expect, it } from 'vitest';
import { buildAnalysisSummary, buildPendingRow, summarizeSavedRow } from '@/lib/ingest-summary';

describe('ingest-summary', () => {
  it('builds OCR pending summary with identity and read fields', () => {
    const row = buildPendingRow({
      rid: 'p1',
      entityKey: 'vehicle',
      source: 'ocr',
      record: { plate: '86버1166', carName: '카니발', vin: 'KNXX' },
      crosscheck: { level: 'ok', confidence: 92, issues: [] },
      filename: '등록증.pdf',
      mime: 'application/pdf',
    });
    expect(row.docKind).toBe('자동차등록증');
    expect(row.category).toBe('차량');
    expect(row.fileForm).toBe('PDF');
    expect(row.analysisSummary).toContain('86버1166');
    expect(row.analysisSummary).toMatch(/읽음/);
    expect(row.confidence).toBe(92);
    expect(row.statusLabel).toBe('OCR대기');
  });

  it('summarizes inbox saved rows by kind and reason', () => {
    const s = summarizeSavedRow('inbox', {
      filename: '등록증.pdf',
      kind: '자동차등록증',
      suggestedEntity: 'vehicle',
      classificationReason: '파일명 식별',
      classificationConfidence: 'high',
      processingState: '확인필요',
      assignmentState: '미배정',
    });
    expect(s.fileForm).toBe('PDF');
    expect(s.docKind).toBe('자동차등록증');
    expect(s.category).toBe('vehicle');
    expect(s.analysisSummary).toContain('등록증.pdf');
    expect(s.confidence).toBe(90);
    expect(s.statusTone).toBe('amber');
  });

  it('marks unread OCR labels in analysis helper', () => {
    const text = buildAnalysisSummary('vehicle', { plate: '11가1111' }, { source: 'ocr' });
    expect(text).toContain('11가1111');
  });
});
