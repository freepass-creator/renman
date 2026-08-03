import { google } from 'googleapis';
import {
  DEFAULT_DATABASE,
  backupPrefix,
  collectionIdsFromArgs,
  loadAdminCredentials,
  loadProjectEnv,
  normalizeGsUri,
  requireExpectedProject,
} from './firestore-managed-common.mts';

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const checkApi = args.includes('--check-api');
const waitForCompletion = args.includes('--wait');
const env = loadProjectEnv();
const project = requireExpectedProject(env);
const database = String(env.FIRESTORE_DATABASE_ID || DEFAULT_DATABASE).trim();
const bucket = normalizeGsUri(
  env.FIRESTORE_BACKUP_BUCKET || env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  'FIRESTORE_BACKUP_BUCKET',
);
const outputUriPrefix = backupPrefix(bucket);
const collectionIds = collectionIdsFromArgs(args);
const credentials = loadAdminCredentials(env);

console.log(`Firestore 백업 대상: ${project}/${database}`);
console.log(`내보내기 위치: ${outputUriPrefix}`);
console.log(`컬렉션: ${collectionIds?.join(', ') || '전체'}`);

if (!execute) {
  if (checkApi) {
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/cloud-platform',
        'https://www.googleapis.com/auth/datastore',
      ],
    });
    const authClient = await auth.getClient();
    const firestore = google.firestore({ version: 'v1', auth: authClient });
    const storage = google.storage({ version: 'v1', auth: authClient });
    const resourceManager = google.cloudresourcemanager({ version: 'v1', auth: authClient });
    const databaseResult = await firestore.projects.databases.get({
      name: `projects/${project}/databases/${database}`,
    });
    const bucketName = bucket.slice('gs://'.length).split('/')[0];
    const bucketResult = await storage.buckets.get({ bucket: bucketName });
    console.log(
      `읽기 권한 확인: Firestore ${databaseResult.data.locationId || '위치 미상'} · ` +
      `Storage ${bucketResult.data.location || '위치 미상'}`,
    );
    console.log(
      `PITR: ${databaseResult.data.pointInTimeRecoveryEnablement || '상태 미상'} · ` +
      `삭제 보호: ${databaseResult.data.deleteProtectionState || '상태 미상'}`,
    );
    if (databaseResult.data.deleteProtectionState !== 'DELETE_PROTECTION_ENABLED') {
      console.error('출시 차단: Firestore 삭제 보호가 활성화되어 있지 않습니다.');
      process.exit(1);
    }
    const requiredPermissions = [
      'datastore.databases.export',
      'datastore.databases.import',
      'datastore.operations.get',
    ];
    const permissionResult = await resourceManager.projects.testIamPermissions({
      resource: project,
      requestBody: { permissions: requiredPermissions },
    });
    const granted = new Set(permissionResult.data.permissions || []);
    const missing = requiredPermissions.filter((permission) => !granted.has(permission));
    if (missing.length) {
      console.error(
        `백업·복구 IAM 권한 누락: ${missing.join(', ')}. ` +
        '실행 서비스 계정에 roles/datastore.importExportAdmin 역할을 부여하세요.',
      );
      process.exit(1);
    }
    console.log('백업·복구 IAM 권한 확인 완료');
  }
  console.log('백업 사전검증 통과. 실제 실행은 --execute와 FIRESTORE_BACKUP_CONFIRM=BACKUP:renman-dd0a2가 필요합니다.');
  process.exit(0);
}

if (env.FIRESTORE_BACKUP_CONFIRM !== `BACKUP:${project}`) {
  throw new Error(`실행 확인값이 없습니다. FIRESTORE_BACKUP_CONFIRM=BACKUP:${project}를 설정하세요.`);
}

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/datastore',
  ],
});
const authClient = await auth.getClient();
const firestore = google.firestore({ version: 'v1', auth: authClient });
let response;
try {
  response = await firestore.projects.databases.exportDocuments({
    name: `projects/${project}/databases/${database}`,
    requestBody: {
      outputUriPrefix,
      ...(collectionIds ? { collectionIds } : {}),
    },
  });
} catch (error) {
  const code = typeof error === 'object' && error && 'code' in error ? Number(error.code) : 0;
  const apiMessage =
    typeof error === 'object' &&
    error &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response &&
    'data' in error.response &&
    typeof error.response.data === 'object' &&
    error.response.data &&
    'error' in error.response.data &&
    typeof error.response.data.error === 'object' &&
    error.response.data.error &&
    'message' in error.response.data.error
      ? String(error.response.data.error.message)
      : error instanceof Error
        ? error.message
        : String(error);
  if (code === 403) {
    console.error(`백업 API 권한 거부: ${apiMessage}`);
    console.error(
      '실행 주체의 roles/datastore.importExportAdmin 역할과 Firestore 서비스 에이전트의 백업 버킷 접근 권한을 확인하세요.',
    );
    console.error('백업 작업은 시작되지 않았습니다.');
    process.exit(1);
  }
  console.error(`백업 작업 시작 실패: ${apiMessage}`);
  process.exit(1);
}

if (!response.data.name) throw new Error('백업 작업이 생성됐지만 작업 ID를 받지 못했습니다.');
console.log(`백업 작업 시작: ${response.data.name}`);
if (!waitForCompletion) {
  console.log('Google Cloud 작업이 완료 상태가 된 뒤 해당 경로를 복구 입력값으로 보관하세요.');
  process.exit(0);
}

for (let attempt = 0; attempt < 120; attempt += 1) {
  const operation = await firestore.projects.databases.operations.get({ name: response.data.name });
  if (operation.data.done) {
    if (operation.data.error) {
      throw new Error(`백업 작업 실패: ${operation.data.error.code || ''} ${operation.data.error.message || ''}`.trim());
    }
    console.log(`백업 완료: ${outputUriPrefix}`);
    process.exit(0);
  }
  if (attempt % 6 === 0) console.log('백업 진행 중…');
  await new Promise((resolve) => setTimeout(resolve, 5_000));
}

throw new Error(`백업 완료 대기시간을 초과했습니다. 작업 ID로 상태를 확인하세요: ${response.data.name}`);
