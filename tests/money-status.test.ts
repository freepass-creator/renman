/**
 * 자금분류·자금상태 정의 — 세 축이 섞이지 않는지 못박는다.
 *   자금분류 = 뭐로 입금됐는가(계좌이체·CMS·카드·현금) · 자금상태 = 매칭됐는가 · 계정과목 = 무슨 돈인가
 */
import { describe, test, expect } from 'vitest';
import {
  moneyStatusOf, moneyClassOf, moneyStatusNeedsWork,
  MONEY_STATUS, MONEY_STATUS_ORDER, MONEY_STATUS_TONE,
  MONEY_CLASS, MONEY_CLASS_TONE,
} from '@/lib/finance/money-status';

describe('자금상태 — 6단계 정의', () => {
  test('상태 목록·톤·정렬이 서로 빠짐없이 대응', () => {
    expect(MONEY_STATUS).toHaveLength(6);
    for (const s of MONEY_STATUS) {
      expect(MONEY_STATUS_TONE[s]).toBeTruthy();
      expect(typeof MONEY_STATUS_ORDER[s]).toBe('number');
    }
    // 처리해야 할 것이 앞에 온다
    expect(MONEY_STATUS_ORDER['미분류']).toBeLessThan(MONEY_STATUS_ORDER['매칭완료']);
    expect(MONEY_STATUS_ORDER['미분류']).toBeLessThan(MONEY_STATUS_ORDER['해당없음']);
  });

  test('★계정과목이 없으면 미분류 — 이전에는 «미매칭»과 구분이 안 됐다', () => {
    expect(moneyStatusOf({ category: '', inAmount: 500_000 })).toBe('미분류');
    expect(moneyStatusOf({ category: '(미분류)', inAmount: 500_000 })).toBe('미분류');
  });

  test('분류는 됐고 계약에 안 붙었으면 미매칭 · 제안이 있으면 제안있음', () => {
    expect(moneyStatusOf({ category: '대여료수입', inAmount: 500_000 })).toBe('미매칭');
    expect(moneyStatusOf({ category: '대여료수입', inAmount: 500_000, hasProposal: true })).toBe('제안있음');
  });

  test('계약에 붙었으면 매칭완료 — 제안 여부와 무관', () => {
    expect(moneyStatusOf({ category: '대여료수입', inAmount: 500_000, matchedContractId: 'c1' })).toBe('매칭완료');
    expect(moneyStatusOf({ category: '대여료수입', inAmount: 500_000, matchedScheduleSeq: 3, hasProposal: true })).toBe('매칭완료');
  });

  test('지출·이체는 계약에 붙을 돈이 아니다 → 해당없음', () => {
    expect(moneyStatusOf({ category: '보험료', outAmount: 300_000 })).toBe('해당없음');
    expect(moneyStatusOf({ category: '계좌간이체', inAmount: 1_000_000 })).toBe('해당없음');
    expect(moneyStatusOf({ category: '보증금반환', outAmount: 500_000 })).toBe('해당없음');
  });

  test('입금액이 0이면 분류가 수입이어도 해당없음', () => {
    expect(moneyStatusOf({ category: '대여료수입', inAmount: 0 })).toBe('해당없음');
  });

  test('CMS — 짝짓기가 계정과목보다 먼저다', () => {
    // 명세행: 통장 집금과 짝이 안 맞으면 분류가 없어도 «집금대기»(미분류이 아니다)
    expect(moneyStatusOf({ isCmsItem: true, category: '' })).toBe('집금대기');
    expect(moneyStatusOf({ isCmsItem: true, matchedContractId: 'c1' })).toBe('매칭완료');
    // 집금(통장)행: 정산 표식으로 판정
    expect(moneyStatusOf({ isCmsDeposit: true, cmsSettled: false })).toBe('집금대기');
    expect(moneyStatusOf({ isCmsDeposit: true, cmsSettled: true })).toBe('매칭완료');
  });

  test('손이 필요한 상태 판정 — 자금일보 «할 일» 카운트', () => {
    expect(moneyStatusNeedsWork('미분류')).toBe(true);
    expect(moneyStatusNeedsWork('집금대기')).toBe(true);
    expect(moneyStatusNeedsWork('미매칭')).toBe(true);
    expect(moneyStatusNeedsWork('제안있음')).toBe(true);
    expect(moneyStatusNeedsWork('매칭완료')).toBe(false);
    expect(moneyStatusNeedsWork('해당없음')).toBe(false);
  });
});

describe('자금분류 = «뭐로 입금됐는가» — 계정과목과 다른 축', () => {
  test('분류 목록·톤이 대응', () => {
    expect(MONEY_CLASS).toHaveLength(5);
    for (const c of MONEY_CLASS) expect(MONEY_CLASS_TONE[c]).toBeTruthy();
  });

  test('CMS·카드 플래그가 source 보다 우선', () => {
    expect(moneyClassOf({ isCms: true, source: '계좌' })).toBe('CMS');
    expect(moneyClassOf({ isCard: true, source: '계좌' })).toBe('법인카드');
  });

  test('source 문자열 해석', () => {
    expect(moneyClassOf({ source: '현금' })).toBe('현금');
    expect(moneyClassOf({ source: '계좌' })).toBe('계좌이체');
    expect(moneyClassOf({ source: '이체' })).toBe('계좌이체');
    expect(moneyClassOf({ source: '' })).toBe('계좌이체');   // 통장 거래 기본
    expect(moneyClassOf({ source: '알수없는것' })).toBe('기타');
  });

  test('★분류가 달라도 상태 판정은 같다 — 두 축이 섞이면 안 된다', () => {
    const base = { category: '대여료수입', inAmount: 500_000 };
    expect(moneyStatusOf(base)).toBe('미매칭');
    // 자금분류(수단)는 moneyStatusOf 의 입력이 아니다.
    expect(moneyClassOf({ source: '현금' })).toBe('현금');
    expect(moneyClassOf({ isCms: true })).toBe('CMS');
    expect(moneyStatusOf(base)).toBe('미매칭');
  });

  test('계정과목은 «무슨 돈인가»로 남는다 — 자금분류와 별개 칸', () => {
    // 같은 수단(계좌이체)이라도 계정과목은 여러 가지일 수 있다.
    expect(moneyClassOf({ source: '계좌' })).toBe('계좌이체');
    expect(moneyStatusOf({ category: '대여료수입', inAmount: 100 })).toBe('미매칭');
    expect(moneyStatusOf({ category: '보험료', outAmount: 100 })).toBe('해당없음');
  });
});
