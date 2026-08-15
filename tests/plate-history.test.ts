/**
 * 차량번호 변경(임판 → 정식번호) 승계 — 오픈 전 필수 가드.
 *
 * 왜 테스트하는가: 차량 자연키가 plate이고 계약·정비·과태료가 «번호»로 차량을 찾는다.
 *   번호를 바꿀 때 옛 번호를 plateHistory에 쌓지 않으면 그 차에 붙어 있던 모든 건이 떨어져 나가고,
 *   재투입 시 같은 차가 2대로 갈라진다. 오픈 후에는 수동 병합밖에 없어 사실상 복구 불가.
 */
import { describe, test, expect } from 'vitest';
import { vehicleMatchesPlate, findVehicleByPlate, normPlate, plateAliasesOf, plateAliasesFor, inPlateAliases, scopedPlateKey } from '@/lib/plate';

/** lib/store.ts carryPlateHistory 와 동일 규약(승계 결과 형태)을 검증용으로 재현. */
function carry(before: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  if (!('plate' in patch)) return {};
  const oldPlate = String(before.plate ?? '');
  const newPlate = String(patch.plate ?? '');
  if (!oldPlate || !newPlate || normPlate(oldPlate) === normPlate(newPlate)) return {};
  const prior = Array.isArray(before.plateHistory) ? before.plateHistory.map((h) => String(h)) : [];
  if (prior.some((h) => normPlate(h) === normPlate(oldPlate))) return {};
  return { plateHistory: [...prior, oldPlate] };
}

describe('차량번호 변경 이력 승계', () => {
  test('전체 법인 조인 키는 같은 번호판도 법인별로 분리한다', () => {
    expect(scopedPlateKey('A', '12가 3456')).toBe('A::12가3456');
    expect(scopedPlateKey('A', '12가3456')).not.toBe(scopedPlateKey('B', '12가3456'));
  });
  test('임판 → 정식번호: 옛 번호가 이력에 쌓인다', () => {
    const before = { plate: '01가1234' };
    expect(carry(before, { plate: '123가4567' })).toEqual({ plateHistory: ['01가1234'] });
  });

  test('같은 번호 재저장은 이력을 늘리지 않는다', () => {
    expect(carry({ plate: '123가4567' }, { plate: '123가4567' })).toEqual({});
    // 공백·O/0 표기차도 같은 번호로 본다(normPlate)
    expect(carry({ plate: '123가4567' }, { plate: '123가 4567' })).toEqual({});
  });

  test('plate를 건드리지 않는 수정은 이력에 관여하지 않는다', () => {
    expect(carry({ plate: '123가4567' }, { status: '운행' })).toEqual({});
  });

  test('번호 원복 시 중복 적재하지 않는다', () => {
    const before = { plate: '99나9999', plateHistory: ['01가1234'] };
    expect(carry(before, { plate: '01가1234' })).toEqual({ plateHistory: ['01가1234', '99나9999'] });
    // 이미 이력에 있는 번호로 되돌리는 경우
    const back = { plate: '01가1234', plateHistory: ['01가1234', '99나9999'] };
    expect(carry(back, { plate: '99나9999' })).toEqual({});
  });

  test('이력이 쌓이면 옛 번호로도 그 차가 찾아진다(계약·정비 유실 방지)', () => {
    const v = { plate: '123가4567', plateHistory: ['01가1234'] };
    expect(vehicleMatchesPlate(v, '01가1234')).toBe(true);   // 옛 번호로 걸린 계약
    expect(vehicleMatchesPlate(v, '123가4567')).toBe(true);  // 현재 번호
    expect(vehicleMatchesPlate(v, '777다7777')).toBe(false);
    expect(findVehicleByPlate([v], '01가1234')).toBe(v);
  });

  test('이력이 없으면 옛 번호로 못 찾는다 — 승계가 없을 때의 실제 피해', () => {
    const v = { plate: '123가4567' };
    expect(vehicleMatchesPlate(v, '01가1234')).toBe(false);
  });
});

describe('재투입 별칭 dedup — 번호 바뀐 차가 2대로 갈라지지 않는다', () => {
  /** lib/store.ts FirestoreAdapter.save 의 plateAliases 판정과 동일 규약. */
  function aliasesOf(existing: Array<Record<string, unknown>>): Set<string> {
    const out = new Set<string>();
    for (const r of existing) {
      const hist = Array.isArray(r.plateHistory) ? r.plateHistory : [];
      for (const cand of [r.plate, ...hist]) {
        const n = normPlate(cand);
        if (n) out.add(n);
      }
    }
    return out;
  }

  test('정식번호로 다시 투입해도 이미 있는 차로 인식', () => {
    const aliases = aliasesOf([{ plate: '123가4567', plateHistory: ['01가1234'] }]);
    expect(aliases.has(normPlate('123가4567'))).toBe(true);
    expect(aliases.has(normPlate('01가1234'))).toBe(true);   // 옛 번호로 들어온 시트도 흡수
    expect(aliases.has(normPlate('777다7777'))).toBe(false); // 진짜 새 차는 통과
  });
});

describe('별칭 조인 — 이력을 쌓아도 «조회»가 보지 않으면 의미가 없다', () => {
  const v = { _key: '01가1234', plate: '123가4567', plateHistory: ['01가1234'] };

  test('plateAliasesOf: 현재 번호 + 이력 전부', () => {
    const a = plateAliasesOf(v);
    expect(a.has(normPlate('123가4567'))).toBe(true);
    expect(a.has(normPlate('01가1234'))).toBe(true);
    expect(a.size).toBe(2);
  });

  test('plateAliasesOf: 차량이 없으면 빈 집합', () => {
    expect(plateAliasesOf(null).size).toBe(0);
    expect(plateAliasesOf(undefined).size).toBe(0);
  });

  test('plateAliasesFor: 옛 번호로 찾아도 별칭 전부가 나온다', () => {
    const a = plateAliasesFor([v], '01가1234');
    expect(a.has(normPlate('123가4567'))).toBe(true);
    expect(a.has(normPlate('01가1234'))).toBe(true);
  });

  test('plateAliasesFor: 모르는 번호면 그 번호 하나만(오조인 방지)', () => {
    const a = plateAliasesFor([v], '777다7777');
    expect([...a]).toEqual([normPlate('777다7777')]);
  });

  test('★옛 번호로 걸린 계약·과태료가 별칭 조인으로 붙는다', () => {
    const aliases = plateAliasesOf(v);
    const contracts = [
      { plate: '01가1234', contractorName: '홍길동' },   // 임판 시절 계약
      { plate: '123가4567', contractorName: '김철수' },  // 정식번호 계약
      { plate: '777다7777', contractorName: '남의차' },
    ];
    const mine = contracts.filter((c) => inPlateAliases(aliases, c.plate));
    expect(mine.map((c) => c.contractorName)).toEqual(['홍길동', '김철수']);
  });

  test('정확 일치만 쓰면 옛 번호 계약이 사라진다 — 고치기 전의 실제 피해', () => {
    const np = normPlate(v.plate);
    const contracts = [{ plate: '01가1234' }, { plate: '123가4567' }];
    expect(contracts.filter((c) => normPlate(c.plate) === np)).toHaveLength(1);
  });
});
