import { google } from 'googleapis';
import {
  DEFAULT_DATABASE,
  loadAdminCredentials,
  loadProjectEnv,
  requireExpectedProject,
} from './firestore-managed-common.mts';

const env = loadProjectEnv();
const project = requireExpectedProject(env);
const database = String(env.FIRESTORE_DATABASE_ID || DEFAULT_DATABASE).trim();
const databaseName = `projects/${project}/databases/${database}`;
const credentials = loadAdminCredentials(env);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/datastore',
  ],
});
const authClient = await auth.getClient();
const firestore = google.firestore({ version: 'v1', auth: authClient });
const result = await firestore.projects.databases.get({ name: databaseName });
const state = result.data.deleteProtectionState || '상태 미상';

console.log(`Firestore 삭제 보호 대상: ${databaseName}`);
console.log(`현재 상태: ${state}`);
if (state !== 'DELETE_PROTECTION_ENABLED') {
  throw new Error('출시 차단: Firestore 삭제 보호가 활성화되어 있지 않습니다.');
}
console.log('Firestore 삭제 보호 검증 통과');
