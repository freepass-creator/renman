/** 문자 수신자 타입 — NotifyDialog · recipients 공용. server-only 와 분리. */
export type NotifyRecipient = {
  contractKey: string;
  companyId: string;
  name: string;
  plate: string;
  phone: string;
  contractNo?: string;
  unpaidAmount: number;
  unpaidSeqCount: number;
  currentSeq: number;
  monthlyRent: number;
  depositDue: number;
  depositRefund: number | null;
  depositReceived: number | null;
  depositUnreceived: number | null;
};
