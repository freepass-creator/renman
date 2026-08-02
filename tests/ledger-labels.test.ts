import { describe, expect, it } from 'vitest';
import { LEDGER_LABEL } from '@/lib/ledger-labels';
import {
  ASSET_MASTER_BASIC_COLS,
  ASSET_MASTER_EXPANDED_COLS,
  CONTRACT_MASTER_BASIC_COLS,
  CONTRACT_MASTER_EXPANDED_COLS,
  ASSET_DETAIL_SECTIONS,
} from '@/lib/master-ledger-cols';
import { FLEET_EXPANDED_COLS } from '@/lib/sheet-cols';
import { WORK_ALL_COLS } from '@/lib/work-cols';
import { WORK_BASIC_COLS } from '@/lib/work-cols';
import { ACCOUNT_ALL_COLS, ACCOUNT_BASIC_COLS } from '@/lib/finance/account-cols';
import { CASH_BASIC_COLS, CASH_EXPANDED_COLS } from '@/lib/finance/cash-cols';
import { RISK_BASIC_COLS, RISK_EXPANDED_COLS } from '@/lib/risk-cols';
import { FLEET_BASIC_COLS } from '@/lib/sheet-cols';

function labelOf(cols: Array<{ key: string; label: string }>, key: string): string | undefined {
  return cols.find((col) => col.key === key)?.label;
}

const firstFiveKeys = (cols: readonly { key: string }[]) => cols.slice(0, 5).map((col) => col.key);

describe('페이지별 공통 원장 용어', () => {
  it('차량과 계약분류 명칭이 페이지마다 동일하다', () => {
    expect(labelOf(ASSET_MASTER_EXPANDED_COLS, 'plate')).toBe(LEDGER_LABEL.plate);
    expect(labelOf(CONTRACT_MASTER_EXPANDED_COLS, 'plate')).toBe(LEDGER_LABEL.plate);
    expect(labelOf(CONTRACT_MASTER_EXPANDED_COLS, 'carName')).toBe(LEDGER_LABEL.carName);
    expect(labelOf(FLEET_EXPANDED_COLS, 'rentalType')).toBe(LEDGER_LABEL.rentalType);
    expect(labelOf(CONTRACT_MASTER_EXPANDED_COLS, 'rentalType')).toBe(LEDGER_LABEL.rentalType);
    expect(labelOf(WORK_ALL_COLS, 'rentalType')).toBe(LEDGER_LABEL.rentalType);
  });

  it('자산 상세패널에 표의 수선 요약이 함께 제공된다', () => {
    const section = ASSET_DETAIL_SECTIONS.find((item) => item.title === '수선·이력');
    expect(section?.cols.map((col) => col.key)).toEqual([
      'maintCost', 'maintVsAvg', 'maintCount', 'maintLastDate', 'vehicle360Link',
    ]);
  });

  it.each([
    ['자산', ASSET_MASTER_BASIC_COLS, ASSET_MASTER_EXPANDED_COLS],
    ['계약', CONTRACT_MASTER_BASIC_COLS, CONTRACT_MASTER_EXPANDED_COLS],
    ['업무', WORK_BASIC_COLS, WORK_ALL_COLS],
    ['운영', FLEET_BASIC_COLS, FLEET_EXPANDED_COLS],
    ['자금', CASH_BASIC_COLS, CASH_EXPANDED_COLS],
    ['계좌', ACCOUNT_BASIC_COLS, ACCOUNT_ALL_COLS],
    ['리스크', RISK_BASIC_COLS, RISK_EXPANDED_COLS],
  ])('%s 전체보기는 기본보기의 핵심 5열 순서를 유지한다', (_name, basic, all) => {
    expect(firstFiveKeys(all)).toEqual(firstFiveKeys(basic));
  });
});
