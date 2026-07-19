import { readFileSync } from 'fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getDatabase, ref, get, child } from 'firebase/database';
const env = Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
const app = initializeApp({ apiKey:env.NEXT_PUBLIC_FIREBASE_API_KEY, authDomain:env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, databaseURL:env.NEXT_PUBLIC_FIREBASE_DATABASE_URL, projectId:env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, appId:env.NEXT_PUBLIC_FIREBASE_APP_ID });
await signInWithEmailAndPassword(getAuth(app), 'pyh@teamjpk.com', '000000');
const db = getDatabase(app);
// v5 하위 노드별 건수
const snap = await get(ref(db,'v5'));
const v = snap.val();
console.log('v5 하위 노드:', v ? Object.keys(v).length+'개' : '없음(null)');
if (v) for (const k of Object.keys(v)) { const c = v[k] && typeof v[k]==='object' ? Object.keys(v[k]).length : '(값)'; console.log('  v5/'+k+': '+c+'건'); }
// 루트에 다른 버전 있나 (shallow 시도)
try { const r = await get(ref(db,'/')); const rv=r.val(); console.log('\n루트 키:', rv?Object.keys(rv).join(', '):'접근불가/없음'); } catch(e){ console.log('루트 읽기:', e.code); }
process.exit(0);
