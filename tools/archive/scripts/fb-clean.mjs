import { initializeApp } from 'firebase/app';
import { getFirestore, doc, deleteDoc } from 'firebase/firestore';
const app = initializeApp({ apiKey:'AIzaSyAXU23aUSy-SCrtCNGjVxATWHPmQDGgxNg', authDomain:'renman-dd0a2.firebaseapp.com', projectId:'renman-dd0a2', storageBucket:'renman-dd0a2.firebasestorage.app', messagingSenderId:'220476662395', appId:'1:220476662395:web:7c2c14475e743ed04778de' });
try { await deleteDoc(doc(getFirestore(app), '_conntest', 'ping')); console.log('테스트 문서 삭제 완료'); } catch(e){ console.log('삭제 스킵', e.message); }
process.exit(0);
