/**
 * 행문법 게이트 — 전 원장을 «가로질러» 검사.
 *
 * ★기존 tests/ledger-labels.test.ts 의 PAGE_VIEWS 는 페이지별 기대 순서를 하드코딩한다.
 *   그건 「이 페이지가 안 바뀐다」를 지킬 뿐 「페이지끼리 같은 자리다」를 지키지 않는다.
 *   새 원장이 생기면 또 어긋난다 — 규격이 주석에만 있었으므로.
 *   여기서는 규칙(lib/ledger-grammar)을 모든 원장에 똑같이 적용한다.
 */
import { describe, expect, it } from 'vitest';
import type { SheetCol } from '@/components/ui';
import { checkRowGrammar, CLASS_LABEL, STATUS_LABEL } from '@/lib/ledger-grammar';
import { LEDGER_LABEL } from '@/lib/ledger-labels';
import { FLEET_BASIC_COLS } from '@/lib/sheet-cols';
import {
  ASSET_MASTER_BASIC_COLS, ASSET_MAINT_BASIC_COLS,
  CONTRACT_MASTER_BASIC_COLS, SCHEDULE_LEDGER_COLS,
} from '@/lib/master-ledger-cols';
import { RISK_BASIC_COLS } from '@/lib/risk-cols';
import { RECEIVABLE_BASIC_COLS } from '@/lib/receivables-cols';
import { WORK_BASIC_COLS, PENALTY_BASIC_COLS } from '@/lib/work-cols';
import { AGENDA_BASIC_COLS } from '@/lib/agenda-cols';
import { STAFF_COLS } from '@/lib/staff-cols';

/* eslint-disable @typescript-eslint/no-explicit-any */
const LEDGERS: Array<[string, SheetCol<any>[]]> = [
  ['운영현황', FLEET_BASIC_COLS],
  ['자산', ASSET_MASTER_BASIC_COLS],
  ['정비', ASSET_MAINT_BASIC_COLS],
  ['계약', CONTRACT_MASTER_BASIC_COLS],
  ['회차', SCHEDULE_LEDGER_COLS],
  ['리스크', RISK_BASIC_COLS],
  ['미수', RECEIVABLE_BASIC_COLS],
  ['업무', WORK_BASIC_COLS],
  ['과태료', PENALTY_BASIC_COLS],
  ['일정', AGENDA_BASIC_COLS],
  ['임직원', STAFF_COLS],
];

const labelOf = (c: SheetCol<any>) => (typeof c.label === 'string' ? c.label : '');

describe('행문법', () => {
  it.each(LEDGERS)('%s 기본보기가 행문법을 지킨다', (name, cols) => {
    const bad = checkRowGrammar(cols);
    expect(bad, `${name}:\n  ${bad.join('\n  ')}\n  실제 순서: ${cols.map((c) => labelOf(c)).join(' · ')}`).toEqual([]);
  });

  it('1번 칸은 어느 원장에서나 회사명이다', () => {
    for (const [name, cols] of LEDGERS) {
      expect(cols[0].key, name).toBe('company');
      expect(labelOf(cols[0]), name).toBe(LEDGER_LABEL.company);
    }
  });

  it('분류·상태 라벨은 원장 이름을 접두로 갖는다 — 맨 「분류」·「상태」 금지', () => {
    const bare: string[] = [];
    for (const [name, cols] of LEDGERS) {
      for (const c of cols) {
        const l = labelOf(c);
        if ((CLASS_LABEL.test(l) || STATUS_LABEL.test(l)) && (l === '분류' || l === '상태')) {
          bare.push(`${name}.${c.key}=「${l}」`);
        }
      }
    }
    expect(bare, bare.join(' / ')).toEqual([]);
  });

  it('분류 바로 뒤가 상태다 — 쌍이 떨어지면 눈이 다시 찾는다', () => {
    for (const [name, cols] of LEDGERS) {
      const i = cols.findIndex((c) => CLASS_LABEL.test(labelOf(c)));
      expect(i, `${name}: 분류 칸 없음`).toBeGreaterThanOrEqual(0);
      expect(STATUS_LABEL.test(labelOf(cols[i + 1])), `${name}: ${labelOf(cols[i])} 뒤가 ${labelOf(cols[i + 1])}`).toBe(true);
    }
  });

  it('검사기 자체가 위반을 실제로 잡는다(헛돌지 않게)', () => {
    const fake = [
      { key: 'plate', label: '차량번호', render: () => null },
      { key: 'status', label: '자산상태', render: () => null },
      { key: 'lifecycle', label: '자산분류', render: () => null },
    ] as unknown as SheetCol<any>[];
    const bad = checkRowGrammar(fake);
    expect(bad.length).toBeGreaterThan(0);
    expect(bad.join(' ')).toContain('company');
  });
});
