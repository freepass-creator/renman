// 거래 계정과목 분류 SSOT — 홈 자금렌즈·자금일보(/finance)가 공유하는 단일 경로.
//   부분필드 변경이므로 update(패치 병합). 반영은 store가 자동 브로드캐스트(notifySaved) → 전 화면 갱신.
//   마감월은 store assertMoneyMutable + 여기 사전 가드.
import { getStore } from './store';
import { assertNotLocked } from './finance/period-lock';
import { safeUpdate } from './safe-update';

export async function classifyTx(entity: 'bank_tx' | 'card_tx', companyId: string, key: string, category: string): Promise<boolean> {
  if (!key || !category) return false;
  const store = getStore();
  const before = await store.get(entity, companyId, key);
  try {
    assertNotLocked(companyId, before?.txDate);
  } catch (e) {
    await safeUpdate(async () => { throw e; });
    return false;
  }
  const ok = await safeUpdate(() => store.update(entity, companyId, key, { category }));
  return ok != null;
}
