/**
 * 수납·할인 entry Zod 스키마 = 검증 SSOT. (B: 강타입 — EntityRecord 느슨함·고스트필드 오타 방어)
 * 손으로 쓴 lib/payments/types/banking.ts 와 형태 일치. 점진 이행: 신규 검증은 여기서, 기존 타입은 그대로 공존.
 * 주의: source 는 실데이터에 'CMS' 도 있어(methodMap) hand-written enum('정산|계좌|카드|현금|수동')이 실제와 어긋났음 → 여기서 보정.
 */
import { z } from 'zod';

export const PAYMENT_SOURCES = ['정산', '계좌', '카드', '현금', '수동', 'CMS'] as const;

export const PaymentEntrySchema = z.object({
  date: z.string(),                          // YYYY-MM-DD 실입금일
  amount: z.number(),
  source: z.enum(PAYMENT_SOURCES),
  seq: z.number().optional(),                // 회차 지정(씨앗·수동)
  txId: z.string().optional(),
  cardTxId: z.string().optional(),
  memo: z.string().optional(),
  by: z.string().optional(),
  at: z.string().optional(),
  synthetic: z.boolean().optional(),         // 재구성 entry(실입금 아님)
  manual: z.boolean().optional(),
}).loose();                                  // 미지의 키 허용(점진 이행 — 있는 필드만 검증)
export type PaymentEntryZ = z.infer<typeof PaymentEntrySchema>;

export const DiscountEntrySchema = z.object({
  date: z.string(),
  amount: z.number(),                        // 할인액(양수)
  reason: z.string().optional(),
  seq: z.number().optional(),
  memo: z.string().optional(),
  by: z.string().optional(),
  at: z.string().optional(),
}).loose();
export type DiscountEntryZ = z.infer<typeof DiscountEntrySchema>;

/** 안전 파싱 — 실패해도 던지지 않음(점진 이행). ok=false면 issues로 무엇이 어긋났는지. */
export function parsePaymentEntry(v: unknown) {
  return PaymentEntrySchema.safeParse(v);
}
