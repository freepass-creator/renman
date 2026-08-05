import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MONEY_ENTITIES, isMoneyEntity, findCreateOnlyConflicts, moneyConflictMessage } from '@/lib/finance/immutable-money';

const route = readFileSync(join(process.cwd(), 'app', 'api', 'entities', '[entity]', 'route.ts'), 'utf8');

describe('자금 원자 create-only', () => {
  it('대상은 통장·카드 거래뿐 — 다른 엔티티는 임포트 덮어쓰기가 정상 경로다', () => {
    expect([...MONEY_ENTITIES].sort()).toEqual(['bank_tx', 'card_tx']);
    expect(isMoneyEntity('bank_tx')).toBe(true);
    expect(isMoneyEntity('vehicle')).toBe(false);
  });

  it('이미 저장된 문서 ID = 충돌 (덮어쓰기 시도)', () => {
    const conflicts = findCreateOnlyConflicts(['co__a', 'co__b'], ['co__b']);
    expect(conflicts).toEqual(['co__b']);
  });

  it('새 건만 있으면 충돌 없음', () => {
    expect(findCreateOnlyConflicts(['co__a', 'co__b'], [])).toEqual([]);
    expect(findCreateOnlyConflicts(['co__a'], ['co__zzz'])).toEqual([]);
  });

  it('한 요청 안 같은 ID 중복도 충돌 — batch.create가 커밋에서 터지기 전에 잡는다', () => {
    expect(findCreateOnlyConflicts(['co__a', 'co__a'], [])).toEqual(['co__a']);
  });

  it('충돌 목록은 정렬·중복 제거', () => {
    expect(findCreateOnlyConflicts(['co__b', 'co__a', 'co__b'], ['co__a', 'co__b'])).toEqual(['co__a', 'co__b']);
  });

  it('거부 사유는 걸린 거래를 3건까지 보여주고 나머지는 건수로', () => {
    expect(moneyConflictMessage(['a', 'b'])).toContain('(a, b)');
    const many = moneyConflictMessage(['a', 'b', 'c', 'd', 'e']);
    expect(many).toContain('(a, b, c 외 2건)');
  });
});

describe('엔티티 임포트 라우트 — 자금 쓰기 경계', () => {
  it('자금은 batch.create, 나머지만 batch.set', () => {
    expect(route).toContain('if (money) batch.create(ref, data);');
    expect(route).toContain('else batch.set(ref, data);');
    // set이 자금 경로로 다시 새지 않도록 — batch.set 호출은 이 한 곳뿐
    expect(route.match(/batch\.set\(/g) ?? []).toHaveLength(1);
  });

  it('커밋 전에 존재 여부를 선검사한다', () => {
    expect(route).toContain('db.getAll(');
    expect(route).toContain('findCreateOnlyConflicts');
  });

  it('MONEY_ENTITIES는 라우트가 자체 정의하지 않고 SSOT에서 가져온다', () => {
    expect(route).toContain("from '@/lib/finance/immutable-money'");
    expect(route).not.toMatch(/const MONEY_ENTITIES\s*=/);
  });
});
