'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { Plus, UploadCloud, FileText, Trash2 } from 'lucide-react';
import { useEntityLists } from '@/lib/use-entity-lists';
import { textMatch } from '@/lib/search-match';
import { companyDisplay } from '@/lib/companies';
import type { EntityRecord } from '@/lib/intake/entities';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Badge, Btn, C, FilterChips, LedgerActions, LedgerCreatePanel, LedgerFilterButton, LedgerFilterFields, LedgerFilterPanel, LedgerFrame, LedgerRecordPanel, PageLoading, Search, won,
  PeriodBar, Select, useConfirm, type LedgerColView, type SheetCol,
} from '@/components/ui';
import { useSession } from '@/lib/session';
import { commitRemove } from '@/lib/commit';
import { NEED_COMPANY } from '@/lib/scope';
import { toast } from '@/lib/toast';
import { useIsMobile } from '@/lib/use-mobile';
import { todayKST } from '@/lib/contracts/dates';
import {
  buildDetailSections, buildSheetViews, type DetailSectionDef, type SheetViewKeys,
} from '@/lib/ledger-ext';
import {
  WORK_FILTER_DEFS, countActiveFilters, emptyFilterValues, eqFilter, matchLedgerFilters,
} from '@/lib/ledger-filter-defs';
import {
  PENALTY_KINDS, PENALTY_PROCESSES,
  buildPenaltyBucketRow, buildPenaltyWorkRows,
  type PenaltyKind, type PenaltyProcess, type PenaltyWorkRow,
} from '@/lib/penalty-work';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';
import { WORK_SECTIONS_BY_KIND, type WorkGroup } from '@/lib/work-form-sections';
import { PenaltyBucketPanel } from '@/components/work/PenaltyBucketPanel';
import { workRail, workRailStyle } from '@/lib/work-rail';
import { rentalTypeOf } from '@/lib/schema/contract';

type WorkGroupFilter = '전체' | WorkGroup;
type WorkSource = 'work_item' | 'history' | 'penalty' | 'inbox';
/** 업무 상태 SSOT — 미분류는 업무구분(분류) 미지정값이지 상태 아님. */
type WorkStatus = '대기' | '진행' | '완료' | '보류' | '미배정';

type WorkLedgerRow = {
  id: string;
  company: string;
  companyId: string;
  kind: string;
  group: WorkGroup;
  /** 검색용 합본 */
  target: string;
  title: string;
  workAt: string;
  workDate: string;
  createdAt: string;
  updatedAt: string;
  dueDate: string;
  status: WorkStatus | string;
  assignee: string;
  amount: number;
  source: WorkSource;
  nest?: 'penalty-bucket';
  plate?: string;
  carName?: string;
  contractKey?: string;
  contractNo?: string;
  /** 계약자명 — 신원 컬럼 */
  customerName?: string;
  /** 대여형태 — 계약자 sub */
  rentalType?: string;
  priority?: string;
  violationDate?: string;
  driverName?: string;
  penaltyKind?: PenaltyKind;
  process?: PenaltyProcess;
  matched?: boolean;
  count?: number;
  openCount?: number;
  raw: EntityRecord;
};

function carNameOf(plate: string, vehicles: EntityRecord[]): string {
  if (!plate) return '';
  const v = vehicles.find((x) => String(x.plate || '') === plate);
  return v ? String(v.carName || v.model || '') : '';
}

function contractMeta(
  contractKey: string,
  contracts: EntityRecord[],
): { customerName: string; contractNo: string; rentalType: string; plate: string } {
  if (!contractKey) return { customerName: '', contractNo: '', rentalType: '', plate: '' };
  const c = contracts.find((x) => String(x._key || '') === contractKey);
  if (!c) return { customerName: '', contractNo: '', rentalType: '', plate: '' };
  return {
    customerName: String(c.contractorName || ''),
    contractNo: String(c.contractNo || ''),
    rentalType: rentalTypeOf(c),
    plate: String(c.plate || ''),
  };
}

/** ISO → MM-DD HH:mm (시:분까지). 날짜만 있으면 MM-DD. */
function fmtStamp(iso: string): string {
  if (!iso) return '—';
  const m = String(iso).replace('T', ' ').match(/(?:\d{4}-)?(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return '—';
  return m[3] != null ? `${m[1]}-${m[2]} ${m[3]}:${m[4]}` : `${m[1]}-${m[2]}`;
}

/** 원천 status → 대기·진행·완료·보류·미배정. '미분류'는 상태로 쓰지 않음. */
function normalizeWorkStatus(raw: unknown, done?: boolean): WorkStatus {
  if (done || raw === 'completed' || raw === true) return '완료';
  const s = String(raw ?? '').trim();
  if (!s || s === '미분류') return '대기';
  if (/완료|종결/.test(s)) return '완료';
  if (/보류|취소/.test(s)) return '보류';
  if (/미배정/.test(s)) return '미배정';
  if (/진행/.test(s)) return '진행';
  if (/대기|접수|예정|todo|waiting/.test(s)) return '대기';
  return '대기';
}

function workStatusTone(status: string): 'green' | 'amber' | 'red' | 'gray' | 'blue' {
  if (status === '완료') return 'green';
  if (status === '진행') return 'blue';
  if (status === '미배정' || status === '대기' || status === '보류') return 'amber';
  if (/지연|미매칭|경과|미처리/.test(status)) return 'red';
  return 'gray';
}

/** 차량번호 — 1줄 차번 · 2줄 mute 차명. 없으면 미배정(셀은 대시). */
function PlateCell({ r }: { r: WorkLedgerRow }) {
  if (!r.plate) {
    return <span style={{ color: C.mute }}>{LEDGER_EMPTY.dash}</span>;
  }
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {r.plate}
      </div>
      {r.carName ? (
        <div style={{ fontSize: 11, color: C.mute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.carName}
        </div>
      ) : null}
    </div>
  );
}

/** 계약자 — 없으면 LEDGER_EMPTY.none. sub=대여형태. */
function ContractorCell({ r }: { r: WorkLedgerRow }) {
  const name = String(r.customerName || '').trim();
  if (!name) {
    return <span style={{ color: C.mute }}>{LEDGER_EMPTY.none}</span>;
  }
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
      {r.rentalType ? (
        <div style={{ fontSize: 11, color: C.mute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.rentalType}
        </div>
      ) : null}
    </div>
  );
}

function KindCell({ kind }: { kind: string }) {
  if (!kind || kind === '미분류' || kind === '일반') {
    return <Badge tone="amber">미분류</Badge>;
  }
  return <>{kind}</>;
}

function AssigneeCell({ name }: { name: string }) {
  if (!name) return <Badge tone="amber">미지정</Badge>;
  return <>{name}</>;
}

const WORK_GROUPS: WorkGroupFilter[] = ['전체', '일정', '고객상담', '정비·수선', '사고', '과태료', '문서', '기타'];
const WORK_SOURCE_LABEL: Record<WorkSource, string> = {
  work_item: '업무',
  history: '이력',
  penalty: '과태료',
  inbox: '문서함',
};

const PENALTY_ROW_BG = 'color-mix(in srgb, var(--brand) 10%, var(--bg-card))';

function workGroup(kind: unknown): WorkGroup {
  const value = String(kind || '');
  if (!value || value === '미분류' || value === '일반') return '기타';
  if (/일정|스케줄|예약/.test(value)) return '일정';
  if (/상담|통화|문자|연락|고객|민원/.test(value)) return '고객상담';
  if (/정비|수선|검사|세차|부품|오일|타이어/.test(value)) return '정비·수선';
  if (/사고|파손|보험접수/.test(value)) return '사고';
  if (/과태료|범칙|통행료|주차/.test(value)) return '과태료';
  if (/문서|증빙|서류|계약서|등록증|증권/.test(value)) return '문서';
  return '기타';
}

const WORK_COL_CATALOG: SheetCol<WorkLedgerRow>[] = [
  { key: 'co', label: '회사명', pin: true, priority: 2, render: (r) => r.company || LEDGER_EMPTY.dash, text: (r) => r.company },
  {
    key: 'kind', label: '업무구분', pin: true, priority: 1,
    render: (r) => <KindCell kind={r.kind} />,
    text: (r) => r.kind,
  },
  {
    key: 'status', label: '상태', align: 'c', priority: 1,
    render: (r) => <Badge tone={workStatusTone(r.status)}>{r.status}</Badge>,
    text: (r) => r.status,
  },
  {
    key: 'plate', label: '차량번호', priority: 1, pin: true,
    render: (r) => <PlateCell r={r} />,
    text: (r) => [r.plate, r.carName].filter(Boolean).join(' '),
  },
  {
    key: 'contractor', label: '계약자', priority: 1,
    render: (r) => <ContractorCell r={r} />,
    text: (r) => r.customerName || LEDGER_EMPTY.none,
  },
  { key: 'title', label: '업무내용', priority: 1, render: (r) => r.title || LEDGER_EMPTY.dash, text: (r) => r.title },
  {
    key: 'assignee', label: '담당자', priority: 1,
    render: (r) => <AssigneeCell name={r.assignee} />,
    text: (r) => r.assignee,
  },
  {
    key: 'created', label: '생성일시', priority: 1,
    render: (r) => fmtStamp(r.createdAt),
    text: (r) => r.createdAt,
  },
  {
    key: 'updated', label: '최종처리', priority: 1,
    render: (r) => fmtStamp(r.updatedAt),
    text: (r) => r.updatedAt,
  },
  { key: 'due', label: '기한', render: (r) => r.dueDate || LEDGER_EMPTY.dash, text: (r) => r.dueDate },
  { key: 'amount', label: '금액', align: 'r', render: (r) => r.amount ? won(r.amount) : LEDGER_EMPTY.dash, text: (r) => r.amount || '' },
  { key: 'source', label: '원천', render: (r) => WORK_SOURCE_LABEL[r.source], text: (r) => r.source },
];

/** 과태료 전용 열 — 1건=1행: 위반일·차번·금액·실운전자·처리상태 */
const PENALTY_COL_CATALOG: SheetCol<WorkLedgerRow>[] = [
  { key: 'violationDate', label: '위반일', pin: true, priority: 1, render: (r) => r.violationDate || LEDGER_EMPTY.dash, text: (r) => r.violationDate || '' },
  { key: 'plate', label: '차번', pin: true, priority: 1, render: (r) => r.plate || LEDGER_EMPTY.dash, text: (r) => r.plate || '' },
  {
    key: 'amount', label: '금액', align: 'r', priority: 1,
    render: (r) => r.amount ? <span style={{ color: C.warn, fontWeight: 700 }}>{won(r.amount)}</span> : LEDGER_EMPTY.dash,
    text: (r) => r.amount || '',
  },
  { key: 'driver', label: '실운전자', priority: 1, render: (r) => r.driverName || LEDGER_EMPTY.unmatched, text: (r) => r.driverName || '' },
  {
    key: 'status', label: '처리상태', align: 'c', priority: 1,
    render: (r) => <Badge tone={workStatusTone(r.status)}>{r.status}</Badge>,
    text: (r) => r.status,
  },
  { key: 'ptype', label: '유형', priority: 2, render: (r) => r.penaltyKind || LEDGER_EMPTY.dash, text: (r) => r.penaltyKind || '' },
  { key: 'title', label: '위반내용', priority: 2, render: (r) => r.title || LEDGER_EMPTY.dash, text: (r) => r.title },
  { key: 'co', label: '회사명', priority: 2, render: (r) => r.company || LEDGER_EMPTY.dash, text: (r) => r.company },
  { key: 'due', label: '납기', priority: 2, render: (r) => r.dueDate || LEDGER_EMPTY.dash, text: (r) => r.dueDate },
];

const WORK_SHEET_KEYS: SheetViewKeys = {
  // 회사 → 신원 → 내용 → 분류 → 상태 → 수치/담당·시각
  basic: ['co', 'plate', 'contractor', 'title', 'kind', 'status', 'assignee', 'created', 'updated'],
  all: ['co', 'plate', 'contractor', 'title', 'kind', 'status', 'assignee', 'created', 'updated', 'due', 'amount', 'source'],
};
const PENALTY_SHEET_KEYS: SheetViewKeys = {
  // 신원(차)·수치 → 신원(운전자) → 상태 → 내용·보조
  basic: ['co', 'plate', 'driver', 'title', 'status', 'violationDate', 'amount'],
  all: ['co', 'plate', 'driver', 'title', 'status', 'violationDate', 'amount', 'ptype', 'due'],
};

const _workViews = buildSheetViews(WORK_COL_CATALOG, WORK_SHEET_KEYS);
const BASIC_COLS = _workViews.basic;
const ALL_COLS = _workViews.expanded;
const _penViews = buildSheetViews(PENALTY_COL_CATALOG, PENALTY_SHEET_KEYS);
const PEN_BASIC = _penViews.basic;
const PEN_ALL = _penViews.expanded;

const WORK_DETAIL_DEFS: DetailSectionDef[] = [
  { title: '업무 분류', open: true, keys: ['co', 'kind', 'status', 'source'] },
  { title: '신원·내용', keys: ['plate', 'contractor', 'title'] },
  { title: '처리정보', keys: ['created', 'updated', 'due', 'assignee', 'amount'] },
];
const PENALTY_DETAIL_DEFS: DetailSectionDef[] = [
  { title: '고지서', open: true, keys: ['violationDate', 'plate', 'amount', 'driver', 'status'] },
  { title: '부가', keys: ['ptype', 'title', 'co', 'due'] },
];
const WORK_DETAIL_SECTIONS = buildDetailSections(ALL_COLS, WORK_DETAIL_DEFS);
const PENALTY_DETAIL_SECTIONS = buildDetailSections(PEN_ALL, PENALTY_DETAIL_DEFS);

function parseGroup(raw: string | null): WorkGroupFilter {
  if (raw && (WORK_GROUPS as string[]).includes(raw)) return raw as WorkGroupFilter;
  return '전체';
}

function WorkLedgerInner() {
  const mobile = useIsMobile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { companyId } = useSession();
  const confirm = useConfirm();
  const { data: [workItems = [], history = [], penalties = [], inbox = [], contracts = [], vehicles = []], loading, reload } =
    useEntityLists(['work_item', 'history', 'penalty', 'inbox', 'contract', 'vehicle']);
  const [q, setQ] = useState('');
  const [colView, setColView] = useState<LedgerColView>('기본');
  const [group, setGroup] = useState<WorkGroupFilter>(() => parseGroup(searchParams.get('group')));
  const [detailFilters, setDetailFilters] = useState(() => emptyFilterValues(WORK_FILTER_DEFS));
  const [filterOpen, setFilterOpen] = useState(false);
  const [range, setRange] = useState({ from: '', to: '' });
  const [selected, setSelected] = useState<WorkLedgerRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [penProcess, setPenProcess] = useState<PenaltyProcess | null>(null);
  const [penKind, setPenKind] = useState<PenaltyKind | null>(null);

  useEffect(() => {
    setGroup(parseGroup(searchParams.get('group')));
  }, [searchParams]);

  const penaltyRows = useMemo(
    () => (buildPenaltyWorkRows(penalties, contracts) as WorkLedgerRow[]).map((r) => {
      const plate = String(r.plate || '');
      const contractKey = String(r.raw.contractKey || r.raw.contractId || '');
      const meta = contractMeta(contractKey, contracts);
      const customerName = meta.customerName
        || (String(r.driverName || '') !== '미매칭' ? String(r.driverName || '') : '');
      const createdAt = String(r.raw.createdAt || r.workAt || '');
      const updatedAt = String(r.raw.updatedAt || r.workAt || createdAt);
      let status = normalizeWorkStatus(r.status);
      if (!plate && status !== '완료' && status !== '보류') status = '미배정';
      return {
        ...r,
        plate,
        carName: carNameOf(plate, vehicles),
        contractKey,
        contractNo: meta.contractNo || String(r.raw.contractNo || ''),
        customerName,
        rentalType: meta.rentalType,
        target: [plate, customerName].filter(Boolean).join(' '),
        createdAt,
        updatedAt,
        workAt: createdAt,
        workDate: createdAt.slice(0, 10),
        status,
      };
    }),
    [penalties, contracts, vehicles],
  );
  const penaltyBucket = useMemo(() => buildPenaltyBucketRow(penaltyRows as PenaltyWorkRow[]), [penaltyRows]);
  const matchedDocs = useMemo(
    () => (penaltyRows as PenaltyWorkRow[]).filter((r) => r.matched).length,
    [penaltyRows],
  );

  const otherRows = useMemo<WorkLedgerRow[]>(() => {
    const scheduled = workItems.map((r): WorkLedgerRow => {
      const createdAt = String(r.createdAt || r.date || r.dueDate || '');
      const updatedAt = String(r.updatedAt || r.completedAt || createdAt);
      const contractKey = String(r.contractKey || '');
      const meta = contractMeta(contractKey, contracts);
      const plate = String(r.plate || meta.plate || '');
      const contractNo = String(r.contractNo || meta.contractNo || '');
      const customerName = String(r.customerName || meta.customerName || '');
      const carName = String(r.carName || '') || carNameOf(plate, vehicles);
      const kind = String(r.workType || r.category || '').trim() || '미분류';
      let status = normalizeWorkStatus(r.status, !!(r.status === 'completed' || r.done));
      // 차량번호 없으면 미배정 (계약자만으로는 신원 미완)
      if (!plate && status !== '완료' && status !== '보류') status = '미배정';
      return {
        id: `work:${String(r._key || r.id)}`,
        company: companyDisplay(String(r.companyId || '')),
        companyId: String(r.companyId || ''),
        kind,
        group: workGroup(kind),
        target: [plate, carName, customerName, contractNo].filter(Boolean).join(' '),
        title: String(r.title || r.memo || ''),
        workAt: createdAt,
        workDate: createdAt.slice(0, 10),
        createdAt,
        updatedAt,
        dueDate: String(r.dueDate || r.date || '').slice(0, 10),
        status,
        assignee: String(r.assigneeName || r.assigneeId || ''),
        amount: Number(r.amount || r.cost) || 0,
        source: 'work_item',
        plate, carName, contractKey, contractNo, customerName,
        rentalType: meta.rentalType,
        priority: String(r.priority || ''),
        raw: r,
      };
    });
    const activities = history.map((r): WorkLedgerRow => {
      const createdAt = String(r.createdAt || r.occurredAt || r.date || '');
      const updatedAt = String(r.updatedAt || r.occurredAt || createdAt);
      const plate = String(r.plate || '');
      const contractNo = String(r.contractNo || '');
      const carName = carNameOf(plate, vehicles);
      const kind = String(r.category || (r._kind === 'work' ? '정비' : '')).trim() || '미분류';
      let status = normalizeWorkStatus(r.work_status || r.status);
      if (!plate && status !== '완료' && status !== '보류') status = '미배정';
      return {
        id: `history:${String(r._key || r.id)}`,
        company: companyDisplay(String(r.companyId || '')),
        companyId: String(r.companyId || ''),
        kind,
        group: workGroup(kind),
        target: [plate, carName, contractNo].filter(Boolean).join(' '),
        title: String(r.title || r.memo || r.vendor || ''),
        workAt: createdAt,
        workDate: createdAt.slice(0, 10),
        createdAt,
        updatedAt,
        dueDate: String(r.dueDate || r.date || '').slice(0, 10),
        status,
        assignee: String(r.author || r.assignee || ''),
        amount: Number(r.cost || r.amount) || 0,
        source: 'history',
        plate, carName, contractKey: '', contractNo, customerName: '',
        rentalType: '',
        raw: r,
      };
    });
    const documents = inbox.map((r): WorkLedgerRow => {
      const createdAt = String(r.createdAt || r.uploadedAt || '');
      const updatedAt = String(r.updatedAt || r.matchedAt || createdAt);
      const contractKey = String(r.contractKey || '');
      const meta = contractMeta(contractKey, contracts);
      const plate = String(r.plate || meta.plate || '');
      const contractNo = String(r.contractNo || meta.contractNo || '');
      const carName = carNameOf(plate, vehicles);
      const kind = String(r.workType || '').trim() || '문서검토';
      let status = normalizeWorkStatus(r.status || (r.matchedAt ? '완료' : '대기'));
      if (!plate && status !== '완료' && status !== '보류') status = '미배정';
      return {
        id: `inbox:${String(r._key || r.id)}`,
        company: companyDisplay(String(r.companyId || '')),
        companyId: String(r.companyId || ''),
        kind,
        group: '문서',
        target: [plate, carName, meta.customerName, contractNo].filter(Boolean).join(' '),
        title: String(r.title || r.fileName || r.memo || r.kind || '수집 문서 확인'),
        workAt: createdAt,
        workDate: createdAt.slice(0, 10),
        createdAt,
        updatedAt,
        dueDate: String(r.dueDate || r.uploadedAt || r.createdAt || '').slice(0, 10),
        status,
        assignee: String(r.assignee || r.uploadedBy || ''),
        amount: Number(r.amount) || 0,
        source: 'inbox',
        plate, carName, contractKey, contractNo,
        customerName: meta.customerName,
        rentalType: meta.rentalType,
        raw: r,
      };
    });
    // 기본 정렬 = 최종처리 오래된 순(방치 감지)
    return [...scheduled, ...activities, ...documents]
      .sort((a, b) => (a.updatedAt || '').localeCompare(b.updatedAt || '') || a.kind.localeCompare(b.kind, 'ko'));
  }, [workItems, history, inbox, vehicles, contracts]);

  const penaltyMode = group === '과태료';

  const allRows = useMemo<WorkLedgerRow[]>(() => {
    if (penaltyMode) return penaltyRows;
    const base = otherRows.filter((r) => r.group !== '과태료');
    if (!penaltyBucket) return base;
    const bucket: WorkLedgerRow = {
      ...(penaltyBucket as WorkLedgerRow),
      createdAt: String(penaltyBucket.workAt || ''),
      updatedAt: String(penaltyBucket.workAt || ''),
      status: penaltyBucket.openCount ? '대기' : '완료',
    };
    return [...base, bucket];
  }, [penaltyMode, penaltyRows, otherRows, penaltyBucket]);

  useEffect(() => {
    const open = searchParams.get('open');
    if (!open || !allRows.length) return;
    const hit = allRows.find((r) => {
      const key = String(r.raw._key || r.raw.id || '');
      return key === open || r.id === open || r.id === `work:${open}` || r.id.endsWith(`:${open}`);
    });
    if (hit) {
      setCreating(false);
      if (hit.group === '과태료' || hit.source === 'penalty') setGroup('과태료');
      setSelected(hit);
    }
  }, [searchParams, allRows]);

  const assignees = useMemo(() => [...new Set(allRows.map((r) => r.assignee).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')), [allRows]);
  const statuses = useMemo(() => [...new Set(allRows.map((r) => r.status).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')), [allRows]);
  const sources = useMemo(() => [...new Set(allRows.map((r) => r.source))], [allRows]);
  const workFilterMatchers = useMemo(() => ({
    status: eqFilter<WorkLedgerRow>((r) => r.status),
    assignee: eqFilter<WorkLedgerRow>((r) => r.assignee),
    source: eqFilter<WorkLedgerRow>((r) => r.source),
  }), []);
  const detailFilterCount = countActiveFilters(detailFilters, WORK_FILTER_DEFS);
  const latest = useMemo(
    () => allRows.reduce((value, r) => (r.workDate > value ? r.workDate : value), new Date().toISOString().slice(0, 10)),
    [allRows],
  );

  const rows = useMemo(() => allRows.filter((r) => {
    if (penaltyMode) {
      if (penProcess && r.process !== penProcess) return false;
      if (penKind && r.penaltyKind !== penKind) return false;
    } else if (group !== '전체' && r.group !== group && r.nest !== 'penalty-bucket') {
      return false;
    } else if (group !== '전체' && r.nest === 'penalty-bucket') {
      return false;
    }
    if (!penaltyMode && !matchLedgerFilters(r, detailFilters, workFilterMatchers)) return false;
    if (range.from && r.workDate && r.workDate < range.from) return false;
    if (range.to && r.workDate && r.workDate > range.to) return false;
    return textMatch(
      q,
      r.company, r.kind, r.target, r.title, r.status, r.assignee, r.createdAt, r.updatedAt,
      r.plate, r.carName, r.contractKey, r.contractNo, r.customerName, r.rentalType,
      r.driverName, r.violationDate, r.penaltyKind,
    );
  }), [allRows, penaltyMode, penProcess, penKind, group, detailFilters, workFilterMatchers, range.from, range.to, q]);

  const inProgress = rows.filter((r) => !/완료|종결/.test(r.status)).length;

  const setGroupAndUrl = (next: WorkGroupFilter) => {
    setGroup(next);
    setSelected(null);
    setCreating(false);
    setPenProcess(null);
    setPenKind(null);
    const url = next === '전체' ? '/work' : `/work?group=${encodeURIComponent(next)}`;
    router.replace(url, { scroll: false });
  };

  const cols = penaltyMode
    ? (colView === '기본' ? PEN_BASIC : PEN_ALL)
    : (colView === '기본' ? BASIC_COLS : ALL_COLS);

  return (
    <LedgerFrame
      title="업무관리"
      meta="일정·상담·정비·사고·과태료·문서와 처리 이력"
      right={<LedgerActions aria-label="쓰기">
        {penaltyMode ? (
          <>
            <Btn size="sm" variant="ghost" href="/penalty/upload"><UploadCloud size={14} /> 대량 업로드</Btn>
            {matchedDocs > 0 && (
              <Btn size="sm" variant="ghost" href="/penalty/docs"><FileText size={14} /> 변경부과 공문</Btn>
            )}
          </>
        ) : (
          <Btn
            size="sm"
            variant="solid"
            aria-pressed={creating}
            onClick={() => {
              setSelected(null);
              setCreating((open) => !open);
            }}
          ><Plus size={14} /> {creating ? '취소' : '업무 생성'}</Btn>
        )}
      </LedgerActions>}
      filters={<>
        <Search
          size="sm"
          placeholder={penaltyMode ? '차번·실운전자·위반·상태' : '구분·차량·계약자·내용·상태·담당자'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: mobile ? '100%' : 250 }}
        />
        {!penaltyMode && (
          <LedgerFilterButton open={filterOpen} count={detailFilterCount} onClick={() => setFilterOpen((open) => !open)} />
        )}
        <Select size="sm" aria-label="업무 구분" value={group} onChange={(e) => setGroupAndUrl(e.target.value as WorkGroupFilter)}>
          {WORK_GROUPS.map((key) => <option key={key} value={key}>{key}</option>)}
        </Select>
        {penaltyMode && (
          <>
            <FilterChips
              value={penProcess}
              onChange={setPenProcess}
              allowOff
              options={PENALTY_PROCESSES.map((k) => ({
                key: k,
                label: k,
                count: penaltyRows.filter((r) => r.process === k).length,
              }))}
            />
            <FilterChips
              value={penKind}
              onChange={setPenKind}
              allowOff
              options={PENALTY_KINDS.map((k) => ({
                key: k,
                label: k,
                count: penaltyRows.filter((r) => r.penaltyKind === k).length,
              }))}
            />
          </>
        )}
        <PeriodBar latest={latest} initial="월간" size="sm" onRange={setRange} />
      </>}
      stats={<span style={{ fontSize: 12.5, color: C.mute }}>
        {penaltyMode
          ? <>과태료 <b>{rows.length}</b> · 미매칭 <b style={{ color: C.danger }}>{rows.filter((r) => r.process === '미매칭').length}</b></>
          : <>전체 <b>{rows.length}</b> · 진행 <b style={{ color: C.warn }}>{inProgress}</b></>}
      </span>}
      colView={colView}
      onColView={setColView}
      loading={loading}
      empty={penaltyMode
        ? '과태료 고지서가 없습니다. «대량 업로드»로 OCR 등록하세요.'
        : '업무가 없습니다. 우측 «업무 생성» 또는 과태료 OCR로 담으세요.'}
      cols={cols}
      rows={rows}
      rowKey={(r) => r.id}
      selectedRowKey={selected?.id}
      rowStyle={(r) => {
        const rail = workRailStyle(workRail(r));
        if (r.nest === 'penalty-bucket') {
          return { ...rail, background: PENALTY_ROW_BG };
        }
        return rail;
      }}
      onRow={(row) => {
        // 표 클릭 = 우측 상세패널만 (다른 페이지 이동 없음)
        setCreating(false);
        setSelected(row);
      }}
      onRowDoubleClick={(row) => {
        setCreating(false);
        setSelected(row);
      }}
      onCloseDetail={() => setSelected(null)}
      filterPanel={!penaltyMode && filterOpen ? (
        <LedgerFilterPanel
          title="업무 세부 필터"
          onClose={() => setFilterOpen(false)}
          onReset={() => setDetailFilters(emptyFilterValues(WORK_FILTER_DEFS))}
        >
          <LedgerFilterFields
            defs={WORK_FILTER_DEFS}
            values={detailFilters}
            onChange={(key, value) => setDetailFilters((prev) => ({ ...prev, [key]: value }))}
            options={{
              status: statuses,
              assignee: assignees,
              source: sources.map((value) => ({ value, label: WORK_SOURCE_LABEL[value] })),
            }}
          />
        </LedgerFilterPanel>
      ) : null}
      sidePanel={creating ? (
        <LedgerCreatePanel
          key="new-work"
          entityKey="work_item"
          title="업무 생성"
          sectionsByKind={WORK_SECTIONS_BY_KIND}
          kindField="category"
          fallbackKind="기타"
          quick
          initial={{
            date: todayKST(),
            status: '대기',
            category: '기타',
            workType: '기타',
            title: '',
          }}
          onClose={() => setCreating(false)}
          onSaved={() => reload()}
        />
      ) : selected?.nest === 'penalty-bucket' ? (
        <PenaltyBucketPanel
          rows={penaltyRows as PenaltyWorkRow[]}
          matchedDocs={matchedDocs}
          onClose={() => setSelected(null)}
          onUpload={() => router.push('/penalty/upload')}
          onDocs={() => router.push('/penalty/docs')}
          onOpenItem={(row) => {
            setGroupAndUrl('과태료');
            setSelected(row as WorkLedgerRow);
          }}
        />
      ) : selected ? (
        <LedgerRecordPanel
          title={selected.title || selected.kind}
          identity={selected.source === 'penalty'
            ? `${selected.plate || LEDGER_EMPTY.unassigned} · ${selected.driverName || LEDGER_EMPTY.unmatched}`
            : `${selected.plate || LEDGER_EMPTY.unassigned} · ${selected.customerName || LEDGER_EMPTY.none}`}
          statusBadge={<Badge tone={workStatusTone(selected.status)}>{selected.status}</Badge>}
          row={selected}
          cols={selected.source === 'penalty' ? PEN_ALL : ALL_COLS}
          sections={selected.source === 'penalty' ? PENALTY_DETAIL_SECTIONS : WORK_DETAIL_SECTIONS}
          onClose={() => setSelected(null)}
          actions={(
            <>
              {selected.source === 'penalty' && matchedDocs > 0 ? (
                <Btn size="sm" variant="ghost" href="/penalty/docs">
                  <FileText size={14} /> 변경부과 공문
                </Btn>
              ) : null}
              {selected.source === 'penalty' && selected.nest !== 'penalty-bucket' ? (
                <Btn
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    const key = String(selected.raw._key || '');
                    if (!key) return;
                    const ok = await confirm({
                      message: `이 과태료를 삭제할까요? (휴지통에서 복구 가능)\n${selected.plate || ''} · ${selected.amount ? won(selected.amount) : ''}`,
                      danger: true,
                    });
                    if (!ok) return;
                    try {
                      await commitRemove({
                        entity: 'penalty',
                        sessionCompanyId: companyId,
                        rec: selected.raw,
                        key,
                        reason: '수기 삭제',
                      });
                      setSelected(null);
                      reload();
                      toast('삭제됨', 'success');
                    } catch {
                      toast(NEED_COMPANY, 'error');
                    }
                  }}
                >
                  <Trash2 size={14} /> 삭제
                </Btn>
              ) : null}
            </>
          )}
        />
      ) : null}
    />
  );
}

export default function WorkLedgerPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <WorkLedgerInner />
    </Suspense>
  );
}
