'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { Plus, FileText, Pencil, Trash2, X, UserPlus, Clock, CalendarClock } from 'lucide-react';
import { useEntityLists } from '@/lib/use-entity-lists';
import { textMatch } from '@/lib/search-match';
import { companyDisplay } from '@/lib/companies';
import type { EntityRecord } from '@/lib/intake/entities';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Badge, Btn, C, ContextMenu, type ContextMenuItem, LedgerActions, LedgerActiveFilters, LedgerCreatePanel, LedgerEditPanel, LedgerFilterButton, LedgerFilterFields, LedgerFilterPanel, LedgerFrame, LedgerRecordPanel, PageLoading, Search, won,
  PeriodBar, useConfirm, useSheetExport, type LedgerColView,
} from '@/components/ui';
import { useSession } from '@/lib/session';
import { commitRemove, commitSave, commitUpdate } from '@/lib/commit';
import { buildAgenda } from '@/lib/agenda';
import { isSnoozed, reconcileDirectives, reschedulePatch, snoozeDate } from '@/lib/directives';
import { NEED_COMPANY } from '@/lib/scope';
import { toast } from '@/lib/toast';
import { useIsMobile } from '@/lib/use-mobile';
import { todayKST } from '@/lib/contracts/dates';
import {
  WORK_FILTER_DEFS, countActiveFilters, emptyFilterValues, eqFilter, matchLedgerFilters,
} from '@/lib/ledger-filter-defs';
import {
  PENALTY_KINDS, PENALTY_PROCESSES,
  buildPenaltyBucketRow, buildPenaltyWorkRows,
  countMatchedPenalties, countPenaltyByKind, countPenaltyByProcess,
  type PenaltyKind, type PenaltyProcess, type PenaltyWorkRow,
} from '@/lib/penalty-work';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';
import { PenaltyIntakePanel } from '@/components/work/PenaltyIntakePanel';
import { latestDateOf } from '@/lib/ledger-stats';
import { TODAY } from '@/lib/dashboard-consts';
import { WORK_SECTIONS_BY_KIND, workSectionsFor } from '@/lib/work-form-sections';
import { PenaltyBucketPanel } from '@/components/work/PenaltyBucketPanel';
import {
  WORK_GROUPS, WORK_SOURCE_LABEL, WORK_DETAIL_CATEGORIES, workRowInDivision,
  buildDirectiveLedgerRows, buildWorkItemLedgerRows, carNameOf, contractMeta, inboxWorkStatus, normalizeWorkStatus, parseWorkGroup, summarizeWorkLedgerRows, workGroup,
  workAttentionRank, workDueSignal,
  type WorkGroupFilter, type WorkLedgerRow, type WorkSource, type WorkStatus,
} from '@/lib/work-ledger';
import { WORK_DIVISION_CATEGORIES } from '@/lib/work-taxonomy';
import {
  WORK_BASIC_COLS, WORK_ALL_COLS, workDetailSectionsFor, INBOX_DETAIL_SECTIONS,
  PENALTY_BASIC_COLS, PENALTY_ALL_COLS, PENALTY_DETAIL_SECTIONS,
  workStatusTone,
} from '@/lib/work-cols';

function WorkLedgerInner() {
  const mobile = useIsMobile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { companyId, isOperator } = useSession();
  const confirm = useConfirm();
  const { data: [workItems = [], history = [], penalties = [], inbox = [], contracts = [], vehicles = [], insurances = []], loading, error: loadError, reload } =
    useEntityLists(['work_item', 'history', 'penalty', 'inbox', 'contract', 'vehicle', 'insurance']);
  const [q, setQ] = useState('');
  const [colView, setColView] = useState<LedgerColView>('기본');
  const [group, setGroup] = useState<WorkGroupFilter>(() => parseWorkGroup(searchParams.get('group')));
  const [detailFilters, setDetailFilters] = useState(() => emptyFilterValues(WORK_FILTER_DEFS));
  const [filterOpen, setFilterOpen] = useState(false);
  const [range, setRange] = useState({ from: '', to: '' });
  const [selected, setSelected] = useState<WorkLedgerRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  /** 스누즈(다시 보기 날짜가 미래)한 자동업무를 펼칠지. 기본은 접어 둔다 — 스누즈의 뜻이 그것이다. */
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [penProcess, setPenProcess] = useState<PenaltyProcess | null>(null);
  const [penKind, setPenKind] = useState<PenaltyKind | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 });
  const xl = useSheetExport<WorkLedgerRow>({
    title: '업무관리',
    filterSummary: () => {
      const parts = [group === '전체' ? '' : group].filter(Boolean);
      if (range.from || range.to) parts.push(`${range.from || '…'}~${range.to || '…'}`);
      if (q.trim()) parts.push('검색');
      return parts.join(' · ') || '전체';
    },
  });
  const ctxItems: ContextMenuItem[] = [
    xl.exportItem(),
    ...(isOperator ? [xl.exportItem({ unmasked: true })] : []),
  ];

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

  /**
   * 지시(자동 업무) — 「조건이 업무를 낳는다」.
   * 어젠다가 감지한 기한을 **아직 저장되지 않은 제안행**으로 합성하고, 이미 실체화된 자동업무에는
   * 기한변경·근거소멸 표식을 붙인다. 저장은 사람이 손댈 때만 일어난다(`lib/directives.ts` 참고).
   */
  const directives = useMemo(
    () => reconcileDirectives(buildAgenda(contracts, vehicles, insurances, penalties), workItems),
    [contracts, vehicles, insurances, penalties, workItems],
  );

  const otherRows = useMemo<WorkLedgerRow[]>(() => {
    const scheduled = buildWorkItemLedgerRows(workItems, contracts, vehicles)
      .filter((r) => showSnoozed || !isSnoozed(r.raw, TODAY))
      .map((r) => {
        const flag = directives.flags[String(r.raw._key || r.raw.workId || '')];
        if (!flag || flag.flag === 'ok') return r;
        return flag.flag === '기한변경'
          ? { ...r, autoFlag: '기한변경' as const, nextDue: flag.nextDue }
          : { ...r, autoFlag: '근거소멸' as const };
      });
    const proposals = buildDirectiveLedgerRows(directives.proposals, contracts, vehicles, TODAY);
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
      const kind = String(r.workType || r.kind || '').trim() || '문서검토';
      const status = inboxWorkStatus(r);
      return {
        id: `inbox:${String(r._key || r.id)}`,
        company: companyDisplay(String(r.companyId || '')),
        companyId: String(r.companyId || ''),
        kind,
        group: '문서',
        target: [plate, carName, meta.customerName, contractNo, r.suggestedEntity].filter(Boolean).join(' '),
        title: String(r.title || r.filename || r.fileName || r.memo || r.kind || '수집 문서 확인'),
        workAt: createdAt,
        workDate: createdAt.slice(0, 10),
        createdAt,
        updatedAt,
        dueDate: String(r.dueDate || '').slice(0, 10),
        status,
        assignee: String(r.assignmentState) === '배정됨' ? String(r.assignee || '') : '',
        amount: Number(r.amount) || 0,
        source: 'inbox',
        plate, carName, contractKey, contractNo,
        customerName: meta.customerName,
        rentalType: meta.rentalType,
        raw: r,
      };
    });
    // 기본 정렬 = 최종처리 오래된 순(방치 감지)
    return [...scheduled, ...activities, ...documents, ...proposals]
      .sort((a, b) => workAttentionRank(a, TODAY) - workAttentionRank(b, TODAY)
        || (a.updatedAt || '').localeCompare(b.updatedAt || '')
        || a.kind.localeCompare(b.kind, 'ko'));
  }, [workItems, history, inbox, vehicles, contracts, directives, showSnoozed]);

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
    // 세부(17종) — 대분류 탭으로 좁힌 뒤 더 좁히는 2단.
    category: eqFilter<WorkLedgerRow>((r) => String(r.group || '')),
    // 급한 정도 — 「일정」을 분류 축에서 뺀 대신 이 축으로 거른다(긴급·높음·보통·낮음).
    priority: eqFilter<WorkLedgerRow>((r) => String(r.priority || '')),
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
    } else if (group !== '전체' && !workRowInDivision(r.group, group) && r.nest !== 'penalty-bucket') {
      // 탭 = 대분류(6축). 행의 group 은 세부 17종이라 workDivisionOf 로 승격해 비교한다(손롤 비교 금지).
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

  const { total: rowTotal, inProgress, unmatched: unmatchedPenalty, unassigned, overdue } = useMemo(
    () => summarizeWorkLedgerRows(rows, TODAY),
    [rows],
  );
  /** 아직 아무도 안 맡은 자동 제안 — 「할 일이 얼마나 밀려 있나」의 답. */
  const autoProposed = useMemo(() => rows.filter((r) => r.source === 'agenda').length, [rows]);

  const setGroupAndUrl = (next: WorkGroupFilter, opts?: { keepCreating?: boolean }) => {
    setGroup(next);
    setSelected(null);
    // 생성 패널 안에서 구분 전환(과태료 등)할 때는 패널을 유지한다.
    if (!opts?.keepCreating) setCreating(false);
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

  /**
   * 자동 제안 → 실제 업무. **이 지시 엔진의 유일한 저장 지점**이다(지연 실체화).
   * `workId` 가 근거키(자연키)라 두 번 눌러도, 다른 사람이 동시에 눌러도 문서는 하나다.
   */
  const materialize = async (row: WorkLedgerRow, patch: EntityRecord, msg: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const rec: EntityRecord = { ...row.raw, ...patch };
      await commitSave({ entity: 'work_item', sessionCompanyId: companyId, rec, records: [rec] });
      setSelected(null);
      reload();
      toast(msg, 'success');
    } catch (e) {
      toast((e as Error).message || NEED_COMPANY, 'error');
    } finally {
      setBusy(false);
    }
  };

  /** 「기한변경」 반영 — 새 업무를 만들지 않고 기존 문서의 기한만 옮긴다(이력 유지). */
  const applyReschedule = async (row: WorkLedgerRow) => {
    const key = String(row.raw._key || row.raw.workId || '');
    const flag = directives.flags[key];
    if (!key || !flag || flag.flag !== '기한변경' || busy) return;
    setBusy(true);
    try {
      await commitUpdate({ entity: 'work_item', sessionCompanyId: companyId, rec: row.raw, key, patch: reschedulePatch(flag) });
      setSelected(null);
      reload();
      toast(`기한을 ${flag.nextDue}(으)로 옮겼습니다`, 'success');
    } catch (e) {
      toast((e as Error).message || NEED_COMPANY, 'error');
    } finally {
      setBusy(false);
    }
  };

  /** 「근거소멸」 종결 — 자동으로 닫지 않는다. 사람이 확인하고 닫는다(감사 흔적). */
  const closeVanished = async (row: WorkLedgerRow) => {
    const key = String(row.raw._key || row.raw.workId || '');
    if (!key || busy) return;
    setBusy(true);
    try {
      await commitUpdate({
        entity: 'work_item', sessionCompanyId: companyId, rec: row.raw, key,
        patch: { status: '완료', completedAt: new Date().toISOString(), description: [String(row.raw.description || ''), '근거 해소로 종결'].filter(Boolean).join(' · ') },
      });
      setSelected(null);
      reload();
      toast('종결됨', 'success');
    } catch (e) {
      toast((e as Error).message || NEED_COMPANY, 'error');
    } finally {
      setBusy(false);
    }
  };

  const cols = penaltyMode
    ? (colView === '기본' ? PENALTY_BASIC_COLS : PENALTY_ALL_COLS)
    : (colView === '기본' ? WORK_BASIC_COLS : WORK_ALL_COLS);

  const workFilterDefs = WORK_FILTER_DEFS.filter((def) => (
    penaltyMode
      ? def.key === 'group' || def.key === 'penProcess' || def.key === 'penKind'
      : def.key === 'group' || def.key === 'category' || def.key === 'priority' || def.key === 'status' || def.key === 'assignee' || def.key === 'source'
  ));
  const activeFilterValues = {
    ...detailFilters,
    group: group === '전체' ? '' : group,
    penProcess: penProcess || '',
    penKind: penKind || '',
  };
  const filterCount = countActiveFilters(activeFilterValues, workFilterDefs);

  return (
    <>
    <LedgerFrame
      title="업무관리"
      meta="자산·계약·자금·과태료·기타 · 담당·기한·상태"
      right={<LedgerActions aria-label="쓰기">
        <Btn
          size="sm"
          variant="solid"
          aria-pressed={creating}
          onClick={() => {
            setSelected(null);
            setEditing(false);
            setCreating((open) => !open);
          }}
        >{creating ? <X size={14} /> : <Plus size={14} />} {creating ? '취소' : '업무 생성'}</Btn>
      </LedgerActions>}
      filters={<>
        <Search
          size="sm"
          placeholder={penaltyMode ? '차번·실운전자·위반·상태' : '구분·차량·계약자·내용·상태·담당자'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: mobile ? 160 : 280, flexShrink: 0 }}
        />
        <LedgerFilterButton open={filterOpen} count={filterCount} onClick={() => setFilterOpen((o) => !o)} />
        {!filterOpen && <LedgerActiveFilters
          defs={workFilterDefs}
          values={activeFilterValues}
          onClear={(key) => {
            if (key === 'group') { setGroupAndUrl('전체'); return; }
            if (key === 'penProcess') { setPenProcess(null); return; }
            if (key === 'penKind') { setPenKind(null); return; }
            setDetailFilters((prev) => ({ ...prev, [key]: '' }));
          }}
          onClearAll={() => {
            setDetailFilters(emptyFilterValues(WORK_FILTER_DEFS));
            setPenProcess(null);
            setPenKind(null);
            setGroupAndUrl('전체');
          }}
        />}
        <PeriodBar latest={latest} initial="전체" size="sm" onRange={setRange} />
        {!penaltyMode && (
          <Btn size="sm" variant={showSnoozed ? 'solid' : 'ghost'} aria-pressed={showSnoozed} onClick={() => setShowSnoozed((v) => !v)}>
            <Clock size={14} /> 미룬 일
          </Btn>
        )}
      </>}
      filterPanel={filterOpen ? (
        <LedgerFilterPanel
          title="업무 필터"
          onReset={() => {
            setDetailFilters(emptyFilterValues(WORK_FILTER_DEFS));
            setPenProcess(null);
            setPenKind(null);
          }}
          onClose={() => setFilterOpen(false)}
        >
          <LedgerFilterFields
            defs={workFilterDefs}
            values={{
              ...detailFilters,
              group: group === '전체' ? '' : group,
              penProcess: penProcess || '',
              penKind: penKind || '',
            }}
            onChange={(key, value) => {
              if (key === 'group') {
                setGroupAndUrl((value || '전체') as WorkGroupFilter);
                return;
              }
              if (key === 'penProcess') {
                setPenProcess((value || null) as PenaltyProcess | null);
                return;
              }
              if (key === 'penKind') {
                setPenKind((value || null) as PenaltyKind | null);
                return;
              }
              setDetailFilters((prev) => ({ ...prev, [key]: value }));
            }}
            options={{
              group: WORK_GROUPS.filter((g) => g !== '전체'),
              // 세부는 선택된 대분류의 것만 — 「차량」 탭에서 「분쟁」을 고를 수 있으면 결과가 항상 0건이다.
              category: (group === '전체'
                ? [...WORK_DETAIL_CATEGORIES]
                : [...(WORK_DIVISION_CATEGORIES[group] ?? [])]).map((c) => ({ value: c, label: c })),
              // 우선순위 = work_item 엔티티 옵션과 같은 순서(급한 것부터).
              priority: ['긴급', '높음', '보통', '낮음'].map((v) => ({ value: v, label: v })),
              status: statuses,
              assignee: assignees,
              source: sources.map((value) => ({ value, label: WORK_SOURCE_LABEL[value] })),
              penProcess: PENALTY_PROCESSES.map((k) => ({ value: k, label: `${k}${processCounts[k] ? ` (${processCounts[k]})` : ''}` })),
              penKind: PENALTY_KINDS.map((k) => ({ value: k, label: `${k}${kindCounts[k] ? ` (${kindCounts[k]})` : ''}` })),
            }}
          />
        </LedgerFilterPanel>
      ) : null}
      stats={<span style={{ fontSize: 12.5, color: C.mute }}>
        {penaltyMode
          ? <>과태료 <b>{rowTotal}</b> · 미매칭 <b style={{ color: C.danger }}>{unmatchedPenalty}</b></>
          : <>전체 <b>{rowTotal}</b> · 진행 <b style={{ color: C.warn }}>{inProgress}</b> · 기한경과 <b style={{ color: C.danger }}>{overdue}</b> · 미배정 <b style={{ color: C.danger }}>{unassigned}</b> · 자동제안 <b>{autoProposed}</b></>}
      </span>}
      colView={colView}
      onColView={setColView}
      loading={loading}
      error={loadError}
      onRetry={reload}
      empty={penaltyMode
        ? '과태료 고지서가 없습니다. «업무 생성»에서 업무분류=과태료로 업로드하세요.'
        : '업무가 없습니다. «업무 생성» 버튼으로 등록하세요.'}
      cols={cols}
      rows={rows}
      mobileCard={(r) => ({
        co: r.company,
        badge: r.status,
        badgeTone: workStatusTone(r.status),
        rail: r.status === '미배정' || workDueSignal(r.dueDate, r.status, TODAY).state === '기한경과' ? 'danger' : 'none',
        plate: r.plate || undefined,
        name: r.plate ? undefined : (r.target || r.title),
        carType: r.plate ? (r.customerName || r.carName) : r.carName,
        fields: [
          ['업무분류', r.kind || r.group],
          ['일정', r.dueDate
            ? `${r.dueDate}${workDueSignal(r.dueDate, r.status, TODAY).label ? ` · ${workDueSignal(r.dueDate, r.status, TODAY).label}` : ''}`
            : r.workDate || LEDGER_EMPTY.dash],
          ['담당', r.assignee || LEDGER_EMPTY.unassigned],
        ],
        right: r.amount > 0 ? won(r.amount) : undefined,
      })}
      rowKey={(r) => r.id}
      selectedRowKey={selected?.id}
      onView={xl.onView}
      onRowContextMenu={(e) => {
        e.preventDefault();
        setCtxMenu({ open: true, x: e.clientX, y: e.clientY });
      }}
      onRowDoubleClick={(row) => {
        setCreating(false);
        setEditing(false);
        setSelected(row);
      }}
      onCloseDetail={() => { setSelected(null); setEditing(false); }}
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
              sectionTitle: '고지서 업로드',
              message: '고지서 파일을 올리면 OCR로 위반일시·차량을 읽어 계약(임차인)을 자동 매칭합니다. 등록 후 과태료 목록에 반영됩니다.',
              render: ({ companyId: co }) => (
                <PenaltyIntakePanel
                  companyId={co}
                  onDone={() => {
                    setCreating(false);
                    setGroupAndUrl('과태료');
                    reload();
                  }}
                />
              ),
            },
          }}
          onKindChange={(kind) => {
            // 목록 탭만 맞춤 · 생성 패널은 열어 둔 채 업로드 섹션이 펼쳐지게.
            if (kind === '과태료') setGroupAndUrl('과태료', { keepCreating: true });
          }}
          quick
          continuable
          initial={{
            date: todayKST(),
            status: '미배정',
            category: '',
            workType: '',
            title: '',
          }}
          onClose={() => setCreating(false)}
          onSaved={() => reload()}
        />
      ) : selected && editing && (selected.source === 'work_item' || selected.source === 'inbox') ? (
        <LedgerEditPanel
          key={`edit-${selected.source}:${selected.id}`}
          entityKey={selected.source === 'inbox' ? 'inbox' : 'work_item'}
          title={selected.title || '업무'}
          sections={selected.source === 'inbox' ? [
            { title: '담당·기한', fields: ['assignee', 'dueDate'], open: true },
            { title: '확인 메모', fields: ['note'] },
          ] : workSectionsFor(selected.kind)}
          sectionsByKind={selected.source === 'inbox' ? undefined : WORK_SECTIONS_BY_KIND}
          kindField={selected.source === 'inbox' ? 'kind' : 'category'}
          fallbackKind={selected.source === 'inbox' ? '문서' : '기타'}
          record={selected.raw}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); setSelected(null); reload(); }}
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
            : selected.source === 'inbox'
              ? `수집 문서 · ${selected.assignee || LEDGER_EMPTY.unassigned}`
            : `${selected.plate || LEDGER_EMPTY.unassigned} · ${selected.customerName || LEDGER_EMPTY.none}`}
          statusBadge={<Badge tone={workStatusTone(selected.status)}>{selected.status}</Badge>}
          row={selected}
          cols={selected.source === 'penalty' ? PENALTY_ALL_COLS : WORK_ALL_COLS}
          sections={selected.source === 'penalty'
            ? PENALTY_DETAIL_SECTIONS
            : selected.source === 'inbox' ? INBOX_DETAIL_SECTIONS : workDetailSectionsFor(selected.kind)}
          onClose={() => setSelected(null)}
          actions={(
            <>
              {selected.source === 'work_item' ? (
                <Btn size="sm" onClick={() => setEditing(true)}><Pencil size={14} /> 이어서 수정</Btn>
              ) : null}
              {/* 자동 제안 — 여기서 처음으로 실제 업무가 된다. 맡기거나, 미루거나 둘 뿐이다. */}
              {selected.source === 'agenda' ? (
                <>
                  <Btn
                    size="sm"
                    variant="solid"
                    disabled={busy}
                    onClick={() => { void materialize(selected, { status: '대기' }, '업무로 등록됨'); }}
                  ><UserPlus size={14} /> 업무로 맡기</Btn>
                  <Btn
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => { void materialize(selected, { status: '보류', snoozeUntil: snoozeDate(TODAY, 7) }, '7일 뒤에 다시 보입니다'); }}
                  ><Clock size={14} /> 7일 뒤에</Btn>
                </>
              ) : null}
              {selected.autoFlag === '기한변경' && selected.nextDue ? (
                <Btn size="sm" variant="solid" disabled={busy} onClick={() => { void applyReschedule(selected); }}>
                  <CalendarClock size={14} /> 기한 {selected.nextDue} 반영
                </Btn>
              ) : null}
              {selected.autoFlag === '근거소멸' ? (
                <Btn size="sm" disabled={busy} onClick={() => { void closeVanished(selected); }}>
                  <X size={14} /> 근거 해소 — 종결
                </Btn>
              ) : null}
              {selected.source === 'inbox' ? (
                <>
                  <Btn size="sm" href={`/inbox?open=${encodeURIComponent(String(selected.raw._key || selected.raw.id || ''))}`}>
                    <FileText size={14} /> 확인·매칭
                  </Btn>
                  <Btn size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil size={14} /> 담당·기한</Btn>
                </>
              ) : null}
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
    <ContextMenu
      open={ctxMenu.open}
      x={ctxMenu.x}
      y={ctxMenu.y}
      onClose={() => setCtxMenu((m) => ({ ...m, open: false }))}
      items={ctxItems}
    />
    </>
  );
}

export default function WorkLedgerPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <WorkLedgerInner />
    </Suspense>
  );
}
