/**
 * 데모 샘플 팩 — UI·미결·리스크·검색 확인용 소량 데이터.
 *   날짜는 TODAY 기준 상대값. 번호판은 법인마다 다르게(합본 중복대여 오탐 방지).
 */
import type { EntityRecord } from './intake/entities';
import { TODAY } from './dashboard-consts';

function d(offset: number): string {
  const t = new Date(TODAY + 'T12:00:00');
  t.setDate(t.getDate() + offset);
  return t.toISOString().slice(0, 10);
}

export type DemoPack = Record<string, EntityRecord[]>;

/** 한 법인용 데모 — 운행·미수·반납임박/지남·유휴·대기·과태료·미분류입금 포함. */
export function buildDemoPack(companyId: string): DemoPack {
  const n = companyId === 'switchplan' ? 1 : companyId === 'prime' ? 2 : 3;
  const P = {
    a: `${10 + n}가${3000 + n}`,
    b: `${20 + n}나${4000 + n}`,
    c: `${30 + n}다${5000 + n}`,
    d: `${40 + n}라${6000 + n}`,
    e: `${50 + n}마${7000 + n}`,
    f: `${60 + n}바${8000 + n}`,
    g: `${70 + n}사${9000 + n}`,
    h: `${80 + n}아${1000 + n}`,
  };

  const vehicles: EntityRecord[] = [
    { plate: P.a, carName: '그랜저 GN7', maker: '현대', status: '운행', year: 2023, fuel: '가솔린', acquisitionPrice: 32000000, companyId },
    { plate: P.b, carName: '쏘렌토 MQ4', maker: '기아', status: '운행', year: 2022, fuel: '디젤', acquisitionPrice: 28000000, companyId },
    { plate: P.c, carName: '아반떼 CN7', maker: '현대', status: '운행', year: 2024, fuel: '가솔린', acquisitionPrice: 21000000, companyId },
    { plate: P.d, carName: '카니발 KA4', maker: '기아', status: '휴차', year: 2021, fuel: '디젤', acquisitionPrice: 35000000, companyId },
    { plate: P.e, carName: '팰리세이드', maker: '현대', status: '대기', year: 2023, fuel: '가솔린', acquisitionPrice: 42000000, companyId },
    { plate: P.f, carName: '레이', maker: '기아', status: '정비', year: 2020, fuel: '가솔린', acquisitionPrice: 12000000, companyId },
    { plate: P.g, carName: '투싼 NX4', maker: '현대', status: '운행', year: 2022, fuel: '가솔린', acquisitionPrice: 25000000, companyId },
    { plate: P.h, carName: '모닝 JA', maker: '기아', status: '구매대기', year: 2025, fuel: '가솔린', acquisitionPrice: 0, companyId },
  ];

  const contracts: EntityRecord[] = [
    { contractNo: `D-${companyId}-001`, plate: P.a, carName: '그랜저 GN7', contractorName: '김민수', contractorPhone: '010-1111-2222',
      status: '운행', startDate: d(-120), deliveredDate: d(-120), endDate: d(240), returnScheduledDate: d(240),
      contractDate: d(-125), rentalMonths: 12, monthlyRent: 550000, deposit: 1000000, paymentDay: 25, _paidTotal: 1650000, companyId },
    { contractNo: `D-${companyId}-002`, plate: P.b, carName: '쏘렌토 MQ4', contractorName: '이서연', contractorPhone: '010-3333-4444',
      status: '운행', startDate: d(-200), deliveredDate: d(-200), endDate: d(160), returnScheduledDate: d(160),
      contractDate: d(-205), rentalMonths: 12, monthlyRent: 620000, deposit: 1500000, paymentDay: 25, _paidTotal: 620000, companyId },
    { contractNo: `D-${companyId}-003`, plate: P.c, carName: '아반떼 CN7', contractorName: '박준호', contractorPhone: '010-5555-6666',
      status: '운행', startDate: d(-90), deliveredDate: d(-90), endDate: d(3), returnScheduledDate: d(3),
      contractDate: d(-95), rentalMonths: 3, monthlyRent: 480000, deposit: 800000, paymentDay: 10, _paidTotal: 960000, companyId },
    { contractNo: `D-${companyId}-004`, plate: P.g, carName: '투싼 NX4', contractorName: '최유진', contractorPhone: '010-7777-8888',
      status: '운행', startDate: d(-180), deliveredDate: d(-180), endDate: d(-5), returnScheduledDate: d(-5),
      contractDate: d(-185), rentalMonths: 6, monthlyRent: 520000, deposit: 1000000, paymentDay: 15, _paidTotal: 2080000, companyId },
    { contractNo: `D-${companyId}-005`, plate: P.e, carName: '팰리세이드', contractorName: '정하늘', contractorPhone: '010-9999-0000',
      status: '대기', startDate: d(2), endDate: d(367), returnScheduledDate: d(367),
      contractDate: d(-3), rentalMonths: 12, monthlyRent: 780000, deposit: 2000000, paymentDay: 25, companyId },
    { contractNo: `D-${companyId}-006`, plate: P.d, carName: '카니발 KA4', contractorName: '한도윤', contractorPhone: '010-2222-3333',
      status: '종료', startDate: d(-400), deliveredDate: d(-400), endDate: d(-30), returnedDate: d(-30), returnScheduledDate: d(-30),
      contractDate: d(-405), rentalMonths: 12, monthlyRent: 700000, deposit: 1500000, paymentDay: 25, _paidTotal: 5600000, _carryUnpaid: 700000, companyId },
  ];

  const bank_tx: EntityRecord[] = [
    { account: '영업 신한', txDate: d(-2), amount: 550000, withdraw: 0, counterparty: '김민수', category: '대여료', plate: P.a, renter: '김민수', method: '계좌', companyId },
    { account: '영업 신한', txDate: d(-1), amount: 480000, withdraw: 0, counterparty: '미상입금', category: '(미분류)', plate: '', renter: '', method: '계좌', companyId },
    { account: '영업 신한', txDate: d(0), amount: 0, withdraw: 120000, counterparty: '정비비', category: '(미분류)', plate: P.f, renter: '', method: '계좌', companyId },
    { account: '영업 신한', txDate: d(-5), amount: 1000000, withdraw: 0, counterparty: '박준호', category: '보증금', plate: P.c, renter: '박준호', method: '계좌', companyId },
  ];

  const insurance: EntityRecord[] = [
    { plate: P.a, insurer: 'DB손해보험', policyNo: `DB-${companyId}-001`, startDate: d(-100), endDate: d(20), companyId },
    { plate: P.b, insurer: '삼성화재', policyNo: `SS-${companyId}-002`, startDate: d(-200), endDate: d(-3), companyId },
    { plate: P.c, insurer: '현대해상', policyNo: `HD-${companyId}-003`, startDate: d(-50), endDate: d(300), companyId },
  ];

  const penalties: EntityRecord[] = [
    { plate: P.b, violationDate: d(-40), dueDate: d(10), amount: 70000, description: '속도위반 카메라', docType: '과태료', reassignStatus: '접수', companyId },
    { plate: P.a, violationDate: d(-15), dueDate: d(20), amount: 40000, description: '주정차 위반', docType: '과태료', reassignStatus: '임차인확인', companyId },
  ];

  const history: EntityRecord[] = [
    { plate: P.f, category: '정비', title: '엔진오일·필터', date: d(-2), vendor: '블루핸즈', cost: 180000, status: '진행', companyId, _kind: 'work', work_status: '진행' },
    { plate: P.a, category: '통화', title: '연체 독촉 통화', date: d(-1), author: '박영협', customer: '이서연', companyId },
    { plate: P.c, category: '메모', title: '반납 시 스크래치 확인', date: d(0), author: '박영협', customer: '박준호', companyId },
  ];

  return { vehicle: vehicles, contract: contracts, bank_tx, insurance, penalty: penalties, history };
}
