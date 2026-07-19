/**
 * 내용증명 발송 — 인쇄(PrintHost) + 계약 발송이력 + 이력 1건.
 *   새 라우트 금지. 미수·Vehicle360이 이 함수만 호출.
 *   일괄 = sendNoticeCertBulk (PrintHost N페이지 · 이력 N건).
 */
import { getStore } from '@/lib/store';
import { openPrintDoc } from '@/lib/ui-bus';
import { type EntityRecord } from '@/lib/intake/entities';
import { TODAY } from '@/lib/dashboard-consts';
import { buildNoticeClaim } from '@/lib/docs/notice-claim';
import { newId } from '@/lib/domain/ids';

export type SendNoticeOpts = {
  rec: EntityRecord;
  companyId: string;
  actor?: string;
  /** 기본 true — noticeSentDate·docNo 기록 */
  markSent?: boolean;
  /** 인쇄만 (미리보기) */
  previewOnly?: boolean;
};

async function markNoticeSent(rec: EntityRecord, companyId: string, actor: string) {
  const co = String(rec.companyId || companyId);
  const key = String(rec._key || '');
  const plate = String(rec.plate || '');
  const claim = buildNoticeClaim(rec, TODAY);
  if (!key) return claim;
  const store = getStore();
  await store.update('contract', co, key, {
    noticeSentDate: TODAY,
    noticeDocNo: claim.docNo,
    noticeClaimAmount: claim.claim,
    noticeDueDate: claim.dueDate,
  });
  try {
    await store.save('history', co, [{
      histKey: newId('history'),
      plate,
      date: TODAY,
      category: '독촉',
      title: '내용증명 발송',
      description: `${claim.docNo} · 청구 ${claim.claim.toLocaleString('ko-KR')}원 · 기한 ${claim.dueDate}${actor ? ` · ${actor}` : ''}`,
      status: '완료',
      contractNo: String(rec.contractNo || ''),
      customer: String(rec.contractorName || ''),
    }]);
  } catch { /* 이력 실패가 발송 자체는 막지 않음 */ }
  return claim;
}

export async function sendNoticeCert(opts: SendNoticeOpts): Promise<{ docNo: string; claim: number }> {
  const { rec, companyId, actor = '', markSent = true, previewOnly = false } = opts;
  const key = String(rec._key || '');
  const plate = String(rec.plate || '');
  const claim = buildNoticeClaim(rec, TODAY);

  openPrintDoc('notice', plate, { contractKey: key });

  if (previewOnly || !markSent || !key) return { docNo: claim.docNo, claim: claim.claim };
  await markNoticeSent(rec, companyId, actor);
  return { docNo: claim.docNo, claim: claim.claim };
}

/** 내용증명 일괄 — v5 /notice/cert/bulk 흡수. PrintHost 한 번에 N페이지. */
export async function sendNoticeCertBulk(opts: {
  recs: EntityRecord[];
  companyId: string;
  actor?: string;
  markSent?: boolean;
}): Promise<{ count: number; totalClaim: number }> {
  const { recs, companyId, actor = '', markSent = true } = opts;
  const list = recs.filter((r) => String(r._key || ''));
  if (list.length === 0) return { count: 0, totalClaim: 0 };

  const keys = list.map((r) => String(r._key));
  const firstPlate = String(list[0].plate || '');
  openPrintDoc('notice', firstPlate, { contractKeys: keys, contractKey: keys[0] });

  let totalClaim = 0;
  if (markSent) {
    for (const rec of list) {
      const claim = await markNoticeSent(rec, companyId, actor);
      totalClaim += claim.claim;
    }
  } else {
    totalClaim = list.reduce((s, r) => s + buildNoticeClaim(r, TODAY).claim, 0);
  }
  return { count: list.length, totalClaim };
}
