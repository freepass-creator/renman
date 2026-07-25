import type { EntityRecord } from '@/lib/intake/entities';

export type TxMode = 'return' | 'extend' | 'terminate';
export type RecMode = 'pay' | 'disc';

export type TxForm = {
  date: string;
  mileage: string;
  fuel: string;
  settleNote: string;
  months: string;
  reason: string;
  penaltyNote: string;
};

export type DlvForm = {
  date: string;
  mileage: string;
  fuel: string;
};

export type RecForm = {
  seq: string;
  date: string;
  amount: string;
  method: string;
  reason: string;
};

export type VehicleIssue = {
  label: string;
  detail: string;
  tone: 'red' | 'amber' | 'gray';
  go?: () => void;
};

export type VehicleEntity = EntityRecord | null;