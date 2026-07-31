/**
 * 서류 교차검증 — 실데이터에서 «실제로 나온» 케이스를 그대로 못박는다.
 *
 * 근거: 스위치플랜 마이그레이션 원본(등록증 139 · 보험증권 109 · 계약서 102 · 자금일보 2,837건)을
 *       손으로 대조해서 나온 문제만 규칙으로 만들었다. 여기 테스트는 그 실제 값을 쓴다.
 */
import { describe, test, expect } from 'vitest';
import {
  crossCheckDocuments, crossCheckCounts, crossCheckSummary, findPlateTypoPairs,
} from '@/lib/integrity/doc-crosscheck';

const TODAY = '2026-07-31';
const V = (plate: string, extra: Record<string, unknown> = {}) => ({
  plate, companyId: 'switchplan', status: '운행', carName: '그랜저', ...extra,
});
const doc = (type: string) => ({ type, url: `https://x/${type}.pdf` });
/** 서류·보험이 완비된 차량 — 다른 규칙이 끼어들지 않게. */
const CLEAN = (plate: string, extra: Record<string, unknown> = {}) =>
  V(plate, { _docs: [doc('vehicle'), doc('insurance')], ...extra });
const INS = (plate: string, extra: Record<string, unknown> = {}) => ({
  plate, companyId: 'switchplan', endDate: '2027-01-01', carName: '그랜저', ...extra,
});

describe('한 글자 차이 번호 탐지 — 사람 눈으로는 못 잡는다', () => {
  test('실데이터에서 나온 «한 글자» 3쌍을 잡는다', () => {
    const pairs = findPlateTypoPairs([
      '145거1781', '145가1781',   // 보험증권 vs 등록증 — 가/거
      '37나3382', '57나3382',     // 3/5
      '97너0815', '97러0815',     // 너/러
    ]).map(([a, b]) => [a, b].sort().join('~')).sort();
    expect(pairs).toEqual([
      '145가1781~145거1781',
      '37나3382~57나3382',
      '97너0815~97러0815',
    ]);
  });

  test('★두 글자 다른 것은 잡지 않는다 — 별개 차량일 수 있다', () => {
    // 실데이터의 254가2481 ↔ 265가2481 은 두 글자(54→65)가 달라 오기입으로 단정할 수 없다.
    expect(findPlateTypoPairs(['254가2481', '265가2481'])).toEqual([]);
    expect(findPlateTypoPairs(['123가4567', '123나4568'])).toEqual([]);
  });

  test('인접 자리바꿈은 잡는다 — 타이핑에서 가장 흔한 오타', () => {
    const pairs = findPlateTypoPairs(['123가4567', '123가4576']);
    expect(pairs).toHaveLength(1);
    // 떨어진 자리끼리의 교환은 잡지 않는다(오탐 방지)
    expect(findPlateTypoPairs(['123가4567', '123가7564'])).toEqual([]);
  });

  test('길이가 다르면 비교하지 않는다', () => {
    expect(findPlateTypoPairs(['12가3456', '123가3456'])).toEqual([]);
  });

  test('임판·빈값·형식이상은 제외', () => {
    expect(findPlateTypoPairs(['', '자금이동', '01가1234'])).toEqual([]);
  });
});

describe('번호오기입 — 마스터에 없는 쪽이 오기입 후보', () => {
  test('한쪽만 차량마스터에 있으면 high 로 보고', () => {
    const items = crossCheckDocuments({
      vehicles: [CLEAN('145가1781')],
      insurances: [INS('145거1781')],   // 증권에는 «거» — 마스터에 없다
      contracts: [],
      today: TODAY,
    });
    const typo = items.filter((i) => i.kind === '번호오기입');
    expect(typo).toHaveLength(1);
    expect(typo[0].plate).toBe('145거1781');
    expect(typo[0].sev).toBe('high');
    expect(typo[0].detail).toContain('145가1781');
    expect(typo[0].evidence.join(' ')).toContain('보험증권');
  });

  test('둘 다 마스터에 있으면 별개 차량으로 보고 잡지 않는다', () => {
    const items = crossCheckDocuments({
      vehicles: [CLEAN('145가1781'), CLEAN('145거1781')],
      insurances: [INS('145가1781'), INS('145거1781')],
      contracts: [],
      today: TODAY,
    });
    expect(items.filter((i) => i.kind === '번호오기입')).toHaveLength(0);
  });
});

describe('정체불명 — 거래는 있는데 차량·서류에 없다', () => {
  test('실데이터 4대 케이스: 자금거래만 있는 번호', () => {
    const items = crossCheckDocuments({
      vehicles: [CLEAN('123가4567')],
      insurances: [INS('123가4567')],
      contracts: [],
      bankTx: [
        { plate: '161호1259', companyId: 'switchplan', amount: 2_770_000 },
        { plate: '161호1259', companyId: 'switchplan', amount: 500_000 },
      ],
      today: TODAY,
    });
    const orphan = items.filter((i) => i.kind === '정체불명');
    expect(orphan).toHaveLength(1);
    expect(orphan[0].plate).toBe('161호1259');
    expect(orphan[0].sev).toBe('high');
    expect(orphan[0].detail).toContain('2건');
  });

  test('번호변경 이력에 있으면 정체불명이 아니다', () => {
    const items = crossCheckDocuments({
      vehicles: [CLEAN('123가4567', { plateHistory: ['01가1234'] })],
      insurances: [INS('123가4567')],
      contracts: [],
      bankTx: [{ plate: '01가1234', companyId: 'switchplan', amount: 100 }],
      today: TODAY,
    });
    expect(items.filter((i) => i.kind === '정체불명')).toHaveLength(0);
  });

  test('«자금이동» 같은 비차량 값은 무시', () => {
    const items = crossCheckDocuments({
      vehicles: [CLEAN('123가4567')], insurances: [INS('123가4567')], contracts: [],
      bankTx: [{ plate: '자금이동', companyId: 'switchplan', amount: 100 }],
      today: TODAY,
    });
    expect(items.filter((i) => i.kind === '정체불명')).toHaveLength(0);
  });
});

describe('무보험 — 해지만 있는 경우를 따로 구분한다', () => {
  test('보험 레코드가 아예 없으면 high', () => {
    const items = crossCheckDocuments({
      vehicles: [V('123가4567', { _docs: [doc('vehicle'), doc('insurance')] })],
      insurances: [], contracts: [], today: TODAY,
    });
    const no = items.filter((i) => i.kind === '무보험');
    expect(no).toHaveLength(1);
    expect(no[0].detail).toContain('아예 없습니다');
  });

  test('★해지 증권만 있으면 무보험이다 — 실데이터 6대 케이스', () => {
    const items = crossCheckDocuments({
      vehicles: [CLEAN('16부2718')],
      insurances: [INS('16부2718', { endDate: '2026-03-01', cancelledDate: '2026-02-10' })],
      contracts: [], today: TODAY,
    });
    const no = items.filter((i) => i.kind === '무보험');
    expect(no).toHaveLength(1);
    expect(no[0].detail).toContain('해지');
    expect(no[0].evidence.join(' ')).toContain('전부 무효');
  });

  test('만기가 지난 증권만 있으면 무보험', () => {
    const items = crossCheckDocuments({
      vehicles: [CLEAN('123가4567')],
      insurances: [INS('123가4567', { endDate: '2026-06-30' })],
      contracts: [], today: TODAY,
    });
    expect(items.filter((i) => i.kind === '무보험')).toHaveLength(1);
  });

  test('유효 증권이 있으면 잡지 않는다', () => {
    const items = crossCheckDocuments({
      vehicles: [CLEAN('123가4567')],
      insurances: [INS('123가4567', { endDate: '2026-10-10' })],
      contracts: [], today: TODAY,
    });
    expect(items.filter((i) => i.kind === '무보험')).toHaveLength(0);
  });

  test('매각·말소·폐차 차량은 검증 대상이 아니다', () => {
    for (const status of ['매각', '말소', '폐차', '처분완료']) {
      const items = crossCheckDocuments({
        vehicles: [V('123가4567', { status })], insurances: [], contracts: [], today: TODAY,
      });
      expect(items).toHaveLength(0);
    }
  });
});

describe('서류미비 — 등록증·보험증권·계약서', () => {
  test('등록증이 없으면 high(차량 자체를 증명할 수 없다)', () => {
    const items = crossCheckDocuments({
      vehicles: [V('123가4567', { _docs: [doc('insurance')] })],
      insurances: [INS('123가4567')], contracts: [], today: TODAY,
    });
    const m = items.filter((i) => i.kind === '서류미비');
    expect(m).toHaveLength(1);
    expect(m[0].sev).toBe('high');
    expect(m[0].detail).toBe('자동차등록증 미첨부');
  });

  test('증권만 없으면 med', () => {
    const items = crossCheckDocuments({
      vehicles: [V('123가4567', { _docs: [doc('vehicle')] })],
      insurances: [INS('123가4567')], contracts: [], today: TODAY,
    });
    const m = items.filter((i) => i.kind === '서류미비');
    expect(m[0].sev).toBe('med');
    expect(m[0].detail).toBe('보험증권 미첨부');
  });

  test('★계약서는 «운행 중 계약이 있는 차»에만 요구한다', () => {
    // 계약 없음 → 계약서를 요구하지 않는다
    const noContract = crossCheckDocuments({
      vehicles: [CLEAN('123가4567')], insurances: [INS('123가4567')], contracts: [], today: TODAY,
    });
    expect(noContract.filter((i) => i.kind === '서류미비')).toHaveLength(0);

    // 운행 계약 있고 계약서 미첨부 → 잡는다
    const withContract = crossCheckDocuments({
      vehicles: [CLEAN('123가4567')],
      insurances: [INS('123가4567')],
      contracts: [{ plate: '123가4567', companyId: 'switchplan', contractorName: '홍길동' }],
      today: TODAY,
    });
    const m = withContract.filter((i) => i.kind === '서류미비');
    expect(m).toHaveLength(1);
    expect(m[0].detail).toBe('계약서 미첨부');
    expect(m[0].evidence.join(' ')).toContain('홍길동');
  });

  test('반납된 계약은 계약서를 요구하지 않는다', () => {
    const items = crossCheckDocuments({
      vehicles: [CLEAN('123가4567')],
      insurances: [INS('123가4567')],
      contracts: [{ plate: '123가4567', companyId: 'switchplan', returnedDate: '2026-05-01' }],
      today: TODAY,
    });
    expect(items.filter((i) => i.kind === '서류미비')).toHaveLength(0);
  });
});

describe('차종불일치 — 표기가 다르면 집계가 흩어진다', () => {
  test('포함관계면 같은 것으로 본다(오탐 방지)', () => {
    const items = crossCheckDocuments({
      vehicles: [CLEAN('123가4567', { carName: '벤츠E클래스' })],
      insurances: [INS('123가4567', { carName: 'E클래스' })],
      contracts: [], today: TODAY,
    });
    expect(items.filter((i) => i.kind === '차종불일치')).toHaveLength(0);
  });

  test('실데이터 케이스: 차량「벤츠S450」 vs 증권「벤츠S클」 → 포함관계 아님 → 잡는다', () => {
    const items = crossCheckDocuments({
      vehicles: [CLEAN('109로1819', { carName: '벤츠S450' })],
      insurances: [INS('109로1819', { carName: 'S클래스' })],
      contracts: [], today: TODAY,
    });
    const m = items.filter((i) => i.kind === '차종불일치');
    expect(m).toHaveLength(1);
    expect(m[0].sev).toBe('low');
    expect(m[0].detail).toContain('벤츠S450');
  });

  test('한쪽이 비어 있으면 불일치로 보지 않는다', () => {
    const items = crossCheckDocuments({
      vehicles: [CLEAN('123가4567', { carName: '' })],
      insurances: [INS('123가4567', { carName: '그랜저' })],
      contracts: [], today: TODAY,
    });
    expect(items.filter((i) => i.kind === '차종불일치')).toHaveLength(0);
  });
});

describe('집계·요약 — 투입 직후 안내', () => {
  test('심각도순으로 정렬된다', () => {
    const items = crossCheckDocuments({
      vehicles: [
        V('123가4567', { carName: '벤츠S450', _docs: [doc('vehicle'), doc('insurance')] }),  // 차종불일치 low
        V('999다9999', { _docs: [] }),                                                        // 서류미비 high + 무보험 high
      ],
      insurances: [INS('123가4567', { carName: 'S클래스' })],
      contracts: [], today: TODAY,
    });
    const sevs = items.map((i) => i.sev);
    expect(sevs).toEqual([...sevs].sort((a, b) => ({ high: 0, med: 1, low: 2 }[a] - { high: 0, med: 1, low: 2 }[b])));
  });

  test('요약 문장 — 문제가 없으면 빈 문자열', () => {
    expect(crossCheckSummary([])).toBe('');
    const items = crossCheckDocuments({
      vehicles: [V('999다9999', { _docs: [] })], insurances: [], contracts: [], today: TODAY,
    });
    const s = crossCheckSummary(items);
    expect(s).toContain('무보험');
    expect(s).toContain('서류미비');
  });

  test('종류별 카운트는 6종 전부 키를 갖는다', () => {
    const c = crossCheckCounts([]);
    expect(Object.keys(c).sort())
      .toEqual(['무보험', '번호오기입', '서류미비', '정체불명', '차종불일치', '대여료불일치'].sort());
  });
});

describe('대여료불일치 — «미납»과 «재조정 미반영»은 조치가 정반대다', () => {
  const rentTx = (plate: string, amount: number, n: number) =>
    Array.from({ length: n }, () => ({ plate, companyId: 'switchplan', category: '대여료', amount }));

  test('★실데이터 케이스: 23회 전부 870,000 인데 계약은 960,000', () => {
    const items = crossCheckDocuments({
      vehicles: [CLEAN('365주3303')],
      insurances: [INS('365주3303')],
      contracts: [{ plate: '365주3303', companyId: 'switchplan', contractorName: '이은규', monthlyRent: 960_000 }],
      bankTx: rentTx('365주3303', 870_000, 23),
      today: TODAY,
    });
    const m = items.filter((i) => i.kind === '대여료불일치');
    expect(m).toHaveLength(1);
    expect(m[0].sev).toBe('high');
    expect(m[0].detail).toContain('23회');
    expect(m[0].detail).toContain('-90,000');
    expect(m[0].evidence.join(' ')).toContain('이은규');
  });

  test('계약 금액과 같은 입금이 한 번이라도 있으면 정상 — 잡지 않는다', () => {
    const items = crossCheckDocuments({
      vehicles: [CLEAN('123가4567')],
      insurances: [INS('123가4567')],
      contracts: [{ plate: '123가4567', companyId: 'switchplan', monthlyRent: 500_000 }],
      bankTx: [...rentTx('123가4567', 500_000, 1), ...rentTx('123가4567', 300_000, 3)],
      today: TODAY,
    });
    expect(items.filter((i) => i.kind === '대여료불일치')).toHaveLength(0);
  });

  test('금액이 흔들리면 분납·연체합납이므로 이 규칙 대상이 아니다', () => {
    const items = crossCheckDocuments({
      vehicles: [CLEAN('120라5445')],
      insurances: [INS('120라5445')],
      contracts: [{ plate: '120라5445', companyId: 'switchplan', monthlyRent: 540_000 }],
      bankTx: [
        ...rentTx('120라5445', 200_000, 2),
        ...rentTx('120라5445', 130_000, 2),
        ...rentTx('120라5445', 340_000, 1),
      ],
      today: TODAY,
    });
    expect(items.filter((i) => i.kind === '대여료불일치')).toHaveLength(0);
  });

  test('3회 미만이면 판단하지 않는다(우연일 수 있다)', () => {
    const items = crossCheckDocuments({
      vehicles: [CLEAN('123가4567')],
      insurances: [INS('123가4567')],
      contracts: [{ plate: '123가4567', companyId: 'switchplan', monthlyRent: 500_000 }],
      bankTx: rentTx('123가4567', 400_000, 2),
      today: TODAY,
    });
    expect(items.filter((i) => i.kind === '대여료불일치')).toHaveLength(0);
  });

  test('계정과목이 «대여료»가 아닌 입금은 세지 않는다', () => {
    const items = crossCheckDocuments({
      vehicles: [CLEAN('123가4567')],
      insurances: [INS('123가4567')],
      contracts: [{ plate: '123가4567', companyId: 'switchplan', monthlyRent: 500_000 }],
      bankTx: Array.from({ length: 5 }, () => ({ plate: '123가4567', companyId: 'switchplan', category: '보증금', amount: 400_000 })),
      today: TODAY,
    });
    expect(items.filter((i) => i.kind === '대여료불일치')).toHaveLength(0);
  });

  test('반납된 계약은 대상이 아니다', () => {
    const items = crossCheckDocuments({
      vehicles: [CLEAN('123가4567')],
      insurances: [INS('123가4567')],
      contracts: [{ plate: '123가4567', companyId: 'switchplan', monthlyRent: 500_000, returnedDate: '2026-05-01' }],
      bankTx: rentTx('123가4567', 400_000, 5),
      today: TODAY,
    });
    expect(items.filter((i) => i.kind === '대여료불일치')).toHaveLength(0);
  });
});
