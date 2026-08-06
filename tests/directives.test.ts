/**
 * 지시(자동 업무) 엔진 — `lib/directives.ts`.
 * 규격 = `docs/PLAN-work-autogen.md` §8. 「조건이 업무를 낳되, 좀비도 중복도 생기지 않는다」를 지킨다.
 */
import { describe, it, expect } from 'vitest';
import type { AgendaItem } from '@/lib/agenda';
import type { EntityRecord } from '@/lib/intake/entities';
import {
  DIRECTIVE_CATEGORY, isSnoozed, materializePatch, parseSourceKey,
  reconcileDirectives, reschedulePatch, snoozeDate, sourceKeyOf,
} from '@/lib/directives';
import { workDivisionOf } from '@/lib/work-taxonomy';
import { workGroup } from '@/lib/work-ledger';

const TODAY = '2026-08-07';

function agenda(over: Partial<AgendaItem> = {}): AgendaItem {
  return {
    key: 'k', date: '2026-09-01', dday: 25, kind: '검사만기', status: '예정',
    plate: '12가3456', title: '아반떼', companyId: 'switchplan', company: '스위치', tone: 'green',
    refKey: 'veh_1',
    ...over,
  };
}

/** 실체화된 자동업무를 흉내 — store가 붙이는 `_key`(= workId)까지 포함. */
function autoWork(sourceKey: string, over: Partial<EntityRecord> = {}): EntityRecord {
  return { _key: sourceKey, workId: sourceKey, sourceKey, autoSource: 'agenda', companyId: 'switchplan', status: '대기', ...over };
}

describe('근거키(sourceKey)', () => {
  it('대상+종류+기한으로 만들고 되읽을 수 있다', () => {
    const sk = sourceKeyOf(agenda());
    expect(sk).toBe('auto:검사만기:veh_1:2026-09-01');
    expect(parseSourceKey(sk)).toEqual({ kind: '검사만기', target: 'veh_1', date: '2026-09-01' });
  });

  it('손으로 만든 업무는 근거키로 인식하지 않는다', () => {
    expect(parseSourceKey('work_123')).toBeNull();
    expect(parseSourceKey('')).toBeNull();
    expect(parseSourceKey(undefined)).toBeNull();
  });

  it('refKey가 없으면 차량번호로 물러선다', () => {
    expect(sourceKeyOf(agenda({ refKey: undefined }))).toBe('auto:검사만기:12가3456:2026-09-01');
  });
});

describe('제안 생성', () => {
  it('종류마다 세부분류·대분류가 정해져 있다', () => {
    const kinds = ['반납·만기', '검사만기', '보험만기', '세금 만기'] as const;
    const got = reconcileDirectives(kinds.map((kind, i) => agenda({ kind, refKey: `r${i}` })), []);
    expect(got.proposals).toHaveLength(4);
    expect(got.proposals.map((p) => p.category).sort()).toEqual(['검사', '반납·정산', '보험', '자금'].sort());
    for (const p of got.proposals) {
      expect(p.division).toBe(workDivisionOf(p.category));
      // 세부값이 원장 그룹 판정을 통과해야 탭에서 사라지지 않는다(과거 '반납·정산'이 「기타」로 떨어졌다).
      expect(workGroup(p.category)).toBe(p.category);
    }
  });

  it('과태료는 제안하지 않는다 — penalty가 이미 업무원장의 원천이라 두 줄이 된다', () => {
    const got = reconcileDirectives([agenda({ kind: '과태료 기한', refKey: 'pen_1' })], []);
    expect(got.proposals).toHaveLength(0);
    expect(DIRECTIVE_CATEGORY['과태료 기한']).toBe('과태료');   // 매핑표에는 남아 있다
  });

  it('같은 근거가 두 번 들어와도 한 줄이다', () => {
    const got = reconcileDirectives([agenda(), agenda()], []);
    expect(got.proposals).toHaveLength(1);
  });

  it('우선순위는 어젠다 상태에서 파생한다', () => {
    const got = reconcileDirectives([
      agenda({ status: '어김', refKey: 'a' }),
      agenda({ status: '임박', refKey: 'b' }),
      agenda({ status: '예정', refKey: 'c' }),
    ], []);
    expect(got.proposals.map((p) => p.priority)).toEqual(['긴급', '높음', '보통']);
  });

  it('반납·만기만 계약키를 싣는다(자산 일에 계약키가 붙으면 계약 탭으로 샌다)', () => {
    const got = reconcileDirectives([
      agenda({ kind: '반납·만기', refKey: 'ctr_9' }),
      agenda({ kind: '검사만기', refKey: 'veh_9' }),
    ], []);
    const ret = got.proposals.find((p) => p.kind === '반납·만기');
    const insp = got.proposals.find((p) => p.kind === '검사만기');
    expect(ret?.contractKey).toBe('ctr_9');
    expect(insp?.contractKey).toBe('');
  });
});

describe('중복 방지 — 실체가 이긴다', () => {
  it('같은 근거키의 업무가 이미 있으면 제안하지 않는다', () => {
    const item = agenda();
    const got = reconcileDirectives([item], [autoWork(sourceKeyOf(item))]);
    expect(got.proposals).toHaveLength(0);
    expect(got.flags).toEqual({});
  });

  it('완료된 자동업무는 다시 제안하지 않는다(사람이 끝났다고 했다)', () => {
    const item = agenda();
    const got = reconcileDirectives([item], [autoWork(sourceKeyOf(item), { status: '완료' })]);
    expect(got.proposals).toHaveLength(0);
  });

  it('손으로 만든 업무는 어떤 판정에도 걸리지 않는다', () => {
    const manual: EntityRecord = { _key: 'w1', workId: 'w1', category: '검사', plate: '12가3456', status: '대기' };
    const got = reconcileDirectives([agenda()], [manual]);
    expect(got.proposals).toHaveLength(1);       // 손 업무가 있어도 제안은 따로 뜬다
    expect(got.flags).toEqual({});               // 손 업무에 표식을 붙이지 않는다
  });
});

describe('기한 변경', () => {
  it('미완료 자동업무의 기한만 바뀌면 새로 만들지 않고 「기한변경」으로 표시한다', () => {
    const old = autoWork('auto:검사만기:veh_1:2026-09-01');
    const got = reconcileDirectives([agenda({ date: '2026-11-30' })], [old]);
    expect(got.proposals).toHaveLength(0);
    expect(got.flags['auto:검사만기:veh_1:2026-09-01']).toEqual({
      flag: '기한변경', nextDue: '2026-11-30', nextSourceKey: 'auto:검사만기:veh_1:2026-11-30',
    });
  });

  it('반영 patch는 기한·근거키만 바꾼다 — workId(문서ID)는 그대로다', () => {
    const flag = { flag: '기한변경', nextDue: '2026-11-30', nextSourceKey: 'auto:검사만기:veh_1:2026-11-30' } as const;
    const patch = reschedulePatch(flag);
    expect(patch).toEqual({ dueDate: '2026-11-30', sourceKey: 'auto:검사만기:veh_1:2026-11-30' });
    expect(patch.workId).toBeUndefined();
  });

  it('스누즈(보류) 중이어도 기한 변경은 따라간다 — 보류는 종결이 아니다', () => {
    const old = autoWork('auto:검사만기:veh_1:2026-09-01', { status: '보류', snoozeUntil: '2026-08-14' });
    const got = reconcileDirectives([agenda({ date: '2026-11-30' })], [old]);
    expect(got.flags['auto:검사만기:veh_1:2026-09-01']?.flag).toBe('기한변경');
  });

  it('완료된 자동업무는 건드리지 않고 다음 회차를 새로 제안한다', () => {
    const done = autoWork('auto:검사만기:veh_1:2026-09-01', { status: '완료' });
    const got = reconcileDirectives([agenda({ date: '2027-09-01' })], [done]);
    expect(got.flags).toEqual({});
    expect(got.proposals).toHaveLength(1);
    expect(got.proposals[0].sourceKey).toBe('auto:검사만기:veh_1:2027-09-01');
  });
});

describe('근거 소멸', () => {
  it('어젠다에서 사라진 미완료 자동업무는 「근거소멸」로 표시하되 자동 종결하지 않는다', () => {
    const orphan = autoWork('auto:검사만기:veh_1:2026-09-01');
    const got = reconcileDirectives([], [orphan]);
    expect(got.flags['auto:검사만기:veh_1:2026-09-01']).toEqual({ flag: '근거소멸' });
    expect(orphan.status).toBe('대기');   // 엔진이 상태를 바꾸지 않는다(순수)
  });

  it('완료된 자동업무는 근거가 없어도 표식을 붙이지 않는다', () => {
    const got = reconcileDirectives([], [autoWork('auto:검사만기:veh_1:2026-09-01', { status: '완료' })]);
    expect(got.flags).toEqual({});
  });
});

describe('스누즈', () => {
  it('다시 보기 날짜가 미래면 접어 둔다', () => {
    expect(isSnoozed({ snoozeUntil: '2026-08-14' }, TODAY)).toBe(true);
    expect(isSnoozed({ snoozeUntil: '2026-08-07' }, TODAY)).toBe(false);   // 당일이면 다시 보인다
    expect(isSnoozed({ snoozeUntil: '2026-08-01' }, TODAY)).toBe(false);
    expect(isSnoozed({}, TODAY)).toBe(false);
  });

  it('스누즈 종료일은 날짜 연산이라 TZ에 흔들리지 않는다', () => {
    expect(snoozeDate(TODAY, 7)).toBe('2026-08-14');
    expect(snoozeDate('2026-08-28', 7)).toBe('2026-09-04');
    expect(snoozeDate('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('실체화 레코드', () => {
  it('workId = 근거키 — 다시 저장해도 같은 문서다', () => {
    const [p] = reconcileDirectives([agenda()], []).proposals;
    const rec = materializePatch(p, TODAY);
    expect(rec.workId).toBe(p.sourceKey);
    expect(rec.sourceKey).toBe(p.sourceKey);
    expect(rec.autoSource).toBe('agenda');
    expect(rec.category).toBe('검사');
    expect(rec.dueDate).toBe('2026-09-01');
    expect(rec.status).toBe('대기');
  });

  it('patch로 담당·스누즈를 덮어쓸 수 있다', () => {
    const [p] = reconcileDirectives([agenda()], []).proposals;
    const rec = materializePatch(p, TODAY, { status: '보류', snoozeUntil: '2026-08-14', assigneeName: '김실장' });
    expect(rec.status).toBe('보류');
    expect(rec.assigneeName).toBe('김실장');
    // 실체화한 것을 다시 엔진에 넣으면 제안이 사라진다(왕복 확인)
    const back = reconcileDirectives([agenda()], [{ ...rec, _key: String(rec.workId) }]);
    expect(back.proposals).toHaveLength(0);
  });

  it('금액을 모르는 근거는 amount를 만들어내지 않는다', () => {
    const [p] = reconcileDirectives([agenda({ kind: '세금 만기', amount: undefined })], []).proposals;
    expect(materializePatch(p, TODAY).amount).toBeUndefined();
  });
});
