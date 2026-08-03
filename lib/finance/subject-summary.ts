/**
 * 손익·부가세 과목표 집계 SSOT — 페이지 .filter/.reduce 손롤 금지.
 * 영업손익 헤드라인 숫자 = operatingProfit(행) 유지. 여기는 과목 표·Metric용 분해.
 */
import { type SubjectAgg } from './cash-ledger';
import { groupOfLabel, vatOfLabel } from '@/lib/payments/ledger-subjects';

export type PnlSubjectSummary = {
  opIncome: SubjectAgg[];
  opExpense: SubjectAgg[];
  capFin: SubjectAgg[];
  unclass: SubjectAgg[];
  totalIn: number;
  totalOut: number;
  capFinOut: number;
  capFinIn: number;
  unclassAmt: number;
};

/** 과목표 → 영업수입/비용·자본금융·미분류 + 합계. */
export function summarizePnlSubjects(subjects: SubjectAgg[]): PnlSubjectSummary {
  const opIncome: SubjectAgg[] = [];
  const opExpense: SubjectAgg[] = [];
  const capFin: SubjectAgg[] = [];
  const unclass: SubjectAgg[] = [];
  let totalIn = 0, totalOut = 0, capFinOut = 0, capFinIn = 0, unclassAmt = 0;

  for (const s of subjects) {
    const g = groupOfLabel(s.label);
    if (s.kind === '미분류') {
      unclass.push(s);
      unclassAmt += s.inAmt + s.outAmt;
      continue;
    }
    if (g === '자본' || g === '금융') {
      capFin.push(s);
      capFinOut += s.outAmt;
      capFinIn += s.inAmt;
      continue;
    }
    if (s.kind === '수입' && g === '영업') {
      opIncome.push(s);
      totalIn += s.inAmt;
      continue;
    }
    if (s.kind === '지출' && g === '영업') {
      opExpense.push(s);
      totalOut += s.outAmt;
    }
  }

  return { opIncome, opExpense, capFin, unclass, totalIn, totalOut, capFinOut, capFinIn, unclassAmt };
}

export type VatSubjectSummary = {
  taxableIn: SubjectAgg[];
  taxableOut: SubjectAgg[];
  salesGross: number;
  purchaseGross: number;
  salesVat: number;
  purchaseVat: number;
  payable: number;
  supplyValue: number;
};

/** 과세 매출/매입 → 세액(공급대가×10/110). */
export function summarizeVatSubjects(subjects: SubjectAgg[]): VatSubjectSummary {
  const taxableIn: SubjectAgg[] = [];
  const taxableOut: SubjectAgg[] = [];
  let salesGross = 0, purchaseGross = 0;

  for (const s of subjects) {
    if (vatOfLabel(s.label) !== '과세') continue;
    if (s.kind === '수입') {
      taxableIn.push(s);
      salesGross += s.inAmt;
    } else if (s.kind === '지출') {
      taxableOut.push(s);
      purchaseGross += s.outAmt;
    }
  }

  const salesVat = Math.round(salesGross / 11);
  const purchaseVat = Math.round(purchaseGross / 11);
  return {
    taxableIn,
    taxableOut,
    salesGross,
    purchaseGross,
    salesVat,
    purchaseVat,
    payable: salesVat - purchaseVat,
    supplyValue: salesGross - salesVat,
  };
}
