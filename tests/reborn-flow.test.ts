import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAtomicEvent } from '@/lib/domain/atomic-event';
import { buildFileDrivenWorkflowTasks } from '@/lib/reborn/workflow-tasks';

const today = '2026-08-15';

describe('Rental Manager 대표 파일 기반 흐름', () => {
  it('업로드에서 원자 사건과 복수 예외를 만들고, 조건이 충족되면 업무에서 제거한다', () => {
    const extractedContract = {
      _key: 'contract-1', companyId: 'A', contractorName: '고객', status: '대기',
      webViewLink: 'https://drive.google.com/file/d/source-contract',
    };
    const event = buildAtomicEvent({ entityType: 'contract', companyId: 'A', record: extractedContract, source: 'upload', occurredAt: '2026-08-15T01:00:00Z' });
    const pending = buildFileDrivenWorkflowTasks({ contracts: [extractedContract], vehicles: [], inbox: [], today });

    expect(event.eventType).toBe('contract.recorded');
    expect(event.companyId).toBe('A');
    expect(pending).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'contract-unassigned:contract-1', action: '차량 배정', evidenceHref: extractedContract.webViewLink }),
      expect.objectContaining({ id: 'contract-collection-missing:contract-1', action: '계약서 확인', evidenceHref: extractedContract.webViewLink }),
    ]));

    const completed = buildFileDrivenWorkflowTasks({
      contracts: [{ ...extractedContract, plate: '12가3456', status: '운행', deliveredDate: today, monthlyRent: 500_000, paymentDay: 10 }],
      vehicles: [{ _key: 'vehicle-1', companyId: 'A', plate: '12가3456' }],
      inbox: [{ _key: 'inbox-1', companyId: 'A', processingState: '처리완료' }],
      today,
    });
    expect(completed).toEqual([]);
  });

  it('업무목록에서 상세·원문을 분리하고 키보드·모바일 규칙을 유지한다', () => {
    const source = readFileSync(join(process.cwd(), 'app/sheet/reborn/SimpleRentalManager.tsx'), 'utf8');
    const css = readFileSync(join(process.cwd(), 'app/sheet/reborn/simple.module.css'), 'utf8');
    const detail = readFileSync(join(process.cwd(), 'app/sheet/reborn/vehicle/[plate]/VehicleRecord.tsx'), 'utf8');

    expect(source).toContain('taskPriorityLabel(item.priority)');
    expect(source).toContain('taskDueLabel(item.dueDate, item.dday)');
    expect(source).toContain('className={styles.todoEvidence}');
    expect(source).toContain('role="dialog" aria-label="업무 필터와 정렬"');
    expect(source).toContain("event.key === 'Escape'");
    expect(css).toMatch(/\.todoEvidence[^}]*min-height:\s*44px/);
    expect(css).toContain('@media (max-width: 700px)');
    expect(detail).toContain('buildMobileVehicleScope(vehicles, contracts, plate, companyId)');
    expect(detail).toContain('safeEvidenceHref(doc.url)');
    expect(source).toContain('useDashboardData(RENTAL_COMPANY_IDS)');
    expect(source).not.toContain('<input autoFocus');
    expect(detail).toContain("href={`/work?open=${encodeURIComponent(item.id)}`}");
  });

  it('네 원장 모두 화면 렌더링 상한을 두되 검색은 상한 적용 전에 수행한다', () => {
    const source = readFileSync(join(process.cwd(), 'app/sheet/reborn/ledgers/LedgerHub.tsx'), 'utf8');
    expect(source.match(/rows\.slice\(0, 400\)/g)).toHaveLength(4);
    expect(source).toContain('vehicleRows.filter');
    expect(source).toContain('contractRows.filter');
    expect(source).toContain('collectionRows.filter');
    expect(source).toContain('cashRows.filter');
  });
});
