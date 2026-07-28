'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { Plus, UploadCloud, CarFront, FileText } from 'lucide-react';
import { useEntityLists } from '@/lib/use-entity-lists';
import { textMatch } from '@/lib/search-match';
import { companyDisplay } from '@/lib/companies';
import type { EntityRecord } from '@/lib/intake/entities';
import { openCar } from '@/lib/ui-bus';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Badge, Btn, C, FilterChips, LedgerActions, LedgerCreatePanel, LedgerFilterButton, LedgerFilterFields, LedgerFilterPanel, LedgerFrame, LedgerRecordPanel, PageLoading, Search, won,
  PeriodBar, Select, type LedgerColView, type SheetCol,
} from '@/components/ui';
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
import { WORK_SECTIONS_BY_KIND, type WorkGroup } from '@/lib/work-form-sections';
import { PenaltyBucketPanel } from '@/components/work/PenaltyBucketPanel';

type WorkGroupFilter = '전체' | WorkGroup;
type WorkSource = 'work_item' | 'history' | 'penalty' | 'inbox';

type WorkLedgerRow = {
  id: string;
  company: string;
  companyId: string;
  kind: string;
  group: WorkGroup;
  target: string;
  title: string;
  workAt: string;
  workDate: string;
  dueDate: string;
  status: string;
  assignee: string;
  amount: number;
  source: WorkSource;
  nest?: 'penalty-bucket';
  plate?: string;
  violationDate?: string;
  driverName?: string;
  penaltyKind?: PenaltyKind;
  process?: PenaltyProcess;
  matched?: boolean;
  count?: number;
  openCount?: number;
  raw: EntityRecord;
};

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
  if (/일정|스케줄|예약/.test(value)) return '일정';
  if (/상담|통화|문자|연락|고객|민원/.test(value)) return '고객상담';
  if (/정비|수선|검사|세차|부품|오일|타이어/.test(value)) return '정비·수선';
  if (/사고|파손|보험접수/.test(value)) return '사고';
  if (/과태료|범칙|통행료|주차/.test(value)) return '과태료';
  if (/문서|증빙|서류|계약서|등록증|증권/.test(value)) return '문서';
  return '기타';
}

function statusTone(status: string): 'green' | 'amber' | 'red' | 'gray' {
  if (/완료|종결|completed/.test(status)) return 'green';
  if (/지연|미매칭|경과|취소|미처리/.test(status)) return 'red';
  if (/진행|대기|접수|확인|신청|todo|waiting/.test(status)) return 'amber';
  return 'gray';
}

const WORK_COL_CATALOG: SheetCol<WorkLedgerRow>[] = [
  { key: 'co', label: '회사명', pin: true, priority: 2, render: (r) => r.company || '—', text: (r) => r.company },
  { key: 'kind', label: '업무구분', pin: true, priority: 1, render: (r) => r.kind, text: (r) => r.kind },
  { key: 'target', label: '대상', priority: 1, render: (r) => r.target || '—', text: (r) => r.target },
  { key: 'title', label: '업무내용', priority: 1, render: (r) => r.title || '—', text: (r) => r.title },
  { key: 'at', label: '업무일시', priority: 1, render: (r) => r.workAt ? r.workAt.slice(0, 16).replace('T', ' ') : '—', text: (r) => r.workAt },
  { key: 'status', label: '상태', align: 'c', priority: 1, render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge>, text: (r) => r.status },
  { key: 'assignee', label: '담당자', priority: 2, render: (r) => r.assignee || '—', text: (r) => r.assignee },
  { key: 'due', label: '예정일', render: (r) => r.dueDate || '—', text: (r) => r.dueDate },
  { key: 'amount', label: '금액', align: 'r', render: (r) => r.amount ? won(r.amount) : '—', text: (r) => r.amount || '' },
  { key: 'source', label: '원천', render: (r) => WORK_SOURCE_LABEL[r.source], text: (r) => r.source },
];

/** 과태료 전용 열 — 1건=1행: 위반일·차번·금액·실운전자·처리상태 */
const PENALTY_COL_CATALOG: SheetCol<WorkLedgerRow>[] = [
  { key: 'violationDate', label: '위반일', pin: true, priority: 1, render: (r) => r.violationDate || '—', text: (r) => r.violationDate || '' },
  { key: 'plate', label: '차번', pin: true, priority: 1, render: (r) => r.plate || '—', text: (r) => r.plate || '' },
  {
    key: 'amount', label: '금액', align: 'r', priority: 1,
    render: (r) => r.amount ? <span style={{ color: C.warn, fontWeight: 700 }}>{won(r.amount)}</span> : '—',
    text: (r) => r.amount || '',
  },
  { key: 'driver', label: '실운전자', priority: 1, render: (r) => r.driverName || '미매칭', text: (r) => r.driverName || '' },
  {
    key: 'status', label: '처리상태', align: 'c', priority: 1,
    render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge>,
    text: (r) => r.status,
  },
  { key: 'ptype', label: '유형', priority: 2, render: (r) => r.penaltyKind || '—', text: (r) => r.penaltyKind || '' },
  { key: 'title', label: '위반내용', priority: 2, render: (r) => r.title || '—', text: (r) => r.title },
  { key: 'co', label: '회사명', priority: 2, render: (r) => r.company || '—', text: (r) => r.company },
  { key: 'due', label: '납기', priority: 2, render: (r) => r.dueDate || '—', text: (r) => r.dueDate },
];

const WORK_SHEET_KEYS: SheetViewKeys = {
  basic: ['co', 'kind', 'target', 'title', 'at', 'status', 'assignee'],
  all: ['co', 'kind', 'target', 'title', 'at', 'status', 'assignee', 'due', 'amount', 'source'],
};
const PENALTY_SHEET_KEYS: SheetViewKeys = {
  basic: ['violationDate', 'plate', 'amount', 'driver', 'status'],
  all: ['violationDate', 'plate', 'amount', 'driver', 'status', 'ptype', 'title', 'co', 'due'],
};

const _workViews = buildSheetViews(WORK_COL_CATALOG, WORK_SHEET_KEYS);
const BASIC_COLS = _workViews.basic;
const ALL_COLS = _workViews.expanded;
const _penViews = buildSheetViews(PENALTY_COL_CATALOG, PENALTY_SHEET_KEYS);
const PEN_BASIC = _penViews.basic;
const PEN_ALL = _penViews.expanded;

const WORK_DETAIL_DEFS: DetailSectionDef[] = [
  { title: '업무 분류', open: true, keys: ['co', 'kind', 'status', 'source'] },
  { title: '대상·내용', keys: ['target', 'title'] },
  { title: '처리정보', keys: ['at', 'due', 'assignee', 'amount'] },
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
  const { data: [workItems = [], history = [], penalties = [], inbox = [], contracts = []], loading, reload } =
    useEntityLists(['work_item', 'history', 'penalty', 'inbox', 'contract']);
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
    () => buildPenaltyWorkRows(penalties, contracts) as WorkLedgerRow[],
    [penalties, contracts],
  );
  const penaltyBucket = useMemo(() => buildPenaltyBucketRow(penaltyRows as PenaltyWorkRow[]), [penaltyRows]);
  const matchedDocs = useMemo(
    () => (penaltyRows as PenaltyWorkRow[]).filter((r) => r.matched).length,
    [penaltyRows],
  );

  const otherRows = useMemo<WorkLedgerRow[]>(() => {
    const scheduled = workItems.map((r): WorkLedgerRow => {
      const workAt = String(r.completedAt || r.date || r.dueDate || r.updatedAt || r.createdAt || '');
      return {
        id: `work:${String(r._key || r.id)}`,
        company: companyDisplay(String(r.companyId || '')),
        companyId: String(r.companyId || ''),
        kind: String(r.workType || r.category || (r.source === 'schedule' ? '일정' : '일반')),
        group: workGroup(r.workType || r.category || (r.source === 'schedule' ? '일정' : '일반')),
        target: String(r.plate || r.contractNo || r.customerName || r.relatedEntity || ''),
        title: String(r.title || r.memo || ''),
        workAt,
        workDate: workAt.slice(0, 10),
        dueDate: String(r.dueDate || r.date || '').slice(0, 10),
        status: String(r.status === 'completed' || r.done ? '완료' : r.status || '대기'),
        assignee: String(r.assigneeName || r.assigneeId || ''),
        amount: Number(r.amount || r.cost) || 0,
        source: 'work_item', raw: r,
      };
    });
    const activities = history.map((r): WorkLedgerRow => {
      const workAt = String(r.occurredAt || r.date || r.updatedAt || r.createdAt || '');
      return {
        id: `history:${String(r._key || r.id)}`,
        company: companyDisplay(String(r.companyId || '')),
        companyId: String(r.companyId || ''),
        kind: String(r.category || (r._kind === 'work' ? '정비' : '업무')),
        group: workGroup(r.category || (r._kind === 'work' ? '정비' : '업무')),
        target: String(r.plate || r.contractNo || ''),
        title: String(r.title || r.memo || r.vendor || ''),
        workAt,
        workDate: workAt.slice(0, 10),
        dueDate: String(r.dueDate || r.date || '').slice(0, 10),
        status: String(r.work_status || r.status || '접수'),
        assignee: String(r.author || r.assignee || ''),
        amount: Number(r.cost || r.amount) || 0,
        source: 'history', raw: r,
      };
    });
    const documents = inbox.map((r): WorkLedgerRow => {
      const workAt = String(r.matchedAt || r.uploadedAt || r.updatedAt || r.createdAt || '');
      return {
        id: `inbox:${String(r._key || r.id)}`,
        company: companyDisplay(String(r.companyId || '')),
        companyId: String(r.companyId || ''),
        kind: String(r.workType || '문서검토'),
        group: '문서',
        target: String(r.plate || r.contractNo || r.matchedEntity || ''),
        title: String(r.title || r.fileName || r.memo || r.kind || '수집 문서 확인'),
        workAt,
        workDate: workAt.slice(0, 10),
        dueDate: String(r.dueDate || r.uploadedAt || r.createdAt || '').slice(0, 10),
        status: String(r.status || (r.matchedAt ? '완료' : '대기')),
        assignee: String(r.assignee || r.uploadedBy || ''),
        amount: Number(r.amount) || 0,
        source: 'inbox', raw: r,
      };
    });
    return [...scheduled, ...activities, ...documents]
      .sort((a, b) => b.workAt.localeCompare(a.workAt) || a.kind.localeCompare(b.kind, 'ko'));
  }, [workItems, history, inbox]);

  const penaltyMode = group === '과태료';

  const allRows = useMemo<WorkLedgerRow[]>(() => {
    if (penaltyMode) return penaltyRows;
    const base = otherRows.filter((r) => r.group !== '과태료');
    return penaltyBucket ? [...base, penaltyBucket] : base;
  }, [penaltyMode, penaltyRows, otherRows, penaltyBucket]);

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
      r.company, r.kind, r.target, r.title, r.status, r.assignee, r.workAt,
      r.plate, r.driverName, r.violationDate, r.penaltyKind,
    );
  }), [allRows, penaltyMode, penProcess, penKind, group, detailFilters, workFilterMatchers, range.from, range.to, q]);

  const inProgress = rows.filter((r) => !/완료|종결|취소/.test(r.status)).length;

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
          placeholder={penaltyMode ? '차번·실운전자·위반·상태' : '구분·대상·내용·상태·담당자'}
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
      rowStyle={(r) => (r.nest === 'penalty-bucket' ? { background: PENALTY_ROW_BG } : undefined)}
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
            status: '접수',
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
          subtitle={selected.source === 'penalty'
            ? `${selected.plate || '차번 없음'} · ${selected.driverName || '미매칭'}`
            : `${selected.kind} · ${selected.target || '대상 없음'}`}
          row={selected}
          cols={selected.source === 'penalty' ? PEN_ALL : ALL_COLS}
          sections={selected.source === 'penalty' ? PENALTY_DETAIL_SECTIONS : WORK_DETAIL_SECTIONS}
          onClose={() => setSelected(null)}
          actions={(
            <>
              {(selected.plate || String(selected.raw.plate || '')) ? (
                <Btn size="sm" variant="ghost" onClick={() => openCar(String(selected.plate || selected.raw.plate))}>
                  <CarFront size={14} /> 차량·매칭
                </Btn>
              ) : null}
              {selected.source === 'penalty' && matchedDocs > 0 ? (
                <Btn size="sm" variant="ghost" href="/penalty/docs">
                  <FileText size={14} /> 변경부과 공문
                </Btn>
              ) : null}
              {String(selected.raw.contractNo || '') ? (
                <Btn size="sm" variant="ghost" onClick={() => router.push('/contract')}>
                  <FileText size={14} /> 계약
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
