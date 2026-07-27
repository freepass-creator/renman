import { initializeApp } from 'firebase/app';
import { getFirestore, doc, deleteDoc } from 'firebase/firestore';
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
try { await deleteDoc(doc(getFirestore(app), '_conntest', 'ping')); console.log('테스트 문서 삭제 완료'); } catch(e){ console.log('삭제 스킵', e.message); }
process.exit(0);
