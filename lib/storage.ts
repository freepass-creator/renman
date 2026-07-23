// 문서 원본 파일 저장 — Firebase Storage(즉시 미리보기용) + 회사 워크스페이스 Google Drive 미러(시스템 보관).
//   파일=Drive(회사)·데이터=Firebase 방침. Drive 미러는 NEXT_PUBLIC_DRIVE_MIRROR=1 + 서버 creds 있을 때만.
// Firebase 미설정(.env.local 없음)이면 null 반환 → 호출측이 "파일 미첨부"로 처리(로컬 미리보기 단계).
import { getFirebaseApp, firebaseReady } from './firebase/client';
import { apiAuthHeaders } from './api-headers';

export function storageReady(): boolean { return firebaseReady(); }

/** 회사 워크스페이스 Drive 미러(파일=Drive). 폴더트리 = storagePath 파생. 비차단·실패무시(Firebase 원본 유효). */
async function mirrorToDrive(file: File, storagePath: string): Promise<void> {
  if (process.env.NEXT_PUBLIC_DRIVE_MIRROR !== '1') return; // creds·플래그 준비 전엔 skip
  const parts = storagePath.split('/').filter(Boolean);      // [docs, companyId, entityKey, recordKey, {ts}_name]
  const fileName = (parts[parts.length - 1] || file.name).replace(/^\d+_/, '');
  const drivePath = parts.slice(1, -1).join('/') || 'misc';  // docs/ 제거 → 회사·엔티티·레코드 트리
  try {
    const form = new FormData();
    form.append('file', file);
    form.append('path', drivePath);
    form.append('fileName', fileName);
    await fetch('/api/google/drive/upload', { method: 'POST', headers: apiAuthHeaders(), body: form });
  } catch { /* 미러 실패는 무시 */ }
}

/** 파일 업로드 → 다운로드 URL. path 예: `docs/{companyId}/{entityKey}/{recordKey}/{filename}` */
export async function uploadDoc(file: File, path: string): Promise<string | null> {
  if (!firebaseReady()) return null;
  try {
    const { getStorage, ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
    const st = getStorage(getFirebaseApp()!);
    const r = ref(st, path);
    await uploadBytes(r, file, { contentType: file.type || 'application/octet-stream' });
    void mirrorToDrive(file, path); // 회사 Drive 미러(비차단)
    return await getDownloadURL(r);
  } catch (e) {
    console.error('문서 업로드 실패', e);
    return null;
  }
}

/** 저장 경로 규칙(회사 격리). */
export function docPath(companyId: string, entityKey: string, recordKey: string, filename: string): string {
  const safe = filename.replace(/[^\w.\-가-힣]/g, '_');
  return `docs/${companyId}/${entityKey}/${recordKey || 'new'}/${Date.now()}_${safe}`;
}
