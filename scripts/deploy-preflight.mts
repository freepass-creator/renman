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

const adminKey = String(env.FIREBASE_ADMIN_KEY || '').trim();
if (!adminKey) {
  failures.push('FIREBASE_ADMIN_KEY 누락: API 인증 및 Custom Claims 설정에 필요');
} else {
  try {
    const parsed = JSON.parse(adminKey);
    if (parsed.project_id !== expectedProject || !parsed.client_email || !parsed.private_key) {
      failures.push('FIREBASE_ADMIN_KEY가 대상 프로젝트의 유효한 서비스 계정 JSON이 아님');
    }
  } catch {
    failures.push('FIREBASE_ADMIN_KEY가 올바른 JSON 형식이 아님');
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
