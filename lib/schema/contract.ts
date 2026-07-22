/**
 * 계약(contract) Zod 스키마 = 필드 어휘 SSOT + 검증. (B: 강타입)
 * 목적: 고스트필드(_carryUnpaid·_paidTotal·_payments·_discounts)를 «선언»해 오타/유실을 잡고,
 *       핵심 금액·생애 필드의 런타임 타입을 검증. .loose()로 나머지 필드는 허용(점진 이행 — 전면 전환 아님).
 * 파생: type ContractRecord = z.infer<...>. 손으로 쓴 EntityRecord(Record<string,unknown>)와 공존, 경계에서 parse.
 */
import { z } from 'zod';
import { PaymentEntrySchema, DiscountEntrySchema } from './payment';

const numlike = z.union([z.number(), z.string()]).optional(); // 소스가 숫자/문자 혼재(느슨한 원본 방어)

export const ContractSchema = z.object({
  _key: z.string().optional(),
  companyId: z.string().optional(),
  contractNo: z.string().optional(),
  contractorName: z.string().optional(),
  contractorPhone: z.string().optional(),
  plate: z.string().optional(),
  carName: z.string().optional(),

  // 생애
  status: z.string().optional(),            // 대기|운행|반납|해지|채권 (domain/status 어휘)
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  contractDate: z.string().optional(),
  deliveredDate: z.string().optional(),
  returnScheduledDate: z.string().optional(),
  returnedDate: z.string().optional(),
  endReason: z.string().optional(),

  // 금액·결제
  monthlyRent: numlike,
  rentalMonths: numlike,
  deposit: numlike,
  paymentDay: numlike,
  paymentTiming: z.enum(['선불', '후불']).optional(),

  // 시동제어
  engineDisabled: z.boolean().optional(),
  engineDisabledAt: z.string().optional(),
  engineDisabledReason: z.string().optional(),

  // ── 미수 고스트필드(반드시 선언 — 오타 시 조용한 유실 방지) ──
  _carryUnpaid: z.number().optional(),       // 개시이월(opening balance) 앵커 = 순미수 SSOT
  _paidTotal: z.number().optional(),         // 개시 역산 납부(표시용)
  _payments: z.array(PaymentEntrySchema).optional(),
  _discounts: z.array(DiscountEntrySchema).optional(),
}).loose();                                  // 그 외 필드(cdw·deductible·mileageOut 등)는 허용
export type ContractRecord = z.infer<typeof ContractSchema>;

/** 안전 파싱 — 실패해도 던지지 않음. 경계(commit·seed 검증)에서 점진 도입용. */
export function parseContract(v: unknown) {
  return ContractSchema.safeParse(v);
}
