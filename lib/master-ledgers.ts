import { companyShort } from './companies';
import { computeContractView } from './contract-ops';
import type { EntityRecord } from './intake/entities';
import { OUT } from './domain/status';
import { assetLifecycle, type AssetLifecycle } from './domain/asset-lifecycle';
import { computeOverMileage } from './domain/over-mileage';
import { contractRisks } from './risk-ops';
import { rentalTypeOf, paymentTimingOf } from './schema/contract';

const str = (v: unknown) => String(v ?? '').trim();
const num = (v: unknown) => Number(v) || 0;
/** 결측을 0으로 만들지 않음(주행거리·매물가 등). */
const numOrNull = (v: unknown): number | null => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export type AssetMasterRow = {
  raw: EntityRecord;
  companyId: string; company: string;
  assetCode: string; plate: string; status: string; disposed: boolean;
  lifecycle: AssetLifecycle;
  documentNo: string; certIssueDate: string; firstReg: string;
  vehicleType: string; usage: string; carName: string; maker: string;
  modelLine: string; subModel: string; variant: string; trim: string; modelYear: string;
  typeNumber: string; yearMonth: string; vin: string; engineType: string;
  ownerName: string; ownerBizNo: string; useAddress: string; approvalNumber: string;
  fuel: string; displacement: number; ratedOutput: string; cylinders: string;
  driveType: string; transmission: string; exteriorColor: string; interiorColor: string;
  lengthMm: number; widthMm: number; heightMm: number; grossWeightKg: number;
  seats: number; maxLoadKg: number; fuelEfficiency: number; mileage: number;
  inspectionFrom: string; inspectionTo: string; inspectionType: string;
  consumerPrice: number; optionPrice: number; optionDiscount: number; taxExempt: string;
  acquisitionPrice: number; purchasedDate: string; acquisitionDate: string; supplier: string;
  loanKind: string; loanCompany: string; loanMonths: number; loanPrincipal: number;
  loanRemainingPrincipal: number; loanRate: number; loanStartDate: string;
  insuranceCompany: string; insurancePolicyNo: string; insuranceExpiryDate: string;
  gpsProvider: string; gpsDeviceId: string; gpsInstalledDate: string; gpsControl: string;
  saleDate: string; salePrice: number; optionList: string;
  dealerAgency: string; dealerContact: string; dealerPhone: string;
  /** 금융구분 원값(예/아니오) — loanKind 파생의 소스. */
  loanCashOnly: string;
  listRent: number; listDeposit: number; listTerm: number; insuranceIncluded: string;
  /** 정비비 함대 랭킹 — page가 fleetMaintRanking으로 채움(원장은 0). */
  maintCost: number; maintCount: number; maintLastDate: string; maintVsAvg: number;
};

export function assetMasterRow(raw: EntityRecord): AssetMasterRow {
  const companyId = str(raw.companyId);
  const status = str(raw.status) || '미지정';
  return {
    raw, companyId, company: companyShort(companyId),
    assetCode: str(raw.assetCode), plate: str(raw.plate), status, disposed: OUT.has(status),
    lifecycle: assetLifecycle(status, OUT.has(status)),
    documentNo: str(raw.documentNo), certIssueDate: str(raw.certIssueDate), firstReg: str(raw.firstReg),
    vehicleType: str(raw.vehicleType), usage: str(raw.usage), carName: str(raw.carName),
    maker: str(raw.maker), modelLine: str(raw.modelLine), subModel: str(raw.subModel),
    variant: str(raw.variant), trim: str(raw.trim), modelYear: str(raw.modelYear),
    typeNumber: str(raw.typeNumber), yearMonth: str(raw.yearMonth), vin: str(raw.vin),
    engineType: str(raw.engineType), ownerName: str(raw.ownerName), ownerBizNo: str(raw.ownerBizNo),
    useAddress: str(raw.useAddress), approvalNumber: str(raw.approvalNumber),
    fuel: str(raw.fuel), displacement: num(raw.displacement), ratedOutput: str(raw.ratedOutput),
    cylinders: str(raw.cylinders), driveType: str(raw.driveType), transmission: str(raw.transmission),
    exteriorColor: str(raw.exteriorColor), interiorColor: str(raw.interiorColor),
    lengthMm: num(raw.lengthMm), widthMm: num(raw.widthMm), heightMm: num(raw.heightMm),
    grossWeightKg: num(raw.grossWeightKg), seats: num(raw.seats), maxLoadKg: num(raw.maxLoadKg),
    fuelEfficiency: num(raw.fuelEfficiency), mileage: num(raw.mileage),
    inspectionFrom: str(raw.inspectionFrom), inspectionTo: str(raw.inspectionTo), inspectionType: str(raw.inspectionType),
    consumerPrice: num(raw.consumerPrice), optionPrice: num(raw.optionPrice), optionDiscount: num(raw.optionDiscount),
    taxExempt: str(raw.taxExempt), acquisitionPrice: num(raw.acquisitionPrice),
    purchasedDate: str(raw.purchasedDate), acquisitionDate: str(raw.acquisitionDate), supplier: str(raw.supplier),
    loanKind: /예|현금|Y/i.test(str(raw.loanCashOnly)) ? '현금' : (raw.loanCompany ? '할부/리스' : ''),
    loanCashOnly: str(raw.loanCashOnly),
    loanCompany: str(raw.loanCompany), loanMonths: num(raw.loanMonths), loanPrincipal: num(raw.loanPrincipal),
    loanRemainingPrincipal: num(raw.loanRemainingPrincipal), loanRate: num(raw.loanRate),
    loanStartDate: str(raw.loanStartDate), insuranceCompany: str(raw.insuranceCompany),
    insurancePolicyNo: str(raw.insurancePolicyNo), insuranceExpiryDate: str(raw.insuranceExpiryDate),
    gpsProvider: str(raw.gpsProvider), gpsDeviceId: str(raw.gpsDeviceId),
    gpsInstalledDate: str(raw.gpsInstalledDate), gpsControl: str(raw.gpsControl),
    saleDate: str(raw.saleDate), salePrice: num(raw.salePrice), optionList: str(raw.optionList),
    dealerAgency: str(raw.dealerAgency), dealerContact: str(raw.dealerContact), dealerPhone: str(raw.dealerPhone),
    listRent: num(raw.listRent), listDeposit: num(raw.listDeposit), listTerm: num(raw.listTerm),
    insuranceIncluded: str(raw.insuranceIncluded),
    maintCost: 0, maintCount: 0, maintLastDate: '', maintVsAvg: 0,
  };
}

export type ContractMasterRow = {
  raw: EntityRecord;
  companyId: string; company: string; contractNo: string; status: string; rentalType: string; ended: boolean;
  contractDate: string; contractorName: string; contractorPhone: string; contractorBirth: string;
  contractorLicenseNo: string; contractorLicenseExpiry: string; contractorAddress: string; licenseType: string;
  plate: string; carName: string; rentalMonths: number; startDate: string; endDate: string;
  deliveredDate: string; returnScheduledDate: string; returnedDate: string;
  pickupPlace: string; returnPlace: string; annualMileageLimit: number;
  mileageOut: number | null; returnMileage: number | null; overMileageRate: number | null;
  /** computeOverMileage 소비값 — 재계산 금지. 산출불가/한도없음이면 null. */
  drivenKm: number | null; allowedKm: number | null; excessKm: number | null;
  overMileageFee: number | null; overMileageBasis: string;
  monthlyRent: number; deposit: number; reservationFee: number;
  paymentDay: number; paymentTiming: string; paymentMethod: string;
  driverAgeMin: number; driverAge: number; insuranceAge: number;
  lateFeeRate: number; earlyTerminationRate: number;
  cdw: string; deductible: number; superCover: string; additionalDrivers: string; withDriver: string;
  fuelOut: string; fuelIn: string; depositSettledDate: string; endReason: string;
  net: number; overdueDays: number; unpaidCount: number;
  sourceCarryUnpaid: number; reconciliationDelta: number; dataAlert: string;
  /** 계약 불이행 여부 — risk-ops SSOT (미수·보험·반납 등). */
  atRisk: boolean;
  /** 리스크 종류 요약 (미수·보험불일치·반납지남). */
  riskLabel: string;
};

export function contractMasterRow(raw: EntityRecord, today: string): ContractMasterRow {
  const view = computeContractView(raw, today);
  const risks = contractRisks(raw, today, view);
  const om = computeOverMileage(raw, today);
  const computable = om.basis === '반납확정';
  const companyId = str(raw.companyId);
  return {
    raw, companyId, company: companyShort(companyId), contractNo: str(raw.contractNo || raw._key),
    status: view.status, rentalType: rentalTypeOf(raw), ended: view.ended, contractDate: str(raw.contractDate),
    contractorName: str(raw.contractorName), contractorPhone: str(raw.contractorPhone),
    contractorBirth: str(raw.contractorBirth), contractorLicenseNo: str(raw.contractorLicenseNo),
    contractorLicenseExpiry: str(raw.contractorLicenseExpiry),
    contractorAddress: str(raw.contractorAddress), licenseType: str(raw.licenseType),
    plate: str(raw.plate), carName: str(raw.carName), rentalMonths: num(raw.rentalMonths),
    startDate: view.startDate, endDate: view.endDate, deliveredDate: str(raw.deliveredDate),
    returnScheduledDate: str(raw.returnScheduledDate), returnedDate: str(raw.returnedDate),
    pickupPlace: str(raw.pickupPlace), returnPlace: str(raw.returnPlace),
    annualMileageLimit: num(raw.annualMileageLimit),
    mileageOut: numOrNull(raw.mileageOut), returnMileage: numOrNull(raw.returnMileage),
    overMileageRate: numOrNull(raw.overMileageRate),
    drivenKm: computable ? om.drivenKm : null,
    allowedKm: computable ? Math.round(om.allowedKm) : null,
    excessKm: computable ? Math.round(om.excessKm) : null,
    overMileageFee: computable ? om.fee : null,
    overMileageBasis: om.basis,
    monthlyRent: view.monthlyRent,
    deposit: num(raw.deposit), reservationFee: num(raw.reservationFee),
    paymentDay: num(raw.paymentDay), paymentTiming: paymentTimingOf(raw.paymentTiming),
    paymentMethod: str(raw.paymentMethod), driverAgeMin: num(raw.driverAgeMin),
    driverAge: num(raw.driverAge), insuranceAge: num(raw.insuranceAge),
    lateFeeRate: num(raw.lateFeeRate), earlyTerminationRate: num(raw.earlyTerminationRate),
    cdw: str(raw.cdw), deductible: num(raw.deductible), superCover: str(raw.superCover),
    additionalDrivers: str(raw.additionalDrivers), withDriver: str(raw.withDriver),
    fuelOut: str(raw.fuelOut), fuelIn: str(raw.fuelIn),
    depositSettledDate: str(raw.depositSettledDate), endReason: str(raw.endReason),
    net: view.net, overdueDays: view.overdueDays, unpaidCount: view.count,
    sourceCarryUnpaid: num(raw.sourceCarryUnpaid), reconciliationDelta: num(raw.reconciliationDelta),
    dataAlert: str(raw.dataAlert),
    atRisk: risks.length > 0,
    riskLabel: risks.map((r) => r.kind).join(' · '),
  };
}
