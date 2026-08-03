import { google } from 'googleapis';
import {
  DEFAULT_DATABASE,
  collectionIdsFromArgs,
  loadAdminCredentials,
  loadProjectEnv,
  normalizeGsUri,
  parseGsUri,
  requireExpectedProject,
} from './firestore-managed-common.mts';

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const inputArg = args.find((arg) => arg.startsWith('--input='))?.slice('--input='.length) || '';
const env = loadProjectEnv();
const project = requireExpectedProject(env);
const database = String(env.FIRESTORE_DATABASE_ID || DEFAULT_DATABASE).trim();
const inputUriPrefix = normalizeGsUri(inputArg || env.FIRESTORE_RESTORE_INPUT || '', '복구 입력 경로');
const collectionIds = collectionIdsFromArgs(args);
const credentials = loadAdminCredentials(env);
const configuredBucket = parseGsUri(
  env.FIRESTORE_BACKUP_BUCKET || env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  'FIRESTORE_BACKUP_BUCKET',
);
const input = parseGsUri(inputUriPrefix, '복구 입력 경로');

if (input.bucket !== configuredBucket.bucket || !input.objectPrefix.startsWith('firestore-managed/')) {
  throw new Error(
    `승인된 관리형 백업 경로가 아닙니다: ` +
    `gs://${configuredBucket.bucket}/firestore-managed/ 아래 경로만 허용됩니다.`,
  );
}

console.log(`Firestore 복구 대상: ${project}/${database}`);
console.log(`가져오기 위치: ${inputUriPrefix}`);
console.log(`컬렉션: ${collectionIds?.join(', ') || '백업 전체'}`);
console.log('주의: 같은 문서 ID는 덮어쓰지만 백업 이후 새로 생긴 문서를 자동 삭제하지는 않습니다.');

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

const [databaseResult, objectResult, permissionResult] = await Promise.all([
  firestore.projects.databases.get({ name: `projects/${project}/databases/${database}` }),
  storage.objects.list({
    bucket: input.bucket,
    prefix: `${input.objectPrefix}/`,
    maxResults: 1000,
  }),
  resourceManager.projects.testIamPermissions({
    resource: project,
    requestBody: { permissions: ['datastore.databases.import', 'datastore.operations.get'] },
  }),
]);

const exportMetadata = (objectResult.data.items || []).find((item) =>
  item.name?.endsWith('.overall_export_metadata'),
);
if (!exportMetadata?.name) {
  throw new Error('완료된 Firestore 내보내기 메타데이터를 백업 경로에서 찾지 못했습니다.');
}
const requiredPermissions = ['datastore.databases.import', 'datastore.operations.get'];
const granted = new Set(permissionResult.data.permissions || []);
const missing = requiredPermissions.filter((permission) => !granted.has(permission));
if (missing.length) throw new Error(`복구 IAM 권한 누락: ${missing.join(', ')}`);
console.log(`백업 메타데이터 확인: gs://${input.bucket}/${exportMetadata.name}`);
console.log(
  `복구 대상 상태: ${databaseResult.data.locationId || '위치 미상'} · ` +
  `PITR ${databaseResult.data.pointInTimeRecoveryEnablement || '상태 미상'} · ` +
  `삭제 보호 ${databaseResult.data.deleteProtectionState || '상태 미상'}`,
);
console.log('복구 IAM 권한 확인 완료');

if (!execute) {
  console.log('복구 사전검증만 수행했습니다. 실제 실행은 --execute와 FIRESTORE_RESTORE_CONFIRM=RESTORE:renman-dd0a2가 필요합니다.');
  process.exit(0);
}

if (env.FIRESTORE_RESTORE_CONFIRM !== `RESTORE:${project}`) {
  throw new Error(`실행 확인값이 없습니다. FIRESTORE_RESTORE_CONFIRM=RESTORE:${project}를 설정하세요.`);
}

let response;
try {
  response = await firestore.projects.databases.importDocuments({
    name: `projects/${project}/databases/${database}`,
    requestBody: {
      inputUriPrefix,
      ...(collectionIds ? { collectionIds } : {}),
    },
  });
} catch (error) {
  const code = typeof error === 'object' && error && 'code' in error ? Number(error.code) : 0;
  if (code === 403) {
    console.error('복구 권한 부족: 실행 서비스 계정에 roles/datastore.importExportAdmin 역할이 필요합니다.');
    console.error('권한을 부여한 뒤 승인된 백업 경로로 다시 실행하세요.');
    process.exit(1);
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error(`복구 작업 시작 실패: ${message}`);
  process.exit(1);
}

if (!response.data.name) throw new Error('복구 작업이 생성됐지만 작업 ID를 받지 못했습니다.');
console.log(`복구 작업 시작: ${response.data.name}`);
console.log('복구 완료 후 미수·수납·자금일보 합계와 audit_logs를 반드시 재대사하세요.');
