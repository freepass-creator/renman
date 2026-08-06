/**
 * .env.local 입력 도우미 — `npm run env:setup`
 *
 * 왜 있나: 키를 채팅·이슈에 붙여넣지 않고, 파일을 손으로 열지도 않게 하려고.
 * 물어보는 대로 붙여넣으면 이 스크립트가 .env.local 의 해당 줄만 갈아끼운다.
 *
 *  · 값은 화면에 다시 출력하지 않는다(어깨너머·스크롤백 노출 방지). 확인은 «채워짐/비어있음» 으로만.
 *  · 그냥 Enter = 건너뛰기(기존 값 유지). 지우려면 `-` 한 글자.
 *  · 주석·순서는 그대로 둔다. 기존 파일이 없으면 .env.local.example 을 바탕으로 만든다.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV = resolve(ROOT, '.env.local');
const SAMPLE = resolve(ROOT, '.env.local.example');

/** 물어볼 항목 — 순서 = 실제로 받으러 가는 순서. */
const FIELDS = [
  { section: 'Firebase 웹 SDK — 콘솔 ▸ 프로젝트 설정 ▸ 내 앱(웹) ▸ firebaseConfig' },
  { key: 'NEXT_PUBLIC_FIREBASE_API_KEY', label: 'apiKey' },
  { key: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', label: 'authDomain' },
  { key: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', label: 'projectId' },
  { key: 'NEXT_PUBLIC_FIREBASE_DATABASE_URL', label: 'databaseURL (없으면 Enter)' },
  { key: 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', label: 'storageBucket  ★Storage 활성화 후 값이 생긴다' },
  { key: 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', label: 'messagingSenderId' },
  { key: 'NEXT_PUBLIC_FIREBASE_APP_ID', label: 'appId' },
  { section: '서버 전용 — 콘솔 ▸ 프로젝트 설정 ▸ 서비스 계정 ▸ 새 비공개 키 생성' },
  { key: 'FIREBASE_ADMIN_KEY', label: '서비스계정 JSON 전체를 한 줄로 (없으면 Enter)' },
  { section: 'Gemini OCR — aistudio.google.com/apikey ▸ API 키 만들기' },
  { key: 'GEMINI_API_KEY', label: 'API 키 (없으면 Enter — OCR만 꺼진다)' },
];

const KEYS = FIELDS.filter((f) => f.key).map((f) => f.key);

function readEnv() {
  if (existsSync(ENV)) return readFileSync(ENV, 'utf8');
  if (existsSync(SAMPLE)) { copyFileSync(SAMPLE, ENV); return readFileSync(ENV, 'utf8'); }
  return KEYS.map((k) => `${k}=`).join('\n') + '\n';
}

/** `KEY=...` 줄만 교체. 없으면 끝에 붙인다. 주석·빈 줄·순서는 건드리지 않는다. */
function setValue(text, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(text) ? text.replace(re, line) : `${text.replace(/\s*$/, '')}\n${line}\n`;
}

function currentOf(text, key) {
  const m = text.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : '';
}

const rl = createInterface({ input: process.stdin, output: process.stdout });

console.log('\n.env.local 입력 — 값은 화면에 다시 출력하지 않습니다.');
console.log('그냥 Enter = 건너뛰기(기존 값 유지) · `-` 입력 = 값 지우기\n');

let text = readEnv();
let changed = 0;

for (const f of FIELDS) {
  if (f.section) { console.log(`\n── ${f.section}`); continue; }
  const has = currentOf(text, f.key) !== '';
  const answer = (await rl.question(`  ${f.label}  [${has ? '채워짐' : '비어있음'}] : `)).trim();
  if (!answer) continue;
  text = setValue(text, f.key, answer === '-' ? '' : answer);
  changed += 1;
}

rl.close();
writeFileSync(ENV, text, 'utf8');

console.log(`\n저장했습니다 — .env.local (${changed}개 항목 변경)\n`);
console.log('현재 상태:');
for (const key of KEYS) console.log(`  ${currentOf(text, key) ? '✔' : '·'} ${key}`);
console.log('\n다음: dev 재시작해야 반영됩니다 (Next 는 .env 를 부팅 때만 읽습니다).');
console.log('  npm run dev\n');
