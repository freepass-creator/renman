'use client';
// 법인(회사) 마스터 — 모든 자산(차)·자금(계좌)이 "어느 법인의 X"로 귀속되는 뿌리 설정.
// 법인별 소재지·차고지·등록대수·증차신청·공문 등 운영 기준의 SSOT. 모듈형(접기·추가·제거).
// 지금은 localStorage(설정 데이터), 후에 Firestore 마스터로 승격.
const LS_KEY = 'jpk:company-master';

export type Garage = { id: string; name?: string; address?: string; capacity?: number; note?: string };
export type RegApplication = {
  id: string; date?: string; kind: '증차' | '감차'; count?: number; office?: string;
  status: '준비' | '접수' | '승인' | '반려'; resultDate?: string; note?: string;
};
export type OfficialDoc = {
  id: string; date?: string; direction: '발신' | '수신'; title?: string; counterpart?: string; docNo?: string; note?: string;
};

export type CompanyMaster = {
  bizNo?: string;        // 사업자등록번호
  corpNo?: string;       // 법인등록번호
  ceo?: string;          // 대표
  address?: string;      // 본점(사무실) 소재지
  phone?: string;        // 대표 전화
  garages?: Garage[];    // 차고지(들) — 주소 + 수용대수
  parking?: string[];    // 사무실 주차장(들)
  cards?: { no: string; alias?: string }[]; // 법인카드
  registeredCount?: number;          // 관청 등록 대수
  regApplications?: RegApplication[]; // 증차·감차 신청 이력
  officialDocs?: OfficialDoc[];       // 공문 대장(발신·수신)
  modules?: string[];    // 활성 모듈 키(순서 = 표시 순서)
  collapsed?: string[];  // 접힌 모듈 키
};

type MasterMap = Record<string, CompanyMaster>; // companyId → master

// 모듈 카탈로그 — "넣었다 지웠다" 대상. basic 은 항상 켬(제거 불가).
export const MODULE_CATALOG: { key: string; label: string; desc: string; core?: boolean }[] = [
  { key: 'basic', label: '기본 정보', desc: '법인명·대표·사업자번호·본점 소재지·연락처', core: true },
  { key: 'garage', label: '차고지', desc: '주소 + 수용대수 (등록대수 요건)' },
  { key: 'vehicleReg', label: '등록대수·증차신청', desc: '등록 대수 / 증차·감차 신청 워크플로우' },
  { key: 'officialDoc', label: '공문 대장', desc: '법인 명의 발신·수신 문서 대장' },
  { key: 'card', label: '법인카드', desc: '법인카드 번호·별명' },
  { key: 'license', label: '인허가 증빙', desc: '사업자등록증·대여사업 등록증·정관·등기부 (보관)' },
];
export const DEFAULT_MODULES = ['basic', 'garage', 'vehicleReg'];

// app 런타임 전용 id 생성(스크립트 아님 — Date/Math 사용 가능).
export function genId(prefix = 'm'): string { return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

export function loadMasters(): MasterMap {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}
export function loadMaster(companyId: string): CompanyMaster {
  const m = loadMasters()[companyId] || {};
  if (!m.modules || !m.modules.length) m.modules = [...DEFAULT_MODULES];
  return m;
}
export function saveMaster(companyId: string, m: CompanyMaster): void {
  if (typeof window === 'undefined' || !companyId) return;
  const all = loadMasters();
  all[companyId] = m;
  localStorage.setItem(LS_KEY, JSON.stringify(all));
  window.dispatchEvent(new Event('jpk:master-change'));
}
