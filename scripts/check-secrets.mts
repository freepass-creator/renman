import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const checks = [
  { name: 'Google/Firebase API key', pattern: /AIza[0-9A-Za-z_-]{20,}/g },
  { name: 'private key', pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g },
  { name: 'GitHub token', pattern: /gh[opsu]_[0-9A-Za-z]{30,}/g },
  { name: 'Slack token', pattern: /xox[baprs]-[0-9A-Za-z-]{20,}/g },
];

const findings: string[] = [];
for (const filename of tracked) {
  let contents: string;
  try {
    const buffer = fs.readFileSync(filename);
    if (buffer.includes(0)) continue;
    contents = buffer.toString('utf8');
  } catch {
    continue;
  }

  for (const check of checks) {
    check.pattern.lastIndex = 0;
    if (check.pattern.test(contents)) findings.push(`${filename}: ${check.name}`);
  }
}

if (findings.length) {
  console.error('추적 파일에서 비밀정보 패턴을 발견했습니다:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`비밀정보 검사 통과: 추적 파일 ${tracked.length}개`);
