import { spawnSync } from 'node:child_process';

const npmCli = process.env.npm_execpath;
const command = npmCli ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const commandArgs = npmCli ? [npmCli, 'audit', '--json'] : ['audit', '--json'];
const result = spawnSync(command, commandArgs, {
  cwd: process.cwd(),
  encoding: 'utf8',
  shell: false,
});

const stdout = result.stdout || '';
const stderr = result.stderr || '';
if (result.error || !stdout.trim()) {
  console.error(`의존성 감사 실행 실패: ${result.error?.message || stderr.trim() || '결과 없음'}`);
  process.exit(1);
}

let report: {
  metadata?: {
    vulnerabilities?: Record<'info' | 'low' | 'moderate' | 'high' | 'critical' | 'total', number>;
  };
};
try {
  report = JSON.parse(stdout);
} catch {
  console.error('의존성 감사 결과를 해석할 수 없습니다.');
  process.exit(1);
}

const counts = report.metadata?.vulnerabilities;
if (!counts) {
  console.error('의존성 감사 결과에 취약점 집계가 없습니다.');
  process.exit(1);
}

console.log(
  `의존성 감사: critical ${counts.critical} · high ${counts.high} · ` +
  `moderate ${counts.moderate} · low ${counts.low}`,
);

if (counts.critical > 0 || counts.high > 0) {
  console.error('배포 차단: critical/high 의존성 취약점이 남아 있습니다.');
  process.exit(1);
}

console.log('의존성 보안 게이트 통과: critical/high 0건');
