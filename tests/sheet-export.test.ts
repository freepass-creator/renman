/**
 * sheet-export 단위 테스트 — xlsx 없이 행렬만.
 */
import { describe, expect, it, vi } from 'vitest';
import { buildSheetMatrix, toCell } from '@/lib/sheet-export';
import type { SheetCol } from '@/components/ui/excel-sheet';

type Row = {
  phone: string;
  contractorLicenseNo: string;
  rent: number;
  zero: number;
  empty: number | null;
  day: string;
  status: string;
};

const cols: SheetCol<Row>[] = [
  { key: 'phone', label: '전화', render: () => null, text: (r) => r.phone, xf: 'text' },
  { key: 'contractorLicenseNo', label: '면허', render: () => null, text: (r) => r.contractorLicenseNo },
  { key: 'rent', label: '월대여료', align: 'r', render: () => null, text: (r) => r.rent, xf: 'money' },
  { key: 'zero', label: '잔액', align: 'r', render: () => null, text: (r) => r.zero, xf: 'money' },
  { key: 'empty', label: '없음', align: 'r', render: () => null, text: (r) => r.empty ?? '', xf: 'money' },
  { key: 'day', label: '일자', render: () => null, text: (r) => r.day, xf: 'date' },
  { key: 'status', label: '상태', render: () => null, text: (r) => r.status },
  { key: 'noText', label: '빈열', render: () => null },
];

const row: Row = {
  phone: '010-1234-5678',
  contractorLicenseNo: '서울12-345678-90',
  rent: 550000,
  zero: 0,
  empty: null,
  day: '2026-07-31',
  status: '운행',
};

describe('sheet-export', () => {
  it('금액 열은 t:n + #,##0 숫자', () => {
    const c = toCell(cols[2]!, row, true);
    expect(c).toEqual({ v: 550000, t: 'n', z: '#,##0' });
  });

  it('0은 0으로 기록', () => {
    expect(toCell(cols[3]!, row, true)).toEqual({ v: 0, t: 'n', z: '#,##0' });
  });

  it('null은 빈 셀', () => {
    expect(toCell(cols[4]!, row, true)).toBeNull();
  });

  it('날짜는 t:s YYYY-MM-DD', () => {
    expect(toCell(cols[5]!, row, true)).toEqual({ v: '2026-07-31', t: 's' });
  });

  it('phone·면허 마스킹', () => {
    const phone = toCell(cols[0]!, row, true);
    expect(String(phone?.v)).toContain('●');
    expect(String(phone?.v)).not.toContain('1234');
    const lic = toCell(cols[1]!, row, true);
    expect(String(lic?.v)).toContain('●');
  });

  it('mask:false 에도 휴대폰 패턴 최종방어', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const spooky: SheetCol<Row> = {
      key: 'mysteryPhone', label: 'X', render: () => null, text: () => '010-9999-8888',
    };
    const c = toCell(spooky, row, false);
    expect(String(c?.v)).toContain('●');
    warn.mockRestore();
  });

  it('text 없는 열은 빈 셀', () => {
    expect(toCell(cols[7]!, row, true)).toBeNull();
  });

  it('buildSheetMatrix 프리앰블·파일명', () => {
    const m = buildSheetMatrix(cols.filter((c) => c.text), [row], {
      title: '자산관리',
      company: '스위치플랜',
      filterLine: '보유',
      today: '2026-07-31',
      sumLine: '합계 ₩550,000',
    });
    expect(m.headerRow).toBe(3);
    expect(m.aoa[0]![0]!.v).toBe('자산관리');
    expect(String(m.aoa[1]![0]!.v)).toContain('1건');
    expect(m.aoa[3]!.map((c) => c.v)).toEqual(cols.filter((c) => c.text).map((c) => c.label));
    expect(m.fileName).toMatch(/자산관리-스위치플랜-20260731\.xlsx/);
    expect(m.sheetName.length).toBeLessThanOrEqual(31);
  });
});
