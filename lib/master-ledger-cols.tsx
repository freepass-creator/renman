import { Badge, C, won, type SheetCol } from '@/components/ui';
import type { AssetMasterRow, ContractMasterRow } from './master-ledgers';

const dash = (v: unknown) => (v === '' || v === null || v === undefined || v === 0 ? '—' : String(v));
const date = (v: string) => v ? v.slice(0, 10) : '—';
const money = (v: number) => v ? won(v) : '—';
const number = (v: number, suffix = '') => v ? `${v.toLocaleString('ko-KR')}${suffix}` : '—';

const A = {
  company: { key: 'company', label: '회사명', pin: true, priority: 2, render: (r) => r.company, text: (r) => r.company },
  assetCode: { key: 'assetCode', label: '자산코드', priority: 4, render: (r) => dash(r.assetCode), text: (r) => r.assetCode },
  plate: { key: 'plate', label: '차량번호', pin: true, priority: 1, render: (r) => r.plate, text: (r) => r.plate },
  status: { key: 'status', label: '자산상태', align: 'c', priority: 1, render: (r) => <Badge tone={r.disposed ? 'gray' : r.status === '운행' ? 'green' : r.status === '정비' || r.status === '사고' ? 'amber' : 'blue'}>{r.status}</Badge>, text: (r) => r.status },
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

export const ASSET_MASTER_BASIC_COLS: SheetCol<AssetMasterRow>[] = [
  A.company, A.plate, A.status, A.carName, A.maker, A.modelLine, A.inspectionTo,
];

const ax = (key: keyof AssetMasterRow, label: string, opts?: { date?: boolean; money?: boolean; num?: string; align?: 'l' | 'c' | 'r' }): SheetCol<AssetMasterRow> => ({
  key: String(key), label, align: opts?.align,
  render: (r) => opts?.date ? date(String(r[key] || '')) : opts?.money ? money(Number(r[key]) || 0) : opts?.num != null ? number(Number(r[key]) || 0, opts.num) : dash(r[key]),
  text: (r) => r[key] as string | number,
});

export const ASSET_MASTER_EXPANDED_COLS: SheetCol<AssetMasterRow>[] = [
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

const C0 = {
  company: { key: 'company', label: '회사명', pin: true, priority: 2, render: (r) => r.company, text: (r) => r.company },
  contractNo: { key: 'contractNo', label: '계약번호', pin: true, priority: 1, render: (r) => dash(r.contractNo), text: (r) => r.contractNo },
  status: { key: 'status', label: '계약상태', align: 'c', priority: 1, render: (r) => <Badge tone={r.ended ? 'gray' : 'green'}>{r.status}</Badge>, text: (r) => r.status },
  contractorName: { key: 'contractorName', label: '계약자', priority: 1, render: (r) => dash(r.contractorName), text: (r) => r.contractorName },
  contractorPhone: { key: 'contractorPhone', label: '연락처', priority: 3, render: (r) => dash(r.contractorPhone), text: (r) => r.contractorPhone },
  plate: { key: 'plate', label: '계약차량', priority: 1, render: (r) => dash(r.plate), text: (r) => r.plate },
  carName: { key: 'carName', label: '계약차종', priority: 3, render: (r) => dash(r.carName), text: (r) => r.carName },
  contractDate: { key: 'contractDate', label: '계약일', priority: 4, render: (r) => date(r.contractDate), text: (r) => r.contractDate },
  startDate: { key: 'startDate', label: '시작일', priority: 2, render: (r) => date(r.startDate), text: (r) => r.startDate },
  endDate: { key: 'endDate', label: '종료일', priority: 2, render: (r) => date(r.endDate), text: (r) => r.endDate },
  monthlyRent: { key: 'monthlyRent', label: '월대여료', align: 'r', priority: 1, render: (r) => money(r.monthlyRent), text: (r) => r.monthlyRent },
  deposit: { key: 'deposit', label: '보증금', align: 'r', priority: 3, render: (r) => money(r.deposit), text: (r) => r.deposit },
  payment: { key: 'payment', label: '납부조건', priority: 4, render: (r) => `${r.paymentDay || 25}일 · ${r.paymentTiming}${r.paymentMethod ? ` · ${r.paymentMethod}` : ''}`, text: (r) => `${r.paymentDay} ${r.paymentTiming} ${r.paymentMethod}` },
  net: { key: 'net', label: '미수', align: 'r', priority: 1, render: (r) => r.net ? <span style={{ color: C.danger, fontWeight: 700 }}>{won(r.net)}</span> : '—', text: (r) => r.net },
  alert: { key: 'alert', label: '데이터알람', priority: 2, render: (r) => r.dataAlert ? <Badge tone="amber">{r.dataAlert}</Badge> : <Badge tone="green">원본 대사완료</Badge>, text: (r) => r.dataAlert || '원본 대사완료' },
} satisfies Record<string, SheetCol<ContractMasterRow>>;

export const CONTRACT_MASTER_BASIC_COLS: SheetCol<ContractMasterRow>[] = [
  C0.company, C0.contractNo, C0.status, C0.contractorName, C0.plate,
  C0.endDate, C0.monthlyRent, C0.net, C0.alert,
];

const cx = (key: keyof ContractMasterRow, label: string, opts?: { date?: boolean; money?: boolean; num?: string; align?: 'l' | 'c' | 'r' }): SheetCol<ContractMasterRow> => ({
  key: String(key), label, align: opts?.align,
  render: (r) => opts?.date ? date(String(r[key] || '')) : opts?.money ? money(Number(r[key]) || 0) : opts?.num != null ? number(Number(r[key]) || 0, opts.num) : dash(r[key]),
  text: (r) => r[key] as string | number,
});

export const CONTRACT_MASTER_EXPANDED_COLS: SheetCol<ContractMasterRow>[] = [
  C0.company, C0.contractNo, C0.status, C0.contractorName, C0.contractorPhone,
  C0.plate, C0.carName, C0.contractDate, C0.startDate, C0.endDate,
  C0.monthlyRent, C0.deposit, C0.payment, C0.net, C0.alert,
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
