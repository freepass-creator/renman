'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { Plus, UploadCloud, FileText, Trash2 } from 'lucide-react';
import { useEntityLists } from '@/lib/use-entity-lists';
import { textMatch } from '@/lib/search-match';
import { companyDisplay } from '@/lib/companies';
import type { EntityRecord } from '@/lib/intake/entities';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Badge, Btn, C, FilterChips, LedgerActions, LedgerCreatePanel, LedgerFilterSelects, LedgerFrame, LedgerRecordPanel, PageLoading, Search, won,
  PeriodBar, Select, useConfirm, type LedgerColView,
} from '@/components/ui';
import { useSession } from '@/lib/session';
import { commitRemove } from '@/lib/commit';
import { NEED_COMPANY } from '@/lib/scope';
import { toast } from '@/lib/toast';
import { useIsMobile } from '@/lib/use-mobile';
import { todayKST } from '@/lib/contracts/dates';
import {
  WORK_FILTER_DEFS, emptyFilterValues, eqFilter, matchLedgerFilters,
} from '@/lib/ledger-filter-defs';
import {
  PENALTY_KINDS, PENALTY_PROCESSES,
  buildPenaltyBucketRow, buildPenaltyWorkRows,
  countMatchedPenalties, countPenaltyByKind, countPenaltyByProcess,
  type PenaltyKind, type PenaltyProcess, type PenaltyWorkRow,
} from '@/lib/penalty-work';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';
import { latestDateOf } from '@/lib/ledger-stats';
import { TODAY } from '@/lib/dashboard-consts';
import { WORK_SECTIONS_BY_KIND } from '@/lib/work-form-sections';
import { PenaltyBucketPanel } from '@/components/work/PenaltyBucketPanel';
import { workRail, workRailStyle } from '@/lib/work-rail';
import {
  WORK_GROUPS, WORK_SOURCE_LABEL,
  carNameOf, contractMeta, normalizeWorkStatus, parseWorkGroup, summarizeWorkLedgerRows, workGroup,
  type WorkGroupFilter, type WorkLedgerRow, type WorkSource, type WorkStatus,
} from '@/lib/work-ledger';
import {
  WORK_BASIC_COLS, WORK_ALL_COLS, WORK_DETAIL_SECTIONS,
  PENALTY_BASIC_COLS, PENALTY_ALL_COLS, PENALTY_DETAIL_SECTIONS,
  workStatusTone,
} from '@/lib/work-cols';

const PENALTY_ROW_BG = 'color-mix(in srgb, var(--brand) 10%, var(--bg-card))';

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
  const [group, setGroup] = useState<WorkGroupFilter>(() => parseWorkGroup(searchParams.get('group')));
  const [detailFilters, setDetailFilters] = useState(() => emptyFilterValues(WORK_FILTER_DEFS));
  const [range, setRange] = useState({ from: '', to: '' });
  const [selected, setSelected] = useState<WorkLedgerRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [penProcess, setPenProcess] = useState<PenaltyProcess | null>(null);
  const [penKind, setPenKind] = useState<PenaltyKind | null>(null);

  useEffect(() => {
    setGroup(parseWorkGroup(searchParams.get('group')));
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
    () => countMatchedPenalties(penaltyRows as PenaltyWorkRow[]),
    [penaltyRows],
  );
  const processCounts = useMemo(
    () => countPenaltyByProcess(penaltyRows as PenaltyWorkRow[]),
    [penaltyRows],
  );
  const kindCounts = useMemo(
    () => countPenaltyByKind(penaltyRows as PenaltyWorkRow[]),
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
  const latest = useMemo(
    () => latestDateOf(allRows, (r) => r.workDate, TODAY),
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

  const { total: rowTotal, inProgress, unmatched: unmatchedPenalty } = useMemo(
    () => summarizeWorkLedgerRows(rows),
    [rows],
  );

  const setGroupAndUrl = (next: WorkGroupFilter) => {
    setGroup(next);
    setSelected(null);
    setCreating(false);
    setPenProcess(null);
    setPenKind(null);
    const url = next === '전체' ? '/work' : `/work?group=${encodeURIComponent(next)}`;
    router.replace(url, { scroll: false });
  };

  /** 과태료 개별 소프트삭제 — 상세·버킷 행 공용. */
  const removePenalty = async (row: Pick<WorkLedgerRow, 'raw' | 'plate' | 'amount' | 'nest'>) => {
    if (row.nest === 'penalty-bucket') return;
    const key = String(row.raw._key || row.raw.id || '');
    if (!key) {
      toast('삭제 키를 찾을 수 없습니다', 'error');
      return;
    }
    const ok = await confirm({
      message: `이 과태료를 삭제할까요? (휴지통에서 복구 가능)\n${row.plate || ''} · ${row.amount ? won(row.amount) : ''}`,
      danger: true,
    });
    if (!ok) return;
    try {
      await commitRemove({
        entity: 'penalty',
        sessionCompanyId: companyId,
        rec: row.raw,
        key,
        reason: '수기 삭제',
      });
      setSelected(null);
      reload();
      toast('삭제됨', 'success');
    } catch {
      toast(NEED_COMPANY, 'error');
    }
  };

  const cols = penaltyMode
    ? (colView === '기본' ? PENALTY_BASIC_COLS : PENALTY_ALL_COLS)
    : (colView === '기본' ? WORK_BASIC_COLS : WORK_ALL_COLS);

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
          <LedgerFilterSelects
            defs={WORK_FILTER_DEFS}
            values={detailFilters}
            onChange={(key, value) => setDetailFilters((prev) => ({ ...prev, [key]: value }))}
            options={{
              status: statuses,
              assignee: assignees,
              source: sources.map((value) => ({ value, label: WORK_SOURCE_LABEL[value] })),
            }}
          />
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
                count: processCounts[k],
              }))}
            />
            <FilterChips
              value={penKind}
              onChange={setPenKind}
              allowOff
              options={PENALTY_KINDS.map((k) => ({
                key: k,
                label: k,
                count: kindCounts[k],
              }))}
            />
          </>
        )}
        <PeriodBar latest={latest} initial="월간" size="sm" onRange={setRange} />
      </>}
      stats={<span style={{ fontSize: 12.5, color: C.mute }}>
        {penaltyMode
          ? <>과태료 <b>{rowTotal}</b> · 미매칭 <b style={{ color: C.danger }}>{unmatchedPenalty}</b></>
          : <>전체 <b>{rowTotal}</b> · 진행 <b style={{ color: C.warn }}>{inProgress}</b></>}
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
      sidePanel={creating ? (
        <LedgerCreatePanel
          key="new-work"
          entityKey="work_item"
          title="업무 생성"
          sectionsByKind={WORK_SECTIONS_BY_KIND}
          kindField="category"
          fallbackKind="기타"
          kindGateways={{
            과태료: {
              message: '과태료는 고지서 파일로 등록합니다. 업로드하면 OCR로 위반일시·차량을 읽어 계약(임차인)을 자동 매칭합니다.',
              actionLabel: '고지서 업로드',
              href: '/penalty/upload',
            },
          }}
          onKindChange={(kind) => {
            if (kind === '과태료') setGroupAndUrl('과태료');
          }}
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
          onRemoveItem={(row) => { void removePenalty(row); }}
        />
      ) : selected ? (
        <LedgerRecordPanel
          title={selected.title || selected.kind}
          identity={selected.source === 'penalty'
            ? `${selected.plate || LEDGER_EMPTY.unassigned} · ${selected.driverName || LEDGER_EMPTY.unmatched}`
            : `${selected.plate || LEDGER_EMPTY.unassigned} · ${selected.customerName || LEDGER_EMPTY.none}`}
          statusBadge={<Badge tone={workStatusTone(selected.status)}>{selected.status}</Badge>}
          row={selected}
          cols={selected.source === 'penalty' ? PENALTY_ALL_COLS : WORK_ALL_COLS}
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
                  onClick={() => { void removePenalty(selected); }}
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
