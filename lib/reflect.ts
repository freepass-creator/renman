'use client';
// 반영 엔진(분자) — 회사 실데이터를 깨끗이 적재하고 운영 스냅샷을 산출. jpkerp5 commitAll 대응.
//   페이지 버튼 로직 아님 — 개발도구·홈·어디서든 이 하나를 호출(원자·분자 원칙).
import { getStore } from './store';
import { wipeCompany } from './reset';
import { computeDashboard, type OperatingSummary } from './operating-snapshot';
import { TODAY } from './dashboard-consts';
import { auditReceiptIntegrity, assertReceiptIntegrity, type ReceiptIntegrityReport } from './payments/receipt-integrity';
import { baselineDateOf } from './migrate/acceptance-normalization';
import { resolveMigrateMode } from './migrate/pack';
import { isRemoteBackend } from './migrate/acceptance';

export type ReflectAcceptance = {
  /** 서버에 승인이 기록됐는가. false면 이 반영은 «오픈 근거»가 될 수 없다. */
  recorded: boolean;
  /** 기록되지 않았다면 왜인지 — 사람에게 그대로 보여줄 수 있는 문장. */
  reason?: string;
  runId?: string;
};

export type ReflectResult = {
  loaded: { total: number; perEntity: Record<string, number> };
  summary: OperatingSummary;
  /** 수납이력 대조 결과 — 실패하면 여기까지 오지 않는다(반영 자체가 던진다). */
  receipts: ReceiptIntegrityReport;
  /** 서버 승인 — 로컬 미리보기 반영은 기록하지 않는다(P0-1 로컬/원격 혼합 승인 차단). */
  acceptance: ReflectAcceptance;
};

/**
 * 서버 승인 기록 — 기준선 POST → 승인 POST.
 *
 * ★저장 백엔드가 firestore 가 아니면 **보내지 않는다.** localStorage 반영은 서버에 아무것도 남기지
 *   않았으므로, 그 상태에서 승인만 서버에 적히면 「승인됐는데 서버는 비어 있다」가 된다.
 *   서버도 같은 것을 막지만(로컬 액터 403), 애초에 보내지 않는 것이 경계의 앞단이다.
 *
 * 정당한 거부(400·403·409)는 던진다 — 반영을 «완료»로 보이게 하면 안 되는 사유들이다.
 * 네트워크·5xx 는 기록 실패로만 남긴다 — 데이터는 이미 서버에 들어갔고, 승인은 다시 시도할 수 있다.
 */
async function recordAcceptance(companyId: string, backend: string, baseline: {
  packMode: string; baselineDate: string; perEntity: Record<string, number>; receipts: { count: number; sum: number };
}): Promise<ReflectAcceptance> {
  if (!isRemoteBackend(backend)) {
    return { recorded: false, reason: `로컬 미리보기(${backend}) 반영 — 서버 승인을 남기지 않았습니다` };
  }
  const { apiAuthHeaders } = await import('./api-headers');
  const headers = await apiAuthHeaders();
  headers.set('content-type', 'application/json');

  const post = async (url: string, payload: unknown) => {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    if (!res.ok) {
      const detail = await res.json().catch(() => null) as { error?: string } | null;
      const message = detail?.error || `승인 경로가 거부했습니다 (${res.status})`;
      if (res.status === 400 || res.status === 403 || res.status === 409) throw new Error(message);
      return { soft: message } as const;
    }
    return { data: await res.json() } as const;
  };

  const base = await post('/api/migration-baseline', { companyId, ...baseline });
  if ('soft' in base) return { recorded: false, reason: base.soft };
  const runId = String((base.data as { runId?: string }).runId || '');
  if (!runId) return { recorded: false, reason: '기준선 실행 번호를 받지 못했습니다' };

  const accept = await post('/api/migration-acceptance', { companyId, runId });
  if ('soft' in accept) return { recorded: false, reason: accept.soft, runId };
  return { recorded: true, runId };
}

/** 회사 실데이터 반영 — 기존 비우고 최신 적재 → 적재본으로 운영 스냅샷 산출. clean=false면 비우지 않고 추가만. */
export async function reflectCompany(companyId: string, opts: { clean?: boolean } = {}): Promise<ReflectResult> {
  const store = getStore();
  if (opts.clean !== false) await wipeCompany(companyId);
  const { seedSampleData } = await import('./seed');
  const loaded = await seedSampleData(companyId);
  // 적재 직후 다시 읽어(캐시 무효화됨) 같은 집계 엔진으로 스냅샷 산출 — 홈과 동일 계산.
  const [contracts, vehicles, insurances, penalties, bankTx] = await Promise.all([
    store.list('contract', companyId), store.list('vehicle', companyId), store.list('insurance', companyId),
    store.list('penalty', companyId), store.list('bank_tx', companyId),
  ]);
  /* ★승인 게이트(fail-closed) — 「반영 완료」 토스트를 띄우기 전에 넣은 것과 들어간 것을 대조한다.
     저장은 자연키 dedup 이라 동일내용 거래가 조용히 접힐 수 있고, 그렇게 사라진 수납은
     화면 어디에도 «없어졌다»고 표시되지 않는다. 대조에 실패하면 성공을 반환하지 않는다. */
  const source = loaded.pack.bank_tx || [];
  const receipts = auditReceiptIntegrity({ source, loaded: bankTx, baselineDate: baselineDateOf(source) });
  assertReceiptIntegrity(receipts);

  /* 대조를 통과한 뒤에야 승인을 남긴다 — 순서가 뒤집히면 «검증 전 승인»이 된다. */
  const acceptance = await recordAcceptance(companyId, store.backend, {
    packMode: resolveMigrateMode(),
    baselineDate: receipts.baselineDate,
    perEntity: loaded.perEntity,
    receipts: { count: receipts.loaded.count, sum: receipts.loaded.sum },
  });

  const D = computeDashboard({ contracts, vehicles, insurances, penalties, bankTx }, TODAY);
  return { loaded, summary: D.summary, receipts, acceptance };
}
