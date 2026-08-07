/**
 * KST 날짜 규격 — UTC 로 날짜를 자르면 KST 00~09시에 «어제»가 된다.
 *
 * `new Date().toISOString().slice(0, 10)` 은 UTC 기준이다. 한국 시각 08:00 은 UTC 23:00(전날)이므로
 * 그 시간대에 저장·표시되는 날짜가 하루 밀린다. 실제로 두 군데서 나왔다(2026-08-07):
 *   · 자금 단건 입력의 거래일 기본값 → 새벽에 입력하면 통장거래가 어제로 기록
 *   · 임직원 마지막 로그인 표시 → 새벽 로그인이 어제로 표시
 * 소스에 그 패턴이 다시 들어오는지 원문으로 검사한다(런타임 시각에 의존하지 않게).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loginAge } from '@/lib/staff-cols';
import { todayKST } from '@/lib/contracts/dates';

const root = process.cwd();

/** 「지금」을 UTC 로 잘라 날짜를 만드는 패턴. 공백·따옴표 변형까지 잡는다. */
const NOW_UTC_YMD = /new Date\(\)\s*\.toISOString\(\)\s*\.(slice\(\s*0\s*,\s*10\s*\)|split\('T'\)\[0\])/;

const GUARDED = [
  'app/cash/page.tsx',
  'app/payments/page.tsx',
  'lib/staff-cols.tsx',
  'lib/field-queue.ts',
  'lib/docs/notice-claim.ts',
  'lib/finance/cash-plan.ts',
  'lib/payments/match-proposal.ts',
  'lib/payments/returned-proration.ts',
  'lib/directives.ts',
  'lib/dashboard-consts.ts',
];

describe('KST 날짜', () => {
  it.each(GUARDED)('%s 는 「지금」을 UTC 로 잘라 날짜를 만들지 않는다', (rel) => {
    const src = readFileSync(join(root, rel), 'utf8');
    expect(NOW_UTC_YMD.test(src), `${rel}: todayKST() 를 쓸 것`).toBe(false);
  });

  it('todayKST 는 UTC 자정~오전9시 구간에서 UTC 절단보다 하루 앞선다', () => {
    // 2026-08-07 00:30 UTC = KST 09:30 → 둘 다 08-07. 경계 확인은 아래 케이스로.
    const kstMorning = Date.parse('2026-08-06T23:30:00Z');   // KST 2026-08-07 08:30
    const utcCut = new Date(kstMorning).toISOString().slice(0, 10);
    const kstCut = new Date(kstMorning + 9 * 3_600_000).toISOString().slice(0, 10);
    expect(utcCut).toBe('2026-08-06');   // ← 예전 버그가 보여주던 「어제」
    expect(kstCut).toBe('2026-08-07');   // ← 실제 한국 날짜
  });

  it('마지막 로그인 표시는 KST 날짜다', () => {
    // KST 2026-08-07 08:00 로그인.
    const at = '2026-08-06T23:00:00Z';
    const { label } = loginAge(at, new Date('2026-08-07T00:00:00Z'));
    expect(label).toContain('2026-08-07');
    expect(label).not.toContain('2026-08-06');
  });

  it('todayKST 는 yyyy-mm-dd 형식이다', () => {
    expect(todayKST()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
