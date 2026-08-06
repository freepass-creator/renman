import { describe, expect, it } from 'vitest';
import {
  buildAnalysisSummary, buildPendingRow, makeIngestPage,
  mergePageExtracts, fileFormFromPages, summarizeSavedRow,
} from '@/lib/ingest-summary';
import { defaultDocKindForEntity, resolveDocKind, docDestination } from '@/lib/doc-kinds';

describe('ingest-summary pages + axes', () => {
  it('builds OCR pending with multiple pages and axes', () => {
    const f1 = new File(['a'], 'front.jpg', { type: 'image/jpeg' });
    const f2 = new File(['b'], 'back.jpg', { type: 'image/jpeg' });
    const pages = [makeIngestPage(f1), makeIngestPage(f2)];
    pages[0] = { ...pages[0], status: '읽음', extracted: { car_number: '86버1166', car_name: '카니발' } };
    pages[1] = { ...pages[1], status: '분석중' };

    const { record } = mergePageExtracts('vehicle', pages);
    const row = buildPendingRow({
      rid: 'p1',
      entityKey: 'vehicle',
      source: 'ocr',
      record,
      pages,
      docKind: defaultDocKindForEntity('vehicle'),
    });

    expect(row.docKind).toBe('자동차등록증');
    expect(row.nature).toBe('증서');
    expect(row.division).toBe('자산');
    expect(row.pages).toHaveLength(2);
    expect(row.fileForm).toContain('2장');
    expect(row.statusLabel).toBe('분석중');
    expect(row.analysisSummary).toMatch(/2장/);
    expect(row.destLabel).toContain('자산');
    expect(row.targetAssigned).toBe(true);
  });

  it('marks evidence nature analysis as 해당없음', () => {
    const row = buildPendingRow({
      rid: 'p2',
      entityKey: 'vehicle',
      source: 'ocr',
      record: {},
      docKind: '차량 사진',
      pages: [makeIngestPage(new File(['x'], 'car.jpg', { type: 'image/jpeg' }))],
    });
    expect(row.nature).toBe('증빙');
    expect(row.analysisLabel).toBe('해당없음');
    expect(row.targetAssigned).toBe(false);
    expect(row.target).toBe('미배정');
  });

  it('merges page extracts and reports conflicts', () => {
    const pages = [
      { id: '1', fileName: 'a.jpg', mime: 'image/jpeg', status: '읽음' as const, extracted: { car_number: '11가1111' } },
      { id: '2', fileName: 'b.jpg', mime: 'image/jpeg', status: '읽음' as const, extracted: { car_number: '22나2222', vin: 'VIN1' } },
    ];
    const { record, conflicts } = mergePageExtracts('vehicle', pages);
    expect(record.plate).toBe('11가1111');
    expect(record.vin).toBe('VIN1');
    expect(conflicts.length).toBeGreaterThan(0);
  });

  it('shares doc-kinds destination with work divisions', () => {
    expect(resolveDocKind('자동차등록증').ocrType).toBe('vehicle_reg');
    expect(docDestination('증서', '자산', 'vehicle').href).toBe('/asset');
    expect(docDestination('청구/영수', '과태료', 'penalty').href).toContain('과태료');
    expect(fileFormFromPages([{ id: '1', fileName: 'a.pdf', mime: 'application/pdf', status: '대기' }])).toBe('PDF');
    expect(summarizeSavedRow('inbox', { filename: '등록증.pdf', kind: '자동차등록증', processingState: '확인필요' }).fileForm).toBe('PDF');
    expect(buildAnalysisSummary('vehicle', { plate: '11가1111' }, { source: 'ocr' })).toContain('11가1111');
  });
});
