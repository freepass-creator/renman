/**
 * 웹 단건 입력 입구 — QuickInput 하나 · 데이터센터는 파일 먼저 · 원장 탄생은 생성 패널.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('웹 단건 입력', () => {
  it('셸이 기존 QuickInput을 전역 호스트로 띄운다', () => {
    expect(read('app/layout.tsx')).toContain('AppShell');
    expect(read('components/AppShell.tsx')).toContain('QuickInputHost');
    expect(read('components/SessionBar.tsx')).toContain('openQuickInput');
    expect(read('lib/ui-bus.ts')).toContain("new Event('jpk:quick-input')");
    expect(read('components/QuickInput.tsx')).toContain('export function QuickInputHost');
    expect(read('components/CommandPalette.tsx')).toContain("label: '빠른 입력'");
  });

  it('모바일 업로드 탭은 같은 QuickInput을 인라인으로 쓴다', () => {
    const entry = read('app/m/entry/page.tsx');
    expect(entry).toContain('<QuickInput');
    expect(entry).not.toContain('QuickInputHost');
  });
});

describe('데이터센터 파일 먼저', () => {
  it('메뉴 진입은 무엇이든 올리기, 딥링크만 종류 패널', () => {
    const ingest = read('app/ingest/page.tsx');
    expect(ingest).toContain("const typedIntake = Boolean(typeQ || plateQ)");
    expect(ingest).toContain('useState(typedIntake)');
    expect(ingest).toContain('useState(!typedIntake)');
  });
});

describe('원장 탄생 문은 하나', () => {
  it('자산 빈 상태는 생성 패널을 연다 — 데이터센터로 보내지 않는다', () => {
    const asset = read('app/asset/page.tsx');
    expect(asset).toContain('setCreating(true)');
    expect(asset).toContain('VEHICLE_INTAKE_SPEC');
    expect(asset).not.toContain("openIngest('vehicle')");
  });

  it('계약 빈 상태는 생성 패널을 연다 — 데이터센터로 보내지 않는다', () => {
    const contract = read('app/contract/page.tsx');
    expect(contract).toContain('setCreating(true)');
    expect(contract).toContain('CONTRACT_INTAKE_SPEC');
    expect(contract).not.toContain("openIngest('contract')");
  });
});
