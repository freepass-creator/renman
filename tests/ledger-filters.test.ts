/**
 * 세부필터 규격 게이트.
 *
 * ## 규칙
 *   R1. **기본보기 4·5번 칸(X분류·X상태)은 세부필터에 있어야 한다.**
 *       표에 보이는 축인데 거를 수 없으면 «눈으로 훑어라»가 된다.
 *       실제로 운영현황은 자산분류·자산상태 둘 다, 자산은 자산분류가 빠져 있었다(2026-08-07).
 *   R2. **회사는 세부필터에 넣지 않는다.** `LedgerFrame` 이 필터줄에 `CompanyFilter` 를 항상
 *       그린다(components/ui/ledger-frame). 세부필터에 또 넣으면 같은 것을 통제하는 손잡이가
 *       둘이 되고, 하나는 세션 범위를 하나는 표시명을 거른다 — 서로 어긋난다.
 *       (리스크에 잠깐 넣었다가 이 이유로 되돌렸다.)
 *   R3. 필터 라벨도 사전(LEDGER_LABEL) 어휘를 따른다 — 같은 축을 표와 필터가 달리 부르면 안 된다.
 *
 * ## 대상
 *   세부필터 패널(LedgerFilterFields)을 쓰는 원장만. 미수(/receivables)는 FacetRail 이라는
 *   다른 방식을 쓰므로 제외한다 — 방식이 다른 것이지 빠진 것이 아니다.
 */
import { describe, expect, it } from 'vitest';
import type { SheetCol } from '@/components/ui';
import {
  ASSET_FILTER_DEFS, CONTRACT_FILTER_DEFS, FLEET_FILTER_DEFS,
  RISK_FILTER_DEFS, WORK_FILTER_DEFS, type LedgerFilterFieldDef,
} from '@/lib/ledger-filter-defs';
import { LEDGER_LABEL } from '@/lib/ledger-labels';
import { FLEET_BASIC_COLS } from '@/lib/sheet-cols';
import { ASSET_MASTER_BASIC_COLS, CONTRACT_MASTER_BASIC_COLS } from '@/lib/master-ledger-cols';
import { RISK_BASIC_COLS } from '@/lib/risk-cols';
import { WORK_BASIC_COLS, PENALTY_BASIC_COLS } from '@/lib/work-cols';

/* eslint-disable @typescript-eslint/no-explicit-any */
const PANELS: Array<[string, SheetCol<any>[], LedgerFilterFieldDef[]]> = [
  ['운영현황', FLEET_BASIC_COLS, FLEET_FILTER_DEFS],
  ['자산', ASSET_MASTER_BASIC_COLS, ASSET_FILTER_DEFS],
  ['계약', CONTRACT_MASTER_BASIC_COLS, CONTRACT_FILTER_DEFS],
  ['리스크', RISK_BASIC_COLS, RISK_FILTER_DEFS],
  ['업무', WORK_BASIC_COLS, WORK_FILTER_DEFS],
  ['과태료', PENALTY_BASIC_COLS, WORK_FILTER_DEFS],
];

const labelOf = (c: SheetCol<any>) => (typeof c.label === 'string' ? c.label : '');

describe('세부필터 규격', () => {
  it.each(PANELS)('%s — 기본보기 분류·상태 축을 필터로 거를 수 있다', (name, cols, defs) => {
    const want = [labelOf(cols[3]), labelOf(cols[4])];   // 4·5번 칸 = X분류 · X상태
    const have = defs.map((d) => d.label);
    const missing = want.filter((w) => w && !have.includes(w));
    expect(
      missing,
      `${name}: 표에 「${missing.join('·')}」가 보이는데 필터에 없다.\n  현재 필터: ${have.join(' · ')}`,
    ).toEqual([]);
  });

  it('회사는 세부필터에 넣지 않는다 — CompanyFilter 가 유일한 회사 통제다', () => {
    const bad: string[] = [];
    for (const [name, , defs] of PANELS) {
      for (const d of defs) {
        if (d.key === 'company' || d.label === LEDGER_LABEL.company) bad.push(`${name}.${d.key}`);
      }
    }
    expect(bad, `세부필터에 회사가 있다(중복 통제): ${bad.join(', ')}`).toEqual([]);
  });

  it('필터 라벨은 사전 어휘를 따른다 — 표와 필터가 같은 축을 달리 부르지 않는다', () => {
    const dict = new Map(Object.entries(LEDGER_LABEL) as Array<[string, string]>);
    const drift: string[] = [];
    for (const [name, , defs] of PANELS) {
      for (const d of defs) {
        const expected = dict.get(d.key);
        if (expected && d.label !== expected) drift.push(`${name}.${d.key}: 「${d.label}」 ≠ 사전 「${expected}」`);
      }
    }
    expect(drift, drift.join('\n  ')).toEqual([]);
  });

  it('필터 key 는 원장 안에서 중복되지 않는다', () => {
    for (const [name, , defs] of PANELS) {
      const keys = defs.map((d) => d.key);
      expect(new Set(keys).size, `${name}: ${keys.join(',')}`).toBe(keys.length);
    }
  });
});
