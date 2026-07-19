import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
const cfg = {
  apiKey: 'AIzaSyAXU23aUSy-SCrtCNGjVxATWHPmQDGgxNg',
  authDomain: 'renman-dd0a2.firebaseapp.com',
  projectId: 'renman-dd0a2',
  storageBucket: 'renman-dd0a2.firebasestorage.app',
  messagingSenderId: '220476662395',
  appId: '1:220476662395:web:7c2c14475e743ed04778de',
};
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
