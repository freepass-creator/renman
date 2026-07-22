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
const MASTER_EMAIL = 'pyh@teamjpk.com'; // firestore.rules isMaster()와 동일 유지

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
    await setDoc(doc(db, 'period_locks', 'C1'), { companyId: 'C1', month: '2026-06' });
    await setDoc(doc(db, 'audit_logs', 'a1'), { companyId: 'C1', byUid: 'staffA', action: 'update' });
  });
});

// ctx 헬퍼
const staffA = () => env.authenticatedContext('staffA').firestore();
const staffB = () => env.authenticatedContext('staffB').firestore();
const hq = () => env.authenticatedContext('hq').firestore();
const master = () => env.authenticatedContext('master', { email: MASTER_EMAIL }).firestore();

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

describe('마스터 이메일 — 현행 동작 문서화(⚠ P0-2: 추후 Custom Claims로 이관 예정)', () => {
  test('master 이메일 계정: users 문서 없이도 본사 권한(타사 계약 읽기) → 허용', async () => {
    await assertSucceeds(getDoc(doc(master(), 'contracts', 'c1')));
    await assertSucceeds(getDoc(doc(master(), 'contracts', 'c2')));
  });
});
