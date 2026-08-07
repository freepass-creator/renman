/**
 * 계약서 투입 — 계약관리에서 계약서를 올리면 계약이 만들어진다.
 * OCR 자체는 외부 호출이라 여기서 검사하지 않고, «읽은 뒤의 판단»을 고정한다:
 *   차량매칭 · 중복 · 기간겹침 · 저장가능 판정 · 저장 레코드 모양.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CONTRACT_OCR_TYPE,
  buildContractSaveRecords,
  contractIntakeMissing,
  deriveContractMatch,
  isContractIntakeReady,
  type ContractIntakeRow,
} from '@/lib/contract-intake';
import { makeDocIntakeRows } from '@/lib/doc-intake';
import { contractPeriodOverlaps } from '@/lib/contracts/dates';
import { ENTITIES } from '@/lib/intake/entities';

const VEHICLES = [
  { plate: '12가3456', carName: '아반떼', companyId: 'switchplan' },
  { plate: '34나5678', carName: '쏘렌토', companyId: 'switchplan' },
];

const EXISTING = [
  { contractNo: 'C-2601-0001', plate: '12가3456', contractorName: '홍길동', startDate: '2026-01-01', endDate: '2026-12-31' },
];

function row(rec: Record<string, unknown>): ContractIntakeRow {
  return { id: 'r1', fileName: 'a.pdf', file: {} as File, status: 'done', rec };
}

describe('계약서 OCR 종류', () => {
  it('엔티티가 선언한 ocrType 을 쓴다 — 엔티티 key(contract)가 아니다', () => {
    expect(CONTRACT_OCR_TYPE).toBe(ENTITIES.contract.ocrType);
    expect(CONTRACT_OCR_TYPE).toBe('rental_contract');
  });

  it('OCR API 가 그 종류를 실제로 지원한다', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/ocr/extract/route.ts'), 'utf8');
    expect(route).toContain('rental_contract');
  });
});

describe('차량·중복·겹침 판정', () => {
  it('차량 원장에서 차명을 찾아 붙인다', () => {
    const m = deriveContractMatch({ plate: '12가3456' }, VEHICLES, []);
    expect(m.carName).toBe('아반떼');
    expect(m.ghostPlate).toBe(false);
  });

  it('차량 원장에 없는 차번은 알린다 — 저장은 막지 않는다', () => {
    const m = deriveContractMatch({ plate: '99하9999' }, VEHICLES, []);
    expect(m.carName).toBeNull();
    expect(m.ghostPlate).toBe(true);
  });

  it('같은 계약번호는 중복이다', () => {
    expect(deriveContractMatch({ contractNo: 'C-2601-0001' }, VEHICLES, EXISTING).dup).toBe(true);
  });

  it('같은 차번+시작일은 중복이다 — 계약번호가 없어도 잡는다', () => {
    expect(deriveContractMatch({ plate: '12가3456', startDate: '2026-01-01' }, VEHICLES, EXISTING).dup).toBe(true);
  });

  it('같은 차량의 기간이 겹치면 이중배차로 알린다', () => {
    const m = deriveContractMatch(
      { plate: '12가3456', startDate: '2026-06-01', endDate: '2026-08-31' },
      VEHICLES, EXISTING,
    );
    expect(m.dup).toBe(false);
    expect(m.overlapWith).toBe('홍길동');
  });

  it('기간이 안 겹치면 조용하다', () => {
    const m = deriveContractMatch(
      { plate: '12가3456', startDate: '2027-01-01', endDate: '2027-12-31' },
      VEHICLES, EXISTING,
    );
    expect(m.overlapWith).toBeNull();
  });

  it('겹침 판정은 운영 스냅샷과 같은 규칙(contractPeriodOverlaps)을 쓴다', () => {
    const a = { startDate: '2026-01-01', endDate: '2026-12-31' };
    expect(contractPeriodOverlaps(a, { startDate: '2026-06-01', endDate: '2026-08-31' })).toBe(true);
    expect(contractPeriodOverlaps(a, { startDate: '2027-01-01' })).toBe(false);
    // 종료일 없으면 무기한 — 이후 어떤 계약과도 겹친다.
    expect(contractPeriodOverlaps({ startDate: '2026-01-01' }, { startDate: '2030-01-01' })).toBe(true);
  });
});

describe('저장 가능 판정', () => {
  it('임차인·차번·시작일이 다 있어야 등록된다', () => {
    expect(isContractIntakeReady(row({ contractorName: '홍길동', plate: '12가3456', startDate: '2026-01-01' }))).toBe(true);
  });

  it.each([
    [{ plate: '12가3456', startDate: '2026-01-01' }, '임차인'],
    [{ contractorName: '홍길동', startDate: '2026-01-01' }, '차량번호'],
    [{ contractorName: '홍길동', plate: '12가3456' }, '시작일'],
  ])('%o → 「%s」가 없어 등록 불가', (rec, want) => {
    const r = row(rec);
    expect(isContractIntakeReady(r)).toBe(false);
    expect(contractIntakeMissing(r)).toContain(want);
  });

  it('계약번호는 없어도 된다 — store 가 시스템 id 를 자연키로 승격한다', () => {
    expect(isContractIntakeReady(row({ contractorName: '홍길동', plate: '12가3456', startDate: '2026-01-01' }))).toBe(true);
  });
});

describe('저장 레코드', () => {
  it('회사·상태를 채우고 차명은 차량 원장에서 보충한다', async () => {
    const rows = [row({ contractorName: '김철수', plate: '34나5678', startDate: '2026-03-01' })];
    const recs = await buildContractSaveRecords(rows, 'switchplan', (rec) => deriveContractMatch(rec, VEHICLES, []));
    expect(recs).toHaveLength(1);
    expect(recs[0].companyId).toBe('switchplan');
    expect(recs[0].status).toBe('대기');          // 계약서만 들어온 시점 = 인도 전
    expect(recs[0].carName).toBe('쏘렌토');       // OCR 이 못 읽어도 비우지 않는다
    expect(recs[0].contractorName).toBe('김철수');
  });

  it('OCR 이 읽은 차명이 있으면 덮어쓰지 않는다', async () => {
    const rows = [row({ contractorName: '김철수', plate: '34나5678', startDate: '2026-03-01', carName: '쏘렌토 하이브리드' })];
    const recs = await buildContractSaveRecords(rows, 'switchplan', (rec) => deriveContractMatch(rec, VEHICLES, []));
    expect(recs[0].carName).toBe('쏘렌토 하이브리드');
  });

  it('행 id 는 파일마다 다르다 — 같은 이름 파일을 여러 장 올려도 안 뭉친다', () => {
    const files = [{ name: 'a.pdf' }, { name: 'a.pdf' }] as File[];
    const ids = makeDocIntakeRows(files, 'contract', 1).map((r) => r.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('계약관리에서 닿는다', () => {
  it('계약 생성 패널이 계약서 업로드를 인라인으로 그린다 — 데이터센터로 내보내지 않는다', () => {
    const page = readFileSync(join(process.cwd(), 'app/contract/page.tsx'), 'utf8');
    expect(page).toContain('CONTRACT_INTAKE_SPEC');
    expect(page).toContain('DocIntakePanel');
    expect(page).toContain("label: '계약서 업로드'");
    expect(page).toContain('render:');
  });
});
