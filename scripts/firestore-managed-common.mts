import fs from 'node:fs';
import path from 'node:path';

export const EXPECTED_PROJECT = 'renman-dd0a2';
export const DEFAULT_DATABASE = '(default)';

export function loadProjectEnv(root = process.cwd()): Record<string, string> {
  const values: Record<string, string> = {};
  for (const filename of ['.env', '.env.production', '.env.local', '.env.production.local']) {
    const envPath = path.join(root, filename);
    if (!fs.existsSync(envPath)) continue;
    for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const separator = line.indexOf('=');
      if (separator < 1) continue;
      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) value = value.slice(1, -1);
      values[key] = value;
    }
  }
  return { ...values, ...process.env } as Record<string, string>;
}

export function requireExpectedProject(env: Record<string, string>): string {
  const project = String(
    env.FIRESTORE_BACKUP_PROJECT || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  ).trim();
  if (project !== EXPECTED_PROJECT) {
    throw new Error(`대상 프로젝트가 ${EXPECTED_PROJECT}가 아닙니다: ${project || '(미설정)'}`);
  }
  return project;
}

export function normalizeGsUri(value: string, label: string): string {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  if (!trimmed) throw new Error(`${label}이(가) 설정되지 않았습니다.`);
  const uri = trimmed.startsWith('gs://') ? trimmed : `gs://${trimmed}`;
  if (!/^gs:\/\/[a-z0-9][a-z0-9._-]+(?:\/.+)?$/i.test(uri)) {
    throw new Error(`${label} 형식이 올바르지 않습니다: gs://bucket/path 형식이어야 합니다.`);
  }
  return uri;
}

export function parseGsUri(value: string, label: string): { bucket: string; objectPrefix: string } {
  const uri = normalizeGsUri(value, label);
  const [bucket, ...pathParts] = uri.slice('gs://'.length).split('/');
  return { bucket, objectPrefix: pathParts.join('/') };
}

export function collectionIdsFromArgs(args: string[]): string[] | undefined {
  const raw = args.find((arg) => arg.startsWith('--collections='))?.slice('--collections='.length);
  const values = raw?.split(',').map((value) => value.trim()).filter(Boolean) || [];
  return values.length ? [...new Set(values)] : undefined;
}

export function backupPrefix(bucket: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `${bucket}/firestore-managed/${stamp}`;
}

export function loadAdminCredentials(env: Record<string, string>): Record<string, unknown> {
  let raw = String(env.FIREBASE_ADMIN_KEY || '').trim();
  if (!raw) {
    const configured = String(env.FIREBASE_ADMIN_KEY_FILE || '').trim();
    if (!configured) throw new Error('FIREBASE_ADMIN_KEY 또는 FIREBASE_ADMIN_KEY_FILE이 필요합니다.');
    const keyPath = path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
    if (!fs.existsSync(keyPath)) throw new Error(`서비스 계정 키 파일을 찾을 수 없습니다: ${configured}`);
    raw = fs.readFileSync(keyPath, 'utf8');
  }
  const credentials = JSON.parse(raw) as Record<string, unknown>;
  if (
    credentials.project_id !== EXPECTED_PROJECT ||
    typeof credentials.client_email !== 'string' ||
    typeof credentials.private_key !== 'string'
  ) throw new Error(`서비스 계정 키가 ${EXPECTED_PROJECT} 프로젝트의 유효한 키가 아닙니다.`);
  return credentials;
}
