import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseSpreadsheet } from '@/lib/intake/xlsx';

describe('보안 패치 SheetJS 인제스천', () => {
  it('스키마 헤더를 엔티티 필드로 변환한다', async () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['차량번호 *', '차명'],
      ['12가3456', '테스트 차량'],
    ]);
    XLSX.utils.book_append_sheet(workbook, worksheet, '차량');
    const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const file = new File([data], 'vehicles.xlsx');

    const rows = await parseSpreadsheet('vehicle', file);
    expect(rows).toHaveLength(1);
    expect(rows[0].plate).toBe('12가3456');
  });
});
