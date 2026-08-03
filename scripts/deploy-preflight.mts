import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function parseEnv(contents: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const fileEnv = ['.env', '.env.production', '.env.local', '.env.production.local'].reduce<
  Record<string, string>
>((values, filename) => {
  const envPath = path.join(root, filename);
  return fs.existsSync(envPath)
    ? { ...values, ...parseEnv(fs.readFileSync(envPath, 'utf8')) }
    : values;
}, {});
const env = { ...fileEnv, ...process.env };
const required = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
] as const;

const failures: string[] = [];
const missing = required.filter((key) => !String(env[key] || '').trim());
if (missing.length) failures.push(`필수 환경변수 누락: ${missing.join(', ')}`);

const expectedProject = 'renman-dd0a2';
const configuredProject = String(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '').trim();
if (configuredProject && configuredProject !== expectedProject) {
  failures.push(
    `Firebase 프로젝트 불일치: .firebaserc=${expectedProject}, NEXT_PUBLIC_FIREBASE_PROJECT_ID=${configuredProject}`,
  );
}

/**
 * 서비스 계정 — 런타임(lib/api-auth.ts)과 «같은 해석»이어야 한다.
 *   FIREBASE_ADMIN_KEY(인라인 JSON) 우선 · 없으면 FIREBASE_ADMIN_KEY_FILE(JSON 경로).
 * 예전엔 인라인만 인정해서, 파일 방식으로 정상 동작하는 로컬에서 배포가 영구 차단됐다
 * (= 규칙 수정이 배포되지 못하고 로컬 파일에만 남는 사고 원인).
 */
function readAdminKey(): { json: string; from: string } | null {
  const inline = String(env.FIREBASE_ADMIN_KEY || '').trim();
  if (inline) return { json: inline, from: 'FIREBASE_ADMIN_KEY' };
  const keyFile = String(env.FIREBASE_ADMIN_KEY_FILE || '').trim();
  if (!keyFile) return null;
  const abs = path.isAbsolute(keyFile) ? keyFile : path.join(root, keyFile);
  if (!fs.existsSync(abs)) {
    failures.push(`FIREBASE_ADMIN_KEY_FILE 경로에 파일이 없음: ${keyFile}`);
    return null;
  }
  return { json: fs.readFileSync(abs, 'utf8'), from: `FIREBASE_ADMIN_KEY_FILE(${path.basename(abs)})` };
}

const adminKey = readAdminKey();
if (!adminKey) {
  if (!String(env.FIREBASE_ADMIN_KEY_FILE || '').trim()) {
    failures.push('FIREBASE_ADMIN_KEY 또는 FIREBASE_ADMIN_KEY_FILE 누락: API 인증 및 Custom Claims 설정에 필요');
  }
} else {
  try {
    const parsed = JSON.parse(adminKey.json);
    if (parsed.project_id !== expectedProject || !parsed.client_email || !parsed.private_key) {
      failures.push(`서비스 계정이 대상 프로젝트의 유효한 JSON이 아님 — ${adminKey.from}`);
    }
  } catch {
    failures.push(`서비스 계정이 올바른 JSON 형식이 아님 — ${adminKey.from}`);
  }
}

for (const filename of ['firestore.rules', 'storage.rules', 'firebase.json']) {
  if (!fs.existsSync(path.join(root, filename))) failures.push(`${filename} 파일 누락`);
}

if (failures.length) {
  console.error('배포 사전 검증 실패:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`배포 사전 검증 통과: Firebase project=${expectedProject}`);
