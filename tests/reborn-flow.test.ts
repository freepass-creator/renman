import { existsSync, readFileSync } from 'node:fs';
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
    expect(source).toContain('const action = todoActionLabel(item)');
    expect(source).toContain('className={styles.todoEvidence}');
    expect(source).toContain('role="region" aria-label="업무 필터와 정렬"');
    expect(source).toContain("event.key === 'Escape'");
    expect(css).toMatch(/\.todoEvidence[^}]*min-height:\s*48px/);
    expect(css).toContain('@media (max-width: 620px)');
    expect(css).toContain('grid-template-columns: 86px minmax(0, 1fr) 130px');
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

  it('폐기한 구 운영원장과 중복 차량현황 UI는 되살리지 않고 새 업무조회로 연결한다', () => {
    const root = process.cwd();
    const legacyEntry = readFileSync(join(root, 'app/sheet/page.tsx'), 'utf8');

    expect(legacyEntry).toContain("redirect('/sheet/reborn')");
    expect(existsSync(join(root, 'app/sheet/SheetWorkspace.tsx'))).toBe(false);
    expect(existsSync(join(root, 'app/sheet/sheet.module.css'))).toBe(false);
    expect(existsSync(join(root, 'app/sheet/reborn/fleet/page.tsx'))).toBe(false);
    expect(existsSync(join(root, 'app/sheet/reborn/fleet/FleetOverview.tsx'))).toBe(false);
    expect(existsSync(join(root, 'app/sheet/reborn/fleet/fleet.module.css'))).toBe(false);
  });

  it('상단 작업바와 현황·업무목록은 샤프한 B2B 업무도구 규격을 유지한다', () => {
    const root = process.cwd();
    const source = readFileSync(join(root, 'app/sheet/reborn/SimpleRentalManager.tsx'), 'utf8');
    const pageCss = readFileSync(join(root, 'app/sheet/reborn/simple.module.css'), 'utf8');
    const headerCss = readFileSync(join(root, 'app/sheet/reborn/_components/reborn-header.module.css'), 'utf8');
    const uploadCss = readFileSync(join(root, 'app/ingest/reborn-upload.module.css'), 'utf8');

    expect(headerCss).toMatch(/\.headerInner\s*{[^}]*min-height:\s*60px/s);
    expect(headerCss).not.toContain('min-height: 104px');
    expect(headerCss).toMatch(/\.navigation\s+\.active\s*{[^}]*background:\s*var\(--header-accent-soft\)/s);
    expect(pageCss).toMatch(/\.commandDeck\s*{[^}]*grid-template-columns:\s*minmax\(420px, 1fr\) minmax\(560px, 640px\)/s);
    expect(pageCss).toMatch(/\.commandSearch\s*{[^}]*height:\s*64px/s);
    expect(pageCss).toMatch(/\.scopeBar\s*{[^}]*min-height:\s*52px/s);
    expect(pageCss).toMatch(/\.workMetrics\s*{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
    expect(pageCss).toMatch(/\.todoRow\s*{[^}]*min-height:\s*84px/s);
    expect(pageCss).not.toMatch(/font-weight:\s*[78]\d\d/);
    expect(headerCss).not.toMatch(/font-weight:\s*[78]\d\d/);
    expect(source).not.toContain('오늘 할 일');
    expect(source).not.toContain('styles.workTitle');
    expect(source).not.toContain('styles.workBar');
    expect(source).toContain('<span>가동</span>');
    expect(source).toContain('<span>미수</span>');
    expect(source).not.toContain('operationPulse');
    expect(source).toContain("averageIdleDays == null ? '미산정'");
    expect(source).toContain("collectionSummary.hasData ? collectionSummary.rate : '—'");
    expect(source).toContain('<kbd className={styles.searchHint}>Ctrl K</kbd>');
    expect(source).not.toContain('<div><span>할 일</span>');
    expect(uploadCss).toContain('@media (max-width: 759px)');
    expect(source).toContain('aria-pressed={active}');
    expect(source).toContain('aria-pressed={categoryFilter === option.key}');
    expect(source).not.toContain('TASK QUEUE');
    expect(source).not.toContain('SEARCH RESULT');
  });

  it('신형 업무 화면은 기존 UI와 분리된 업무 인박스 구조로 비교 검증할 수 있다', () => {
    const root = process.cwd();
    const source = readFileSync(join(root, 'app/sheet/reborn/SimpleRentalManager.tsx'), 'utf8');
    const nextPage = readFileSync(join(root, 'app/sheet/reborn/next/page.tsx'), 'utf8');
    const nextCss = readFileSync(join(root, 'app/sheet/reborn/workspace-next.module.css'), 'utf8');

    expect(nextPage).toContain('<SimpleRentalManager variant="next" />');
    expect(source).toContain("if (variant === 'next')");
    expect(source).toContain('function RentalWorkspaceNext');
    expect(source).toContain('function NextQueueList');
    expect(source).toContain('처리 필요');
    expect(source).not.toContain('오늘 할 일');
    expect(nextCss).toMatch(/\.header\s*{[^}]*grid-template-columns:/s);
    expect(nextCss).toMatch(/\.signalStrip\s*{[^}]*border-top:/s);
    expect(nextCss).toMatch(/\.queueRow\s*{[^}]*border-bottom:/s);
    expect(nextCss).not.toMatch(/font-weight:\s*[78]\d\d/);
    expect(nextCss).toContain('@media (max-width: 760px)');
  });
});
