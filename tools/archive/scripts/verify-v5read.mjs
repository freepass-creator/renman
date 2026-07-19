import { readFileSync } from 'fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getDatabase, ref, get, query, limitToFirst } from 'firebase/database';

const env = Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
const cfg = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY, authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.NEXT_PUBLIC_FIREBASE_DATABASE_URL, projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
const app = initializeApp(cfg);
const auth = getAuth(app);
await signInWithEmailAndPassword(auth, 'pyh@teamjpk.com', '000000');
console.log('AUTH OK:', auth.currentUser?.email);
const db = getDatabase(app);
for (const node of ['vehicles','contracts','customers','insurances','penalties','bank_tx','history_entries','companies','schedules']) {
  try {
    const snap = await get(ref(db, 'v5/'+node));
    const val = snap.val();
    const n = val ? Object.keys(val).length : 0;
    let sampleKeys = [];
    if (val) { const first = val[Object.keys(val)[0]]; sampleKeys = first && typeof first==='object' ? Object.keys(first) : ['(원시값)']; }
    console.log(`v5/${node}: ${n}건 | 필드: ${sampleKeys.slice(0,22).join(', ')}`);
  } catch (e) { console.log(`v5/${node}: 읽기실패 ${e.code||e.message}`); }
}
process.exit(0);
