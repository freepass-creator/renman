/**
 * 마이그레이션 승인 경계 (P0-1) — 로컬/원격 혼합 승인 차단.
 *
 * 막는 것: Firebase 미연결이면 반영이 localStorage 에만 들어가는데 승인만 서버에 적히는 상태.
 * 그렇게 되면 오픈 판단이 «서버에 없는 데이터»의 승인 기록 위에 선다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MIGRATION_COLL, ACCEPTANCE_ENTITIES, isRemoteBackend, verifyAcceptance,
  acceptanceFailureMessage, baselineDocId, acceptanceDocId,
} from '@/lib/migrate/acceptance';

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');
const baselineRoute = read('app', 'api', 'migration-baseline', 'route.ts');
const acceptanceRoute = read('app', 'api', 'migration-acceptance', 'route.ts');
const rules = read('firestore.rules');
const reflect = read('lib', 'reflect.ts');

const counts = (over: Partial<{ vehicle: number; contract: number; insurance: number; bank_tx: number; count: number; sum: number }> = {}) => ({
  perEntity: {
    vehicle: over.vehicle ?? 163, contract: over.contract ?? 177,
    insurance: over.insurance ?? 118, bank_tx: over.bank_tx ?? 3639,
  },
  receipts: { count: over.count ?? 1948, sum: over.sum ?? 1_691_092_801 },
});

describe('저장 백엔드 판별 — 승인 POST 를 보내도 되는가', () => {
  it('firestore 만 원격', () => {
    expect(isRemoteBackend('firestore')).toBe(true);
  });
  it('로컬 미리보기는 원격이 아니다', () => {
    expect(isRemoteBackend('local(localStorage)')).toBe(false);
    expect(isRemoteBackend('')).toBe(false);
    expect(isRemoteBackend(undefined)).toBe(false);
  });
});

describe('승인 판정 — 서버 실물이 기준선에 미치는가', () => {
  it('숫자가 같으면 통과', () => {
    expect(verifyAcceptance(counts(), counts()).ok).toBe(true);
  });

  it('★한 엔티티라도 모자라면 거부 — 「넣었다는데 없다」', () => {
    const v = verifyAcceptance(counts(), counts({ contract: 176 }));
    expect(v.ok).toBe(false);
    expect(v.mismatches).toContainEqual({ what: 'contract', expected: 177, actual: 176 });
  });

  it('수납 건수가 모자라면 거부', () => {
    const v = verifyAcceptance(counts(), counts({ count: 1947 }));
    expect(v.ok).toBe(false);
    expect(v.mismatches.some((m) => m.what === '수납건수')).toBe(true);
  });

  it('수납 합계는 «많아도» 거부 — 금액이 늘어난 것도 설명이 필요하다', () => {
    expect(verifyAcceptance(counts(), counts({ sum: 1_691_092_802 })).ok).toBe(false);
    expect(verifyAcceptance(counts(), counts({ sum: 1_691_000_000 })).ok).toBe(false);
  });

  it('엔티티가 «많은» 것은 통과 — 반영 뒤 정상 입력을 막지 않는다', () => {
    expect(verifyAcceptance(counts(), counts({ vehicle: 164 })).ok).toBe(true);
  });

  it('거부 사유에 어긋난 항목이 그대로 들어간다', () => {
    const msg = acceptanceFailureMessage(verifyAcceptance(counts(), counts({ contract: 170 })));
    expect(msg).toContain('contract');
    expect(msg).toContain('177');
    expect(msg).toContain('170');
  });

  it('대조 대상은 원장 4종', () => {
    expect([...ACCEPTANCE_ENTITIES]).toEqual(['vehicle', 'contract', 'insurance', 'bank_tx']);
  });

  it('문서 ID 규약 — 기준선은 회사당 하나, 승인은 실행별', () => {
    expect(baselineDocId('switchplan')).toBe('switchplan__baseline');
    expect(acceptanceDocId('switchplan', 'run_abc')).toBe('switchplan__run_abc');
  });
});

describe('승인 라우트 — fail-closed 경계', () => {
  it('로컬 개발 액터를 명시적으로 거부한다(양쪽 라우트)', () => {
    expect(baselineRoute).toContain("actor.systemRole === 'local'");
    expect(acceptanceRoute).toContain("actor.systemRole === 'local'");
  });

  it('본사만 승인할 수 있다', () => {
    expect(baselineRoute).toContain("actor.systemRole !== 'hq'");
    expect(acceptanceRoute).toContain("actor.systemRole !== 'hq'");
  });

  it('★승인은 클라가 보낸 숫자가 아니라 서버가 센 실물로 판정한다', () => {
    expect(acceptanceRoute).toContain('countActual');
    expect(acceptanceRoute).toContain("db.collection(entity).where('companyId', '==', companyId)");
    // 클라 payload 는 회사·실행번호만 받는다 — 건수·합계를 받아 적으면 경계가 무의미해진다
    expect(acceptanceRoute).toMatch(/\{ companyId\?: string; runId\?: string \}/);
  });

  it('기준선이 없거나 실행번호가 다르면 승인하지 않는다', () => {
    expect(acceptanceRoute).toContain('기준선이 없어 승인할 수 없습니다');
    expect(acceptanceRoute).toContain('baseline.runId !== runId');
  });

  it('runId 는 서버가 발급한다 — 클라가 정하면 기록 없는 실행을 승인시킬 수 있다', () => {
    expect(baselineRoute).toContain('const runId = `run_${Date.now().toString(36)}');
    expect(baselineRoute).not.toContain('body?.runId');
  });

  it('승인 기록은 덮어쓰지 않는다(create-only)', () => {
    expect(acceptanceRoute).toMatch(/\.create\(acceptance\)/);
  });
});

describe('클라 가드 — 로컬 반영은 승인을 보내지 않는다', () => {
  it('reflect 가 백엔드를 확인한 뒤에만 POST 한다', () => {
    expect(reflect).toContain('isRemoteBackend(backend)');
    expect(reflect).toContain('/api/migration-baseline');
    expect(reflect).toContain('/api/migration-acceptance');
  });

  it('대조를 통과한 뒤에 승인을 남긴다 — 순서가 뒤집히면 검증 전 승인이 된다', () => {
    expect(reflect.indexOf('assertReceiptIntegrity(receipts)')).toBeGreaterThan(0);
    expect(reflect.indexOf('await recordAcceptance('))
      .toBeGreaterThan(reflect.indexOf('assertReceiptIntegrity(receipts)'));
  });
});

describe('firestore.rules — 승인 기록은 서버만 쓴다', () => {
  it('migration 컬렉션은 클라이언트 읽기·쓰기 전면 차단', () => {
    expect(rules).toMatch(/match \/migration\/\{docId\} \{\s*\n\s*allow read, write: if false;/);
  });

  it('범용 match 의 businessColl 에서도 제외된다 — OR 우회로 새지 않게', () => {
    expect(rules).toContain("&& coll != 'migration'");
  });

  it('컬렉션 이름은 코드와 규칙이 같은 값을 쓴다', () => {
    expect(MIGRATION_COLL).toBe('migration');
    expect(rules).toContain(`match /${MIGRATION_COLL}/{docId}`);
  });
});
