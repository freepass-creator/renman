/**
 * 원장 «어휘» 정합 — 페이지끼리 같은지를 지키는 테스트.
 *
 * ★기존 tests/ledger-labels.test.ts 의 PAGE_VIEWS 는 «이 페이지가 안 바뀐다»만 지킨다.
 *   그래서 페이지끼리 어긋난 채로 고정될 수 있었다(운영 「금융·보험」 vs 자산 「금융·할부」,
 *   일정만 「차량」, 자산만 「차대번호(VIN)」, 운영만 「이율」 — 아무도 못 잡았다).
 *   여기서는 원장을 **가로질러** 본다:
 *     1) 같은 key 는 어디서나 같은 라벨인가
 *     2) 두 원장 이상이 쓰는 라벨이 사전(LEDGER_LABEL)에 등록돼 있는가
 *     3) 사전에 있는 용어를 원장이 제멋대로 바꿔 쓰지 않는가
 *   2)가 핵심이다 — 공유 라벨을 리터럴로 새로 박는 순간 빨간불이 뜨므로,
 *   「회사명」이 9군데에 따로 박히는 일이 구조적으로 다시 생기지 않는다.
 */
import { describe, expect, it } from 'vitest';
import type { SheetCol } from '@/components/ui';
import { LEDGER_LABEL, LEDGER_LABEL_VALUES } from '@/lib/ledger-labels';
import { FLEET_EXPANDED_COLS } from '@/lib/sheet-cols';
import {
  ASSET_MASTER_EXPANDED_COLS, ASSET_MAINT_EXPANDED_COLS,
  CONTRACT_MASTER_EXPANDED_COLS, SCHEDULE_LEDGER_ALL_COLS,
} from '@/lib/master-ledger-cols';
import { RISK_EXPANDED_COLS } from '@/lib/risk-cols';
import { RECEIVABLE_EXPANDED_COLS } from '@/lib/receivables-cols';
import { WORK_ALL_COLS, PENALTY_ALL_COLS } from '@/lib/work-cols';
import { AGENDA_EXPANDED_COLS } from '@/lib/agenda-cols';
import { STAFF_COLS } from '@/lib/staff-cols';

/* eslint-disable @typescript-eslint/no-explicit-any */
const LEDGERS: Array<[string, SheetCol<any>[]]> = [
  ['운영현황', FLEET_EXPANDED_COLS],
  ['자산', ASSET_MASTER_EXPANDED_COLS],
  ['정비', ASSET_MAINT_EXPANDED_COLS],
  ['계약', CONTRACT_MASTER_EXPANDED_COLS],
  ['회차', SCHEDULE_LEDGER_ALL_COLS],
  ['리스크', RISK_EXPANDED_COLS],
  ['미수', RECEIVABLE_EXPANDED_COLS],
  ['업무', WORK_ALL_COLS],
  ['과태료', PENALTY_ALL_COLS],
  ['일정', AGENDA_EXPANDED_COLS],
  ['임직원', STAFF_COLS],
];

/**
 * 같은 key 인데 원장마다 라벨이 다른 게 «정상»인 자리.
 * ★여기 넣을 때는 왜 다른지 반드시 적는다. 테스트를 통과시키려고 넣지 말 것.
 */
const KEY_EXEMPT = new Map<string, string>([
  // 라벨 규격 「X분류 / X상태」 — X 는 원장 이름이다(리스크분류·업무상태…).
  // 원장마다 접두가 달라야 «지금 무슨 표를 보는지»가 행에 남는다. 규격상 의도된 차이.
  ['status', '「X상태」 규격 — 원장 이름이 접두로 붙는다'],
  ['kind', '「X분류」 규격'],
  ['group', '「X구분」 규격'],
  ['category', '「X분류」 규격'],
  ['contractState', '운영=계약상태(계약의 상태) / 미수=미수분류(미수의 축) — 같은 값이지만 표의 축이 다르다'],
  // 원장마다 «무엇의» 제목·내용인지가 달라 접두가 붙는다(리스크내용·업무내용).
  ['subject', '「X내용」 규격'],
  ['title', '「X내용」 규격'],
  ['detail', '「X내용」 규격'],
  ['stage', '미수=회수단계 / 그 외 원장은 자기 단계축'],
  ['paid', '회차=납부액(그 회차에 낸 돈) / 미수=확인입금(은행 대사로 확인된 입금)'],
]);

function labelOf(col: SheetCol<any>): string {
  return typeof col.label === 'string' ? col.label : '';
}

describe('원장 어휘 정합', () => {
  it('같은 key 는 어느 원장에서나 같은 라벨이다', () => {
    const seen = new Map<string, Array<[string, string]>>();
    for (const [ledger, cols] of LEDGERS) {
      for (const col of cols) {
        const label = labelOf(col);
        if (!label || KEY_EXEMPT.has(col.key)) continue;
        seen.set(col.key, [...(seen.get(col.key) || []), [ledger, label]]);
      }
    }
    const drift = [...seen]
      .filter(([, list]) => new Set(list.map(([, l]) => l)).size > 1)
      .map(([key, list]) => `${key}: ${list.map(([p, l]) => `${p}=「${l}」`).join(' / ')}`);
    expect(drift, `같은 key를 다르게 부른다 — 사전(lib/ledger-labels)으로 올려라:\n  ${drift.join('\n  ')}`).toEqual([]);
  });

  it('두 원장 이상이 쓰는 라벨은 사전(LEDGER_LABEL)에 있다', () => {
    const users = new Map<string, Set<string>>();
    for (const [ledger, cols] of LEDGERS) {
      for (const col of cols) {
        const label = labelOf(col);
        if (!label) continue;
        users.set(label, (users.get(label) || new Set()).add(ledger));
      }
    }
    const orphans = [...users]
      .filter(([label, ledgers]) => ledgers.size > 1 && !LEDGER_LABEL_VALUES.has(label))
      .map(([label, ledgers]) => `「${label}」 (${[...ledgers].join('·')})`);
    expect(
      orphans,
      `공유 라벨이 리터럴로 박혔다 — lib/ledger-labels.ts 에 올리고 LEDGER_LABEL.* 로 참조:\n  ${orphans.join('\n  ')}`,
    ).toEqual([]);
  });

  it('사전에 있는 용어를 원장이 다르게 바꿔 쓰지 않는다', () => {
    // key 이름이 사전 key 와 같은 컬럼은 사전 값을 그대로 써야 한다.
    const dict = new Map(Object.entries(LEDGER_LABEL) as Array<[string, string]>);
    const drift: string[] = [];
    for (const [ledger, cols] of LEDGERS) {
      for (const col of cols) {
        if (KEY_EXEMPT.has(col.key)) continue;
        const expected = dict.get(col.key);
        const label = labelOf(col);
        if (expected && label && label !== expected) {
          drift.push(`${ledger}.${col.key}: 「${label}」 ≠ 사전 「${expected}」`);
        }
      }
    }
    expect(drift, drift.join('\n  ')).toEqual([]);
  });

  it('사전에 죽은 항목이 없다 — 아무도 안 쓰는 용어는 지운다', () => {
    const used = new Set<string>();
    for (const [, cols] of LEDGERS) for (const col of cols) used.add(labelOf(col));
    const dead = Object.entries(LEDGER_LABEL).filter(([, v]) => !used.has(v)).map(([k, v]) => `${k}=「${v}」`);
    expect(dead, `사전에만 있고 쓰이지 않는다:\n  ${dead.join('\n  ')}`).toEqual([]);
  });
});
