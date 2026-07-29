import { Badge, C, won, type RailTone, type SheetCol } from '@/components/ui';
import type { AssetMasterRow, ContractMasterRow } from './master-ledgers';
import {
  buildDetailSections, buildSheetViews, type DetailSectionDef, type SheetViewKeys,
} from './ledger-ext';
import { paymentTimingOf } from './schema/contract';
import { workRailStyle } from './work-rail';
import { LEDGER_EMPTY } from './ledger-empty';
import { isContractEndedStatus } from './domain/status';
import { dday } from './dashboard-consts';

const dash = (v: unknown) => (v === '' || v === null || v === undefined || v === 0 ? LEDGER_EMPTY.dash : String(v));
const date = (v: string) => (v ? v.slice(0, 10) : LEDGER_EMPTY.dash);
const money = (v: number) => (v ? won(v) : LEDGER_EMPTY.dash);
const number = (v: number, suffix = '') => (v ? `${v.toLocaleString('ko-KR')}${suffix}` : LEDGER_EMPTY.dash);

/** 자산 원장 rail — 상태·차종 축(함대 fleetRail 비재사용). 정상(운행)=무색. */
export function assetRail(r: Pick<AssetMasterRow, 'disposed' | 'status' | 'vehicleType'>): RailTone {
  if (r.disposed) return 'mute';
  if (r.status === '사고') return 'danger';
  if (r.status === '정비') return 'warn';
  if (r.status === '운행') return 'none';
  if (/화물|승합|버스/.test(String(r.vehicleType || ''))) return 'violet';
  if (/휴차|대기|상품/.test(String(r.status || ''))) return 'brand';
  return 'mute';
}

export { workRailStyle as assetRailStyle };

/** 계약 원장 rail — 만기경과·미납=danger · 만기임박=warn · 종료=mute · 정상=무색. */
export function contractRail(r: Pick<ContractMasterRow, 'ended' | 'status' | 'net' | 'unpaidCount' | 'endDate'>): RailTone {
  if (r.ended || isContractEndedStatus(r.status)) return 'mute';
  if (r.net > 0 || r.unpaidCount > 0) return 'danger';
  const d = dday(r.endDate);
  if (d != null && d < 0) return 'danger';
  if (d != null && d <= 30) return 'warn';
  return 'none';
}

export { workRailStyle as contractRailStyle };

function assetStatusTone(r: Pick<AssetMasterRow, 'disposed' | 'status' | 'vehicleType'>): 'gray' | 'green' | 'amber' | 'red' | 'blue' | 'purple' {
  if (r.disposed) return 'gray';
  if (r.status === '사고') return 'red';
  if (r.status === '정비') return 'amber';
  if (r.status === '운행') return 'green';
  if (/화물|승합|버스/.test(String(r.vehicleType || ''))) return 'purple';
  return 'blue';
}

const A = {
  company: { key: 'company', label: '회사명', pin: true, priority: 2, render: (r) => r.company, text: (r) => r.company },
  assetCode: { key: 'assetCode', label: '자산코드', priority: 4, render: (r) => dash(r.assetCode), text: (r) => r.assetCode },
  plate: { key: 'plate', label: '차량번호', pin: true, priority: 1, render: (r) => r.plate, text: (r) => r.plate },
  status: {
    key: 'status', label: '자산상태', align: 'c', priority: 1,
    render: (r) => <Badge tone={assetStatusTone(r)}>{r.status}</Badge>,
    text: (r) => r.status,
  },
  carName: { key: 'carName', label: '차명', priority: 1, render: (r) => dash(r.carName), text: (r) => r.carName },
  maker: { key: 'maker', label: '제조사', priority: 3, render: (r) => dash(r.maker), text: (r) => r.maker },
  modelLine: { key: 'modelLine', label: '모델', priority: 2, render: (r) => dash(r.modelLine), text: (r) => r.modelLine },
  subModel: { key: 'subModel', label: '세부모델', priority: 4, render: (r) => dash(r.subModel), text: (r) => r.subModel },
  trim: { key: 'trim', label: '트림', priority: 4, render: (r) => dash(r.trim), text: (r) => r.trim },
  modelYear: { key: 'modelYear', label: '연식', align: 'c', priority: 2, render: (r) => dash(r.modelYear || r.yearMonth.slice(0, 4)), text: (r) => r.modelYear || r.yearMonth },
  yearMonth: { key: 'yearMonth', label: '제작연월', priority: 4, render: (r) => dash(r.yearMonth), text: (r) => r.yearMonth },
  vin: { key: 'vin', label: '차대번호(VIN)', priority: 1, render: (r) => dash(r.vin), text: (r) => r.vin },
  ownerName: { key: 'ownerName', label: '소유자', priority: 3, render: (r) => dash(r.ownerName), text: (r) => r.ownerName },
  firstReg: { key: 'firstReg', label: '최초등록일', priority: 4, render: (r) => date(r.firstReg), text: (r) => r.firstReg },
  inspectionTo: { key: 'inspectionTo', label: '검사만료일', priority: 2, render: (r) => date(r.inspectionTo), text: (r) => r.inspectionTo },
  mileage: { key: 'mileage', label: '주행거리', align: 'r', priority: 3, render: (r) => number(r.mileage, 'km'), text: (r) => r.mileage },
} satisfies Record<string, SheetCol<AssetMasterRow>>;

const ax = (key: keyof AssetMasterRow, label: string, opts?: { date?: boolean; money?: boolean; num?: string; align?: 'l' | 'c' | 'r' }): SheetCol<AssetMasterRow> => ({
  key: String(key), label, align: opts?.align,
  render: (r) => opts?.date ? date(String(r[key] || '')) : opts?.money ? money(Number(r[key]) || 0) : opts?.num != null ? number(Number(r[key]) || 0, opts.num) : dash(r[key]),
  text: (r) => r[key] as string | number,
});

/** 자산 열 카탈로그 — 새 항목은 여기 정의 후 SHEET_KEYS / DETAIL_DEFS에 key만. */
const ASSET_COL_CATALOG: SheetCol<AssetMasterRow>[] = [
  A.company, A.assetCode, A.plate, A.status, A.carName, A.maker, A.modelLine,
  A.subModel, A.trim, A.modelYear, A.vin, A.ownerName, A.firstReg, A.inspectionTo, A.mileage,
  ax('documentNo', '문서확인번호'), ax('certIssueDate', '등록증발급일', { date: true }),
  ax('vehicleType', '차종'), ax('usage', '용도'), ax('typeNumber', '형식'), ax('engineType', '원동기형식'),
  ax('ownerBizNo', '법인번호/생년월일'), ax('useAddress', '사용본거지'), ax('approvalNumber', '제원관리번호'),
  ax('fuel', '연료'), ax('displacement', '배기량', { num: 'cc', align: 'r' }), ax('ratedOutput', '정격출력'),
  ax('cylinders', '기통수'), ax('driveType', '구동방식'), ax('transmission', '변속기'),
  ax('exteriorColor', '외장색'), ax('interiorColor', '내장색'), ax('variant', '파워트레인'),
  ax('lengthMm', '길이', { num: 'mm', align: 'r' }), ax('widthMm', '너비', { num: 'mm', align: 'r' }),
  ax('heightMm', '높이', { num: 'mm', align: 'r' }), ax('grossWeightKg', '총중량', { num: 'kg', align: 'r' }),
  ax('seats', '승차정원', { num: '명', align: 'r' }), ax('maxLoadKg', '최대적재', { num: 'kg', align: 'r' }),
  ax('fuelEfficiency', '연비', { num: 'km/L', align: 'r' }),
  ax('inspectionFrom', '검사시작일', { date: true }), ax('inspectionType', '검사구분'),
  ax('acquisitionPrice', '매입가', { money: true, align: 'r' }), ax('consumerPrice', '소비자가', { money: true, align: 'r' }),
  ax('optionPrice', '옵션가', { money: true, align: 'r' }), ax('optionDiscount', '옵션할인', { money: true, align: 'r' }),
  ax('taxExempt', '과세/면세'), ax('purchasedDate', '매입완료일', { date: true }),
  ax('acquisitionDate', '취득일', { date: true }), ax('supplier', '매입처'),
  ax('loanKind', '금융구분'), ax('loanCompany', '할부/리스사'), ax('loanMonths', '할부개월', { num: '개월', align: 'r' }),
  ax('loanPrincipal', '할부원금', { money: true, align: 'r' }), ax('loanRemainingPrincipal', '잔여원금', { money: true, align: 'r' }),
  ax('loanRate', '연이율', { num: '%', align: 'r' }), ax('loanStartDate', '할부개시일', { date: true }),
  ax('insuranceCompany', '보험사'), ax('insurancePolicyNo', '보험증권번호'), ax('insuranceExpiryDate', '보험만기', { date: true }),
  ax('gpsProvider', 'GPS 공급사'), ax('gpsDeviceId', 'GPS 단말번호'), ax('gpsInstalledDate', 'GPS 설치일', { date: true }), ax('gpsControl', '시동제어'),
  ax('dealerAgency', '취급대리점'), ax('dealerContact', '딜러담당자'), ax('dealerPhone', '딜러연락처'),
  ax('optionList', '선택옵션'), ax('saleDate', '매각일', { date: true }), ax('salePrice', '매각가', { money: true, align: 'r' }),
];

/**
 * 자산 엑셀 열 — 추가/삭제 요청: `자산 · 엑셀기본|엑셀전체 · +|-key`
 * @see lib/ledger-ext.ts
 */
export const ASSET_SHEET_KEYS: SheetViewKeys = {
  // 회사 → 신원 → 내용 → 상태 → 보조·기한
  basic: ['company', 'plate', 'carName', 'status', 'maker', 'modelLine', 'inspectionTo'],
  all: [
    'company', 'assetCode', 'plate', 'status', 'carName', 'maker', 'modelLine',
    'subModel', 'trim', 'modelYear', 'vin', 'ownerName', 'firstReg', 'inspectionTo', 'mileage',
    'documentNo', 'certIssueDate', 'vehicleType', 'usage', 'typeNumber', 'engineType',
    'ownerBizNo', 'useAddress', 'approvalNumber',
    'fuel', 'displacement', 'ratedOutput', 'cylinders', 'driveType', 'transmission',
    'exteriorColor', 'interiorColor', 'variant',
    'lengthMm', 'widthMm', 'heightMm', 'grossWeightKg', 'seats', 'maxLoadKg', 'fuelEfficiency',
    'inspectionFrom', 'inspectionType',
    'acquisitionPrice', 'consumerPrice', 'optionPrice', 'optionDiscount', 'taxExempt',
    'purchasedDate', 'acquisitionDate', 'supplier',
    'loanKind', 'loanCompany', 'loanMonths', 'loanPrincipal', 'loanRemainingPrincipal', 'loanRate', 'loanStartDate',
    'insuranceCompany', 'insurancePolicyNo', 'insuranceExpiryDate',
    'gpsProvider', 'gpsDeviceId', 'gpsInstalledDate', 'gpsControl',
    'dealerAgency', 'dealerContact', 'dealerPhone', 'optionList', 'saleDate', 'salePrice',
  ],
};

const _assetViews = buildSheetViews(ASSET_COL_CATALOG, ASSET_SHEET_KEYS);
export const ASSET_MASTER_BASIC_COLS = _assetViews.basic;
export const ASSET_MASTER_EXPANDED_COLS = _assetViews.expanded;

/**
 * 자산 상세 — 필드 추가 요청 시 해당 섹션 keys에만 push.
 * 예: `자산 · 등록증정보 · ownerPhone`
 * 컬럼 정의가 없으면 위 ASSET_MASTER_EXPANDED_COLS에 ax() 먼저.
 */
export const ASSET_DETAIL_DEFS: DetailSectionDef[] = [
  {
    title: '등록·상태',
    open: true,
    keys: ['company', 'assetCode', 'plate', 'status', 'carName', 'mileage'],
  },
  {
    title: '등록증정보',
    keys: [
      'documentNo', 'certIssueDate', 'firstReg', 'vin', 'ownerName', 'ownerBizNo', 'useAddress',
      'vehicleType', 'usage', 'typeNumber', 'engineType', 'approvalNumber',
      'inspectionFrom', 'inspectionTo', 'inspectionType',
    ],
  },
  {
    title: '제조·제원',
    keys: [
      'maker', 'modelLine', 'subModel', 'trim', 'variant', 'modelYear', 'yearMonth',
      'fuel', 'displacement', 'ratedOutput', 'cylinders', 'driveType', 'transmission',
      'exteriorColor', 'interiorColor', 'optionList',
      'lengthMm', 'widthMm', 'heightMm', 'grossWeightKg', 'seats', 'maxLoadKg', 'fuelEfficiency',
    ],
  },
  {
    title: '취득정보',
    keys: [
      'supplier', 'purchasedDate', 'acquisitionDate', 'acquisitionPrice', 'consumerPrice',
      'optionPrice', 'optionDiscount', 'taxExempt', 'dealerAgency', 'dealerContact', 'dealerPhone',
      'saleDate', 'salePrice',
    ],
  },
  {
    title: '금융·할부',
    keys: [
      'loanKind', 'loanCompany', 'loanMonths', 'loanPrincipal', 'loanRemainingPrincipal', 'loanRate', 'loanStartDate',
    ],
  },
  {
    title: '보험·GPS',
    keys: [
      'insuranceCompany', 'insurancePolicyNo', 'insuranceExpiryDate',
      'gpsProvider', 'gpsDeviceId', 'gpsInstalledDate', 'gpsControl',
    ],
  },
];

export const ASSET_DETAIL_SECTIONS = buildDetailSections(ASSET_MASTER_EXPANDED_COLS, ASSET_DETAIL_DEFS);

const C0 = {
  company: { key: 'company', label: '회사명', pin: true, priority: 2, render: (r) => r.company, text: (r) => r.company },
  contractNo: { key: 'contractNo', label: '계약번호', pin: true, priority: 1, render: (r) => dash(r.contractNo), text: (r) => r.contractNo },
  status: { key: 'status', label: '계약상태', align: 'c', priority: 1, render: (r) => <Badge tone={r.ended ? 'gray' : 'green'}>{r.status}</Badge>, text: (r) => r.status },
  rentalType: { key: 'rentalType', label: '대여형태', align: 'c', priority: 2, render: (r) => dash(r.rentalType), text: (r) => r.rentalType },
  contractorName: { key: 'contractorName', label: '계약자', priority: 1, render: (r) => (r.contractorName ? String(r.contractorName) : LEDGER_EMPTY.none), text: (r) => r.contractorName },
  contractorPhone: { key: 'contractorPhone', label: '연락처', priority: 3, render: (r) => dash(r.contractorPhone), text: (r) => r.contractorPhone },
  plate: { key: 'plate', label: '계약차량', priority: 1, render: (r) => (r.plate ? String(r.plate) : LEDGER_EMPTY.unassigned), text: (r) => r.plate },
  carName: { key: 'carName', label: '계약차종', priority: 3, render: (r) => dash(r.carName), text: (r) => r.carName },
  contractDate: { key: 'contractDate', label: '계약일', priority: 4, render: (r) => date(r.contractDate), text: (r) => r.contractDate },
  startDate: { key: 'startDate', label: '시작일', priority: 2, render: (r) => date(r.startDate), text: (r) => r.startDate },
  endDate: { key: 'endDate', label: '종료일', priority: 2, render: (r) => date(r.endDate), text: (r) => r.endDate },
  monthlyRent: { key: 'monthlyRent', label: '월대여료', align: 'r', priority: 1, render: (r) => money(r.monthlyRent), text: (r) => r.monthlyRent },
  deposit: { key: 'deposit', label: '보증금', align: 'r', priority: 3, render: (r) => money(r.deposit), text: (r) => r.deposit },
  paymentDay: {
    key: 'paymentDay', label: '결제일', align: 'c', priority: 3,
    render: (r) => (r.paymentDay ? `${r.paymentDay}일` : LEDGER_EMPTY.dash),
    text: (r) => r.paymentDay || '',
  },
  paymentTiming: {
    key: 'paymentTiming', label: '납부시기', align: 'c', priority: 3,
    render: (r) => {
      const t = paymentTimingOf(r.paymentTiming);
      return t === '후납' ? <Badge tone="amber">후납</Badge> : <Badge tone="gray">선납</Badge>;
    },
    text: (r) => paymentTimingOf(r.paymentTiming),
  },
  paymentMethod: {
    key: 'paymentMethod', label: '납부방법', priority: 4,
    render: (r) => dash(r.paymentMethod),
    text: (r) => r.paymentMethod,
  },
  risk: { key: 'riskLabel', label: '리스크', priority: 1, render: (r) => r.atRisk ? <Badge tone="red">{r.riskLabel}</Badge> : LEDGER_EMPTY.dash, text: (r) => r.riskLabel },
  net: { key: 'net', label: '미수금액', align: 'r', priority: 1, render: (r) => r.net ? <span style={{ color: C.danger, fontWeight: 700 }}>{won(r.net)}</span> : LEDGER_EMPTY.dash, text: (r) => r.net },
  alert: { key: 'alert', label: '데이터알람', priority: 2, render: (r) => r.dataAlert ? <Badge tone="amber">{r.dataAlert}</Badge> : <Badge tone="green">원본 대사완료</Badge>, text: (r) => r.dataAlert || '원본 대사완료' },
} satisfies Record<string, SheetCol<ContractMasterRow>>;

const cx = (key: keyof ContractMasterRow, label: string, opts?: { date?: boolean; money?: boolean; num?: string; align?: 'l' | 'c' | 'r' }): SheetCol<ContractMasterRow> => ({
  key: String(key), label, align: opts?.align,
  render: (r) => opts?.date ? date(String(r[key] || '')) : opts?.money ? money(Number(r[key]) || 0) : opts?.num != null ? number(Number(r[key]) || 0, opts.num) : dash(r[key]),
  text: (r) => r[key] as string | number,
});

/** 계약 열 카탈로그 — 새 항목은 여기 정의 후 SHEET_KEYS / DETAIL_DEFS에 key만. */
const CONTRACT_COL_CATALOG: SheetCol<ContractMasterRow>[] = [
  C0.company, C0.contractNo, C0.status, C0.rentalType, C0.contractorName, C0.contractorPhone,
  C0.plate, C0.carName, C0.contractDate, C0.startDate, C0.endDate,
  C0.monthlyRent, C0.deposit, C0.paymentDay, C0.paymentTiming, C0.paymentMethod, C0.risk, C0.net, C0.alert,
  cx('contractorBirth', '생년월일', { date: true }), cx('contractorLicenseNo', '면허번호'),
  cx('licenseType', '면허종별'), cx('contractorAddress', '주소'),
  cx('rentalMonths', '대여기간', { num: '개월', align: 'r' }), cx('annualMileageLimit', '연주행한도', { num: 'km', align: 'r' }),
  cx('deliveredDate', '인도일', { date: true }), cx('returnScheduledDate', '반납예정일', { date: true }),
  cx('returnedDate', '반납/해지일', { date: true }), cx('pickupPlace', '인수장소'), cx('returnPlace', '반환장소'),
  cx('reservationFee', '예약금', { money: true, align: 'r' }),
  cx('driverAgeMin', '최소운전연령', { num: '세', align: 'r' }), cx('driverAge', '운전자연령', { num: '세', align: 'r' }),
  cx('insuranceAge', '보험허용연령', { num: '세', align: 'r' }),
  cx('lateFeeRate', '지연손해금율', { num: '%', align: 'r' }), cx('earlyTerminationRate', '중도해지율', { num: '%', align: 'r' }),
  cx('cdw', '자차보험(CDW)'), cx('deductible', '면책금', { money: true, align: 'r' }), cx('superCover', '완전면책'),
  cx('additionalDrivers', '추가운전자'), cx('withDriver', '기사포함'), cx('fuelOut', '인수연료'), cx('fuelIn', '반납연료'),
  cx('depositSettledDate', '보증금정산일', { date: true }), cx('endReason', '종료사유'),
  cx('overdueDays', '연체일', { num: '일', align: 'r' }), cx('unpaidCount', '미납회차', { num: '회', align: 'r' }),
  cx('sourceCarryUnpaid', '사업현황 미수', { money: true, align: 'r' }), cx('reconciliationDelta', '원본차이', { money: true, align: 'r' }),
];

/** 계약 엑셀 열 — `계약 · 엑셀기본|엑셀전체 · +|-key` @see lib/ledger-ext.ts */
export const CONTRACT_SHEET_KEYS: SheetViewKeys = {
  // 회사 → 신원(계약자·차) → 내용(계약번호) → 분류 → 상태 → 수치/기한
  basic: [
    'company', 'contractorName', 'plate', 'contractNo', 'rentalType', 'status',
    'endDate', 'monthlyRent', 'paymentDay', 'paymentTiming', 'riskLabel', 'net', 'alert',
  ],
  all: [
    'company', 'contractNo', 'status', 'rentalType', 'contractorName', 'contractorPhone',
    'plate', 'carName', 'contractDate', 'startDate', 'endDate',
    'monthlyRent', 'deposit', 'paymentDay', 'paymentTiming', 'paymentMethod', 'riskLabel', 'net', 'alert',
    'contractorBirth', 'contractorLicenseNo', 'licenseType', 'contractorAddress',
    'rentalMonths', 'annualMileageLimit', 'deliveredDate', 'returnScheduledDate', 'returnedDate',
    'pickupPlace', 'returnPlace', 'reservationFee',
    'driverAgeMin', 'driverAge', 'insuranceAge', 'lateFeeRate', 'earlyTerminationRate',
    'cdw', 'deductible', 'superCover', 'additionalDrivers', 'withDriver', 'fuelOut', 'fuelIn',
    'depositSettledDate', 'endReason', 'overdueDays', 'unpaidCount',
    'sourceCarryUnpaid', 'reconciliationDelta',
  ],
};

const _contractViews = buildSheetViews(CONTRACT_COL_CATALOG, CONTRACT_SHEET_KEYS);
export const CONTRACT_MASTER_BASIC_COLS = _contractViews.basic;
export const CONTRACT_MASTER_EXPANDED_COLS = _contractViews.expanded;

/**
 * 계약 상세 — 필드 추가 요청 시 해당 섹션 keys에만 push.
 * 예: `계약 · 요금·납부 · discountRate`
 */
export const CONTRACT_DETAIL_DEFS: DetailSectionDef[] = [
  {
    title: '계약 기본',
    open: true,
    keys: [
      'company', 'contractNo', 'status', 'rentalType', 'plate', 'carName', 'contractDate', 'startDate', 'endDate', 'alert',
    ],
  },
  {
    title: '계약자',
    keys: [
      'contractorName', 'contractorPhone', 'contractorBirth', 'contractorLicenseNo', 'licenseType', 'contractorAddress',
    ],
  },
  {
    title: '기간·인도',
    keys: [
      'rentalMonths', 'annualMileageLimit', 'deliveredDate', 'returnScheduledDate', 'returnedDate',
      'pickupPlace', 'returnPlace', 'fuelOut', 'fuelIn',
    ],
  },
  {
    title: '요금·납부',
    keys: [
      'monthlyRent', 'deposit', 'reservationFee', 'paymentDay', 'paymentTiming', 'paymentMethod', 'net',
      'lateFeeRate', 'earlyTerminationRate',
    ],
  },
  {
    title: '보험·특약',
    keys: [
      'cdw', 'deductible', 'superCover', 'driverAgeMin', 'driverAge', 'insuranceAge',
      'additionalDrivers', 'withDriver',
    ],
  },
  {
    title: '미수·종료',
    keys: [
      'riskLabel', 'overdueDays', 'unpaidCount', 'sourceCarryUnpaid', 'reconciliationDelta',
      'depositSettledDate', 'endReason',
    ],
  },
];

export const CONTRACT_DETAIL_SECTIONS = buildDetailSections(CONTRACT_MASTER_EXPANDED_COLS, CONTRACT_DETAIL_DEFS);
