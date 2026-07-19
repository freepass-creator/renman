import { readFileSync } from 'fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getDatabase, ref, get } from 'firebase/database';
const env = Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
const app = initializeApp({ apiKey:env.NEXT_PUBLIC_FIREBASE_API_KEY, authDomain:env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, databaseURL:env.NEXT_PUBLIC_FIREBASE_DATABASE_URL, projectId:env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, appId:env.NEXT_PUBLIC_FIREBASE_APP_ID });
await signInWithEmailAndPassword(getAuth(app), 'pyh@teamjpk.com', '000000');
const db = getDatabase(app);
for (const node of ['assets','contracts','customers','companies','journal_entries','ledger','event_uploads','audit_logs']) {
  const snap = await get(ref(db, node));
  const v = snap.val();
  const n = v ? Object.keys(v).length : 0;
  let keys=[]; let sample='';
  if (v) { const f = v[Object.keys(v)[0]]; if (f&&typeof f==='object'){ keys=Object.keys(f); sample=JSON.stringify(f).slice(0,180);} }
  console.log(`[${node}] ${n}건`);
  if (keys.length) { console.log('   필드: '+keys.slice(0,26).join(', ')); console.log('   샘플: '+sample); }
}
process.exit(0);
