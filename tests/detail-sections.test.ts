import { describe, expect, it } from 'vitest';
import { DETAIL_SECTIONS, sectionDefs } from '@/lib/detail-sections';
import { FLEET_DETAIL_DEFS } from '@/lib/sheet-cols';
import { ASSET_DETAIL_DEFS, CONTRACT_DETAIL_DEFS } from '@/lib/master-ledger-cols';
import { RISK_DETAIL_DEFS } from '@/lib/risk-cols';
import { agendaStatusLabel, riskDueSub } from '@/lib/risk-ledger';

const ALL_DEFS = [
  ['운영현황', FLEET_DETAIL_DEFS],
  ['자산', ASSET_DETAIL_DEFS],
  ['계약', CONTRACT_DETAIL_DEFS],
  ['리스크', RISK_DETAIL_DEFS],
] as const;

describe('세부패널 섹션 사전', () => {
  it('원장은 섹션 사전에 있는 이름만 쓴다 — 같은 주제가 페이지마다 다른 이름이 되면 안 된다', () => {
    for (const [name, defs] of ALL_DEFS) {
      for (const def of defs) {
        expect(DETAIL_SECTIONS, `${name} 「${def.title}」`).toContain(def.title);
      }
    }
  });

  it('섹션 순서는 어느 원장에서나 사전 순서를 따른다', () => {
    for (const [name, defs] of ALL_DEFS) {
      const order = defs.map((d) => DETAIL_SECTIONS.indexOf(d.title as never));
      expect([...order].sort((a, b) => a - b), name).toEqual(order);
    }
  });

  it('금융과 보험은 다른 섹션이다 — 한 섹션에 합치지 않는다 (사장님 지시 2026-08-07)', () => {
    const fleet = FLEET_DETAIL_DEFS.map((d) => d.title);
    expect(fleet).toContain('금융');
    expect(fleet).toContain('보험');
    // 예전 합본 이름이 어디에도 남아 있으면 안 된다.
    for (const [, defs] of ALL_DEFS) {
      for (const def of defs) expect(def.title).not.toMatch(/금융·보험|금융·할부/);
    }
  });

  it('같은 주제는 원장이 달라도 같은 섹션에 담긴다 — 금융/보험은 운영·자산 양쪽에 있다', () => {
    for (const defs of [FLEET_DETAIL_DEFS, ASSET_DETAIL_DEFS]) {
      const titles = defs.map((d) => d.title);
      expect(titles).toContain('금융');
      expect(titles).toContain('보험');
    }
  });

  it('빈 배정은 섹션을 만들지 않고, open 은 하나만 열린다', () => {
    const defs = sectionDefs({ '보험': ['a'], '금융': [], '차량·상태': ['b'] });
    expect(defs.map((d) => d.title)).toEqual(['차량·상태', '보험']);
    expect(defs.filter((d) => d.open)).toHaveLength(1);
  });
});

describe('한 칸 한 원자 — 리스크', () => {
  it('기한 보조표시는 날짜와 D-day 를 이어 붙이지 않는다', () => {
    expect(riskDueSub({ dueDate: '2026-04-22', dday: -6 })).toBe('2026-04-22');
    expect(riskDueSub({ dueDate: '', dday: -6 })).toBe('D+6');
    expect(riskDueSub({ dueDate: '', dday: null })).not.toContain('·');
  });

  it('리스크상태는 내부 용어 「어김」을 그대로 내보내지 않는다', () => {
    for (const kind of ['검사만기', '보험만기', '세금 만기', '과태료 기한', '반납·만기', '알 수 없음']) {
      for (const over of [true, false]) {
        const label = agendaStatusLabel(kind, over);
        expect(label).not.toBe('어김');
        expect(label).not.toBe('임박');
        expect(label.length).toBeGreaterThan(0);
      }
    }
    expect(agendaStatusLabel('검사만기', true)).toBe('검사 경과');
    expect(agendaStatusLabel('반납·만기', false)).toBe('반납 임박');
  });
});
