/**
 * 홈(업무) 계산층 회귀 — 근거키·시간축·실체화 결합. (design/home-inbox/SPEC.md §7)
 */
import { describe, expect, it } from 'vitest';
import type { HomeProblem } from '@/lib/home-problems';
import {
  buildHomeTasks, bucketOf, dueCell, filterHomeTasks, homeActionPatch, homeCategory, homeSummary,
  homeTaskRecord, homeWorkId, daysBetween,
} from '@/lib/home-work';

const TODAY = '2026-08-18';
function p(over: Partial<HomeProblem>): HomeProblem {
  return {
    id: 'r1', group: '차량', kind: '검사', status: '검사 경과', problem: '검사 만기 경과', action: '정기검사 예약',
    assignee: '미배정', company: 'JPK', companyId: 'jpk', plate: '12두4470', carName: '스타렉스', rawKind: '검사만기',
    who: '', dueDate: '2026-08-07', dday: -11, overdueDays: 0, amount: 0, href: '/vehicle/12두4470', urgent: true,
    ...over,
  };
}

describe('home-work', () => {
  it('근거키 = auto:{종류}:{대상}:{기한} · 미수는 회수 단계와 무관하게 «미납»', () => {
    expect(homeWorkId(p({}))).toBe('auto:검사만기:12두4470:2026-08-07');
    expect(homeWorkId(p({ group: '미수', kind: '내용증명', rawKind: '미수', dueDate: '2026-07-30' }))).toBe('auto:미납:12두4470:2026-07-30');
    expect(homeWorkId(p({ plate: '', id: 'risk-9', dueDate: '' }))).toBe('auto:검사만기:risk-9:nodue');
  });

  it('시간축은 dday 하나 — 미납은 언제나 지연', () => {
    expect(bucketOf(-1, '차량')).toBe('late');
    expect(bucketOf(0, '차량')).toBe('today');
    expect(bucketOf(7, '차량')).toBe('week');
    expect(bucketOf(8, '차량')).toBe('later');
    expect(bucketOf(30, '미수')).toBe('late');
    expect(bucketOf(null, '차량')).toBe('week');
  });

  it('업무분류 매핑', () => {
    expect(homeCategory(p({}))).toBe('검사');
    expect(homeCategory(p({ group: '미수' }))).toBe('수납이슈');
    expect(homeCategory(p({ rawKind: '만기경과' }))).toBe('반납·정산');
    expect(homeCategory(p({ rawKind: '자금미분류', group: '재무' }))).toBe('자금');
  });

  it('실체화 문서를 근거키로 잇는다 — 완료(오늘)=완료 섹션 · 완료(과거)=제외 · 보류=예정으로 이동 · 담당 승계', () => {
    const base = p({});
    const doneToday = { workId: homeWorkId(base), status: '완료', completedAt: TODAY };
    const donePast = { workId: homeWorkId(base), status: '완료', completedAt: '2026-08-10' };
    const snoozed = { workId: homeWorkId(base), status: '보류', snoozeUntil: '2026-09-01', assigneeName: '김성훈' };

    expect(buildHomeTasks([base], [doneToday], TODAY)[0].bucket).toBe('done');
    expect(buildHomeTasks([base], [donePast], TODAY)).toHaveLength(0);
    const t = buildHomeTasks([base], [snoozed], TODAY)[0];
    expect(t.bucket).toBe('later');
    expect(t.effectiveDue).toBe('2026-09-01');
    expect(t.effectiveDday).toBe(daysBetween(TODAY, '2026-09-01'));
    expect(t.assignee).toBe('김성훈');
  });

  it('사람이 만든 열린 업무(기한 있음)도 합류하고, 자동 제안의 실체화본은 중복되지 않는다', () => {
    const base = p({});
    const manual = { workId: 'w-77', status: '대기', title: '타이어 교체', category: '정비·수선', plate: '31마7702', dueDate: '2026-08-19', assigneeName: '박영협' };
    const dup = { workId: homeWorkId(base), status: '대기' };
    const tasks = buildHomeTasks([base], [manual, dup], TODAY);
    expect(tasks).toHaveLength(2);
    const m = tasks.find((x) => x.workId === 'w-77')!;
    expect(m.origin).toBe('manual');
    expect(m.action).toBe('타이어 교체');
    expect(m.bucket).toBe('week');
    expect(m.group).toBe('차량');
  });

  it('필터·요약·기한 칸', () => {
    const a = p({ id: 'a' });
    const b = p({ id: 'b', group: '미수', kind: '경고', rawKind: '미수', amount: 100000, assignee: '박영협', dday: 120, overdueDays: 3, dueDate: '2026-12-15' });
    const tasks = buildHomeTasks([a, b], [], TODAY);
    expect(homeSummary(tasks).late).toBe(2);
    expect(filterHomeTasks(tasks, { owner: 'me', me: '박영협', dom: null }).map((t) => t.id)).toEqual(['b']);
    expect(filterHomeTasks(tasks, { owner: 'none', me: '박영협', dom: null }).map((t) => t.id)).toEqual(['a']);
    expect(filterHomeTasks(tasks, { owner: 'all', me: '박영협', dom: '미수' }).map((t) => t.id)).toEqual(['b']);
    expect(dueCell(tasks.find((t) => t.id === 'a')!)).toEqual({ text: 'D+11', tone: 'late' });
    // 미수의 기한 칸은 계약 만기(D-120)가 아니라 연체일(D+3)
    const bb = tasks.find((t) => t.id === 'b')!;
    expect(dueCell(bb)).toEqual({ text: 'D+3', tone: 'late' });
    expect(bb.effectiveDue).toBe('2026-08-15');
  });

  it('저장 문서 — 새 문서는 근거키·분류·대상, 행동 patch 는 완료·접수·연기·담당', () => {
    const t = buildHomeTasks([p({})], [], TODAY)[0];
    const rec = homeTaskRecord(t, TODAY);
    expect(rec.workId).toBe('auto:검사만기:12두4470:2026-08-07');
    expect(rec.category).toBe('검사');
    expect(rec.targetType).toBe('자산');
    expect(rec.title).toBe('정기검사 예약');
    expect(homeActionPatch('done', { today: TODAY })).toEqual({ status: '완료', completedAt: TODAY });
    expect(homeActionPatch('take', { today: TODAY, me: '박영협' })).toEqual({ status: '대기', assigneeName: '박영협' });
    const d = homeActionPatch('defer', { today: TODAY, days: 7 });
    expect(d.status).toBe('보류');
    expect(d.snoozeUntil).toBe('2026-08-25');
    expect(d.dueDate).toBe('2026-08-25');
  });
});
