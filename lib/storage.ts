// 문서 원본 파일 저장 — Firebase Storage. 등록증·보험증권·계약서·고지서 스캔 원본 보관·열람.
// Firebase 미설정(.env.local 없음)이면 null 반환 → 호출측이 "파일 미첨부"로 처리(로컬 미리보기 단계).
import { getFirebaseApp, firebaseReady } from './firebase/client';

export function storageReady(): boolean { return firebaseReady(); }

/** 파일 업로드 → 다운로드 URL. path 예: `docs/{companyId}/{entityKey}/{recordKey}/{filename}` */
export async function uploadDoc(file: File, path: string): Promise<string | null> {
  if (!firebaseReady()) return null;
  try {
    const { getStorage, ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
    const st = getStorage(getFirebaseApp()!);
    const r = ref(st, path);
    await uploadBytes(r, file, { contentType: file.type || 'application/octet-stream' });
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
