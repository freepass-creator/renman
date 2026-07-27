import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
const cfg = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
if (Object.values(cfg).some((value) => !value)) {
  throw new Error('NEXT_PUBLIC_FIREBASE_* environment variables are required');
}
const app = initializeApp(cfg);
const db = getFirestore(app);
const t = setTimeout(() => { console.log('RESULT: TIMEOUT 10s — DB 미생성/미도달 가능성'); process.exit(0); }, 10000);
try {
  await setDoc(doc(db, '_conntest', 'ping'), { at: new Date().toISOString(), ok: true });
  const s = await getDoc(doc(db, '_conntest', 'ping'));
  clearTimeout(t);
  console.log('RESULT: SUCCESS — write+read OK, exists=' + s.exists());
} catch (e) {
  clearTimeout(t);
  console.log('RESULT: ERROR code=' + (e.code || '?') + ' | ' + (e.message || e).slice(0, 200));
}
process.exit(0);
