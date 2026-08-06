/**
 * 문서 종류 SSOT — 차량360「문서」·데이터센터가 **같은 목록** (VEHICLE360-SPEC §3-1·§3-2).
 * 축: 파일형태(별도) · 성격 · 귀속(WORK_DIVISIONS) · 종류 — RENMAN-CURSOR §4-9-1.
 */
import type { WorkDivision } from '@/lib/work-taxonomy';

/** ② 성격 — 처리 방식을 정한다. */
export type DocNature = '원장자료' | '증서' | '계약서' | '청구/영수' | '증빙';

export const DOC_NATURES: readonly DocNature[] = ['원장자료', '증서', '계약서', '청구/영수', '증빙'];

export type DocKindDef = {
  kind: string;
  entity: string;
  ocrType?: string;
  nature: DocNature;
  /** ③ 귀속 — WORK_DIVISIONS 재사용 */
  division: WorkDivision;
  slot?: 'vehicle' | 'insurance';
};

export const DOC_KINDS: readonly DocKindDef[] = [
  { kind: '자동차등록증', entity: 'vehicle', ocrType: 'vehicle_reg', nature: '증서', division: '자산', slot: 'vehicle' },
  { kind: '자동차보험증권', entity: 'insurance', ocrType: 'insurance_policy', nature: '증서', division: '자산', slot: 'insurance' },
  { kind: '사업자등록증', entity: 'inbox', nature: '증서', division: '기타' },
  { kind: '운전면허증', entity: 'customer', ocrType: 'license', nature: '증서', division: '계약' },
  { kind: '렌탈계약서', entity: 'contract', ocrType: 'rental_contract', nature: '계약서', division: '계약' },
  { kind: '매매계약서', entity: 'vehicle', nature: '계약서', division: '자산' },
  { kind: '할부/리스 계약서', entity: 'vehicle', nature: '계약서', division: '자산' },
  { kind: '과태료/통행료 고지서', entity: 'penalty', ocrType: 'penalty', nature: '청구/영수', division: '과태료' },
  { kind: '세금계산서', entity: 'bank_tx', nature: '청구/영수', division: '자금' },
  { kind: '견적서', entity: 'vehicle', nature: '청구/영수', division: '자산' },
  { kind: '계좌거래내역', entity: 'bank_tx', nature: '원장자료', division: '자금' },
  { kind: '사업현황', entity: 'vehicle', nature: '원장자료', division: '자산' },
  { kind: '자금일보', entity: 'bank_tx', nature: '원장자료', division: '자금' },
  { kind: '검사증', entity: 'vehicle', nature: '증빙', division: '자산' },
  { kind: '탁송증', entity: 'vehicle', nature: '증빙', division: '자산' },
  { kind: '사고 견적/명세', entity: 'work_item', nature: '증빙', division: '자산' },
  { kind: '차량 사진', entity: 'vehicle', nature: '증빙', division: '자산' },
  { kind: '기타', entity: 'inbox', nature: '증빙', division: '기타' },
] as const;

export function docKindOf(kind: string): DocKindDef | undefined {
  const k = kind.trim();
  return DOC_KINDS.find((d) => d.kind === k);
}

export function defaultDocKindForEntity(entityKey: string): string {
  const hit = DOC_KINDS.find((d) => d.entity === entityKey && d.ocrType);
  if (hit) return hit.kind;
  const any = DOC_KINDS.find((d) => d.entity === entityKey);
  return any?.kind || '기타';
}

export function resolveDocKind(kind: string): DocKindDef {
  return docKindOf(kind) || {
    kind: kind.trim() || '기타',
    entity: 'inbox',
    nature: '증빙',
    division: '기타',
  };
}

/** 행선지 = 성격② + 귀속③ 계산값 (입력 아님). */
export function docDestination(nature: DocNature, division: WorkDivision, entity: string): { label: string; href: string } {
  if (nature === '원장자료' && division === '자금') return { label: '자금원장 › 거래', href: '/cash' };
  if (nature === '원장자료' && division === '자산') return { label: '자산원장 › 차량', href: '/asset' };
  if (nature === '증서' && (entity === 'vehicle' || division === '자산')) return { label: '자산원장 › 차량', href: '/asset' };
  if (nature === '증서' && entity === 'insurance') return { label: '자산원장 › 보험', href: '/asset' };
  if (nature === '증서' && entity === 'customer') return { label: '계약 › 손님', href: '/contract' };
  if (nature === '계약서' && division === '계약') return { label: '계약원장 › 계약', href: '/contract' };
  if (nature === '계약서' && division === '자산') return { label: '자산원장 › 차량', href: '/asset' };
  if (nature === '청구/영수' && division === '과태료') return { label: '과태료원장', href: '/work?group=과태료' };
  if (nature === '청구/영수' && division === '자금') return { label: '자금원장 › 거래', href: '/cash' };
  if (nature === '증빙' && division === '자산') return { label: '자산 › 문서첨부', href: '/asset' };
  if (entity === 'inbox') return { label: '원본 처리함', href: '/ingest?type=inbox' };
  const map: Record<string, { label: string; href: string }> = {
    vehicle: { label: '자산원장 › 차량', href: '/asset' },
    contract: { label: '계약원장', href: '/contract' },
    bank_tx: { label: '자금원장', href: '/cash' },
    penalty: { label: '과태료', href: '/work?group=과태료' },
    work_item: { label: '업무', href: '/work' },
    insurance: { label: '자산 › 보험', href: '/asset' },
    customer: { label: '계약 › 손님', href: '/contract' },
  };
  return map[entity] || { label: `${division} › ${entity}`, href: '/ingest' };
}
