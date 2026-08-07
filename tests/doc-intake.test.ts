/**
 * 문서 투입 공용 규격 — 「원장 생성 패널에 문서를 올리면 그 자리에서 만들어진다」.
 *
 * 과태료(고지서)·계약(계약서)·차량(등록증)이 화면 하나(DocIntakePanel)를 쓰고
 * 규격(spec)만 다르다. 원장마다 패널을 복사하면 「미완 건 폐기 금지」 같은 규칙이
 * 한쪽만 고쳐지므로, 여기서 «규격이 빠짐없이 채워졌는지»와 «화면이 하나인지»를 지킨다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENTITIES } from '@/lib/intake/entities';
import { isDocIntakeReady, makeDocIntakeRows, type DocIntakeSpec } from '@/lib/doc-intake';
import { PENALTY_INTAKE_SPEC } from '@/lib/penalty-intake';
import { CONTRACT_INTAKE_SPEC } from '@/lib/contract-intake';
import { VEHICLE_INTAKE_SPEC, deriveVehicleMatch } from '@/lib/vehicle-intake';

const SPECS: Array<[string, DocIntakeSpec]> = [
  ['과태료', PENALTY_INTAKE_SPEC],
  ['계약', CONTRACT_INTAKE_SPEC],
  ['차량', VEHICLE_INTAKE_SPEC],
];

const root = process.cwd();

describe('투입 규격', () => {
  it.each(SPECS)('%s — OCR 종류가 엔티티 선언과 같다', (name, spec) => {
    const entity = ENTITIES[spec.entityKey];
    expect(entity, `${name}: 엔티티 ${spec.entityKey} 없음`).toBeTruthy();
    expect(spec.ocrType, name).toBe(entity.ocrType);
  });

  it.each(SPECS)('%s — OCR API 가 그 종류를 지원한다', (name, spec) => {
    const specs = readFileSync(join(root, 'app/api/ocr/extract/type-specs.ts'), 'utf8');
    expect(specs, name).toContain(`${spec.ocrType}:`);
  });

  it.each(SPECS)('%s — 수기 보완칸이 필수 항목을 덮는다', (name, spec) => {
    // 못 읽어서 막힌 칸을 그 줄에서 채울 수 없으면 파일이 영영 등록되지 않는다.
    const missing = spec.missing({});
    const manual = new Set(spec.manual.map((f) => f.key));
    expect(missing.length, `${name}: 필수 항목이 없다`).toBeGreaterThan(0);
    expect(spec.manual.length, `${name}: 수기칸이 없다`).toBeGreaterThanOrEqual(missing.length);
    expect(manual.size, `${name}: 수기칸 key 중복`).toBe(spec.manual.length);
  });

  it.each(SPECS)('%s — 빈 레코드는 저장 불가, 필수칸을 채우면 가능', (name, spec) => {
    const empty = makeDocIntakeRows([{ name: 'a.pdf' } as File], spec.entityKey, 1)[0];
    expect(isDocIntakeReady(spec, empty), name).toBe(false);
    const filled = { ...empty, rec: Object.fromEntries(spec.manual.map((f) => [f.key, f.key === 'amount' ? 1000 : '2026-01-01'])) };
    expect(spec.missing(filled.rec), `${name}: ${spec.missing(filled.rec).join(',')}`).toEqual([]);
  });

  it.each(SPECS)('%s — 대조용 원장이 실재한다', (name, spec) => {
    for (const key of spec.refEntities) {
      expect(ENTITIES[key], `${name}: ref ${key}`).toBeTruthy();
    }
  });

  it('행 id 접두가 원장마다 다르다 — 여러 투입이 섞여도 안 뭉친다', () => {
    const ids = SPECS.map(([, s]) => makeDocIntakeRows([{ name: 'a.pdf' } as File], s.entityKey, 1)[0].id);
    expect(new Set(ids).size).toBe(SPECS.length);
  });
});

describe('화면은 하나다', () => {
  it('원장별 전용 투입 패널이 남아 있지 않다', () => {
    // 250줄짜리 패널이 원장마다 복사되면 규칙이 한쪽만 고쳐진다.
    for (const dead of ['components/work/PenaltyIntakePanel.tsx', 'components/contract/ContractIntakePanel.tsx']) {
      expect(() => readFileSync(join(root, dead), 'utf8'), dead).toThrow();
    }
  });

  it.each([
    ['업무', 'app/work/page.tsx', 'PENALTY_INTAKE_SPEC'],
    ['계약', 'app/contract/page.tsx', 'CONTRACT_INTAKE_SPEC'],
    ['자산', 'app/asset/page.tsx', 'VEHICLE_INTAKE_SPEC'],
  ])('%s 페이지가 공용 패널에 규격을 넘긴다', (_name, rel, specName) => {
    const src = readFileSync(join(root, rel), 'utf8');
    expect(src).toContain('DocIntakePanel');
    expect(src).toContain(specName);
  });
});

describe('차량 등록증 판정', () => {
  const VEHICLES = [{ plate: '12가3456' }];
  const CONTRACTS = [{ plate: '99하9999', contractorName: '홍길동' }];

  it('이미 있는 차번은 중복이다', () => {
    expect(deriveVehicleMatch({ plate: '12가3456' }, VEHICLES, CONTRACTS).dup).toBe(true);
  });

  it('계약만 있고 차량이 없던 차번이면 리스크가 풀린다고 알린다', () => {
    const m = deriveVehicleMatch({ plate: '99하9999' }, VEHICLES, CONTRACTS);
    expect(m.dup).toBe(false);
    expect(m.resolvesGhost).toBe(true);
  });

  it('차번이 없으면 아무 판정도 하지 않는다', () => {
    expect(deriveVehicleMatch({}, VEHICLES, CONTRACTS)).toEqual({ dup: false, resolvesGhost: false });
  });
});
