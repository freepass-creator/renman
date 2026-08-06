import { describe, it, expect } from 'vitest';
import { suggestCategory, resolveCategory, suggestionCategoryDef } from '@/lib/finance/classify-tx';
import { accountCategory } from '@/lib/finance/account-categories';

/** 표본은 전부 실제 자금일보에서 나온 값이다(26년_스위치플랜_자금일보.xlsx). */
describe('계정과목 추천', () => {
  it('계좌↔계좌 표기는 자금이동 — 손익에서 빠져야 하므로 제일 중요하다', () => {
    for (const c of ['6166에서868', '1868에서6616', '616에서868']) {
      const s = suggestCategory({ jeokyo: 'BZ뱅크', content: c, amount: 2770000 });
      expect(s?.category, c).toBe('자금이동');
      expect(s?.confidence).toBe('high');
    }
    expect(accountCategory('자금이동')?.nature).toBe('비손익');
  });

  it('BZ수수 적요는 이체수수료', () => {
    const s = suggestCategory({ jeokyo: 'BZ수수', content: '2718관리비카벨', withdraw: 500 });
    expect(s?.category).toBe('이체수수료');
  });

  it('보험사는 방향이 과목을 가른다 — 출금=보험료, 입금=환급', () => {
    expect(suggestCategory({ jeokyo: 'FB이체', content: 'DB손해보험', withdraw: 1597020 })?.category).toBe('보험료');
    expect(suggestCategory({ jeokyo: '타행PC', content: 'DB손보3898', amount: 120000 })?.category).toBe('보험료 환급');
  });

  it('CMS집금·통신·카드사용료를 잡는다', () => {
    expect(suggestCategory({ jeokyo: 'FB자금', content: 'CMS집금', amount: 1818515 })?.category).toBe('CMS집금');
    expect(suggestCategory({ jeokyo: 'FB통신', content: 'SMS140***38186', withdraw: 3000 })?.category).toBe('통신비');
    expect(suggestCategory({ jeokyo: '카드결', content: '신한카드법인', withdraw: 500000 })?.category).toBe('카드사용료');
  });

  it('★입금이라고 대여료로 단정하지 않는다 — 차입금·보증금 입금까지 매출이 되면 안 된다', () => {
    const s = suggestCategory({ jeokyo: '타행IB', content: '주식회사프라임', amount: 8800000 });
    expect(s?.category).toBe('');
    expect(s?.confidence).toBe('low');
  });

  it('추천 과목은 전부 SSOT 에 실재한다 — 오타로 없는 과목을 만들지 않는다', () => {
    const samples = [
      { jeokyo: 'BZ뱅크', content: '6166에서868', amount: 1 },
      { jeokyo: 'BZ수수', content: '', withdraw: 500 },
      { jeokyo: 'FB이체', content: 'DB손해보험', withdraw: 1 },
      { jeokyo: 'FB자금', content: 'CMS집금', amount: 1 },
      { jeokyo: 'FB통신', content: 'LGU+M2M', withdraw: 1 },
      { jeokyo: 'BZ뱅크', content: 'IBK원리금', withdraw: 1 },
      { jeokyo: 'BZ뱅크', content: '12프패탁송정산', withdraw: 1 },
      { jeokyo: 'BZ뱅크', content: '2718관리비카벨', withdraw: 1 },
    ];
    for (const t of samples) {
      const s = suggestCategory(t);
      if (s?.category) expect(suggestionCategoryDef(s), `${s.category} 가 SSOT 에 없다`).toBeTruthy();
    }
  });
});

describe('resolveCategory — 사람이 넣은 값이 이긴다', () => {
  it('기존 분류가 있으면 추천으로 덮지 않는다', () => {
    const r = resolveCategory('차량관리비', { jeokyo: 'BZ수수', content: '', withdraw: 500 });
    expect(r.category).toBe('차량관리비');
    expect(r.source).toBe('사람');
  });

  it('빈칸 + high 추천이면 자동 적용', () => {
    const r = resolveCategory('', { jeokyo: 'BZ수수', content: '', withdraw: 500 });
    expect(r.category).toBe('이체수수료');
    expect(r.source).toBe('자동');
  });

  it('medium 이하는 자동 적용하지 않는다 — 틀린 분류가 빈칸보다 나쁘다', () => {
    const r = resolveCategory('', { jeokyo: 'BZ뱅크', content: 'IBK원리금', withdraw: 500000 });
    expect(r.source).toBe('미분류');
    expect(r.category).toBe('');
    expect(r.suggestion?.category).toBe('할부금'); // 사람에게 보여는 준다
  });
});
