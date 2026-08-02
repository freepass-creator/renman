import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseTxFileReport } from '@/lib/intake/parse-tx';

function workbookFile(rows: unknown[][], name = '신한은행_거래내역.xlsx') {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '거래내역');
  return new File([XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })], name);
}

describe('계좌 엑셀 분석 보고', () => {
  it('정상 행과 확인 필요 행을 조용히 섞지 않고 분리한다', async () => {
    const file = workbookFile([
      ['거래일자', '입금액', '적요', '수납상태'],
      ['2026-08-01', '500,000', '홍길동', '완료'],
      ['날짜없음', '120,000', '김임차', '완료'],
      ['2026-08-02', '300,000', '취소거래', '취소'],
    ]);
    const report = await parseTxFileReport(file);
    expect(report.records).toHaveLength(1);
    expect(report.records[0]).toMatchObject({ txDate: '2026-08-01', amount: 500000 });
    expect(report.rejected.map((row) => row.reason)).toEqual([
      '거래일을 판독할 수 없음',
      '미완료 거래 상태(취소)',
    ]);
    expect(report.rejected.map((row) => row.row)).toEqual([3, 4]);
  });

  it('거래 헤더를 찾지 못한 시트는 경고로 남긴다', async () => {
    const report = await parseTxFileReport(workbookFile([['이름', '주소', '메모'], ['홍길동', '서울', '테스트']], '자료.xlsx'));
    expect(report.records).toHaveLength(0);
    expect(report.warnings).toEqual(['거래내역: 거래내역 헤더를 찾지 못함']);
  });
});
