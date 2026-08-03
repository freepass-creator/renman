/**
 * 수집함 업로드 SSOT — 파일 → Storage 업로드 → inbox 레코드(대기) 적재.
 *   수집함 페이지·홈/마이 업로드 섹션·빠른입력이 공용으로 이 함수만 부른다(로직 중복 금지).
 */
import { commitSave } from '@/lib/commit';
import { uploadDoc, docPath, storageReady } from '@/lib/storage';
import { type EntityRecord } from '@/lib/intake/entities';
import type { ProcessingState } from '@/lib/data-center-terms';
import { routeDocument } from '@/lib/document-router';
import { fingerprintFile, findOriginalByHash } from '@/lib/file-fingerprint';
import { getStore } from '@/lib/store';

const newKey = () => `inbox_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export async function uploadToInbox(
  file: File,
  kind: string,
  companyId: string,
  by: string,
  extra?: { plate?: string; note?: string },
): Promise<{ ok: boolean; reason?: string; key?: string; duplicate?: boolean }> {
  if (!storageReady()) return { ok: false, reason: 'unconfigured' };
  const key = newKey();
  const originalHash = await fingerprintFile(file);
  const existing = originalHash
    ? findOriginalByHash(originalHash, await getStore().list('inbox', companyId).catch(() => []))
    : undefined;
  if (existing) {
    const rec: EntityRecord = {
      inboxKey: key, filename: file.name, kind: String(existing.kind || kind || '기타'), status: '대기',
      processingState: '중복' satisfies ProcessingState,
      classificationState: String(existing.classificationState || '미분류'), intakeState: '미처리', assignmentState: '미배정',
      duplicateOf: String(existing._key || existing.inboxKey || ''), duplicateDetectedAt: new Date().toISOString(),
      originalHash, fingerprintAlgorithm: 'SHA-256', originalMime: file.type || 'application/octet-stream', originalSize: file.size,
      uploadedBy: by, uploadedAt: new Date().toISOString(), companyId,
      ...(existing.url ? { url: existing.url } : {}),
      ...(extra?.note ? { note: extra.note } : {}),
    };
    await commitSave({ entity: 'inbox', sessionCompanyId: companyId, rec, records: [rec] });
    return { ok: true, key, duplicate: true };
  }
  const url = await uploadDoc(file, docPath(companyId, 'inbox', key, file.name));
  if (!url) return { ok: false, reason: 'upload_failed' };
  const plate = (extra?.plate || '').trim();
  const route = routeDocument({ filename: file.name, mime: file.type, hint: kind });
  const classified = route.confidence === 'high';
  const rec: EntityRecord = {
    inboxKey: key, url, filename: file.name, kind: route.kind, status: '대기',
    processingState: (classified ? '확인필요' : '미분류') satisfies ProcessingState,
    classificationState: classified ? '분류됨' : '미분류', intakeState: '미처리', assignmentState: '미배정',
    suggestedEntity: route.entity, classificationConfidence: route.confidence, classificationReason: route.reason,
    originalMime: file.type || 'application/octet-stream', originalSize: file.size,
    ...(originalHash ? { originalHash, fingerprintAlgorithm: 'SHA-256' } : {}),
    uploadedBy: by, uploadedAt: new Date().toISOString(), companyId,
    ...(plate ? { plate } : {}),
    ...(extra?.note ? { note: extra.note } : {}),
  };
  await commitSave({ entity: 'inbox', sessionCompanyId: companyId, rec, records: [rec] });
  return { ok: true, key };
}

/** 텍스트만 대기함(차번 없음·또는 메모만). 파일 URL 없음. */
export async function saveInboxNote(
  note: string,
  companyId: string,
  by: string,
  plate?: string,
): Promise<{ ok: boolean; reason?: string; key?: string }> {
  const text = note.trim();
  if (!text) return { ok: false, reason: 'empty' };
  const key = newKey();
  const p = (plate || '').trim();
  const rec: EntityRecord = {
    inboxKey: key, kind: '기타', status: '대기', note: text,
    processingState: '미분류' satisfies ProcessingState,
    classificationState: '미분류', intakeState: '미처리', assignmentState: '미배정',
    uploadedBy: by, uploadedAt: new Date().toISOString(), companyId,
    ...(p ? { plate: p } : {}),
  };
  await commitSave({ entity: 'inbox', sessionCompanyId: companyId, rec, records: [rec] });
  return { ok: true, key };
}
