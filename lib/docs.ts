/**
 * 문서(서류) 버전 모델 — 서류는 별도 전역 목록이 아니라 "그 정보 레코드와 한 몸"으로 산다.
 *   · rec._docs = DocVersion[]  (없을 수 있음)
 *   · 현재 서류 = 배열의 마지막 원소
 *   · 전체 배열   = 재발급/변경 이력(감사)
 * 원칙: 과거 버전의 OCR 스냅샷·URL은 절대 덮어쓰지 않는다(append-only). 원본 영구보존.
 * 레거시 호환: _docs 이전 데이터는 rec.fileUrl 단일 필드 → v1로 승격해 취급.
 */
import type { EntityRecord } from './intake/entities';

export type DocVersion = {
  v: number;                       // 1부터 증가하는 버전 번호
  type: string;                    // 서류 종류(엔티티 키): 'vehicle'(등록증)·'insurance'(증권)·'penalty'(고지서)…
  url: string;                     // 원본 파일(Firebase Storage URL). '' = 미첨부(수기/OCR만)
  uploadedAt: string;              // ISO 등록 시각
  uploadedBy: string;              // 업로더(uid 또는 'system')
  ocr?: Record<string, unknown>;   // 이 버전의 OCR 원본 스냅샷(영구보존)
  reason?: string;                 // 재발급/변경/오류정정 등 사유
};

/** rec의 서류 배열(레거시 fileUrl 승격 포함). */
function asDocs(rec: EntityRecord | null | undefined): DocVersion[] {
  if (!rec) return [];
  const arr = Array.isArray(rec._docs) ? (rec._docs as DocVersion[]) : [];
  if (arr.length) return arr;
  const legacy = rec.fileUrl ? String(rec.fileUrl) : '';
  if (legacy) return [{ v: 1, type: '', url: legacy, uploadedAt: String(rec.createdAt || ''), uploadedBy: String(rec.createdBy || '') }];
  return [];
}

// 종류 필터 — 레거시(type '')는 어떤 종류로도 매칭(호환).
const byType = (docs: DocVersion[], type?: string) => (type ? docs.filter((d) => !d.type || d.type === type) : docs);

/** 현재(최신) 서류 = 마지막 버전. type 지정 시 해당 종류만. 없으면 null. */
export function latestDoc(rec: EntityRecord | null | undefined, type?: string): DocVersion | null {
  const list = byType(asDocs(rec), type);
  return list.length ? list[list.length - 1] : null;
}

/** 서류 이력(재발급/변경) — 최신 먼저. */
export function docHistory(rec: EntityRecord | null | undefined, type?: string): DocVersion[] {
  return byType(asDocs(rec), type).slice().reverse();
}

/** 새 버전 추가 → 갱신된 _docs 배열 반환(과거 버전 불변). 저장은 호출측(store.save/update)에서. */
export function pushDocVersion(
  rec: EntityRecord | null | undefined,
  { type, url, ocr, reason, by }: { type: string; url?: string; ocr?: Record<string, unknown>; reason?: string; by?: string },
): DocVersion[] {
  const base = asDocs(rec);
  const v = base.length ? base[base.length - 1].v + 1 : 1;
  const next: DocVersion = {
    v, type, url: url || '',
    uploadedAt: new Date().toISOString(),
    uploadedBy: by || 'system',
    ...(ocr ? { ocr } : {}),
    ...(reason ? { reason } : {}),
  };
  return [...base, next];
}
