/**
 * 증차·감차 신청 = 업무 (AUDIT §6-3 · 사장님 확정 2026-08-07).
 * 옛 법인 마스터 배열 → work_item 변환이 뜻을 잃지 않는지.
 */
import { describe, it, expect } from 'vitest';
import type { RegApplication } from '@/lib/company-master';
import {
  REG_APP_CATEGORY, regAppResult, regAppToWorkItem, regAppWorkStatus,
  regAppsToWorkItems, selectRegAppWorks,
} from '@/lib/company-reg-apps';
import { missingWorkRequirements, workDivisionOf } from '@/lib/work-taxonomy';

const app = (over: Partial<RegApplication> = {}): RegApplication => ({
  id: 'ap_1', kind: '증차', status: '준비', date: '2026-07-01', count: 5, office: '서울시청', ...over,
});

describe('신청 상태 → 업무 상태', () => {
  it('준비=대기 · 접수=진행 · 승인/반려=완료', () => {
    expect(regAppWorkStatus('준비')).toBe('대기');
    expect(regAppWorkStatus('접수')).toBe('진행');
    expect(regAppWorkStatus('승인')).toBe('완료');
    expect(regAppWorkStatus('반려')).toBe('완료');
  });

  it('반려도 끝난 것이다 — 보류로 두면 영원히 열린 일로 남는다', () => {
    const w = regAppToWorkItem(app({ status: '반려' }), 'switchplan');
    expect(w.status).toBe('완료');
    expect(w.regResult).toBe('반려');
  });

  it('준비·접수는 아직 결과가 없다', () => {
    expect(regAppResult('준비')).toBeUndefined();
    expect(regAppResult('접수')).toBeUndefined();
  });
});

describe('업무 레코드 변환', () => {
  it('자산 축에 들어가고 제목이 사람 말이 된다', () => {
    const w = regAppToWorkItem(app(), 'switchplan');
    expect(w.category).toBe(REG_APP_CATEGORY);
    expect(workDivisionOf(w.category)).toBe('자산');
    expect(w.title).toBe('증차 신청 5대 · 서울시청');
    expect(w.regKind).toBe('증차');
    expect(w.regCount).toBe(5);
  });

  it('차량번호를 요구하지 않는다 — 아직 사지도 않은 차를 신청하는 일이다', () => {
    // 자산 축의 기본 필수값은 plate 지만 이 세부는 대상이 법인이다.
    expect(missingWorkRequirements(REG_APP_CATEGORY, regAppToWorkItem(app(), 'switchplan'))).toEqual([]);
    // 다른 자산 세부는 여전히 차량번호를 요구한다(예외가 축 전체를 풀어버리지 않았는지)
    expect(missingWorkRequirements('정비·수선', { plate: '' })).toEqual(['차량번호']);
  });

  it('workId가 신청 id라 두 번 이관해도 문서가 하나다', () => {
    const a = app();
    expect(regAppToWorkItem(a, 'switchplan').workId).toBe('regapp:ap_1');
    expect(regAppToWorkItem(a, 'switchplan').workId).toBe(regAppToWorkItem(a, 'switchplan').workId);
  });

  it('지시(자동업무)와 근거키가 겹치지 않는다', () => {
    // auto: 접두는 lib/directives 가 쓴다 — 섞이면 지시 엔진이 남의 업무를 만진다.
    expect(String(regAppToWorkItem(app(), 'switchplan').workId).startsWith('auto:')).toBe(false);
  });

  it('빈 값은 만들어내지 않는다', () => {
    const w = regAppToWorkItem({ id: 'ap_2', kind: '감차', status: '준비' }, 'switchplan');
    expect(w.regCount).toBeUndefined();
    expect(w.regOffice).toBeUndefined();
    expect(w.regResult).toBeUndefined();
    expect(w.title).toBe('감차 신청');
  });

  it('배열 전체 이관 · 없으면 이관할 것이 없다', () => {
    expect(regAppsToWorkItems([app(), app({ id: 'ap_2', kind: '감차' })], 'sw')).toHaveLength(2);
    expect(regAppsToWorkItems(undefined, 'sw')).toEqual([]);
  });
});

describe('법인별 조회', () => {
  it('그 회사의 증차·감차 업무만 · 최신 먼저', () => {
    const rows = selectRegAppWorks([
      { category: REG_APP_CATEGORY, companyId: 'a', date: '2026-01-01' },
      { category: REG_APP_CATEGORY, companyId: 'a', date: '2026-07-01' },
      { category: REG_APP_CATEGORY, companyId: 'b', date: '2026-08-01' },
      { category: '정비·수선', companyId: 'a', date: '2026-09-01' },
    ], 'a');
    expect(rows.map((r) => r.date)).toEqual(['2026-07-01', '2026-01-01']);
  });
});
