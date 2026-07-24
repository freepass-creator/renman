/**
 * 차종마스터 매처(lib/domain/vehicle-master) — 미스냅 마감 + 163대 코퍼스 불변식.
 *   catalog 은 fetch 대신 fs 로 주입(node/vitest 는 fetch 경로 불가) → setCatalog.
 *   보완: 로마숫자(봉고Ⅲ→봉고3) · 벤츠 축약(벤츠c→C클래스). 카탈로그/얼린시드는 무변경.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { setCatalog, classifyVehicle } from '@/lib/domain/vehicle-master';
import seed from '@/lib/migrate/switchplan-data.json';

type V = { carName: string; firstReg?: string; modelYear?: string };
const VEHICLES = (seed as { vehicles: V[] }).vehicles;

beforeAll(() => {
  setCatalog(JSON.parse(readFileSync('public/data/car-master/_index.json', 'utf8')));
});

describe('classifyVehicle — 미스냅 3대 마감', () => {
  it('기아 봉고Ⅲ(로마숫자) → 기아·봉고3·high', () => {
    for (const reg of ['2019-04-07', '2020-05-12']) {
      const r = classifyVehicle('기아 봉고Ⅲ', reg);
      expect(r.maker).toBe('기아');
      expect(r.modelLine).toBe('봉고3');
      expect(r.confidence).toBe('high');
    }
  });

  it('벤츠 "벤츠c 카브리올레"(축약) → 벤츠·C-클래스, none 아님', () => {
    const r = classifyVehicle('벤츠 벤츠c 카브리올레', '2017-04-24');
    expect(r.maker).toBe('벤츠');
    expect(r.modelLine).toBe('C-클래스');
    expect(r.confidence).not.toBe('none');
  });

  it('로마숫자↔아라비아 표기 동치(봉고Ⅲ == 봉고3 == 봉고 III 같은 catalogId)', () => {
    const a = classifyVehicle('기아 봉고Ⅲ', '2019-04-07');
    const b = classifyVehicle('기아 봉고3', '2019-04-07');
    expect(a.catalogId).toBe(b.catalogId);
    expect(a.catalogId).not.toBe('');
  });
});

describe('classifyVehicle — 비회귀(오확장 방지)', () => {
  it('벤츠 C200/C300 Cabriolet → C-클래스(GLC 아님)', () => {
    expect(classifyVehicle('벤츠 C200', '2017-05-31').modelLine).toBe('C-클래스');
    expect(classifyVehicle('벤츠 C300 Cabriolet', '2017-10-23').modelLine).toBe('C-클래스');
  });
  it('벤츠 GLC300 → GLC-클래스 유지(벤츠 단일문자 가드가 GLC 오확장 안 함)', () => {
    expect(classifyVehicle('벤츠 GLC300', '2019-03-18').modelLine).toBe('GLC-클래스');
  });
  it('벤츠 CLS300 → CLS-클래스 유지', () => {
    expect(classifyVehicle('벤츠 CLS300', '2020-08-27').modelLine).toBe('CLS-클래스');
  });
  it('현대 포터Ⅱ → 현대·포터(로마숫자 무관·기존 스냅 유지)', () => {
    const r = classifyVehicle('현대 포터Ⅱ', '2018-11-12');
    expect(r.maker).toBe('현대');
    expect(r.modelLine).toBe('포터');
    expect(r.confidence).toBe('high');
  });
  it('제네시스 G80 → maker 제네시스(현대 아님, 브랜드헤드)', () => {
    expect(classifyVehicle('제네시스 G80', '2017-01-23').maker).toBe('제네시스');
  });
});

describe('163대 얼린시드 코퍼스 불변식', () => {
  const results = () => VEHICLES.map((v) => ({ v, r: classifyVehicle(v.carName, v.firstReg || v.modelYear) }));

  it('전수 스냅 — none 0 · high ≥ 118(미스냅 3대 마감분 포함)', () => {
    const rs = results();
    const none = rs.filter((x) => x.r.confidence === 'none');
    const high = rs.filter((x) => x.r.confidence === 'high').length;
    expect(VEHICLES.length).toBe(163);
    expect(none.map((x) => x.v.carName)).toEqual([]); // 미스냅 0 (실패 시 어느 차명인지 노출)
    expect(high).toBeGreaterThanOrEqual(118);
  });

  it('제네시스 차명은 절대 현대로 분류되지 않음', () => {
    const bad = results().filter((x) => /제네시스|genesis/i.test(x.v.carName) && x.r.maker === '현대');
    expect(bad.map((x) => x.v.carName)).toEqual([]);
  });

  it('C-클래스 계열 차명(GLC 아님)이 GLC로 오분류되지 않음', () => {
    const bad = results().filter((x) => {
      const cClass = /c클래스|c\s?\d{3}/i.test(x.v.carName);
      const isGl = /gl[abces]/i.test(x.v.carName);
      return cClass && !isGl && /GLC/i.test(x.r.modelLine);
    });
    expect(bad.map((x) => x.v.carName)).toEqual([]);
  });
});
