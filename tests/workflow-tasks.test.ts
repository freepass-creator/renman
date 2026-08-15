import { describe, expect, it } from 'vitest';
import { buildFileDrivenWorkflowTasks } from '@/lib/reborn/workflow-tasks';

const input = (overrides = {}) => ({ contracts: [], vehicles: [], inbox: [], today: '2026-08-15', ...overrides });

describe('파일 기반 ERP 업무 규칙', () => {
  it('계약이 반영됐지만 차량이 없으면 차량 배정 업무를 만든다', () => {
    const tasks = buildFileDrivenWorkflowTasks(input({
      contracts: [{ _key: 'c1', contractorName: '홍길동', status: '대기', monthlyRent: 500_000, paymentDay: 10 }],
    }));
    expect(tasks).toContainEqual(expect.objectContaining({ id: 'contract-unassigned:c1', category: 'vehicle', action: '차량 배정' }));
  });

  it('차량까지 연결됐지만 출고되지 않은 계약은 배차 미결로 잡는다', () => {
    const tasks = buildFileDrivenWorkflowTasks(input({
      vehicles: [{ _key: 'v1', plate: '12가3456' }],
      contracts: [{ _key: 'c1', plate: '12가3456', contractorName: '홍길동', status: '대기', startDate: '2026-08-10', monthlyRent: 500_000, paymentDay: 10 }],
    }));
    expect(tasks).toContainEqual(expect.objectContaining({ id: 'contract-undelivered:c1', priority: 1, action: '배차 확인' }));
  });

  it('한 계약의 차량 미배정과 수납조건 누락을 각각 업무로 남긴다', () => {
    const tasks = buildFileDrivenWorkflowTasks(input({
      contracts: [{ _key: 'c1', contractorName: '홍길동', status: '대기' }],
    }));
    expect(tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'contract-unassigned:c1', action: '차량 배정' }),
      expect.objectContaining({ id: 'contract-collection-missing:c1', action: '계약서 확인' }),
    ]));
  });

  it('처리되지 않은 업로드는 대기 업무로 남고 처리완료 자료는 제외한다', () => {
    const tasks = buildFileDrivenWorkflowTasks(input({
      inbox: [
        { _key: 'i1', filename: '렌탈계약서.pdf', docKind: '렌탈계약서', processingState: '확인필요' },
        { _key: 'i2', filename: '등록증.pdf', docKind: '자동차등록증', processingState: '처리완료' },
      ],
    }));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ id: 'inbox:i1', category: 'contract', action: '내용 확인' });
  });

  it('업로드 원문 링크를 업무 근거로 보존한다', () => {
    const tasks = buildFileDrivenWorkflowTasks(input({
      inbox: [{ _key: 'i1', filename: '계약서.pdf', processingState: '확인필요', webViewLink: 'https://drive.google.com/file/d/example' }],
    }));
    expect(tasks[0]).toMatchObject({ evidenceHref: 'https://drive.google.com/file/d/example' });
  });

  it('같은 차량번호라도 다른 법인 차량으로 계약을 충족시키지 않는다', () => {
    const tasks = buildFileDrivenWorkflowTasks(input({
      vehicles: [{ _key: 'v1', companyId: 'prime', plate: '12가3456' }],
      contracts: [{ _key: 'c1', companyId: 'switchplan', plate: '12가3456', status: '대기', monthlyRent: 500_000, paymentDay: 10 }],
    }));
    expect(tasks).toContainEqual(expect.objectContaining({ id: 'contract-vehicle-missing:c1', companyId: 'switchplan' }));
    expect(tasks).not.toContainEqual(expect.objectContaining({ id: 'contract-undelivered:c1' }));
  });

  it('대량 업로드에서도 누락 업무를 빠짐없이 만든다', () => {
    const inbox = Array.from({ length: 5_000 }, (_, index) => ({
      _key: `i${index}`,
      filename: `자료-${index}.pdf`,
      processingState: '미분류',
    }));
    const tasks = buildFileDrivenWorkflowTasks(input({ inbox }));
    expect(tasks).toHaveLength(5_000);
    expect(new Set(tasks.map((task) => task.id)).size).toBe(5_000);
  });

  it('종료 계약은 배차 미결로 되살리지 않는다', () => {
    const tasks = buildFileDrivenWorkflowTasks(input({
      contracts: [{ _key: 'ended', status: '반납' }],
    }));
    expect(tasks).toHaveLength(0);
  });
});
