/**
 * 틀고정(pin) 규격 — 가로 스크롤에서 열이 겹치지 않게.
 *
 * excel-sheet 는 «첫 번째 pin 열» 하나만 `left: 0` 으로 붙인다(둘 이상이면 전부 left:0 이라 겹친다).
 * 따라서 **첫 pin 열이 첫 열이 아니면 그 왼쪽 열들을 덮어버린다.**
 * 과태료 원장이 실제로 그랬다 — company(0번 칸)에 pin 이 없어 plate(1번)가 고정되면서
 * 가로로 밀 때 차량번호가 회사명 위에 포개졌다(2026-08-07 발견).
 */
import { describe, expect, it } from 'vitest';
import type { SheetCol } from '@/components/ui';
import { FLEET_BASIC_COLS, FLEET_EXPANDED_COLS } from '@/lib/sheet-cols';
import {
  ASSET_MASTER_BASIC_COLS, ASSET_MASTER_EXPANDED_COLS,
  ASSET_MAINT_BASIC_COLS, ASSET_MAINT_EXPANDED_COLS,
  CONTRACT_MASTER_BASIC_COLS, CONTRACT_MASTER_EXPANDED_COLS,
} from '@/lib/master-ledger-cols';
import { RISK_BASIC_COLS, RISK_EXPANDED_COLS } from '@/lib/risk-cols';
import { RECEIVABLE_BASIC_COLS, RECEIVABLE_EXPANDED_COLS } from '@/lib/receivables-cols';
import { WORK_BASIC_COLS, WORK_ALL_COLS, PENALTY_BASIC_COLS, PENALTY_ALL_COLS } from '@/lib/work-cols';
import { AGENDA_BASIC_COLS, AGENDA_EXPANDED_COLS } from '@/lib/agenda-cols';
import { STAFF_COLS } from '@/lib/staff-cols';

/* eslint-disable @typescript-eslint/no-explicit-any */
const VIEWS: Array<[string, SheetCol<any>[]]> = [
  ['운영현황.기본', FLEET_BASIC_COLS], ['운영현황.전체', FLEET_EXPANDED_COLS],
  ['자산.기본', ASSET_MASTER_BASIC_COLS], ['자산.전체', ASSET_MASTER_EXPANDED_COLS],
  ['정비.기본', ASSET_MAINT_BASIC_COLS], ['정비.전체', ASSET_MAINT_EXPANDED_COLS],
  ['계약.기본', CONTRACT_MASTER_BASIC_COLS], ['계약.전체', CONTRACT_MASTER_EXPANDED_COLS],
  ['리스크.기본', RISK_BASIC_COLS], ['리스크.전체', RISK_EXPANDED_COLS],
  ['미수.기본', RECEIVABLE_BASIC_COLS], ['미수.전체', RECEIVABLE_EXPANDED_COLS],
  ['업무.기본', WORK_BASIC_COLS], ['업무.전체', WORK_ALL_COLS],
  ['과태료.기본', PENALTY_BASIC_COLS], ['과태료.전체', PENALTY_ALL_COLS],
  ['일정.기본', AGENDA_BASIC_COLS], ['일정.전체', AGENDA_EXPANDED_COLS],
  ['임직원', STAFF_COLS],
];

describe('원장 틀고정', () => {
  it('고정되는 열은 반드시 첫 열이다 — 아니면 왼쪽 열을 덮는다', () => {
    const bad = VIEWS
      .map(([name, cols]) => [name, cols, cols.findIndex((c) => c.pin)] as const)
      .filter(([, , first]) => first > 0)
      .map(([name, cols, first]) =>
        `${name}: 고정=${cols[first].key}(${first}번) → 덮이는 열 ${cols.slice(0, first).map((c) => c.key).join(',')}`);
    expect(bad, `틀고정이 왼쪽 열을 덮는다 — 1번 칸(회사명)에 pin 을 붙여라:\n  ${bad.join('\n  ')}`).toEqual([]);
  });

  it('모든 원장에 고정 열이 하나는 있다 — 가로로 밀 때 신원을 잃지 않게', () => {
    const none = VIEWS.filter(([, cols]) => !cols.some((c) => c.pin)).map(([name]) => name);
    expect(none, `고정 열 없음:\n  ${none.join('\n  ')}`).toEqual([]);
  });
});
