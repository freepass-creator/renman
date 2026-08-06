/**
 * Firestore Rules 보안 테스트 — 에뮬레이터 전용(Java 필요).
 * 실행: `npm run test:rules` (firebase emulators:exec 로 Firestore 에뮬레이터 부팅 → vitest).
 * 기본 `npm test`에서는 제외(vitest.config.ts 의 exclude). CI(.github/workflows)에서 Java+에뮬레이터로 실제 실행.
 *
 * 목표: 평가 P0-1(법인→본사 자기승격) 등 서버 권한 경계가 코드로 잠겨 회귀하지 않게 한다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { beforeAll, afterAll, beforeEach, describe, test } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const RULES = readFileSync(resolve(HERE, '../../firestore.rules'), 'utf8');

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, portStr] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({
    projectId: 'renman-rules-test',
    firestore: { rules: RULES, host, port: Number(portStr) },
  });
});
afterAll(async () => { await env?.cleanup(); });

// 매 테스트 전 규칙 우회로 기준 데이터 시드.
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'hq'),     { role: '본사', companyId: null });
    await setDoc(doc(db, 'users', 'staffA'), { role: '법인', companyId: 'C1' });
    await setDoc(doc(db, 'users', 'staffB'), { role: '법인', companyId: 'C2' });
    await setDoc(doc(db, 'contracts', 'c1'), { companyId: 'C1', status: '운행', renter: '홍길동' });
    await setDoc(doc(db, 'contracts', 'c2'), { companyId: 'C2', status: '운행', renter: '김철수' });
    await setDoc(doc(db, 'period_locks', 'C1'), {
      companyId: 'C1', month: '2026-06',
      map: { '2026-06': { closedAt: '2026-07-01T00:00:00Z', closedBy: 'hq' } },
    });
    // 자금거래 — 마감월(2026-06) / 미마감월(2026-07)
    await setDoc(doc(db, 'bank_tx', 'C1__t-closed'), { companyId: 'C1', txDate: '2026-06-15', amount: 1000 });
    await setDoc(doc(db, 'bank_tx', 'C1__t-open'),   { companyId: 'C1', txDate: '2026-07-15', amount: 1000 });
    await setDoc(doc(db, 'bank_tx', 'C2__t-open'),   { companyId: 'C2', txDate: '2026-06-15', amount: 1000 });
    await setDoc(doc(db, 'audit_logs', 'a1'), { companyId: 'C1', byUid: 'staffA', action: 'update' });
  });
});

// ctx 헬퍼
const staffA = () => env.authenticatedContext('staffA', { systemRole: 'tenant', companyId: 'C1' }).firestore();
const staffB = () => env.authenticatedContext('staffB', { systemRole: 'tenant', companyId: 'C2' }).firestore();
const hq = () => env.authenticatedContext('hq', { systemRole: 'hq' }).firestore();
const emailOnly = () => env.authenticatedContext('master', { email: 'pyh@teamjpk.com' }).firestore();
const claimsOnlyHq = () => env.authenticatedContext('claims-hq', { systemRole: 'hq' }).firestore();

describe('P0-1 권한상승 차단 — 법인은 자기 role을 본사로 못 바꾼다', () => {
  test('법인 staffA: role만 본사로 승격 시도 → 거부 (범용 match OR 우회 봉쇄)', async () => {
    await assertFails(updateDoc(doc(staffA(), 'users', 'staffA'), { role: '본사' }));
  });
  test('법인 staffA: companyId 유지 + role 본사 승격(원 공격 시나리오) → 거부', async () => {
    await assertFails(updateDoc(doc(staffA(), 'users', 'staffA'), { role: '본사', companyId: 'C1' }));
  });
  test('법인 staffA: 자기 users 문서 임의 필드 수정도 거부(update=본사만)', async () => {
    await assertFails(updateDoc(doc(staffA(), 'users', 'staffA'), { nickname: 'x' }));
  });
  test('본사 hq: 타 사용자 role 부여 → 허용', async () => {
    await assertSucceeds(updateDoc(doc(hq(), 'users', 'staffB'), { role: '본사' }));
  });
});

describe('테넌트 격리 — 법인은 자기 회사 문서만', () => {
  test('staffA: 자기 회사(C1) 계약 수정 → 허용 (정상 업무 쓰기 유지)', async () => {
    await assertSucceeds(updateDoc(doc(staffA(), 'contracts', 'c1'), { status: '반납' }));
  });
  test('staffA: 타 회사(C2) 계약 읽기 → 거부', async () => {
    await assertFails(getDoc(doc(staffA(), 'contracts', 'c2')));
  });
  test('staffA: 타 회사(C2) 계약 수정 → 거부', async () => {
    await assertFails(updateDoc(doc(staffA(), 'contracts', 'c2'), { status: '반납' }));
  });
  test('staffA: 계약을 타 회사(C2)로 이동(companyId 변경) → 거부', async () => {
    await assertFails(updateDoc(doc(staffA(), 'contracts', 'c1'), { companyId: 'C2' }));
  });
  test('staffB: 자기 회사(C2) 계약 수정 → 허용', async () => {
    await assertSucceeds(updateDoc(doc(staffB(), 'contracts', 'c2'), { status: '반납' }));
  });
});

describe('마감(period_locks) — 본사만 쓰기, 범용 우회 불가', () => {
  test('법인 staffA: 마감 문서 수정 시도 → 거부', async () => {
    await assertFails(updateDoc(doc(staffA(), 'period_locks', 'C1'), { month: '2026-07' }));
  });
  test('법인 staffA: 마감 문서 생성 시도 → 거부', async () => {
    await assertFails(setDoc(doc(staffA(), 'period_locks', 'C2'), { companyId: 'C2', month: '2026-07' }));
  });
  test('본사 hq: 마감 문서 쓰기 → 허용', async () => {
    await assertSucceeds(setDoc(doc(hq(), 'period_locks', 'C2'), { companyId: 'C2', month: '2026-07' }));
  });
});

describe('감사로그(audit_logs) — append-only, 위변조 불가', () => {
  test('staffA: 감사로그 수정 → 거부', async () => {
    await assertFails(updateDoc(doc(staffA(), 'audit_logs', 'a1'), { action: 'tamper' }));
  });
  test('staffA: 감사로그 삭제 → 거부', async () => {
    await assertFails(deleteDoc(doc(staffA(), 'audit_logs', 'a1')));
  });
  test('staffA: byUid=본인 감사로그 생성 → 허용', async () => {
    await assertSucceeds(setDoc(doc(staffA(), 'audit_logs', 'a2'), { companyId: 'C1', byUid: 'staffA', action: 'update' }));
  });
  test('staffA: byUid 위조(남의 uid) 감사로그 생성 → 거부', async () => {
    await assertFails(setDoc(doc(staffA(), 'audit_logs', 'a3'), { companyId: 'C1', byUid: 'staffB', action: 'update' }));
  });
});

describe('서버 전용 rate-limit 컬렉션', () => {
  test('본사 Claim이어도 클라이언트 조회·쓰기는 거부한다', async () => {
    await assertFails(getDoc(doc(hq(), '_api_rate_limits', 'ocr_x')));
    await assertFails(setDoc(doc(hq(), '_api_rate_limits', 'ocr_x'), {
      companyId: 'C1', count: 1, resetAt: Date.now(),
    }));
  });
});

describe('마이그레이션 기준선·승인(migration) — 서버 Admin 전용', () => {
  test('본사 Claim이어도 승인 기록을 직접 쓸 수 없다 — 로컬 반영을 «승인됨»으로 위장하는 경로 차단', async () => {
    await assertFails(setDoc(doc(hq(), 'migration', 'C1__run_forged'), {
      companyId: 'C1', runId: 'run_forged', acceptedBy: 'hq', acceptedAt: '2026-08-06T00:00:00Z',
    }));
    await assertFails(setDoc(doc(hq(), 'migration', 'C1__baseline'), {
      companyId: 'C1', runId: 'run_forged', perEntity: { contract: 0 },
    }));
  });
  test('조회도 거부 — 기대치·실제치가 곧 회사 규모 정보다', async () => {
    await assertFails(getDoc(doc(hq(), 'migration', 'C1__baseline')));
    await assertFails(getDoc(doc(staffA(), 'migration', 'C1__baseline')));
  });
  test('법인 사용자가 자기 회사 접두어로도 못 쓴다(범용 match 우회 차단)', async () => {
    await assertFails(setDoc(doc(staffA(), 'migration', 'C1__run_x'), { companyId: 'C1', runId: 'run_x' }));
  });
});

describe('관리회사 레지스트리(company_registry) — 서버 API 전용', () => {
  test('본사 Claim이어도 클라이언트 직접 조회·쓰기는 거부한다', async () => {
    await assertFails(getDoc(doc(hq(), 'company_registry', 'C1')));
    await assertFails(setDoc(doc(hq(), 'company_registry', 'C1'), {
      id: 'C1', label: '주식회사 임의변경', status: 'active',
    }));
  });
  test('법인 사용자도 자기 레지스트리를 직접 수정할 수 없다', async () => {
    await assertFails(setDoc(doc(staffA(), 'company_registry', 'C1'), {
      id: 'C1', label: '주식회사 임의변경', status: 'active',
    }));
  });
});

describe('가입(users create) — 셀프가입은 role/companyId 못 심는다', () => {
  test('신규 uid 셀프가입: role/companyId 없이 생성 → 허용', async () => {
    const u = env.authenticatedContext('newbie').firestore();
    await assertSucceeds(setDoc(doc(u, 'users', 'newbie'), { name: '신입', email: 'n@x.com' }));
  });
  test('신규 uid 셀프가입: role 심어서 생성 → 거부', async () => {
    const u = env.authenticatedContext('attacker').firestore();
    await assertFails(setDoc(doc(u, 'users', 'attacker'), { role: '본사' }));
  });
  test('신규 uid 셀프가입: companyId 심어서 생성 → 거부', async () => {
    const u = env.authenticatedContext('attacker2').firestore();
    await assertFails(setDoc(doc(u, 'users', 'attacker2'), { companyId: 'C1' }));
  });
});

describe('Custom Claims 권한 경계', () => {
  test('이메일만 일치하고 Claims가 없으면 본사 권한을 얻지 못한다', async () => {
    await assertFails(getDoc(doc(emailOnly(), 'contracts', 'c1')));
  });
  test('HQ Claim은 users 문서 없이도 전 법인 조회가 가능하다', async () => {
    await assertSucceeds(getDoc(doc(claimsOnlyHq(), 'contracts', 'c1')));
    await assertSucceeds(getDoc(doc(claimsOnlyHq(), 'contracts', 'c2')));
  });
});

describe('회계마감 서버 강제 — 마감월 자금거래는 아무도 못 고친다', () => {
  test('마감월(2026-06) bank_tx 수정 — 소속 법인도 거부', async () => {
    await assertFails(updateDoc(doc(staffA(), 'bank_tx', 'C1__t-closed'), { amount: 9_999 }));
  });
  test('마감월 bank_tx 수정 — 본사도 거부(마감 해제를 타야 한다)', async () => {
    await assertFails(updateDoc(doc(hq(), 'bank_tx', 'C1__t-closed'), { amount: 9_999 }));
  });
  test('마감월 bank_tx 하드삭제 — 본사도 거부', async () => {
    await assertFails(deleteDoc(doc(hq(), 'bank_tx', 'C1__t-closed')));
  });
  test('미마감월(2026-07) bank_tx 수정은 통과', async () => {
    await assertSucceeds(updateDoc(doc(staffA(), 'bank_tx', 'C1__t-open'), { amount: 2_000 }));
  });
  test('미마감월 거래를 마감월로 옮기는 것도 거부(마감월 유입 차단)', async () => {
    await assertFails(updateDoc(doc(staffA(), 'bank_tx', 'C1__t-open'), { txDate: '2026-06-20' }));
  });
  test('마감월 거래를 미마감월로 빼내는 것도 거부(마감월 유출 차단)', async () => {
    await assertFails(updateDoc(doc(staffA(), 'bank_tx', 'C1__t-closed'), { txDate: '2026-07-20' }));
  });
  test('마감은 법인별 — C2는 period_locks 문서가 없으므로 같은 월도 수정 가능', async () => {
    await assertSucceeds(updateDoc(doc(staffB(), 'bank_tx', 'C2__t-open'), { amount: 2_000 }));
  });
  test('마감과 무관한 컬렉션(contracts)은 영향 없음', async () => {
    await assertSucceeds(updateDoc(doc(staffA(), 'contracts', 'c1'), { renter: '홍길동2' }));
  });
});

describe('법인 마스터(company_master) — 본사만 쓰기, 범용 우회 불가', () => {
  test('소속 법인은 자기 회사 마스터를 읽을 수 있다', async () => {
    await assertSucceeds(getDoc(doc(staffA(), 'company_master', 'C1')));
  });
  test('타 법인 마스터는 읽을 수 없다', async () => {
    await assertFails(getDoc(doc(staffB(), 'company_master', 'C1')));
  });
  test('자기 법인 마스터는 쓸 수 있다 — 화면 권한(자기 법인 관리 가능)과 일치해야 한다', async () => {
    await assertSucceeds(setDoc(doc(staffA(), 'company_master', 'C1'), { companyId: 'C1', master: { ceo: '박용호' } }));
  });
  test('타 법인 마스터는 쓸 수 없다', async () => {
    await assertFails(setDoc(doc(staffB(), 'company_master', 'C1'), { companyId: 'C1', master: { ceo: '가짜대표' } }));
  });
  test('companyId 필드가 문서 경로와 다르면 거부(다른 회사로 위장 저장 차단)', async () => {
    await assertFails(setDoc(doc(staffA(), 'company_master', 'C1'), { companyId: 'C2', master: { ceo: '가짜대표' } }));
  });
  test('본사는 어느 법인이든 쓸 수 있다', async () => {
    await assertSucceeds(setDoc(doc(hq(), 'company_master', 'C2'), { companyId: 'C2', master: { ceo: '박용호' } }));
  });
});
