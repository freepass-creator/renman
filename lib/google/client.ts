/**
 * Google Workspace API 클라이언트 — Service Account 기반. (jpkerp5에서 이식)
 *   · 회사 워크스페이스(teamjpk.com) Drive에 문서 파일 저장. 서버 전용(키 클라 노출 X).
 *
 * 환경변수 (.env.local — jpkerp5와 동일 값 재사용):
 *   GOOGLE_SERVICE_ACCOUNT_KEY   Service Account JSON (raw JSON 또는 base64 한 줄)
 *   GOOGLE_IMPERSONATE_USER      (도메인 위임) 대행 계정 — 예 pyh@teamjpk.com. 그 계정 권한으로 Drive 쓰기.
 *   GOOGLE_DRIVE_ROOT_FOLDER_ID  루트 폴더 ID (그 아래 자산/계약/… 트리)
 *   GOOGLE_DRIVE_SHARED_DRIVE_ID 공유 드라이브 ID
 */
import { google } from 'googleapis';

function loadServiceAccountKey(): Record<string, unknown> | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  try {
    if (!raw.trim().startsWith('{')) return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
    return JSON.parse(raw);
  } catch (e) {
    console.error('[google-client] GOOGLE_SERVICE_ACCOUNT_KEY parse 실패:', e);
    return null;
  }
}

const SCOPES_BY_SERVICE = {
  drive: ['https://www.googleapis.com/auth/drive'],
} as const;
export type GoogleService = keyof typeof SCOPES_BY_SERVICE;

function buildJwtClient(service: GoogleService, impersonateUser?: string) {
  const key = loadServiceAccountKey();
  if (!key) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY 미설정 — .env.local 에 Service Account JSON 필요');
  const subject = impersonateUser || process.env.GOOGLE_IMPERSONATE_USER || undefined;
  return new google.auth.JWT({
    email: String(key.client_email),
    key: String(key.private_key),
    scopes: [...SCOPES_BY_SERVICE[service]],
    subject, // Domain-Wide Delegation
  });
}

export function getDriveClient(impersonateUser?: string) {
  const auth = buildJwtClient('drive', impersonateUser);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return google.drive({ version: 'v3', auth: auth as any });
}

/** 연동 가능 상태 빠른 체크(env만 본다). */
export function workspaceConfigured(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) missing.push('GOOGLE_SERVICE_ACCOUNT_KEY');
  if (!process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID) missing.push('GOOGLE_DRIVE_ROOT_FOLDER_ID');
  return { ok: missing.length === 0, missing };
}
