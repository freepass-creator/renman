'use client';

import { useMemo, useState } from 'react';
import { Plus, UploadCloud } from 'lucide-react';
import { useEntityLists } from '@/lib/use-entity-lists';
import { textMatch } from '@/lib/search-match';
import { companyDisplay } from '@/lib/companies';
import type { EntityRecord } from '@/lib/intake/entities';
import {
  Badge, Btn, C, LedgerActions, LedgerCreatePanel, LedgerFilterButton, LedgerFilterFields, LedgerFilterPanel, LedgerFrame, LedgerRecordPanel, Search, won,
  PeriodBar, Select, type LedgerColView, type LedgerFormSection, type SheetCol,
} from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';
import { todayKST } from '@/lib/contracts/dates';
import {
  buildDetailSections, buildSheetViews, type DetailSectionDef, type SheetViewKeys,
} from '@/lib/ledger-ext';
import {
  WORK_FILTER_DEFS, countActiveFilters, emptyFilterValues, eqFilter, matchLedgerFilters,
} from '@/lib/ledger-filter-defs';

type WorkGroup = '일정' | '고객상담' | '정비·수선' | '사고' | '과태료' | '문서' | '기타';
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
  raw: EntityRecord;
};

const WORK_GROUPS: WorkGroupFilter[] = ['전체', '일정', '고객상담', '정비·수선', '사고', '과태료', '문서', '기타'];
const WORK_SOURCE_LABEL: Record<WorkSource, string> = {
  work_item: '업무',
  history: '이력',
  penalty: '과태료',
  inbox: '문서함',
};
const WORK_CREATE_SECTIONS: LedgerFormSection[] = [
  { title: '업무 분류', open: true, fields: ['date', 'category', 'status', 'priority'] },
  { title: '대상·연결정보', fields: ['targetType', 'plate', 'contractNo', 'customerName'] },
  { title: '처리정보', fields: ['dueDate', 'assigneeName', 'vendor', 'amount', 'description'] },
];

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
  if (/지연|미매칭|경과|취소/.test(status)) return 'red';
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

/** 업무 엑셀 — `업무 · 엑셀기본|엑셀전체 · +|-key` @see lib/ledger-ext.ts */
const WORK_SHEET_KEYS: SheetViewKeys = {
  basic: ['co', 'kind', 'target', 'title', 'at', 'status', 'assignee'],
  all: ['co', 'kind', 'target', 'title', 'at', 'status', 'assignee', 'due', 'amount', 'source'],
};

const _workViews = buildSheetViews(WORK_COL_CATALOG, WORK_SHEET_KEYS);
const BASIC_COLS = _workViews.basic;
const ALL_COLS = _workViews.expanded;

/** 업무 상세 — 필드 추가 요청: `업무 · 처리정보 · newKey` */
const WORK_DETAIL_DEFS: DetailSectionDef[] = [
  { title: '업무 분류', open: true, keys: ['co', 'kind', 'status', 'source'] },
  { title: '대상·내용', keys: ['target', 'title'] },
  { title: '처리정보', keys: ['at', 'due', 'assignee', 'amount'] },
];

const WORK_DETAIL_SECTIONS = buildDetailSections(ALL_COLS, WORK_DETAIL_DEFS);

export default function WorkLedgerPage() {
  const mobile = useIsMobile();
  const { data: [workItems = [], history = [], penalties = [], inbox = []], loading, reload } = useEntityLists(['work_item', 'history', 'penalty', 'inbox']);
  const [q, setQ] = useState('');
  const [colView, setColView] = useState<LedgerColView>('기본');
  const [group, setGroup] = useState<WorkGroupFilter>('전체');
  const [detailFilters, setDetailFilters] = useState(() => emptyFilterValues(WORK_FILTER_DEFS));
  const [filterOpen, setFilterOpen] = useState(false);
  const [range, setRange] = useState({ from: '', to: '' });
  const [selected, setSelected] = useState<WorkLedgerRow | null>(null);
  const [creating, setCreating] = useState(false);

  const allRows = useMemo<WorkLedgerRow[]>(() => {
    const scheduled = workItems.map((r): WorkLedgerRow => {
      const workAt = String(r.completedAt || r.date || r.dueDate || r.updatedAt || r.createdAt || '');
      return ({
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
    })});
    const activities = history.map((r): WorkLedgerRow => {
      const workAt = String(r.occurredAt || r.date || r.updatedAt || r.createdAt || '');
      return ({
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
    })});
    const fines = penalties.map((r): WorkLedgerRow => {
      const workAt = String(r.updatedAt || r.createdAt || r.issueDate || r.violationDate || '');
      return ({
      id: `penalty:${String(r._key || r.id)}`,
      company: companyDisplay(String(r.companyId || '')),
      companyId: String(r.companyId || ''),
      kind: '과태료',
      group: '과태료',
      target: String(r.plate || r.contractNo || ''),
      title: String(r.description || r.docType || '과태료 처리'),
      workAt,
      workDate: workAt.slice(0, 10),
      dueDate: String(r.dueDate || r.violationDate || '').slice(0, 10),
      status: String(r.reassignStatus || (r.matchedContractId ? '임차인확인' : '미매칭')),
      assignee: String(r.assignee || r.author || ''),
      amount: Number(r.amount) || 0,
      source: 'penalty', raw: r,
    })});
    const documents = inbox.map((r): WorkLedgerRow => {
      const workAt = String(r.matchedAt || r.uploadedAt || r.updatedAt || r.createdAt || '');
      return ({
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
    })});
    return [...scheduled, ...activities, ...fines, ...documents]
      .sort((a, b) => b.workAt.localeCompare(a.workAt) || a.kind.localeCompare(b.kind, 'ko'));
  }, [workItems, history, penalties, inbox]);

  const assignees = useMemo(() => [...new Set(allRows.map((r) => r.assignee).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')), [allRows]);
  const statuses = useMemo(() => [...new Set(allRows.map((r) => r.status).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')), [allRows]);
  const sources = useMemo(() => [...new Set(allRows.map((r) => r.source))], [allRows]);
  const workFilterMatchers = useMemo(() => ({
    status: eqFilter<WorkLedgerRow>((r) => r.status),
    assignee: eqFilter<WorkLedgerRow>((r) => r.assignee),
    source: eqFilter<WorkLedgerRow>((r) => r.source),
  }), []);
  const detailFilterCount = countActiveFilters(detailFilters, WORK_FILTER_DEFS);
  const latest = useMemo(() => allRows.reduce((value, r) => r.workDate > value ? r.workDate : value, new Date().toISOString().slice(0, 10)), [allRows]);
  const rows = useMemo(() => allRows.filter((r) =>
    (group === '전체' || r.group === group)
    && matchLedgerFilters(r, detailFilters, workFilterMatchers)
    && (!range.from || r.workDate >= range.from)
    && (!range.to || r.workDate <= range.to)
    && textMatch(q, r.company, r.kind, r.target, r.title, r.status, r.assignee, r.workAt),
  ), [allRows, group, detailFilters, workFilterMatchers, range.from, range.to, q]);
  const inProgress = rows.filter((r) => !/완료|종결|취소/.test(r.status)).length;

  return (
    <LedgerFrame
      title="업무관리"
      meta="일정·상담·정비·사고·과태료·문서와 처리 이력"
      right={<LedgerActions aria-label="쓰기">
        <Btn
          size="sm"
          variant="solid"
          aria-pressed={creating}
          onClick={() => {
            setSelected(null);
            setCreating((open) => !open);
          }}
        ><Plus size={14} /> {creating ? '취소' : '업무 생성'}</Btn>
      </LedgerActions>}
      tools={<LedgerActions aria-label="워크플로">
        <Btn size="sm" variant="ghost" iconOnly tip="과태료 OCR" href="/penalty/upload">
          <UploadCloud size={14} />
        </Btn>
      </LedgerActions>}
      filters={<>
        <Search size="sm" placeholder="구분·대상·내용·상태·담당자" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: mobile ? '100%' : 250 }} />
        <LedgerFilterButton open={filterOpen} count={detailFilterCount} onClick={() => setFilterOpen((open) => !open)} />
        <Select size="sm" aria-label="업무 구분" value={group} onChange={(e) => setGroup(e.target.value as typeof group)}>
          {WORK_GROUPS.map((key) => <option key={key} value={key}>{key}</option>)}
        </Select>
        <PeriodBar latest={latest} initial="월간" size="sm" onRange={setRange} />
      </>}
      stats={<span style={{ fontSize: 12.5, color: C.mute }}>전체 <b>{rows.length}</b> · 진행 <b style={{ color: C.warn }}>{inProgress}</b></span>}
      colView={colView}
      onColView={setColView}
      loading={loading}
      empty="업무가 없습니다. 우측 «업무 생성» 또는 과태료 OCR로 담으세요."
      cols={colView === '기본' ? BASIC_COLS : ALL_COLS}
      rows={rows}
      rowKey={(r) => r.id}
      selectedRowKey={selected?.id}
      onRowDoubleClick={(row) => {
        setCreating(false);
        setSelected(row);
      }}
      onCloseDetail={() => setSelected(null)}
      filterPanel={filterOpen ? (
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
          sections={WORK_CREATE_SECTIONS}
          quick
          initial={{
            date: todayKST(),
            status: '미분류',
            category: '미분류',
            workType: '미분류',
            title: '',
          }}
          onClose={() => setCreating(false)}
          onSaved={() => reload()}
        />
      ) : selected ? (
        <LedgerRecordPanel
          title={selected.title || selected.kind}
          subtitle={`${selected.kind} · ${selected.target || '대상 없음'}`}
          row={selected}
          cols={ALL_COLS}
          sections={WORK_DETAIL_SECTIONS}
          onClose={() => setSelected(null)}
        />
      ) : null}
    />
  );
}
