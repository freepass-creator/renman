import { describe, expect, it } from 'vitest';
import { mapOcrToEntity as mapFromSchema } from '@/lib/intake/entities';
import { mapOcrToEntity as mapFromClient } from '@/lib/ocr-client';

describe('OCR → 엔티티 원자 매핑 SSOT', () => {
  it('일반·대량·상세 경로가 같은 매퍼를 사용한다', () => {
    const raw = {
      policy_no: 'POL-001',
      car_number: '12가3456',
      installments: [
        { cycle: 1, due_date: '2026-01-01', amount: 300_000 },
        { cycle: 2, due_date: '2026-02-01', amount: 200_000 },
      ],
    };
    expect(mapFromClient('insurance', raw)).toEqual(mapFromSchema('insurance', raw));
    expect(mapFromClient('insurance', raw).installments).toEqual(raw.installments);
  });

  it('계약서 OCR의 기존 원자 별칭과 보증금 분납표를 보존한다', () => {
    const raw = {
      contract_no: 'C-2608-0001',
      monthly_amount: 880_000,
      deposit_total: 2_000_000,
      autopay_day: 25,
      initial_mileage_km: 12_345,
      deposit_installments: [
        { cycle: 1, amount: 1_000_000 },
        { cycle: 2, amount: 1_000_000 },
      ],
    };
    expect(mapFromSchema('contract', raw)).toMatchObject({
      contractNo: 'C-2608-0001',
      monthlyRent: 880_000,
      deposit: 2_000_000,
      paymentDay: 25,
      mileageOut: 12_345,
      depositInstallments: raw.deposit_installments,
    });
  });

  it('계약자 주민번호 원문은 저장하지 않고 유효한 생년월일만 파생한다', () => {
    const mapped = mapFromSchema('contract', {
      contractor_name: '홍길동',
      contractor_ident: '900101-1234567',
    });
    expect(mapped.contractorBirth).toBe('1990-01-01');
    expect(mapped).not.toHaveProperty('contractorIdent');
    expect(mapped).not.toHaveProperty('contractor_ident');
  });

  it('불완전하거나 유효하지 않은 식별번호에서는 생년월일을 추정하지 않는다', () => {
    expect(mapFromSchema('contract', { contractor_ident: '900101-1******' })).not.toHaveProperty('contractorBirth');
    expect(mapFromSchema('contract', { contractor_ident: '991332-1234567' })).not.toHaveProperty('contractorBirth');
  });
});
