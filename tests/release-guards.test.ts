import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function functionBody(path: string, start: string, end: string): string {
  const source = readFileSync(join(root, path), 'utf8');
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from, `${path}: ${start} 없음`).toBeGreaterThanOrEqual(0);
  expect(to, `${path}: ${end} 없음`).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('출시 차단 회귀 가드', () => {
  it('자금일보 일괄 적용은 쓰기 직전에 현장수납 중복을 다시 검사한다', () => {
    const body = functionBody('app/payments/page.tsx', 'async function apply()', 'async function unmatch');
    const duplicateGuard = body.indexOf('findDuplicateCashPayment({ ...crec, _payments: existing }, r.tx)');
    const write = body.indexOf('await commitAll([');
    expect(duplicateGuard).toBeGreaterThanOrEqual(0);
    expect(write).toBeGreaterThan(duplicateGuard);
    expect(body).toContain('duplicateSkipped++');
  });

  it('다중 원본 업로드는 파일별 실패를 수집하고 부분 성공을 보고한다', () => {
    const body = functionBody('app/ingest/page.tsx', 'async function uploadOriginals', 'async function saveRecords');
    expect(body).toContain('catch (uploadError)');
    expect(body).toContain('failures.push');
    expect(body).toContain('원본 ${saved}건 접수 · ${failures.length}건 실패');
    expect(body).toContain('finally');
  });

  it('계약 회차 엑셀은 화면 200행 제한과 분리된 전체 필터 행을 사용한다', () => {
    const contract = readFileSync(join(root, 'app/contract/page.tsx'), 'utf8');
    expect(contract).toContain('exportRows={(isSchedule ? scheduleRows : undefined)');

    const sheet = readFileSync(join(root, 'components/ui/excel-sheet.tsx'), 'utf8');
    expect(sheet).toContain('exportRows ? applyView(exportRows) : view');
    expect(sheet).toContain('onView?.({ rows: exportView, cols: visibleCols })');
  });

  it('감사 Diff의 마스킹 결과가 같아도 실제 변경 사실을 표시한다', () => {
    const audit = readFileSync(join(root, 'app/audit/page.tsx'), 'utf8');
    expect(audit).toContain('const maskedChange = changed && beforeShown === afterShown');
    expect(audit).toContain('마스킹 영역 변경');
  });
});
