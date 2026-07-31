/**
 * 행 문법 규격 — 전 표 화면의 «열 순서·라벨 쌍»을 코드로 못박는다.
 *
 * 기준(사장님 확정) = 자산관리:
 *     회사(1) · 식별자(2) · 이름(3) · 분류(4) · 상태(5) · 나머지
 *   어느 페이지를 가도 같은 위치에 같은 성격의 칸이 있어야 한다(«이 위치에 이 항목» 안정감).
 *   분류·상태 라벨은 «X분류 / X상태» 쌍이어야 하고 분류 바로 뒤에 상태가 온다.
 *
 * 이 테스트가 없으면 새 화면·새 컬럼이 추가될 때 규격이 조용히 어긋난다
 * (실제로 회차원장은 분류·상태가 6·7번, 일정은 회사 칸 라벨이 「표시명」으로 어긋나 있었다).
 */
import { describe, test, expect } from 'vitest';
import { ASSET_MASTER_BASIC_COLS, CONTRACT_MASTER_BASIC_COLS, SCHEDULE_LEDGER_COLS } from '@/lib/master-ledger-cols';
import { RISK_BASIC_COLS } from '@/lib/risk-cols';
import { WORK_BASIC_COLS, PENALTY_BASIC_COLS } from '@/lib/work-cols';
import { FLEET_BASIC_COLS } from '@/lib/sheet-cols';
import { CASH_BASIC_COLS } from '@/lib/finance/cash-cols';
import { ACCOUNT_BASIC_COLS } from '@/lib/finance/account-cols';
import { AGENDA_BASIC_COLS } from '@/lib/agenda-cols';
import { STAFF_COLS } from '@/lib/staff-cols';

type Col = { key: string; label?: string };

/** 화면별 기본뷰 — 라벨 배열. */
const SCREENS: Array<{ name: string; cols: readonly Col[] }> = [
  { name: '자산관리', cols: ASSET_MASTER_BASIC_COLS as readonly Col[] },
  { name: '계약관리', cols: CONTRACT_MASTER_BASIC_COLS as readonly Col[] },
  { name: '회차원장', cols: SCHEDULE_LEDGER_COLS as readonly Col[] },
  { name: '리스크관리', cols: RISK_BASIC_COLS as readonly Col[] },
  { name: '업무관리', cols: WORK_BASIC_COLS as readonly Col[] },
  { name: '과태료', cols: PENALTY_BASIC_COLS as readonly Col[] },
  { name: '운영현황', cols: FLEET_BASIC_COLS as readonly Col[] },
  { name: '자금관리', cols: CASH_BASIC_COLS as readonly Col[] },
  { name: '계좌', cols: ACCOUNT_BASIC_COLS as readonly Col[] },
  { name: '일정', cols: AGENDA_BASIC_COLS as readonly Col[] },
  { name: '직원(경영관리)', cols: STAFF_COLS as readonly Col[] },
];

const labelsOf = (cols: readonly Col[]) => cols.map((c) => String(c.label ?? c.key));

describe('행 문법 — 회사 칸은 항상 1번', () => {
  for (const { name, cols } of SCREENS) {
    test(`${name}: 첫 칸이 회사명`, () => {
      expect(labelsOf(cols)[0]).toBe('회사명');
    });
  }
});

describe('행 문법 — 분류(4)·상태(5)가 같은 자리, 분류 바로 뒤에 상태', () => {
  for (const { name, cols } of SCREENS) {
    test(`${name}: 4번=X분류 · 5번=X상태`, () => {
      const labels = labelsOf(cols);
      expect(labels.length).toBeGreaterThanOrEqual(5);
      // 실패 시 어느 화면이 어떻게 어긋났는지 바로 보이게 전체 순서를 함께 노출
      expect({ 화면: name, 순서: labels.slice(0, 6), 분류: labels[3], 상태: labels[4] }).toMatchObject({
        분류: expect.stringMatching(/분류$/),
        상태: expect.stringMatching(/상태$/),
      });
    });

    test(`${name}: 분류·상태 라벨이 같은 접두어 쌍`, () => {
      const labels = labelsOf(cols);
      const prefixCls = labels[3].replace(/분류$/, '');
      const prefixSt = labels[4].replace(/상태$/, '');
      // 예: 자산분류/자산상태 · 리스크분류/리스크상태. 「구분」·「세부」·「이행」 같은 모호한 라벨 금지.
      expect({ 화면: name, 분류: labels[3], 상태: labels[4], 접두어: [prefixCls, prefixSt] })
        .toMatchObject({ 접두어: [prefixCls, prefixCls] });
      expect(prefixSt).toBe(prefixCls);
    });
  }
});

describe('행 문법 — 「대상」 같은 모호한 신원 칸을 두지 않는다', () => {
  const BANNED = ['대상', '구분', '세부', '종류', '이행', '표시명', '유형', '상태', '분류'];
  for (const { name, cols } of SCREENS) {
    test(`${name}: 모호한 라벨 없음`, () => {
      const bad = labelsOf(cols).filter((l) => BANNED.includes(l));
      expect({ 화면: name, 위반라벨: bad }).toMatchObject({ 위반라벨: [] });
    });
  }
});

describe('행 문법 — 신원 칸(2·3번)은 실제 식별자여야 한다', () => {
  // 식별자·이름 슬롯에 «분류·상태·금액·날짜»가 오면 안 된다.
  for (const { name, cols } of SCREENS) {
    test(`${name}: 2·3번이 신원 성격`, () => {
      const labels = labelsOf(cols);
      const slots = [labels[1], labels[2]].filter(Boolean);
      // 날짜성 라벨만 잡는다 — 「이메일」처럼 '일'로 끝나는 신원 라벨을 오탐하지 않게.
      const bad = slots.filter((l) => /분류$|상태$|금액$|일자$|기한$|발생일$|위반일$|등록일$|만기$/.test(l));
      expect({ 화면: name, 신원슬롯: slots, 위반: bad }).toMatchObject({ 위반: [] });
    });
  }
});

describe('표에서는 2줄 셀(TwoLineCell)을 쓰지 않는다', () => {
  // 행 높이가 --ledger-row-h 로 고정이고 B2B 표는 조밀해야 읽힌다.
  // 가려질 정보는 2줄로 숨기지 말고 각자의 컬럼으로 내보낸다.
  test('열 카탈로그가 TwoLineCell 을 import 하지 않는다', async () => {
    const { readFileSync } = await import('node:fs');
    const files = [
      'lib/risk-cols.tsx', 'lib/work-cols.tsx', 'lib/sheet-cols.tsx', 'lib/agenda-cols.tsx',
      'lib/master-ledger-cols.tsx', 'lib/staff-cols.tsx',
      'lib/finance/cash-cols.tsx', 'lib/finance/account-cols.tsx',
    ];
    const offenders = files.filter((f) => readFileSync(f, 'utf8').includes('TwoLineCell'));
    expect({ 위반파일: offenders }).toMatchObject({ 위반파일: [] });
  });
});
