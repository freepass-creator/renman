import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.isFile() && entry.name.endsWith('.tsx') ? [path] : [];
  });
}

const operationalFiles = [
  ...tsxFiles(join(root, 'app')).filter((file) => !file.includes(`${join('app', 'dev')}\\`) && !file.includes(`${join('app', 'dev')}/`)),
  ...tsxFiles(join(root, 'components')).filter((file) => !file.includes(`${join('components', 'ui')}\\`) && !file.includes(`${join('components', 'ui')}/`)),
];
const operationalPageFiles = tsxFiles(join(root, 'app')).filter(
  (file) => !file.includes(`${join('app', 'dev')}\\`) && !file.includes(`${join('app', 'dev')}/`),
);

// 일반 실행 버튼이 아닌 복합 위젯·복구 화면만 네이티브 button을 허용한다.
// 새 파일을 추가하기 전에 Btn/TextLink/PillTabs/ActionMenu로 표현할 수 있는지 먼저 판단한다.
const nativeButtonExceptions = new Set([
  'app/audit/page.tsx',
  'app/error.tsx',
  'app/global-error.tsx',
  'app/page.tsx',
  'components/FacetRail.tsx',
  'components/InfoDoc.tsx',
  'components/m/MBackBar.tsx',
  'components/QuickInput.tsx',
  'components/SearchBox.tsx',
  'components/SessionBar.tsx',
  'components/TopSearch.tsx',
  'components/vehicle-detail/desk.tsx',
  'components/vehicle-detail/panels/StatusPanel.tsx',
  'components/vehicle-detail/VehicleDetail.tsx',
  'components/work/PenaltyBucketPanel.tsx',
  'components/WorkbenchBar.tsx',
]);

describe('UI 공용 원자 규격', () => {
  it('운영 화면에서 네이티브 select·textarea를 직접 만들지 않는다', () => {
    const violations = operationalFiles.flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return /<(?:select|textarea)\b/.test(source) ? [relative(root, file)] : [];
    });
    expect(violations).toEqual([]);
  });

  it('페이지가 공용 컨트롤의 내부 스타일 헬퍼를 직접 조립하지 않는다', () => {
    const violations = operationalFiles.flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return /\b(?:fieldStyle|selectStyle|toggleStyle)\b/.test(source) ? [relative(root, file)] : [];
    });
    expect(violations).toEqual([]);
  });

  it('행 선택 체크박스를 페이지에서 직접 만들지 않는다', () => {
    const violations = operationalFiles.flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return /<input\b[^>]*\btype=["']checkbox["']/.test(source) ? [relative(root, file)] : [];
    });
    expect(violations).toEqual([]);
  });

  it('핵심 원장은 웹 표를 축소하지 않고 모바일 전용 카드 매핑을 제공한다', () => {
    const pages = [
      'app/status/page.tsx',
      'app/risk/page.tsx',
      'app/work/page.tsx',
      'app/receivables/page.tsx',
      'app/asset/page.tsx',
      'app/contract/page.tsx',
      'app/cash/page.tsx',
    ];
    const violations = pages.filter((path) => !readFileSync(join(root, path), 'utf8').includes('mobileCard='));
    expect(violations).toEqual([]);

    const frame = readFileSync(join(root, 'components/ui/ledger-frame.tsx'), 'utf8');
    expect(frame).toContain('const colViewControl = !mobile && showColView');
    expect(frame).toContain('view != null && colViewControl != null');
  });

  it('모바일은 업무·단건입력을 전용 경로로 제공하고 웹 데이터센터로 보내지 않는다', () => {
    const tabBar = readFileSync(join(root, 'components/m/MTabBar.tsx'), 'utf8');
    const home = readFileSync(join(root, 'app/m/page.tsx'), 'utf8');
    const entry = readFileSync(join(root, 'app/m/entry/page.tsx'), 'utf8');
    const work = readFileSync(join(root, 'app/m/work/page.tsx'), 'utf8');
    const workDetail = readFileSync(join(root, 'app/m/work/[id]/page.tsx'), 'utf8');

    expect(tabBar).toContain("href: '/m/work'");
    expect(tabBar).not.toContain("href: '/m/risk', label: '리스크'");
    expect(home).toContain("router.push(t ? `/m/search?q=");
    expect(home).toContain("new Set(['/risk', '/status', '/work'])");
    expect(entry).toContain('<QuickInput');
    expect(entry).not.toMatch(/router\.push\(['"]\/(?:ingest|inbox)/);
    expect(work).toContain('buildWorkItemLedgerRows');
    expect(workDetail).toContain('workCreateKindOf(record.workType || record.category)');
    expect(workDetail).toContain('record={editableRecord}');
  });

  it('모바일 전용 셸에는 숨겨진 웹 상단바 여백이 남지 않는다', () => {
    const sessionBar = readFileSync(join(root, 'components/SessionBar.tsx'), 'utf8');
    expect(sessionBar).toContain('if (customMobileShell)');
    expect(sessionBar).toContain("document.body.style.paddingTop = '0px'");
    expect(sessionBar).toContain("document.body.style.paddingBottom = '0px'");
  });

  it('일반 실행 버튼을 페이지에서 새로 손조립하지 않는다', () => {
    const violations = operationalFiles.flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      const path = relative(root, file).replaceAll('\\', '/');
      return /<button\b/.test(source) && !nativeButtonExceptions.has(path) ? [path] : [];
    });
    expect(violations).toEqual([]);
  });

  it('상세패널 닫기와 기능 메뉴 문법을 페이지에서 복제하지 않는다', () => {
    const violations = operationalFiles.flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return /ledger-record-panel__close|aria-haspopup=["']menu["']/.test(source) ? [relative(root, file)] : [];
    });
    expect(violations).toEqual([]);
  });

  it('운영 페이지에 개발용 데이터 마이그레이션 실행 버튼을 노출하지 않는다', () => {
    const violations = operationalPageFiles.flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return /\bMigrateDataButton\b/.test(source) ? [relative(root, file)] : [];
    });
    expect(violations).toEqual([]);
  });

  it('개발 화면과 개발용 메뉴는 운영 배포에서 차단한다', () => {
    const devLayout = readFileSync(join(root, 'app/dev/layout.tsx'), 'utf8');
    expect(devLayout).toContain("process.env.NODE_ENV === 'production'");
    expect(devLayout).toContain('notFound()');

    const nav = readFileSync(join(root, 'lib/nav.ts'), 'utf8');
    expect(nav).toMatch(/href: '\/dev\/data'[^\n]+devOnly: true/);

    const sessionBar = readFileSync(join(root, 'components/SessionBar.tsx'), 'utf8');
    expect(sessionBar).toContain("!it.devOnly || process.env.NODE_ENV !== 'production'");

    const admin = readFileSync(join(root, 'app/admin/page.tsx'), 'utf8');
    expect(admin).toMatch(/process\.env\.NODE_ENV !== 'production'[\s\S]+계정 \(dev\)/);
  });
});
