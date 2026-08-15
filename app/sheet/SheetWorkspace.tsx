'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Search } from 'lucide-react';
import { SheetButton } from '@/components/ui/sheet-controls';
import { companyDisplay } from '@/lib/companies';
import { computeContractView, contractSchedules } from '@/lib/contract-ops';
import { contractTimeline, isVehicleHeld, linkFleet } from '@/lib/domain/model';
import { buildCashLedger } from '@/lib/finance/cash-ledger';
import type { EntityRecord } from '@/lib/intake/entities';
import { computeKPI } from '@/lib/kpi';
import { normPlate } from '@/lib/plate';
import { useSession } from '@/lib/session';
import { buildFleetRows, statusRank } from '@/lib/sheet-rows';
import { getStore } from '@/lib/store';
import { useEntityLists } from '@/lib/use-entity-lists';
import styles from './sheet.module.css';

type CellValue = string | number;
type WorkbookSheetKey = 'asset' | 'contract' | 'collection' | 'cash';
type TabKey = 'summary' | 'operation' | WorkbookSheetKey;
type CellKind = 'text' | 'number' | 'money' | 'status';
type CellAlign = 'left' | 'center' | 'right';
type GridGroup = { label: string; span: number };
type GridColumn = { key: string; label: string; width: number; kind?: CellKind; align?: CellAlign };
type CellBinding = { entity: 'vehicle' | 'contract' | 'bank_tx' | 'card_tx'; companyId: string; recordKey: string; field: string };
type StandaloneRow = { id: string; cells: Record<string, CellValue>; bindings?: Record<string, CellBinding> };
type SelectedRow = { tab: Exclude<TabKey, 'summary'>; rowId: string };
type TimelineItem = { date: string; title: string; detail: string; amount?: number };

const TODAY = new Date().toISOString().slice(0, 10);
const TABS: Array<{ key: TabKey; label: string; kind: string }> = [
  { key: 'summary', label: '요약', kind: '산출' },
  { key: 'operation', label: '운영현황', kind: '산출' },
  { key: 'asset', label: '자산', kind: '입력' },
  { key: 'contract', label: '계약', kind: '입력' },
  { key: 'collection', label: '수납(미수)', kind: '입력' },
  { key: 'cash', label: '자금일보', kind: '입력' },
];

const column = (key: string, label: string, width: number, kind: CellKind = 'text', align?: CellAlign): GridColumn => ({ key, label, width, kind, align });
const monthKeys = (() => {
  const [year, month] = TODAY.slice(0, 7).split('-').map(Number);
  return Array.from({ length: 45 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
})();

const OPERATION_COLUMNS: GridColumn[] = [
  column('no', '번호', 56, 'number', 'right'), column('plate', '차량번호', 116), column('car', '차종', 180),
  column('state', '상태', 92, 'status'), column('action', '조치', 104, 'status'), column('unpaid', '미납잔액', 118, 'money', 'right'),
  column('months', '잔여(개월)', 92, 'number', 'right'), column('end', '종료일', 104), column('customer', '고객명', 124),
  column('paymentDay', '결제일', 78, 'text', 'center'), column('rent', '대여료', 116, 'money', 'right'), column('deposit', '보증금', 116, 'money', 'right'),
  column('start', '인도일', 104), column('company', '소속', 104), column('sales', '영업자', 104),
];

const ASSET_COLUMNS: GridColumn[] = [
  column('plate', '차량번호', 116), column('company', '소속', 92), column('ownership', '보유상태', 98, 'status'),
  column('maker', '제조사', 90), column('model', '모델', 120), column('subModel', '세부모델', 150), column('powertrain', '파워트레인', 118),
  column('trim', '세부트림', 130), column('options', '선택옵션', 190), column('exterior', '외장색상', 100), column('interior', '내장색상', 100),
  column('fuel', '연료', 82), column('displacement', '배기량', 86, 'number', 'right'), column('modelYear', '연식', 78, 'number', 'center'), column('masterMatch', '마스터매칭', 112),
  column('vin', '차대번호', 178), column('regLocation', '등록지', 170), column('firstReg', '최초등록일', 104), column('ageExpiry', '차령만료일', 104),
  column('ageRemain', '잔여차령(일)', 102, 'number', 'right'), column('mileage', '주행거리', 98, 'number', 'right'),
  column('acqDate', '취득일', 104), column('consumerPrice', '소비자가격', 122, 'money', 'right'), column('vehiclePrice', '차량가격', 122, 'money', 'right'),
  column('purchasePrice', '실제구입가격', 126, 'money', 'right'), column('deliveryFee', '신차탁송', 108, 'money', 'right'), column('supplier', '구입처', 132),
  column('merchandising', '상품화비용', 116, 'money', 'right'), column('acquisitionPrice', '취득가격', 122, 'money', 'right'),
  column('registrationTax', '취등록세', 108, 'money', 'right'), column('plateFee', '번호판', 96, 'money', 'right'), column('dealerFee', '매도비', 96, 'money', 'right'),
  column('bond', '공채', 96, 'money', 'right'), column('performanceInsurance', '성능보험료', 110, 'money', 'right'), column('transferAgency', '이전대행료', 110, 'money', 'right'),
  column('stamp', '인지대', 90, 'money', 'right'), column('filing', '접수증지대', 104, 'money', 'right'), column('fleetIncrease', '증차(시청)', 108, 'money', 'right'),
  column('specialTax', '개별소비세', 108, 'money', 'right'), column('regReissue', '등록증재발급', 116, 'money', 'right'), column('otherFees', '기타수수료', 108, 'money', 'right'),
  column('loanType', '할부유형', 96), column('loanCompany', '할부사', 120), column('loanPrincipal', '할부원금', 122, 'money', 'right'),
  column('loanRate', '금리', 76, 'number', 'right'), column('loanMonths', '할부기간(개월)', 112, 'number', 'right'), column('loanPayDay', '결제일', 82, 'text', 'center'),
  column('loanStart', '실행일', 104), column('loanMaturity', '만기일', 104), column('downPayment', '선수금', 114, 'money', 'right'),
  column('monthlyPayment', '월납입액', 114, 'money', 'right'), column('totalRepayment', '총상환금액', 120, 'money', 'right'), column('remainingPrincipal', '잔여원금', 120, 'money', 'right'),
  column('paidInstallments', '납입회차', 92, 'number', 'right'), column('repaymentSchedule', '상환스케줄', 128), column('prepaymentFee', '중도상환수수료', 128, 'money', 'right'),
  column('mortgage', '저당설정', 96), column('gps', 'GPS', 106), column('device', '단말기', 126),
  column('currentCustomer', '현재 고객명', 124), column('derivedStatus', '판정 상태', 104, 'status'), column('currentUnpaid', '미납잔액', 122, 'money', 'right'),
  column('currentRent', '대여료', 116, 'money', 'right'), column('currentEnd', '종료일', 104), column('sortKey', '정렬키', 118),
];

const CONTRACT_BLOCKS = ['현재 계약', '직전 계약', '3차 전 계약', '4차 전 계약', '5차 전 계약', '6차 전 계약', '7차 전 계약'];
const CONTRACT_COLUMNS: GridColumn[] = [
  column('number', '번호', 58, 'number', 'right'), column('insurer', '보험사', 104), column('company', '소속', 92), column('plate', '차량번호', 116),
  column('firstReg', '최초등록', 104), column('subModel', '세부모델', 160), column('age', '연령', 76, 'text', 'center'),
  ...CONTRACT_BLOCKS.flatMap((_, index) => [
    column(`b${index}Type`, '구분', 94), column(`b${index}Customer`, '고객명', 124), column(`b${index}Delivery`, '인도일자', 104),
    column(`b${index}End`, '종료일자', 104), column(`b${index}Returned`, '반납일자', 104), column(`b${index}Rent`, '대여료', 116, 'money', 'right'),
    column(`b${index}Deposit`, '보증금', 116, 'money', 'right'), column(`b${index}Sales`, '영업자', 104),
  ]),
];

const COLLECTION_BASE_COLUMNS: GridColumn[] = [
  column('no', 'NO', 56, 'number', 'right'), column('company', '소속', 92), column('code', '코드명', 116), column('deposit', '보증금', 116, 'money', 'right'),
  column('rent', '대여료', 116, 'money', 'right'), column('installment', '분납여부', 90, 'text', 'center'), column('depositDate', '보증금이체일', 116),
  column('paymentDay', '결제일', 78, 'text', 'center'), column('firstReg', '최초등록일', 104), column('plate', '차량번호', 116), column('start', '시작', 104), column('end', '종료', 104),
];
const COLLECTION_MONTH_COLUMNS: GridColumn[] = monthKeys.flatMap((monthKey) => [
  column(`${monthKey}-charge`, '청구금액', 110, 'money', 'right'), column(`${monthKey}-paid`, '결제금액', 110, 'money', 'right'),
  column(`${monthKey}-date`, '결제일자', 104), column(`${monthKey}-method`, '결제수단', 100), column(`${monthKey}-balance`, '미납금액', 110, 'money', 'right'),
]);
const COLLECTION_COLUMNS = [...COLLECTION_BASE_COLUMNS, ...COLLECTION_MONTH_COLUMNS];

const CASH_COLUMNS: GridColumn[] = [
  column('no', '번호', 56, 'number', 'right'), column('date', '일자', 104), column('account', '계좌', 148), column('party', '거래처·입금자', 160),
  column('memo', '내용', 220), column('source', '출처', 92), column('inflow', '입금', 122, 'money', 'right'), column('outflow', '출금', 122, 'money', 'right'),
  column('category', '계정과목', 130), column('link', '처리상태', 108, 'status'),
];

const DETAIL_GROUPS: Record<Exclude<TabKey, 'summary'>, GridGroup[]> = {
  operation: [{ label: '차량', span: 3 }, { label: '지금 챙길 것', span: 5 }, { label: '계약 세부', span: 7 }],
  asset: [
    { label: '식별', span: 3 }, { label: '제조사 스펙', span: 12 }, { label: '등록증 정보', span: 6 }, { label: '취득', span: 8 },
    { label: '등록비용', span: 12 }, { label: '할부·금융', span: 16 }, { label: '장치', span: 2 }, { label: '자동 판정', span: 6 },
  ],
  contract: [{ label: '차량 기본', span: 7 }, ...CONTRACT_BLOCKS.map((label) => ({ label, span: 8 }))],
  collection: [
    { label: '계약 기본', span: 12 },
    ...monthKeys.map((monthKey) => { const [year, month] = monthKey.split('-'); return { label: `${year.slice(2)}년 ${Number(month)}월`, span: 5 }; }),
  ],
  cash: [{ label: '거래일', span: 2 }, { label: '거래 기본', span: 4 }, { label: '금액', span: 2 }, { label: '분류·연결', span: 2 }],
};

const DETAIL_COLUMNS: Record<Exclude<TabKey, 'summary'>, GridColumn[]> = {
  operation: OPERATION_COLUMNS, asset: ASSET_COLUMNS, contract: CONTRACT_COLUMNS, collection: COLLECTION_COLUMNS, cash: CASH_COLUMNS,
};
const COLUMNS: Record<Exclude<TabKey, 'summary'>, GridColumn[]> = {
  operation: [
    column('no', '번호', 56, 'number', 'right'), column('plate', '차량번호', 116), column('car', '차종', 180), column('state', '상태', 92, 'status'),
    column('action', '조치', 104, 'status'), column('unpaid', '미납잔액', 118, 'money', 'right'), column('months', '잔여(개월)', 92, 'number', 'right'),
    column('end', '종료일', 104), column('customer', '고객명', 124), column('paymentDay', '결제일', 78, 'text', 'center'),
    column('rent', '대여료', 116, 'money', 'right'), column('company', '소속', 104), column('historyAction', '이력', 72, 'status', 'center'),
  ],
  asset: [
    column('plate', '차량번호', 116), column('company', '소속', 92), column('ownership', '보유상태', 98, 'status'), column('maker', '제조사', 90),
    column('subModel', '차종', 180), column('modelYear', '연식', 78, 'number', 'center'), column('firstReg', '최초등록일', 104),
    column('mileage', '주행거리', 98, 'number', 'right'), column('loanType', '취득방식', 96), column('currentCustomer', '현재 고객', 124),
    column('derivedStatus', '현재 상태', 104, 'status'), column('currentUnpaid', '현재 미수', 122, 'money', 'right'), column('currentEnd', '계약 종료일', 104), column('historyAction', '이력', 72, 'status', 'center'),
  ],
  contract: [
    column('number', '번호', 58, 'number', 'right'), column('plate', '차량번호', 116), column('subModel', '차종', 170), column('b0Type', '구분', 94),
    column('b0Customer', '고객명', 124), column('b0Delivery', '인도일', 104), column('b0End', '종료일', 104),
    column('b0Rent', '대여료', 116, 'money', 'right'), column('b0Deposit', '보증금', 116, 'money', 'right'), column('b0Sales', '영업자', 104),
    column('currentUnpaid', '현재 미수', 118, 'money', 'right'), column('currentStatus', '계약 상태', 112, 'status'), column('historyAction', '이력', 72, 'status', 'center'),
  ],
  collection: [
    column('no', 'NO', 56, 'number', 'right'), column('plate', '차량번호', 116), column('customer', '고객명', 124), column('status', '계약 상태', 108, 'status'),
    column('rent', '대여료', 116, 'money', 'right'), column('paymentDay', '결제일', 78, 'text', 'center'), column('start', '시작', 104), column('end', '종료', 104),
    column('totalCharge', '청구 누계', 122, 'money', 'right'), column('totalPaid', '수납 누계', 122, 'money', 'right'),
    column('totalUnpaid', '현재 미수', 122, 'money', 'right'), column('overdueDays', '연체일', 88, 'number', 'right'), column('lastPaidAt', '최근 수납일', 104), column('historyAction', '이력', 72, 'status', 'center'),
  ],
  cash: [...CASH_COLUMNS, column('historyAction', '이력', 72, 'status', 'center')],
};
const GROUPS: Record<Exclude<TabKey, 'summary'>, GridGroup[]> = {
  operation: [{ label: '차량', span: 3 }, { label: '현재 확인', span: 5 }, { label: '계약', span: 4 }, { label: '', span: 1 }],
  asset: [{ label: '차량', span: 5 }, { label: '등록·취득', span: 4 }, { label: '현재', span: 4 }, { label: '', span: 1 }],
  contract: [{ label: '차량', span: 3 }, { label: '현재 계약', span: 7 }, { label: '확인', span: 2 }, { label: '', span: 1 }],
  collection: [{ label: '계약', span: 8 }, { label: '수납 현황', span: 5 }, { label: '', span: 1 }],
  cash: [...DETAIL_GROUPS.cash, { label: '', span: 1 }],
};
const FREEZE: Record<Exclude<TabKey, 'summary'>, number> = { operation: 2, asset: 2, contract: 2, collection: 2, cash: 2 };

const numberValue = (value: unknown) => Number(String(value ?? '').replace(/[^\d.-]/g, '')) || 0;
const displayCell = (value: CellValue | undefined, kind: CellKind = 'text') => {
  if (value === undefined || value === null || value === '') return '—';
  if (kind === 'money' || kind === 'number') return typeof value === 'number' ? value.toLocaleString('ko-KR') : value;
  return value;
};
const editableValue = (value: string, kind: CellKind = 'text'): CellValue => {
  if (!value || value === '—') return '';
  return kind === 'money' || kind === 'number' ? numberValue(value) : value.trim();
};
const matches = (query: string, row: StandaloneRow) => {
  const needle = query.trim().toLowerCase();
  return !needle || Object.values(row.cells).some((value) => String(value).toLowerCase().includes(needle));
};
const firstValue = (record: EntityRecord, ...keys: string[]): CellValue => {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value as CellValue;
  }
  return '';
};
const sourceKey = (record: EntityRecord) => String(record._key || record.id || '');
const sourceCompany = (record: EntityRecord, fallback: string) => String(record.companyId || fallback);
const rowJoinKey = (companyId: unknown, plate: unknown) => `${String(companyId || '')}::${normPlate(plate)}`;
const daysUntil = (value: unknown) => {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? '' : Math.ceil((date.getTime() - new Date(TODAY).getTime()) / 86_400_000);
};
const bindFields = (
  entity: CellBinding['entity'],
  record: EntityRecord,
  fallbackCompany: string,
  fieldMap: Record<string, string>,
): Record<string, CellBinding> => {
  const recordKey = sourceKey(record);
  if (!recordKey) return {};
  const companyId = sourceCompany(record, fallbackCompany);
  return Object.fromEntries(Object.entries(fieldMap).map(([cellKey, field]) => [cellKey, { entity, companyId, recordKey, field }]));
};

const ASSET_FIELD_MAP: Record<string, string> = {
  plate: 'plate', maker: 'maker', model: 'modelLine', subModel: 'subModel', powertrain: 'variant', trim: 'trim',
  options: 'optionList', exterior: 'exteriorColor', interior: 'interiorColor', fuel: 'fuel', displacement: 'displacement', modelYear: 'modelYear',
  masterMatch: 'masterMatch', vin: 'vin', regLocation: 'useAddress', firstReg: 'firstReg', ageExpiry: 'vehicleAgeExpiry', mileage: 'mileage',
  acqDate: 'acquisitionDate', consumerPrice: 'consumerPrice', vehiclePrice: 'vehiclePrice', purchasePrice: 'actualPurchasePrice',
  deliveryFee: 'deliveryFee', supplier: 'supplier', merchandising: 'merchandisingCost', acquisitionPrice: 'acquisitionPrice',
  registrationTax: 'registrationTax', plateFee: 'plateFee', dealerFee: 'dealerFee', bond: 'bondFee', performanceInsurance: 'performanceInsuranceFee',
  transferAgency: 'transferAgencyFee', stamp: 'stampFee', filing: 'filingFee', fleetIncrease: 'fleetIncreaseFee', specialTax: 'specialConsumptionTax',
  regReissue: 'registrationReissueFee', otherFees: 'otherFees', loanType: 'loanType', loanCompany: 'loanCompany', loanPrincipal: 'loanPrincipal',
  loanRate: 'loanRate', loanMonths: 'loanMonths', loanPayDay: 'loanPaymentDay', loanStart: 'loanStartDate', loanMaturity: 'loanMaturityDate',
  downPayment: 'downPayment', monthlyPayment: 'loanMonthlyPayment', totalRepayment: 'totalRepayment', remainingPrincipal: 'loanRemainingPrincipal',
  paidInstallments: 'loanPaidRounds', repaymentSchedule: 'repaymentSchedule', prepaymentFee: 'prepaymentFee', mortgage: 'mortgageStatus',
  gps: 'gpsProvider', device: 'gpsDeviceId',
};
const CONTRACT_BLOCK_FIELD_MAP: Record<string, string> = {
  Type: 'rentalType', Customer: 'contractorName', Delivery: 'deliveredDate', End: 'endDate', Returned: 'returnedDate',
  Rent: 'monthlyRent', Deposit: 'deposit', Sales: 'salesperson',
};
const COLLECTION_FIELD_MAP: Record<string, string> = {
  code: 'contractNo', deposit: 'deposit', rent: 'monthlyRent', installment: 'splitPayment', depositDate: 'depositReceivedDate',
  paymentDay: 'paymentDay', plate: 'plate', start: 'startDate', end: 'endDate',
};

function SheetGrid({
  groups, columns, rows, freeze, editable, onCommit, onRowClick,
}: {
  groups: GridGroup[];
  columns: GridColumn[];
  rows: StandaloneRow[];
  freeze: number;
  editable: boolean;
  onCommit: (rowId: string, column: GridColumn, value: string) => void;
  onRowClick?: (row: StandaloneRow) => void;
}) {
  const offsets = columns.map((_, index) => columns.slice(0, index).reduce((sum, item) => sum + item.width, 0));
  const totalWidth = columns.reduce((sum, item) => sum + item.width, 0);
  const sticky = (index: number): CSSProperties | undefined => index < freeze ? { left: offsets[index] } : undefined;
  const frozenClass = (index: number) => index < freeze ? `${styles.frozenCell} ${index >= 3 ? styles.mobileUnfreeze : ''}` : '';
  const specialClass = (row: StandaloneRow, item: GridColumn) => {
    const value = row.cells[item.key];
    if (item.key === 'historyAction') return styles.historyActionCell;
    if ((item.key === 'unpaid' || item.key === 'currentUnpaid' || item.key === 'totalUnpaid' || item.key.endsWith('-balance')) && numberValue(value) > 0) return styles.unpaidCell;
    if (item.key === 'inflow' && numberValue(value) > 0) return styles.inflowCell;
    if (item.kind === 'status') {
      const label = String(value || '');
      if (/미수|독촉|확인필요|미분류/.test(label)) return styles.badStatusCell;
      if (/쉬는차|휴차|만기|정비|예정/.test(label)) return styles.warnStatusCell;
      if (/보유|대여중|운행|완료|정상/.test(label)) return styles.goodStatusCell;
    }
    return '';
  };

  return (
    <div className={styles.gridScroll}>
      <table className={`${styles.grid} ${onRowClick ? styles.clickableRows : ''}`} style={{ width: totalWidth, minWidth: totalWidth }}>
        <colgroup>{columns.map((item) => <col key={item.key} style={{ width: item.width }} />)}</colgroup>
        <thead>
          <tr className={styles.groupRow}>{groups.map((group, index) => <th key={`${group.label}:${index}`} colSpan={group.span}>{group.label}</th>)}</tr>
          <tr className={styles.columnRow}>
            {columns.map((item, index) => <th key={item.key} className={frozenClass(index)} style={sticky(index)} data-align={item.align || 'left'}>{item.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={columns.length} className={styles.empty}>표시할 데이터가 없습니다.</td></tr> : rows.map((row) => (
            <tr
              key={row.id}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? (event) => {
                if ((event.target as HTMLElement).isContentEditable) return;
                onRowClick(row);
              } : undefined}
              onKeyDown={onRowClick ? (event) => { if (event.key === 'Enter') onRowClick(row); } : undefined}
            >
              {columns.map((item, index) => {
                const cellEditable = editable && Boolean(row.bindings?.[item.key]);
                return (
                  <td
                    key={item.key}
                    className={`${frozenClass(index)} ${specialClass(row, item)} ${cellEditable ? styles.editableCell : ''}`}
                    style={sticky(index)}
                    data-align={item.align || 'left'}
                    contentEditable={cellEditable}
                    suppressContentEditableWarning
                    spellCheck={false}
                    onKeyDown={cellEditable ? (event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } } : undefined}
                    onBlur={cellEditable ? (event) => onCommit(row.id, item, event.currentTarget.innerText.trim()) : undefined}
                  >
                    {displayCell(row.cells[item.key], item.kind)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SheetWorkspace() {
  const { companyId } = useSession();
  const { data: [vehicles = [], contracts = [], insurance = [], history = [], bank = [], card = []], loading, error } = useEntityLists([
    'vehicle', 'contract', 'insurance', 'history', 'bank_tx', 'card_tx',
  ]);
  const [tab, setTab] = useState<TabKey>('summary');
  const [query, setQuery] = useState('');
  const [cashDate, setCashDate] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const [selected, setSelected] = useState<SelectedRow | null>(null);
  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [selected]);

  const views = useMemo(() => contracts.map((record) => computeContractView(record, TODAY)), [contracts]);
  const fleet = useMemo(() => linkFleet(vehicles, contracts, TODAY, views), [contracts, vehicles, views]);
  const fleetRows = useMemo(() => buildFleetRows(fleet.vehicles, insurance, fleet.contracts, history, TODAY)
    .sort((a, b) => statusRank(a) - statusRank(b) || a.plate.localeCompare(b.plate, 'ko')), [fleet, history, insurance]);
  const fleetRowByKey = useMemo(() => new Map(fleetRows.map((row) => [rowJoinKey(row.companyId, row.plate), row])), [fleetRows]);
  const vehicleNodeByKey = useMemo(() => new Map(fleet.vehicles.map((node) => [rowJoinKey(node.veh.companyId, node.plate), node])), [fleet.vehicles]);
  const vehicleNodeByPlate = useMemo(() => new Map(fleet.vehicles.map((node) => [node.plate, node])), [fleet.vehicles]);

  const assetRows = useMemo<StandaloneRow[]>(() => fleetRows
    .filter((row) => row.status !== '차량없음')
    .map((row) => {
      const record = vehicleNodeByKey.get(rowJoinKey(row.companyId, row.plate))?.veh || {};
      const ageExpiry = firstValue(record, 'vehicleAgeExpiry', 'ageExpiryDate', 'inspectionTo');
      return {
        id: `asset:${rowJoinKey(row.companyId, row.plate)}`,
        cells: {
          plate: row.plate, company: row.company, ownership: row.ownership === '보유중' ? '보유' : row.ownership,
          maker: firstValue(record, 'maker') || row.maker, model: firstValue(record, 'modelLine', 'model'), subModel: firstValue(record, 'subModel', 'carName') || row.subModel || row.carName,
          powertrain: firstValue(record, 'variant', 'driveType'), trim: firstValue(record, 'trim'), options: firstValue(record, 'optionList'),
          exterior: firstValue(record, 'exteriorColor'), interior: firstValue(record, 'interiorColor'), fuel: firstValue(record, 'fuel'),
          displacement: firstValue(record, 'displacement'), modelYear: firstValue(record, 'modelYear', 'yearMonth') || row.year, masterMatch: firstValue(record, 'masterMatch', 'masterMatched'),
          vin: firstValue(record, 'vin') || row.vin, regLocation: firstValue(record, 'useAddress', 'registrationLocation'), firstReg: firstValue(record, 'firstReg'),
          ageExpiry, ageRemain: daysUntil(ageExpiry), mileage: firstValue(record, 'mileage') || row.mileage,
          acqDate: firstValue(record, 'acquisitionDate', 'purchasedDate') || row.acqDate, consumerPrice: firstValue(record, 'consumerPrice'),
          vehiclePrice: firstValue(record, 'vehiclePrice', 'acquisitionPrice'), purchasePrice: firstValue(record, 'actualPurchasePrice', 'purchasePrice') || row.acqPrice,
          deliveryFee: firstValue(record, 'deliveryFee', 'newCarDeliveryFee'), supplier: firstValue(record, 'supplier', 'purchaseVendor'),
          merchandising: firstValue(record, 'merchandisingCost', 'productizationCost'), acquisitionPrice: firstValue(record, 'acquisitionPrice') || row.acqPrice,
          registrationTax: firstValue(record, 'registrationTax', 'acquisitionTax'), plateFee: firstValue(record, 'plateFee', 'licensePlateFee'),
          dealerFee: firstValue(record, 'dealerFee', 'saleAgencyFee'), bond: firstValue(record, 'bondFee', 'publicBond'), performanceInsurance: firstValue(record, 'performanceInsuranceFee'),
          transferAgency: firstValue(record, 'transferAgencyFee'), stamp: firstValue(record, 'stampFee'), filing: firstValue(record, 'filingFee', 'receiptStampFee'),
          fleetIncrease: firstValue(record, 'fleetIncreaseFee'), specialTax: firstValue(record, 'specialConsumptionTax'), regReissue: firstValue(record, 'registrationReissueFee'),
          otherFees: firstValue(record, 'otherFees', 'otherRegistrationFee'), loanType: /^(예|Y|현금)$/i.test(String(record.loanCashOnly || '')) ? '현금' : firstValue(record, 'loanType') || (row.loanCompany ? '할부' : ''),
          loanCompany: firstValue(record, 'loanCompany') || row.loanCompany, loanPrincipal: firstValue(record, 'loanPrincipal') || row.loanPrincipal,
          loanRate: firstValue(record, 'loanRate') || row.loanRate, loanMonths: firstValue(record, 'loanMonths') || row.loanMonths,
          loanPayDay: firstValue(record, 'loanPaymentDay'), loanStart: firstValue(record, 'loanStartDate') || row.loanStart, loanMaturity: firstValue(record, 'loanMaturityDate'),
          downPayment: firstValue(record, 'downPayment'), monthlyPayment: firstValue(record, 'monthlyLoanPayment', 'loanMonthlyPayment'), totalRepayment: firstValue(record, 'totalRepayment'),
          remainingPrincipal: firstValue(record, 'loanRemainingPrincipal'), paidInstallments: firstValue(record, 'paidInstallments', 'loanPaidRounds'),
          repaymentSchedule: firstValue(record, 'repaymentSchedule'), prepaymentFee: firstValue(record, 'prepaymentFee'), mortgage: firstValue(record, 'mortgage', 'mortgageStatus'),
          gps: firstValue(record, 'gpsProvider') || row.gps, device: firstValue(record, 'gpsDeviceId'), currentCustomer: row.customer,
          derivedStatus: row.status, currentUnpaid: row.maintainedNet, currentRent: row.rent, currentEnd: row.end, sortKey: `${statusRank(row)}-${row.plate}`, historyAction: '보기',
        },
        bindings: bindFields('vehicle', record, companyId, ASSET_FIELD_MAP),
      };
    }), [companyId, fleetRows, vehicleNodeByKey]);

  const contractRows = useMemo<StandaloneRow[]>(() => fleet.vehicles
    .map((node, index) => {
      const newest = [...contractTimeline(node.contracts)].reverse();
      const ordered = node.activeContract ? [node.activeContract, ...newest.filter((item) => item !== node.activeContract)] : newest;
      const fleetRow = fleetRowByKey.get(rowJoinKey(node.veh.companyId, node.plate));
      const cells: Record<string, CellValue> = {
        number: index + 1, insurer: fleetRow?.insurer || '', company: fleetRow?.company || companyDisplay(String(node.veh.companyId || '')),
        plate: node.plate, firstReg: firstValue(node.veh, 'firstReg'), subModel: firstValue(node.veh, 'subModel', 'carName'), age: ordered[0]?.view.rec.insuranceAge as CellValue || '',
      };
      const bindings: Record<string, CellBinding> = {};
      ordered.slice(0, CONTRACT_BLOCKS.length).forEach((contract, blockIndex) => {
        const record = contract.view.rec;
        cells[`b${blockIndex}Type`] = firstValue(record, 'rentalType');
        cells[`b${blockIndex}Customer`] = firstValue(record, 'contractorName');
        cells[`b${blockIndex}Delivery`] = firstValue(record, 'deliveredDate', 'startDate', 'contractDate');
        cells[`b${blockIndex}End`] = contract.view.endDate;
        cells[`b${blockIndex}Returned`] = firstValue(record, 'returnedDate');
        cells[`b${blockIndex}Rent`] = contract.view.monthlyRent;
        cells[`b${blockIndex}Deposit`] = firstValue(record, 'deposit');
        cells[`b${blockIndex}Sales`] = firstValue(record, 'salesperson', 'salesPerson', 'agentName', 'managerName');
        for (const [suffix, field] of Object.entries(CONTRACT_BLOCK_FIELD_MAP)) {
          const cellKey = `b${blockIndex}${suffix}`;
          Object.assign(bindings, bindFields('contract', record, companyId, { [cellKey]: field }));
        }
      });
      cells.currentUnpaid = ordered[0]?.net || 0;
      cells.currentStatus = ordered[0]?.label || '계약없음';
      cells.historyAction = '보기';
      return { id: `contract:${rowJoinKey(node.veh.companyId, node.plate)}`, cells, bindings };
    })
    .sort((a, b) => String(a.cells.plate || '').localeCompare(String(b.cells.plate || ''), 'ko')), [companyId, fleet.vehicles, fleetRowByKey]);

  const collectionRows = useMemo<StandaloneRow[]>(() => views.map((view, index) => {
    const record = view.rec;
    const schedules = contractSchedules(record, TODAY);
    const cells: Record<string, CellValue> = {
      no: index + 1, company: companyDisplay(String(record.companyId || '')), code: firstValue(record, 'codeName', 'contractNo'),
      deposit: firstValue(record, 'deposit'), rent: view.monthlyRent, installment: firstValue(record, 'splitPayment', 'installmentPayment'),
      depositDate: firstValue(record, 'depositReceivedDate', 'depositTransferDate'), paymentDay: Number(record.paymentDay) || '',
      firstReg: firstValue(vehicleNodeByKey.get(rowJoinKey(record.companyId, record.plate))?.veh || vehicleNodeByPlate.get(normPlate(record.plate))?.veh || {}, 'firstReg'),
      plate: firstValue(record, 'plate'), customer: firstValue(record, 'contractorName'), status: view.ended ? '계약종료' : view.status,
      start: view.startDate, end: view.endDate, totalCharge: view.gross, totalPaid: view.paid, totalUnpaid: view.net,
      overdueDays: view.overdueDays, lastPaidAt: '', historyAction: '보기',
    };
    for (const schedule of schedules) {
      const monthKey = String(schedule.dueDate).slice(0, 7);
      if (!monthKeys.includes(monthKey)) continue;
      cells[`${monthKey}-charge`] = numberValue(cells[`${monthKey}-charge`]) + Math.max(0, schedule.amount - schedule.discount);
      cells[`${monthKey}-paid`] = numberValue(cells[`${monthKey}-paid`]) + schedule.paid;
      cells[`${monthKey}-date`] = String(schedule.paidAt || cells[`${monthKey}-date`] || '');
      cells[`${monthKey}-method`] = String(schedule.method || cells[`${monthKey}-method`] || '');
      cells[`${monthKey}-balance`] = numberValue(cells[`${monthKey}-balance`]) + schedule.balance;
      if (String(schedule.paidAt || '') > String(cells.lastPaidAt || '')) cells.lastPaidAt = String(schedule.paidAt || '');
    }
    return {
      id: `collection:${sourceCompany(record, companyId)}:${sourceKey(record) || index}`,
      cells,
      bindings: bindFields('contract', record, companyId, COLLECTION_FIELD_MAP),
    };
  }).sort((a, b) => String(a.cells.plate || '').localeCompare(String(b.cells.plate || ''), 'ko')), [companyId, vehicleNodeByKey, vehicleNodeByPlate, views]);

  const cashLedger = useMemo(() => buildCashLedger(bank, card).sort((a, b) => b.date.localeCompare(a.date)), [bank, card]);
  const latestCashDate = cashLedger[0]?.date.slice(0, 10) || '';
  const journalDate = cashDate || latestCashDate || TODAY;
  const cashRows = useMemo<StandaloneRow[]>(() => cashLedger
    .filter((row) => row.date.slice(0, 10) === journalDate && row.nest !== 'cms-item' && row.nest !== 'card-item')
    .map((row, index) => {
      const record = row.raw;
      const isBank = row.entity === 'bank_tx';
      const fieldMap: Record<string, string> = isBank
        ? { date: 'txDate', account: 'account', party: 'counterparty', memo: 'memo', inflow: 'amount', outflow: 'withdraw', category: 'category' }
        : { date: 'txDate', party: 'merchant', memo: 'memo', outflow: 'amount', category: 'category' };
      const matched = Boolean(record.matchedContractId || record.matchedScheduleSeq);
      return {
        id: `cash:${row.id}`,
        cells: {
          no: index + 1, date: row.date.slice(0, 10), account: row.accountName || row.account, party: row.party, memo: row.memo,
          source: row.source, inflow: row.inAmt, outflow: row.outAmt, category: row.category || '미분류',
          link: row.inAmt > 0 ? (matched ? '연결완료' : '확인필요') : (row.category ? '분류완료' : '미분류'), historyAction: '보기',
        },
        bindings: bindFields(row.entity, record, companyId, fieldMap),
      };
    }), [cashLedger, companyId, journalDate]);

  const operationRows = useMemo<StandaloneRow[]>(() => fleetRows.filter(isVehicleHeld).map((row, index) => {
    const activeRecord = vehicleNodeByKey.get(rowJoinKey(row.companyId, row.plate))?.activeContract?.view.rec || {};
    const expiring = row.dday !== null && row.dday >= 0 && row.dday <= 30;
    const action = row.maintainedNet > 0 && expiring ? '수납·만기' : row.maintainedNet > 0 ? '수납 독촉' : expiring ? '만기 임박' : row.util === '휴차' ? '쉬는차' : row.warnings.length ? '확인 필요' : '정상';
    return {
      id: `operation:${rowJoinKey(row.companyId, row.plate)}`,
      cells: {
        no: index + 1, plate: row.plate, car: row.carName, state: row.util, action, unpaid: row.maintainedNet,
        months: row.dday === null ? row.termMonths : Math.max(0, Math.ceil(row.dday / 30)), end: row.end, customer: row.customer,
        paymentDay: row.paymentDay ? `${row.paymentDay}일` : '', rent: row.rent, deposit: row.deposit, start: row.start, company: row.company,
        sales: firstValue(activeRecord, 'salesperson', 'salesPerson', 'agentName', 'managerName'), historyAction: '보기',
      },
    };
  }), [fleetRows, vehicleNodeByKey]);

  const kpi = useMemo(() => computeKPI(contracts, vehicles, TODAY), [contracts, vehicles]);
  const currentMonth = monthKeys[0];
  const monthCharge = collectionRows.reduce((sum, item) => sum + numberValue(item.cells[`${currentMonth}-charge`]), 0);
  const monthPaid = collectionRows.reduce((sum, item) => sum + numberValue(item.cells[`${currentMonth}-paid`]), 0);
  const heldCount = operationRows.length;
  const soldCount = assetRows.filter((item) => !['보유', '보유중'].includes(String(item.cells.ownership || ''))).length;
  const runningCount = operationRows.filter((item) => item.cells.state === '운행').length;
  const idleCount = operationRows.filter((item) => item.cells.state === '휴차').length;
  const incompleteCount = contracts.filter((record) => !record.plate || !record.contractorName || (!record.startDate && !record.contractDate) || (!record.endDate && !record.rentalMonths) || !Number(record.monthlyRent)).length;

  const sourceRows: Record<Exclude<TabKey, 'summary'>, StandaloneRow[]> = { operation: operationRows, asset: assetRows, contract: contractRows, collection: collectionRows, cash: cashRows };
  const currentRows = tab === 'summary' ? [] : sourceRows[tab].filter((item) => matches(query, item));
  const selectedRow = selected ? sourceRows[selected.tab].find((item) => item.id === selected.rowId) || null : null;
  const detailSections = (() => {
    if (!selected || !selectedRow) return [];
    const columns = DETAIL_COLUMNS[selected.tab];
    let offset = 0;
    return DETAIL_GROUPS[selected.tab].map((group) => {
      const sectionColumns = columns.slice(offset, offset + group.span);
      offset += group.span;
      return {
        label: group.label,
        items: sectionColumns
          .map((item) => ({ label: item.label, value: selectedRow.cells[item.key], kind: item.kind }))
          .filter((item) => item.value !== undefined && item.value !== null && item.value !== ''),
      };
    }).filter((section) => section.items.length > 0);
  })();
  const detailTimeline = useMemo<TimelineItem[]>(() => {
    if (!selected || !selectedRow) return [];
    const plate = normPlate(selectedRow.cells.plate);
    if (selected.tab === 'collection') {
      const contractKey = selectedRow.bindings?.code?.recordKey || selectedRow.bindings?.plate?.recordKey;
      const record = contracts.find((item) => sourceKey(item) === contractKey);
      if (!record) return [];
      return contractSchedules(record, TODAY).map((schedule) => ({
        date: String(schedule.dueDate || ''),
        title: `${schedule.seq}회차 · ${schedule.status}`,
        detail: `청구 ${numberValue(schedule.amount - schedule.discount).toLocaleString('ko-KR')} · 수납 ${numberValue(schedule.paid).toLocaleString('ko-KR')} · 미수 ${numberValue(schedule.balance).toLocaleString('ko-KR')}`,
        amount: schedule.balance,
      })).sort((a, b) => b.date.localeCompare(a.date));
    }
    if (selected.tab === 'cash') {
      return [{
        date: String(selectedRow.cells.date || ''),
        title: String(selectedRow.cells.party || selectedRow.cells.memo || '자금 거래'),
        detail: `${selectedRow.cells.category || '미분류'} · ${selectedRow.cells.account || '계좌 미지정'} · ${selectedRow.cells.link || ''}`,
        amount: numberValue(selectedRow.cells.inflow) || -numberValue(selectedRow.cells.outflow),
      }];
    }
    const contractItems = contracts.filter((record) => normPlate(record.plate) === plate).map((record) => {
      const view = computeContractView(record, TODAY);
      return {
        date: String(view.startDate || record.contractDate || ''),
        title: `계약 · ${String(record.contractorName || '고객 미입력')}`,
        detail: `${String(view.startDate || '—')} ~ ${String(view.endDate || '—')} · 월 ${numberValue(view.monthlyRent).toLocaleString('ko-KR')} · ${view.status}`,
        amount: view.net,
      };
    });
    const historyItems = history.filter((record) => normPlate(record.plate) === plate).map((record) => ({
      date: String(record.date || ''),
      title: String(record.title || record.category || '차량 이력'),
      detail: [record.category, record.vendor, record.description].map((value) => String(value || '')).filter(Boolean).join(' · '),
      amount: numberValue(record.cost),
    }));
    return [...contractItems, ...historyItems].sort((a, b) => b.date.localeCompare(a.date));
  }, [contracts, history, selected, selectedRow]);

  const setCell = async (sheet: WorkbookSheetKey, rowId: string, item: GridColumn, value: string) => {
    const row = sourceRows[sheet].find((candidate) => candidate.id === rowId);
    const binding = row?.bindings?.[item.key];
    if (!binding) return;
    setSaveState('saving'); setSaveMessage('저장 중');
    try {
      await getStore().update(binding.entity, binding.companyId, binding.recordKey, { [binding.field]: editableValue(value, item.kind) });
      setSaveState('saved'); setSaveMessage('저장됨');
    } catch (saveError) {
      setSaveState('error'); setSaveMessage((saveError as Error).message || '저장 실패');
    }
  };

  const activeTab = TABS.find((item) => item.key === tab) || TABS[0];
  const editable = tab === 'asset' || tab === 'contract' || tab === 'collection' || tab === 'cash';
  const toolbarMeta = tab === 'operation' ? `${currentRows.length}대`
    : tab === 'asset' ? `전체 ${assetRows.length}대 · 현재 보유 ${heldCount}대`
      : tab === 'contract' ? `${currentRows.length}대`
        : tab === 'collection' ? `${currentRows.length}건 · 미수 ${kpi.unpaidCount}건`
          : tab === 'cash' ? `${journalDate} · ${currentRows.length}건`
            : '';

  return (
    <main className={styles.workspace}>
      <nav className={styles.tabs} aria-label="업무 시트">
        {TABS.map((item) => (
          <SheetButton key={item.key} role="tab" aria-selected={tab === item.key} className={`${styles.tab} ${tab === item.key ? styles.tabActive : ''}`} onClick={() => { setTab(item.key); setQuery(''); }}>
            <i aria-hidden="true" /><span>{item.label}</span><small>{item.kind}</small>
          </SheetButton>
        ))}
      </nav>

      <section className={styles.sheet} aria-label={activeTab.label}>
        <header className={styles.sheetToolbar}>
          <div className={styles.sheetIdentity}><strong>{activeTab.label}</strong>{toolbarMeta ? <span>{toolbarMeta}</span> : null}</div>
          <div className={styles.toolbarControls}>
            {saveState !== 'idle' ? <span className={`${styles.saveState} ${saveState === 'error' ? styles.saveError : ''}`}>{saveMessage}</span> : null}
            {tab !== 'summary' ? <label className={styles.searchBox}><Search size={15} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="시트에서 찾기" /></label> : null}
            {tab === 'cash' ? <input className={styles.dateInput} type="date" value={journalDate} onChange={(event) => setCashDate(event.target.value)} /> : null}
          </div>
        </header>

        {error ? <div className={styles.error}>{error}</div> : null}
        {loading ? <div className={styles.loadingStrip}>ERP 데이터를 불러오는 중입니다.</div> : null}

        {tab === 'summary' ? (
          <div className={styles.summaryScroll}>
            <div className={styles.summarySheet}>
              <section>
                <h2>차량</h2><p>취득한 것 중 지금 남은 것</p>
                <div className={styles.summaryRow}>
                  <div><span>취득 누계</span><strong>{assetRows.length}대</strong></div>
                  <div><span>매각·폐차</span><strong>{soldCount}대</strong></div>
                  <div><span>현재 보유</span><strong>{heldCount}대</strong></div>
                  <div><span>대여중</span><strong>{runningCount}대</strong></div>
                  <div className={styles.warnSummary}><span>쉬는차</span><strong>{idleCount}대</strong></div>
                </div>
              </section>
              <section>
                <h2>이번 달 돈</h2><p>대여료 청구와 수납</p>
                <div className={styles.summaryRow}>
                  <div><span>당월 청구</span><strong>{numberValue(monthCharge).toLocaleString('ko-KR')}</strong></div>
                  <div><span>당월 수납</span><strong>{numberValue(monthPaid).toLocaleString('ko-KR')}</strong></div>
                  <div><span>수납률</span><strong>{monthCharge ? Math.round((monthPaid / monthCharge) * 100) : 0}%</strong></div>
                  <div className={styles.badSummary}><span>미납 총잔액</span><strong>{kpi.totalUnpaid.toLocaleString('ko-KR')}</strong><small>{kpi.unpaidCount}건</small></div>
                </div>
              </section>
              <section>
                <h2>연체 구간 · 계약</h2><p>지금 확인할 항목</p>
                <div className={styles.summaryRow}>
                  <div><span>30일 이내</span><strong>{kpi.aging[0].toLocaleString('ko-KR')}</strong></div>
                  <div><span>31–60일</span><strong>{kpi.aging[1].toLocaleString('ko-KR')}</strong></div>
                  <div><span>61–90일</span><strong>{kpi.aging[2].toLocaleString('ko-KR')}</strong></div>
                  <div className={styles.badSummary}><span>90일 초과</span><strong>{kpi.aging[3].toLocaleString('ko-KR')}</strong></div>
                  <div><span>30일 내 만기</span><strong>{kpi.expiring30}건</strong></div>
                  <div><span>계약 확인 필요</span><strong>{incompleteCount}건</strong></div>
                </div>
              </section>
            </div>
          </div>
        ) : (
          <SheetGrid
            groups={GROUPS[tab]}
            columns={COLUMNS[tab]}
            rows={currentRows}
            freeze={FREEZE[tab]}
            editable={editable}
            onCommit={(rowId, item, value) => { if (editable) void setCell(tab, rowId, item, value); }}
            onRowClick={(row) => setSelected({ tab, rowId: row.id })}
          />
        )}
      </section>

      {selected && selectedRow ? (
        <div className={styles.detailBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <section className={styles.detailDialog} role="dialog" aria-modal="true" aria-labelledby="sheet-detail-title">
            <header className={styles.detailHeader}>
              <div>
                <span>{TABS.find((item) => item.key === selected.tab)?.label}</span>
                <h2 id="sheet-detail-title">{String(selectedRow.cells.plate || selectedRow.cells.party || selectedRow.cells.code || '상세')}</h2>
              </div>
              <SheetButton className={styles.closeButton} aria-label="닫기" onClick={() => setSelected(null)}>닫기</SheetButton>
            </header>
            <div className={styles.detailBody}>
              <div className={styles.detailSections}>
                {detailSections.map((section, sectionIndex) => (
                  <section key={`${section.label}:${sectionIndex}`} className={styles.detailSection}>
                    <h3>{section.label}</h3>
                    <dl>
                      {section.items.map((item, index) => (
                        <div key={`${item.label}:${index}`}>
                          <dt>{item.label}</dt>
                          <dd>{displayCell(item.value, item.kind)}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
              </div>
              <section className={styles.timelineSection}>
                <h3>이력</h3>
                {detailTimeline.length ? (
                  <ol className={styles.timeline}>
                    {detailTimeline.map((item, index) => (
                      <li key={`${item.date}:${item.title}:${index}`}>
                        <time>{item.date || '날짜 미입력'}</time>
                        <div><strong>{item.title}</strong><p>{item.detail || '상세 내용 없음'}</p></div>
                        {item.amount ? <b className={item.amount > 0 ? styles.timelineAmount : styles.timelineOut}>{item.amount.toLocaleString('ko-KR')}</b> : null}
                      </li>
                    ))}
                  </ol>
                ) : <p className={styles.noTimeline}>등록된 이력이 없습니다.</p>}
              </section>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
