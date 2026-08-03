import { Badge, Btn, C, money, type SheetCol } from '@/components/ui';
import type { AssetMasterRow, ContractMasterRow } from './master-ledgers';
import {
  buildDetailSections, buildSheetViews, type DetailSectionDef, type SheetViewKeys,
} from './ledger-ext';
import { paymentTimingOf } from './schema/contract';
import { LEDGER_EMPTY } from './ledger-empty';
import { LEDGER_LABEL } from './ledger-labels';
import { assetLifecycleTone } from './domain/asset-lifecycle';
import { openCar } from './ui-bus';
import type { ScheduleLedgerRow, ScheduleKind } from '@/lib/contracts/schedule-ledger';
import type { ScheduleStatus } from '@/lib/payments/types/banking';

const dash = (v: unknown) => (v === '' || v === null || v === undefined || v === 0 ? LEDGER_EMPTY.dash : String(v));
const date = (v: string) => (v ? v.slice(0, 10) : LEDGER_EMPTY.dash);
const moneyCell = (v: number) => (v ? money(v) : LEDGER_EMPTY.dash);
const moneyOrNull = (v: number | null) => (v == null ? LEDGER_EMPTY.dash : moneyCell(v));
const number = (v: number, suffix = '') => (v ? `${v.toLocaleString('ko-KR')}${suffix}` : LEDGER_EMPTY.dash);
const numberOrNull = (v: number | null, suffix = '') => (
  v == null ? LEDGER_EMPTY.dash : `${v.toLocaleString('ko-KR')}${suffix}`
);

export function assetStatusTone(r: Pick<AssetMasterRow, 'disposed' | 'status' | 'vehicleType'>): 'gray' | 'green' | 'amber' | 'red' | 'blue' | 'purple' {
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
  lifecycle: {
    key: 'lifecycle', label: '자산분류', align: 'c', priority: 1,
    render: (r) => <Badge tone={assetLifecycleTone(r.lifecycle)}>{r.lifecycle}</Badge>,
    text: (r) => r.lifecycle,
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
  mileage: { key: 'mileage', label: '주행거리', align: 'r', priority: 3, xf: 'int', render: (r) => number(r.mileage, 'km'), text: (r) => r.mileage },
} satisfies Record<string, SheetCol<AssetMasterRow>>;

const ax = (key: keyof AssetMasterRow, label: string, opts?: { date?: boolean; money?: boolean; num?: string; align?: 'l' | 'c' | 'r'; priority?: 1 | 2 | 3 | 4 }): SheetCol<AssetMasterRow> => ({
  key: String(key), label, align: opts?.align, priority: opts?.priority,
  xf: opts?.money ? 'money' : opts?.num === '%' ? 'rate' : opts?.num != null ? 'int' : opts?.date ? 'date' : undefined,
  render: (r) => opts?.date ? date(String(r[key] || '')) : opts?.money ? moneyCell(Number(r[key]) || 0) : opts?.num != null ? number(Number(r[key]) || 0, opts.num) : dash(r[key]),
  text: (r) => r[key] as string | number,
});

/** 자산 열 카탈로그 — 새 항목은 여기 정의 후 SHEET_KEYS / DETAIL_DEFS에 key만. */
const ASSET_COL_CATALOG: SheetCol<AssetMasterRow>[] = [
  A.company, A.assetCode, A.plate, A.carName, A.lifecycle, A.status, A.maker, A.modelLine,
  A.subModel, A.trim, A.modelYear, A.yearMonth, A.vin, A.ownerName, A.firstReg, A.inspectionTo, A.mileage,
  ax('documentNo', '문서확인번호'), ax('certIssueDate', '등록증발급일', { date: true }),
  ax('vehicleType', '차종'), ax('usage', '용도', { priority: 3 }), ax('typeNumber', '형식'), ax('engineType', '원동기형식'),
  ax('ownerBizNo', '법인번호/생년월일'), ax('useAddress', '사용본거지'), ax('approvalNumber', '제원관리번호'),
  ax('fuel', '연료'), ax('displacement', '배기량', { num: 'cc', align: 'r' }), ax('ratedOutput', '정격출력'),
  ax('cylinders', '기통수'), ax('driveType', '구동방식'), ax('transmission', '변속기'),
  ax('exteriorColor', '외장색'), ax('interiorColor', '내장색'), ax('variant', '파워트레인'),
  ax('lengthMm', '길이', { num: 'mm', align: 'r' }), ax('widthMm', '너비', { num: 'mm', align: 'r' }),
  ax('heightMm', '높이', { num: 'mm', align: 'r' }), ax('grossWeightKg', '총중량', { num: 'kg', align: 'r' }),
  ax('seats', '승차정원', { num: '명', align: 'r' }), ax('maxLoadKg', '최대적재', { num: 'kg', align: 'r' }),
  ax('fuelEfficiency', '연비', { num: 'km/L', align: 'r' }),
  ax('inspectionFrom', '검사시작일', { date: true }), ax('inspectionType', '검사구분'),
  ax('acquisitionPrice', '매입가', { money: true, align: 'r', priority: 2 }), ax('consumerPrice', '소비자가', { money: true, align: 'r' }),
  ax('optionPrice', '옵션가', { money: true, align: 'r' }), ax('optionDiscount', '옵션할인', { money: true, align: 'r' }),
  ax('taxExempt', '과세/면세'), ax('purchasedDate', '매입완료일', { date: true }),
  ax('acquisitionDate', '취득일', { date: true, priority: 3 }), ax('supplier', '매입처'),
  ax('loanKind', '금융구분'), ax('loanCashOnly', '할부없음(현금)'),
  ax('loanCompany', '할부/리스사', { priority: 3 }), ax('loanMonths', '할부개월', { num: '개월', align: 'r' }),
  ax('loanPrincipal', '할부원금', { money: true, align: 'r' }), ax('loanRemainingPrincipal', '잔여원금', { money: true, align: 'r', priority: 2 }),
  ax('loanRate', '연이율', { num: '%', align: 'r' }), ax('loanStartDate', '할부개시일', { date: true }),
  ax('insuranceCompany', '보험사'), ax('insurancePolicyNo', '보험증권번호'), ax('insuranceExpiryDate', '보험만기', { date: true, priority: 2 }),
  ax('gpsProvider', 'GPS 공급사'), ax('gpsDeviceId', 'GPS 단말번호'), ax('gpsInstalledDate', 'GPS 설치일', { date: true }), ax('gpsControl', '시동제어'),
  ax('vehicleTaxDueDate', '자동차세 납기', { date: true, priority: 2 }), ax('vehicleTaxPaidDate', '자동차세 납부일', { date: true }),
  ax('vehicleTaxAmount', '자동차세', { money: true, align: 'r' }),
  ax('dealerAgency', '취급대리점'), ax('dealerContact', '딜러담당자'), ax('dealerPhone', '딜러연락처'),
  ax('optionList', '선택옵션'), ax('saleDate', '매각일', { date: true }), ax('salePrice', '매각가', { money: true, align: 'r' }),
  {
    key: 'bookValue', label: '장부가', align: 'r', priority: 3, xf: 'money',
    render: (r) => moneyOrNull(r.bookValue), text: (r) => r.bookValue ?? '',
  },
  {
    key: 'disposalGainLoss', label: '처분손익', align: 'r', priority: 3, xf: 'money',
    render: (r) => (r.disposalGainLoss == null ? LEDGER_EMPTY.dash : money(r.disposalGainLoss)),
    text: (r) => r.disposalGainLoss ?? '',
  },
  ax('listRent', '매물 월대여료', { money: true, align: 'r' }), ax('listDeposit', '매물 보증금', { money: true, align: 'r' }),
  ax('listTerm', '매물 기준기간', { num: '개월', align: 'r' }), ax('insuranceIncluded', '보험료 포함'),
  {
    key: 'vehicle360Link', label: '수선·과태료·업무',
    render: (r) => (r.plate
      ? <Btn variant="ghost" size="sm" onClick={() => openCar(r.plate)}>차량360으로</Btn>
      : LEDGER_EMPTY.dash),
    text: (r) => (r.plate ? '차량360으로' : ''),
  },
  {
    key: 'maintCost', label: '정비비누계', align: 'r', priority: 1, xf: 'money',
    render: (r) => (r.maintCost ? <b style={{ color: r.maintVsAvg >= 2 ? C.danger : r.maintVsAvg >= 1.5 ? C.warn : C.ink }}>{money(r.maintCost)}</b> : LEDGER_EMPTY.dash),
    text: (r) => r.maintCost,
  },
  {
    key: 'maintVsAvg', label: '평균대비', align: 'r', priority: 1, xf: 'rate',
    render: (r) => (r.maintVsAvg ? `${r.maintVsAvg.toFixed(1)}×` : LEDGER_EMPTY.dash),
    text: (r) => r.maintVsAvg,
  },
  {
    key: 'maintCount', label: '정비건수', align: 'r', priority: 2, xf: 'int',
    render: (r) => (r.maintCount ? `${r.maintCount}건` : LEDGER_EMPTY.dash),
    text: (r) => r.maintCount,
  },
  {
    key: 'maintLastDate', label: '최근정비', align: 'c', priority: 2, xf: 'date',
    render: (r) => (r.maintLastDate ? date(r.maintLastDate) : LEDGER_EMPTY.dash),
    text: (r) => r.maintLastDate,
  },
];

/**
 * 자산 엑셀 열 — 추가/삭제 요청: `자산 · 엑셀기본|엑셀전체 · +|-key`
 * @see lib/ledger-ext.ts
 */
export const ASSET_SHEET_KEYS: SheetViewKeys = {
  // 회사·차번·차명·자산분류·상태·제조사·모델·연식·용도·소유자·취득일·취득가·할부사·잔여할부·주행·보험만기·검사만료
  basic: [
    'company', 'plate', 'carName', 'lifecycle', 'status', 'maker', 'modelLine', 'modelYear', 'usage', 'ownerName',
    'acquisitionDate', 'acquisitionPrice', 'loanCompany', 'loanRemainingPrincipal', 'mileage',
    'insuranceExpiryDate', 'inspectionTo',
  ],
  all: [
    'company', 'plate', 'carName', 'lifecycle', 'status',
    'assetCode', 'maker', 'modelLine', 'subModel', 'trim', 'modelYear', 'yearMonth', 'vin', 'ownerName', 'firstReg', 'inspectionTo', 'mileage',
    'documentNo', 'certIssueDate', 'vehicleType', 'usage', 'typeNumber', 'engineType',
    'ownerBizNo', 'useAddress', 'approvalNumber',
    'fuel', 'displacement', 'ratedOutput', 'cylinders', 'driveType', 'transmission',
    'exteriorColor', 'interiorColor', 'variant',
    'lengthMm', 'widthMm', 'heightMm', 'grossWeightKg', 'seats', 'maxLoadKg', 'fuelEfficiency',
    'inspectionFrom', 'inspectionType',
    'acquisitionPrice', 'consumerPrice', 'optionPrice', 'optionDiscount', 'taxExempt',
    'purchasedDate', 'acquisitionDate', 'supplier',
    'loanKind', 'loanCashOnly', 'loanCompany', 'loanMonths', 'loanPrincipal', 'loanRemainingPrincipal', 'loanRate', 'loanStartDate',
    'insuranceCompany', 'insurancePolicyNo', 'insuranceExpiryDate',
    'gpsProvider', 'gpsDeviceId', 'gpsInstalledDate', 'gpsControl',
    'vehicleTaxDueDate', 'vehicleTaxPaidDate', 'vehicleTaxAmount',
    'dealerAgency', 'dealerContact', 'dealerPhone', 'optionList', 'saleDate', 'salePrice',
    'bookValue', 'disposalGainLoss',
    'listRent', 'listDeposit', 'listTerm', 'insuranceIncluded',
    'maintCost', 'maintVsAvg', 'maintCount', 'maintLastDate',
  ],
};

/** 정비비 함대 랭킹 보기 — 기존 maint 계산 재사용. */
export const ASSET_MAINT_SHEET_KEYS: SheetViewKeys = {
  basic: [
    'company', 'plate', 'carName', 'lifecycle', 'status',
    'maintCost', 'maintVsAvg', 'maintCount', 'maintLastDate', 'mileage',
  ],
  all: [
    'company', 'plate', 'carName', 'lifecycle', 'status', 'maker', 'modelLine',
    'maintCost', 'maintVsAvg', 'maintCount', 'maintLastDate', 'mileage', 'acquisitionPrice',
  ],
};

const _assetViews = buildSheetViews(ASSET_COL_CATALOG, ASSET_SHEET_KEYS);
export const ASSET_MASTER_BASIC_COLS = _assetViews.basic;
export const ASSET_MASTER_EXPANDED_COLS = _assetViews.expanded;

const _assetMaintViews = buildSheetViews(ASSET_COL_CATALOG, ASSET_MAINT_SHEET_KEYS);
export const ASSET_MAINT_BASIC_COLS = _assetMaintViews.basic;
export const ASSET_MAINT_EXPANDED_COLS = _assetMaintViews.expanded;

/**
 * 자산 상세 — 필드 추가 요청 시 해당 섹션 keys에만 push.
 * 예: `자산 · 등록증정보 · ownerPhone`
 * 컬럼 정의가 없으면 위 ASSET_MASTER_EXPANDED_COLS에 ax() 먼저.
 */
export const ASSET_DETAIL_DEFS: DetailSectionDef[] = [
  {
    title: '등록·상태',
    open: true,
    keys: ['company', 'assetCode', 'plate', 'lifecycle', 'status', 'carName', 'mileage'],
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
    ],
  },
  {
    title: '처분·매각',
    keys: ['saleDate', 'salePrice', 'bookValue', 'disposalGainLoss'],
  },
  {
    title: '매물',
    keys: ['listRent', 'listDeposit', 'listTerm', 'insuranceIncluded'],
  },
  {
    title: '금융·할부',
    keys: [
      'loanKind', 'loanCashOnly', 'loanCompany', 'loanMonths', 'loanPrincipal', 'loanRemainingPrincipal', 'loanRate', 'loanStartDate',
    ],
  },
  {
    title: '보험',
    keys: ['insuranceCompany', 'insurancePolicyNo', 'insuranceExpiryDate'],
  },
  {
    title: '세금',
    keys: ['vehicleTaxDueDate', 'vehicleTaxPaidDate', 'vehicleTaxAmount'],
  },
  {
    title: 'GPS',
    keys: ['gpsProvider', 'gpsDeviceId', 'gpsInstalledDate', 'gpsControl'],
  },
  {
    title: '수선·이력',
    keys: ['maintCost', 'maintVsAvg', 'maintCount', 'maintLastDate', 'vehicle360Link'],
  },
];

export const ASSET_DETAIL_SECTIONS = buildDetailSections(ASSET_COL_CATALOG, ASSET_DETAIL_DEFS);

const C0 = {
  company: { key: 'company', label: '회사명', pin: true, priority: 2, render: (r) => r.company, text: (r) => r.company },
  contractNo: { key: 'contractNo', label: '계약번호', pin: true, priority: 1, render: (r) => dash(r.contractNo), text: (r) => r.contractNo },
  status: { key: 'status', label: '계약상태', align: 'c', priority: 1, render: (r) => <Badge tone={r.ended ? 'gray' : 'green'}>{r.status}</Badge>, text: (r) => r.status },
  rentalType: {
    key: 'rentalType', label: LEDGER_LABEL.rentalType, align: 'c', priority: 2,
    render: (r) => (r.rentalType ? String(r.rentalType) : <Badge tone="amber">미분류</Badge>),
    text: (r) => r.rentalType || '미분류',
  },
  contractorName: { key: 'contractorName', label: '계약자', priority: 1, render: (r) => (r.contractorName ? String(r.contractorName) : LEDGER_EMPTY.none), text: (r) => r.contractorName },
  contractorPhone: { key: 'contractorPhone', label: '연락처', priority: 2, render: (r) => dash(r.contractorPhone), text: (r) => r.contractorPhone },
  plate: { key: 'plate', label: LEDGER_LABEL.plate, priority: 1, render: (r) => (r.plate ? String(r.plate) : LEDGER_EMPTY.unassigned), text: (r) => r.plate },
  carName: { key: 'carName', label: LEDGER_LABEL.carName, priority: 2, render: (r) => dash(r.carName), text: (r) => r.carName },
  contractDate: { key: 'contractDate', label: '계약일', priority: 4, xf: 'date', render: (r) => date(r.contractDate), text: (r) => r.contractDate },
  startDate: { key: 'startDate', label: '시작일', priority: 2, xf: 'date', render: (r) => date(r.startDate), text: (r) => r.startDate },
  endDate: { key: 'endDate', label: '종료일', priority: 2, xf: 'date', render: (r) => date(r.endDate), text: (r) => r.endDate },
  monthlyRent: { key: 'monthlyRent', label: '월대여료', align: 'r', priority: 1, xf: 'money', render: (r) => moneyCell(r.monthlyRent), text: (r) => r.monthlyRent },
  deposit: { key: 'deposit', label: '계약보증금', align: 'r', priority: 2, xf: 'money', render: (r) => moneyCell(r.deposit), text: (r) => r.deposit },
  paymentDay: {
    key: 'paymentDay', label: '결제일', align: 'c', priority: 2,
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
  net: { key: 'net', label: '미수금액', align: 'r', priority: 1, xf: 'money', render: (r) => r.net ? <span style={{ color: C.danger, fontWeight: 700 }}>{money(r.net)}</span> : LEDGER_EMPTY.dash, text: (r) => r.net },
  alert: { key: 'alert', label: '데이터알람', priority: 2, render: (r) => r.dataAlert ? <Badge tone="amber">{r.dataAlert}</Badge> : <Badge tone="green">원본 대사완료</Badge>, text: (r) => r.dataAlert || '원본 대사완료' },
} satisfies Record<string, SheetCol<ContractMasterRow>>;

const cx = (key: keyof ContractMasterRow, label: string, opts?: { date?: boolean; money?: boolean; num?: string; align?: 'l' | 'c' | 'r'; priority?: 1 | 2 | 3 | 4 }): SheetCol<ContractMasterRow> => ({
  key: String(key), label, align: opts?.align, priority: opts?.priority,
  xf: opts?.money ? 'money' : opts?.num === '%' ? 'rate' : opts?.num != null ? 'int' : opts?.date ? 'date' : undefined,
  render: (r) => opts?.date ? date(String(r[key] || '')) : opts?.money ? moneyCell(Number(r[key]) || 0) : opts?.num != null ? number(Number(r[key]) || 0, opts.num) : dash(r[key]),
  text: (r) => r[key] as string | number,
});

/** 계약 열 카탈로그 — 새 항목은 여기 정의 후 SHEET_KEYS / DETAIL_DEFS에 key만. */
const CONTRACT_COL_CATALOG: SheetCol<ContractMasterRow>[] = [
  C0.company, C0.contractNo, C0.status, C0.rentalType, C0.contractorName, C0.contractorPhone,
  C0.plate, C0.carName, C0.contractDate, C0.startDate, C0.endDate,
  C0.monthlyRent, C0.deposit, C0.paymentDay, C0.paymentTiming, C0.paymentMethod, C0.risk, C0.net, C0.alert,
  cx('contractorBirth', '생년월일', { date: true }), cx('contractorLicenseNo', '면허번호'),
  cx('contractorLicenseExpiry', '면허만기', { date: true }),
  cx('licenseType', '면허종별'), cx('contractorAddress', '주소'),
  cx('rentalMonths', '대여기간', { num: '개월', align: 'r', priority: 3 }), cx('annualMileageLimit', '연주행한도', { num: 'km', align: 'r' }),
  cx('deliveredDate', '인도일', { date: true }), cx('returnScheduledDate', '반납예정일', { date: true }),
  cx('returnedDate', '반납/해지일', { date: true }), cx('pickupPlace', '인수장소'), cx('returnPlace', '반환장소'),
  cx('reservationFee', '예약금', { money: true, align: 'r' }),
  {
    key: 'depositReceived', label: '보증금 실수령', align: 'r', priority: 2, xf: 'money',
    render: (r) => moneyOrNull(r.depositReceived),
    text: (r) => r.depositReceived ?? '',
  },
  cx('depositReceivedDate', '보증금 수령일', { date: true }),
  {
    key: 'mileageOut', label: '출고주행', align: 'r', xf: 'int',
    render: (r) => numberOrNull(r.mileageOut, 'km'),
    text: (r) => r.mileageOut ?? '',
  },
  {
    key: 'returnMileage', label: '반납주행', align: 'r', xf: 'int',
    render: (r) => numberOrNull(r.returnMileage, 'km'),
    text: (r) => r.returnMileage ?? '',
  },
  {
    key: 'overMileageRate', label: '초과주행 단가', align: 'r', xf: 'money',
    render: (r) => (r.overMileageRate == null ? LEDGER_EMPTY.dash : `${money(r.overMileageRate)}/km`),
    text: (r) => r.overMileageRate ?? '',
  },
  {
    key: 'drivenKm', label: '실주행', align: 'r', xf: 'int',
    render: (r) => numberOrNull(r.drivenKm, 'km'),
    text: (r) => r.drivenKm ?? '',
  },
  {
    key: 'allowedKm', label: '허용주행', align: 'r', xf: 'int',
    render: (r) => numberOrNull(r.allowedKm, 'km'),
    text: (r) => r.allowedKm ?? '',
  },
  {
    key: 'excessKm', label: '초과km', align: 'r', xf: 'int',
    render: (r) => numberOrNull(r.excessKm, 'km'),
    text: (r) => r.excessKm ?? '',
  },
  {
    key: 'overMileageFee', label: '초과주행료', align: 'r', xf: 'money',
    render: (r) => moneyOrNull(r.overMileageFee),
    text: (r) => r.overMileageFee ?? '',
  },
  {
    key: 'overMileageBasis', label: '주행산출',
    render: (r) => dash(r.overMileageBasis),
    text: (r) => r.overMileageBasis,
  },
  cx('driverAgeMin', '최소운전연령', { num: '세', align: 'r' }), cx('driverAge', '운전자연령', { num: '세', align: 'r' }),
  cx('insuranceAge', '보험허용연령', { num: '세', align: 'r' }),
  cx('lateFeeRate', '지연손해금율', { num: '%', align: 'r' }), cx('earlyTerminationRate', '중도해지율', { num: '%', align: 'r' }),
  cx('cdw', '자차보험(CDW)'), cx('deductible', '면책금', { money: true, align: 'r' }), cx('superCover', '완전면책'),
  cx('additionalDrivers', '추가운전자'), cx('withDriver', '기사포함'), cx('fuelOut', '인수연료'), cx('fuelIn', '반납연료'),
  cx('depositSettledDate', '보증금정산일', { date: true }), cx('endReason', '종료사유'),
  cx('overdueDays', '연체일', { num: '일', align: 'r', priority: 1 }), cx('unpaidCount', '미납회차', { num: '회', align: 'r', priority: 2 }),
  cx('sourceCarryUnpaid', '사업현황 미수', { money: true, align: 'r' }), cx('reconciliationDelta', '원본차이', { money: true, align: 'r' }),
];

/** 계약 엑셀 열 — `계약 · 엑셀기본|엑셀전체 · +|-key` @see lib/ledger-ext.ts */
export const CONTRACT_SHEET_KEYS: SheetViewKeys = {
  // 회사·계약번호·계약자·연락처·차·차명·대여형태·상태·시작·종료·기간·월대여·보증·결제·납부시기·미납회차·연체·미수·리스크
  basic: [
    'company', 'contractNo', 'contractorName', 'rentalType', 'status',
    'plate', 'carName', 'contractorPhone',
    'startDate', 'endDate', 'rentalMonths', 'monthlyRent', 'deposit', 'paymentDay', 'paymentTiming',
    'unpaidCount', 'overdueDays', 'net', 'riskLabel',
  ],
  all: [
    'company', 'contractNo', 'contractorName', 'rentalType', 'status',
    'plate', 'carName', 'contractorPhone', 'contractDate', 'startDate', 'endDate',
    'monthlyRent', 'deposit', 'depositReceived', 'depositReceivedDate', 'paymentDay', 'paymentTiming', 'paymentMethod', 'riskLabel', 'net', 'alert',
    'contractorBirth', 'contractorLicenseNo', 'contractorLicenseExpiry', 'licenseType', 'contractorAddress',
    'rentalMonths', 'annualMileageLimit', 'mileageOut', 'returnMileage', 'overMileageRate',
    'drivenKm', 'allowedKm', 'excessKm', 'overMileageFee', 'overMileageBasis',
    'deliveredDate', 'returnScheduledDate', 'returnedDate',
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
      'contractorName', 'contractorPhone', 'contractorBirth', 'contractorLicenseNo', 'contractorLicenseExpiry', 'licenseType', 'contractorAddress',
    ],
  },
  {
    title: '기간·인도',
    keys: [
      'rentalMonths', 'deliveredDate', 'returnScheduledDate', 'returnedDate',
      'pickupPlace', 'returnPlace', 'fuelOut', 'fuelIn',
    ],
  },
  {
    title: '주행',
    keys: [
      'annualMileageLimit', 'mileageOut', 'returnMileage',
      'drivenKm', 'allowedKm', 'excessKm', 'overMileageRate', 'overMileageFee', 'overMileageBasis',
    ],
  },
  {
    title: '요금·납부',
    keys: [
      'monthlyRent', 'deposit', 'depositReceived', 'depositReceivedDate', 'reservationFee', 'paymentDay', 'paymentTiming', 'paymentMethod', 'net',
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

export const CONTRACT_DETAIL_SECTIONS = buildDetailSections(CONTRACT_COL_CATALOG, CONTRACT_DETAIL_DEFS);

/* ── 회차 원장 열 (계약관리 「회차」보기) ── */
function scheduleKindTone(k: ScheduleKind): 'gray' | 'blue' | 'amber' | 'purple' {
  if (k === '선납개시') return 'blue';
  if (k === '일할정산') return 'amber';
  if (k === '이월승계') return 'purple';
  return 'gray';
}
function scheduleStatusTone(s: ScheduleStatus): 'green' | 'red' | 'amber' | 'blue' | 'gray' {
  if (s === '완료') return 'green';
  if (s === '연체') return 'red';
  if (s === '부분납') return 'amber';
  if (s === '예정') return 'blue';
  return 'gray';
}

const SCHEDULE_COL_CATALOG: SheetCol<ScheduleLedgerRow>[] = [
  { key: 'company', label: '회사명', pin: true, priority: 2, render: (r) => r.company, text: (r) => r.company },
  { key: 'contractNo', label: '계약번호', priority: 1, render: (r) => dash(r.contractNo), text: (r) => r.contractNo },
  { key: 'contractorName', label: '계약자', priority: 1, render: (r) => r.contractorName || LEDGER_EMPTY.none, text: (r) => r.contractorName },
  { key: 'plate', label: LEDGER_LABEL.plate, priority: 1, render: (r) => r.plate || LEDGER_EMPTY.unassigned, text: (r) => r.plate },
  {
    key: 'seq', label: '회차', align: 'c', priority: 1,
    render: (r) => `${r.seq}/${r.seqTotal}`,
    text: (r) => `${r.seq}/${r.seqTotal}`,
  },
  {
    key: 'kind', label: '회차분류', align: 'c', priority: 1,
    render: (r) => <Badge tone={scheduleKindTone(r.kind)}>{r.kind}</Badge>,
    text: (r) => r.kind,
  },
  {
    key: 'status', label: '회차상태', align: 'c', priority: 1,
    render: (r) => <Badge tone={scheduleStatusTone(r.status)}>{r.status}</Badge>,
    text: (r) => r.status,
  },
  { key: 'dueDate', label: '납부기일', priority: 1, xf: 'date', render: (r) => date(r.dueDate), text: (r) => r.dueDate },
  { key: 'charge', label: '청구액', align: 'r', priority: 1, xf: 'money', sortNum: true, render: (r) => moneyCell(r.charge), text: (r) => r.charge },
  { key: 'discount', label: '할인', align: 'r', priority: 2, xf: 'money', sortNum: true, render: (r) => moneyCell(r.discount), text: (r) => r.discount },
  { key: 'paid', label: '납부액', align: 'r', priority: 1, xf: 'money', sortNum: true, render: (r) => moneyCell(r.paid), text: (r) => r.paid },
  { key: 'balance', label: '잔액', align: 'r', priority: 1, xf: 'money', sortNum: true, render: (r) => moneyCell(r.balance), text: (r) => r.balance },
  {
    key: 'overdueDays', label: '연체일', align: 'r', priority: 2, xf: 'int', sortNum: true,
    render: (r) => (r.overdueDays ? `${r.overdueDays}일` : LEDGER_EMPTY.dash),
    text: (r) => r.overdueDays,
  },
  { key: 'paidAt', label: '납부완료일', priority: 3, xf: 'date', render: (r) => date(r.paidAt), text: (r) => r.paidAt },
  { key: 'method', label: '수단', priority: 3, render: (r) => dash(r.method), text: (r) => r.method },
];

export const SCHEDULE_SHEET_KEYS: SheetViewKeys = {
  // 열 순서 기준 = 자산관리: 회사(1) · 식별자(2) · 이름(3) · 분류(4) · 상태(5) · 나머지
  basic: ['company', 'contractNo', 'contractorName', 'kind', 'status', 'plate', 'seq', 'dueDate', 'charge', 'paid', 'balance', 'overdueDays'],
  all: ['company', 'contractNo', 'contractorName', 'kind', 'status', 'plate', 'seq', 'dueDate', 'charge', 'discount', 'paid', 'balance', 'overdueDays', 'paidAt', 'method'],
};

const _scheduleViews = buildSheetViews(SCHEDULE_COL_CATALOG, SCHEDULE_SHEET_KEYS);
export const SCHEDULE_LEDGER_COLS = _scheduleViews.basic;
export const SCHEDULE_LEDGER_ALL_COLS = _scheduleViews.expanded;
