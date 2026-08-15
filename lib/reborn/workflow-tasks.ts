import type { EntityRecord } from '@/lib/intake/entities';
import { normPlate, scopedPlateKey } from '@/lib/plate';
import { isContractEndedStatus } from '@/lib/domain/status';

export type WorkflowTaskCategory = 'collection' | 'contract' | 'vehicle' | 'document' | 'finance' | 'other';

export type WorkflowTask = {
  id: string;
  category: WorkflowTaskCategory;
  priority: 1 | 2 | 3;
  companyId?: string;
  plate: string;
  title: string;
  detail: string;
  action: string;
  href?: string;
  evidenceHref?: string;
};

type WorkflowTaskInput = {
  contracts: EntityRecord[];
  vehicles: EntityRecord[];
  inbox: EntityRecord[];
  today: string;
};

function keyOf(record: EntityRecord, fallback: string): string {
  return String(record._key || record.id || record.contractNo || fallback);
}

function documentCategory(source: string): WorkflowTaskCategory {
  if (/계좌|자금|입출금|통장|CMS|카드/.test(source)) return 'finance';
  if (/계약|면허|보험/.test(source)) return 'contract';
  if (/등록증|차량|매매|할부|리스/.test(source)) return 'document';
  return 'other';
}

function isProcessedDocument(record: EntityRecord): boolean {
  const processing = String(record.processingState || '미분류');
  const intake = String(record.intakeState || '');
  return processing === '처리완료' || record.status === '매칭' || intake === '처리완료';
}

function evidenceHref(record: EntityRecord): string | undefined {
  const href = String(record.url || record.fileUrl || record.webViewLink || '').trim();
  return /^https?:\/\//i.test(href) ? href : undefined;
}

/**
 * 파일 투입 이후 다음 상태로 넘어가지 못한 업무를 만든다.
 * 직원이 폼을 채우는 대신 파일을 올리고, 이 규칙이 멈춘 단계를 운영 업무로 드러낸다.
 */
export function buildFileDrivenWorkflowTasks({ contracts, vehicles, inbox, today }: WorkflowTaskInput): WorkflowTask[] {
  const tasks: WorkflowTask[] = [];
  const vehicleKeys = new Set(vehicles.filter((vehicle) => normPlate(vehicle.plate)).map((vehicle) => scopedPlateKey(vehicle.companyId, vehicle.plate)));

  inbox.forEach((record, index) => {
    if (isProcessedDocument(record)) return;
    const source = `${record.docKind || ''} ${record.kind || ''} ${record.filename || ''} ${record.suggestedEntity || ''}`;
    const state = String(record.processingState || '미분류');
    tasks.push({
      id: `inbox:${keyOf(record, String(index))}`,
      category: documentCategory(source),
      priority: /오류|확인필요/.test(state) ? 1 : 2,
      companyId: String(record.companyId || ''),
      plate: normPlate(record.plate),
      title: String(record.filename || record.docKind || record.kind || '업로드 자료'),
      detail: `업로드 완료 · ${state} 단계에서 대기`,
      action: /오류|확인필요/.test(state) ? '내용 확인' : '자동 반영 확인',
      href: '/inbox',
      evidenceHref: evidenceHref(record),
    });
  });

  contracts.forEach((contract, index) => {
    const status = String(contract.status || '');
    if (contract.returnedDate || isContractEndedStatus(status)) return;
    const contractKey = keyOf(contract, String(index));
    const plate = normPlate(contract.plate);
    const customer = String(contract.contractorName || contract.contractNo || '계약자 미확인');

    if (!plate) {
      tasks.push({
        id: `contract-unassigned:${contractKey}`,
        category: 'vehicle',
        priority: 1,
        companyId: String(contract.companyId || ''),
        plate: '',
        title: `${customer} · 차량 미배정`,
        detail: '계약은 반영됐지만 배차할 차량이 연결되지 않았습니다.',
        action: '차량 배정',
        href: '/dispatch',
        evidenceHref: evidenceHref(contract),
      });
    } else if (!vehicleKeys.has(scopedPlateKey(contract.companyId, contract.plate))) {
      tasks.push({
        id: `contract-vehicle-missing:${contractKey}`,
        category: 'document',
        priority: 1,
        companyId: String(contract.companyId || ''),
        plate,
        title: `${plate} · 차량자료 없음`,
        detail: '계약 차량은 지정됐지만 자동차등록증이 반영되지 않았습니다.',
        action: '등록증 요청',
        href: '/ingest',
        evidenceHref: evidenceHref(contract),
      });
    } else if ((status === '대기' || !status) && !contract.deliveredDate) {
      const start = String(contract.deliveryScheduledDate || contract.startDate || '').slice(0, 10);
      tasks.push({
        id: `contract-undelivered:${contractKey}`,
        category: 'vehicle',
        priority: start && start <= today ? 1 : 2,
        companyId: String(contract.companyId || ''),
        plate,
        title: `${plate} · ${customer}`,
        detail: start ? `계약 반영 완료 · ${start} 출고 대기` : '계약 반영 완료 · 배차/인도 일정 미정',
        action: '배차 확인',
        href: '/dispatch',
        evidenceHref: evidenceHref(contract),
      });
    }

    if (!Number(contract.monthlyRent) || !String(contract.paymentDay || '').trim()) {
      tasks.push({
        id: `contract-collection-missing:${contractKey}`,
        category: 'contract',
        priority: 1,
        companyId: String(contract.companyId || ''),
        plate,
        title: `${plate} · 수납조건 확인`,
        detail: '계약서에서 대여료 또는 결제일을 확정하지 못해 수납일정을 만들 수 없습니다.',
        action: '계약서 확인',
        href: '/inbox',
        evidenceHref: evidenceHref(contract),
      });
    }
  });

  return tasks;
}
