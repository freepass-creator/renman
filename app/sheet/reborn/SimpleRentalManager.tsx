'use client';

import {
  AlertTriangle,
  CarFront,
  ChevronRight,
  ListFilter,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { companyLabel, RENTAL_COMPANY_IDS } from '@/lib/companies';
import { TODAY } from '@/lib/dashboard-consts';
import { buildHomePendingRows, buildHomeRiskRows, buildHomeUpcomingRows, hrefForTodayRow, type HomeQueueRow } from '@/lib/home-rows';
import type { EntityRecord } from '@/lib/intake/entities';
import { normPlate } from '@/lib/plate';
import {
  safeEvidenceHref,
  taskCategoryOf,
  taskDueLabel,
  taskOwnerOf,
  taskPriorityLabel,
  taskPriorityOf,
  type TaskCategory,
  type TaskOwner,
  type TaskPriority,
} from '@/lib/reborn/task-model';
import { buildFileDrivenWorkflowTasks } from '@/lib/reborn/workflow-tasks';
import { useDashboardData } from '@/lib/use-dashboard-data';
import { buildWorkItemLedgerRows, workDueSignal } from '@/lib/work-ledger';
import { SheetButton, SheetSelect } from '@/components/ui/sheet-controls';
import RebornHeader from './_components/RebornHeader';
import styles from './simple.module.css';

type TodoFilter = 'all' | 'company' | 'customer';
type TodoCategoryFilter = 'all' | TaskCategory;
type TodoSort = 'urgency' | 'assignee' | 'category';
type TodoItem = {
  id: string;
  owner: TaskOwner;
  category: TaskCategory;
  priority: TaskPriority;
  companyId?: string;
  plate: string;
  title: string;
  detail: string;
  action: string;
  kind: string;
  status: string;
  assignee: string;
  dueDate: string;
  dday: number | null;
  amount: number;
  href?: string;
  evidenceHref?: string;
  evidenceLabel?: string;
};
type SearchRow = {
  vehicle: EntityRecord;
  contract: EntityRecord | null;
  plate: string;
  state: string;
  debt: number;
  debtCount: number;
  overdueDays: number;
};

const TODO_CATEGORY_OPTIONS: Array<{ key: TodoCategoryFilter; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'collection', label: '미수·수납' },
  { key: 'contract', label: '계약·보험' },
  { key: 'vehicle', label: '차량' },
  { key: 'document', label: '자료' },
  { key: 'finance', label: '자금' },
  { key: 'other', label: '기타' },
];

const TODO_CATEGORY_LABEL: Record<TaskCategory, string> = {
  collection: '미수',
  contract: '계약',
  vehicle: '차량',
  document: '자료',
  finance: '자금',
  other: '기타',
};

const won = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });

function text(value: unknown, fallback = '—'): string {
  const resolved = String(value ?? '').trim();
  return resolved || fallback;
}

function money(value: unknown): string {
  return `${won.format(Number(value) || 0)}원`;
}

function compactMoney(value: unknown): string {
  const amount = Number(value) || 0;
  if (Math.abs(amount) >= 100_000_000) return `${(amount / 100_000_000).toFixed(amount % 100_000_000 ? 1 : 0)}억`;
  if (Math.abs(amount) >= 10_000) return `${Math.round(amount / 10_000).toLocaleString('ko-KR')}만`;
  return money(amount);
}

function daysSince(value: unknown): number | null {
  const raw = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const elapsed = new Date(`${TODAY}T00:00:00`).getTime() - new Date(`${raw}T00:00:00`).getTime();
  return Math.max(0, Math.floor(elapsed / 86_400_000));
}

function matches(values: unknown[], query: string): boolean {
  const needle = query.replace(/\s/g, '').toLowerCase();
  return values.some((value) => String(value ?? '').replace(/\s/g, '').toLowerCase().includes(needle));
}

function todoAction(owner: TaskOwner, source: string): string {
  if (owner === 'customer') {
    if (/미수|미납/.test(source)) return '납부 요청';
    if (/검사/.test(source)) return '검사 요청';
    if (/반납/.test(source)) return '반납 요청';
    return '이행 요청';
  }
  if (/서류|첨부|등록증/.test(source)) return '자료 요청';
  if (/자금|미분류|미매칭/.test(source)) return '매칭 확인';
  return '확인';
}

function todoActionLabel(item: TodoItem): string {
  const action = item.action.trim();
  if (action && !['확인', '이행 요청'].includes(action)) return action;
  if (item.category === 'collection') return item.owner === 'customer' ? '납부 이행 확인' : '수납 확인';
  if (item.category === 'contract') return '계약·보험 확인';
  if (item.category === 'vehicle') return item.owner === 'customer' ? '차량 이행 확인' : '차량 상태 확인';
  if (item.category === 'document') return '누락 자료 확인';
  if (item.category === 'finance') return '자금 연결 확인';
  return '업무 확인';
}

function queueStatus(row: HomeQueueRow): string {
  if (row.dday != null && row.dday < 0) return /미수|미납/.test(row.kind) ? '연체' : '기한경과';
  if (row.dday === 0) return '오늘';
  if (row.dday != null && row.dday <= 7) return '임박';
  if (/사고|충돌|위험/.test(`${row.kind} ${row.title}`)) return '긴급';
  return '확인필요';
}

function statusRank(status: string): number {
  if (/연체|기한경과|긴급|오류/.test(status)) return 0;
  if (/오늘|임박|확인필요|미배정/.test(status)) return 1;
  if (/진행/.test(status)) return 2;
  return 3;
}

export default function SimpleRentalManager() {
  const { D, bankTx, contracts, vehicles, inbox, workItems, loading, error } = useDashboardData(RENTAL_COMPANY_IDS);
  const [query, setQuery] = useState('');
  const [todoFilter, setTodoFilter] = useState<TodoFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<TodoCategoryFilter>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [todoSort, setTodoSort] = useState<TodoSort>('urgency');
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    if (!filterOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFilterOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [filterOpen]);

  const todos = useMemo<TodoItem[]>(() => {
    const items = new Map<string, TodoItem>();
    const sourceRows = [...buildHomePendingRows(D), ...buildHomeRiskRows(D), ...buildHomeUpcomingRows(D)];
    sourceRows.forEach((row, index) => {
      if (items.has(row.id)) return;
      const owner = taskOwnerOf(row);
      const plate = normPlate(row.plate);
      const source = `${row.kind} ${row.title} ${row.detail}`;
      items.set(row.id, {
        id: row.id || `todo:${index}`,
        owner,
        category: taskCategoryOf(row),
        priority: taskPriorityOf(row),
        companyId: row.companyId,
        plate,
        title: plate ? `${plate} · ${row.title}` : row.title,
        detail: [row.kind, row.detail, row.amount ? compactMoney(row.amount) : ''].filter(Boolean).join(' · '),
        action: todoAction(owner, source),
        kind: row.kind,
        status: queueStatus(row),
        assignee: '',
        dueDate: '',
        dday: row.dday,
        amount: row.amount,
        href: /서류|첨부|등록증/.test(source) ? '/ingest' : /자금|미분류|미매칭/.test(source) ? '/payments' : undefined,
        evidenceHref: safeEvidenceHref(hrefForTodayRow(row)),
        evidenceLabel: '근거',
      });
    });
    buildFileDrivenWorkflowTasks({ contracts, vehicles, inbox, today: TODAY }).forEach((task) => {
      if (task.id.startsWith('contract-vehicle-missing:')) return; // 동일 차량의 서류미첨부 큐가 이미 더 구체적으로 존재한다.
      items.set(task.id, {
        id: task.id,
        owner: 'company',
        category: task.category,
        priority: task.priority,
        companyId: task.companyId,
        plate: task.plate,
        title: task.title,
        detail: task.detail,
        action: task.action,
        kind: task.category,
        status: /오류|확인필요/.test(task.detail) || task.priority === 1 ? '확인필요' : /분석중|처리중/.test(task.detail) ? '진행' : '대기',
        assignee: '',
        dueDate: '',
        dday: null,
        amount: 0,
        href: task.href,
        evidenceHref: safeEvidenceHref(task.evidenceHref || task.href),
        evidenceLabel: task.evidenceHref ? '원문' : '근거',
      });
    });
    if (!bankTx.some((tx) => text(tx.txDate, '').slice(0, 7) === TODAY.slice(0, 7))) {
      items.set(`finance:${TODAY.slice(0, 7)}`, {
        id: `finance:${TODAY.slice(0, 7)}`,
        owner: 'company',
        category: 'finance',
        priority: 1,
        plate: '',
        title: `${TODAY.slice(0, 7)} 자금자료 확인`,
        detail: '당월 입출금내역이 아직 없습니다.',
        action: '자료올리기',
        kind: '자금자료',
        status: '확인필요',
        assignee: '',
        dueDate: '',
        dday: null,
        amount: 0,
        href: '/ingest',
        evidenceHref: '/ingest',
        evidenceLabel: '자료',
      });
    }
    D.idleCars.forEach(({ v }, index) => {
      const plate = normPlate(v.plate);
      const idleDays = daysSince(v.idleSince || v.statusChangedAt || v.updatedAt);
      items.set(`idle:${text(v._key || v.id, plate || String(index))}:${index}`, {
        id: `idle:${text(v._key || v.id, plate || String(index))}:${index}`,
        owner: 'company',
        category: 'vehicle',
        priority: idleDays != null && idleDays >= 14 ? 2 : 3,
        companyId: text(v.companyId, ''),
        plate,
        title: `${plate || '차량번호 미확인'} · ${text(v.carName, '차종 미확인')}`,
        detail: idleDays == null ? '휴차 시작일 확인 필요' : `${idleDays}일째 운행 없음`,
        action: '배차 확인',
        kind: '휴차',
        status: idleDays != null && idleDays >= 14 ? '장기휴차' : '대기',
        assignee: '',
        dueDate: '',
        dday: null,
        amount: 0,
        evidenceHref: plate ? `/sheet/reborn/vehicle/${encodeURIComponent(plate)}${v.companyId ? `?company=${encodeURIComponent(String(v.companyId))}` : ''}` : undefined,
        evidenceLabel: '차량',
      });
    });
    buildWorkItemLedgerRows(workItems, contracts, vehicles)
      .filter((row) => !['완료', '보류'].includes(String(row.status)))
      .forEach((row) => {
        const source = `${row.group} ${row.kind} ${row.title}`;
        const due = workDueSignal(row.dueDate, row.status, TODAY);
        const signal = { kind: row.kind, title: row.title, detail: source, dday: due.days, amount: row.amount };
        const owner = taskOwnerOf(signal);
        const category = taskCategoryOf(signal);
        const explicitPriority: TaskPriority = due.state === '기한경과' || row.priority === '긴급' || row.priority === '높음' ? 1 : due.state === '오늘' || due.state === '임박' || row.status === '미배정' ? 2 : 3;
        const priority = Math.min(explicitPriority, taskPriorityOf(signal)) as TaskPriority;
        items.set(row.id, {
          id: row.id,
          owner,
          category,
          priority,
          companyId: row.companyId,
          plate: normPlate(row.plate),
          title: [row.plate, row.customerName, row.carName].filter(Boolean).join(' · ') || row.target || '대상 미연결',
          detail: [row.title, row.dueDate ? `기한 ${row.dueDate}` : ''].filter(Boolean).join(' · '),
          action: row.kind && row.kind !== '미분류' ? `${row.kind} 처리` : '업무 확인',
          kind: row.kind,
          status: due.state === '기한경과' ? '기한경과' : due.state === '오늘' ? '오늘' : due.state === '임박' ? '임박' : String(row.status || '대기'),
          assignee: row.assignee,
          dueDate: row.dueDate,
          dday: due.days,
          amount: row.amount,
          href: row.plate ? undefined : '/work',
          evidenceHref: `/work?open=${encodeURIComponent(row.id)}`,
          evidenceLabel: '업무',
        });
      });
    return [...items.values()].sort((left, right) => left.priority - right.priority || left.owner.localeCompare(right.owner));
  }, [D, bankTx, contracts, inbox, vehicles, workItems]);

  const visibleTodos = useMemo(() => {
    const scoped = todos.filter((item) =>
      (todoFilter === 'all' || item.owner === todoFilter)
      && (categoryFilter === 'all' || item.category === categoryFilter)
      && (statusFilter === 'all' || item.status === statusFilter)
      && (assigneeFilter === 'all' || (assigneeFilter === 'unassigned' ? !item.assignee : item.assignee === assigneeFilter)));
    return scoped.sort((left, right) => {
      if (todoSort === 'assignee') return (left.assignee || '힣').localeCompare(right.assignee || '힣', 'ko') || left.priority - right.priority;
      if (todoSort === 'category') return TODO_CATEGORY_LABEL[left.category].localeCompare(TODO_CATEGORY_LABEL[right.category], 'ko') || left.priority - right.priority;
      return left.priority - right.priority
        || statusRank(left.status) - statusRank(right.status)
        || (left.dday ?? 9999) - (right.dday ?? 9999)
        || right.amount - left.amount;
    });
  }, [assigneeFilter, categoryFilter, statusFilter, todoFilter, todoSort, todos]);

  const searchedTodos = useMemo(() => {
    if (!query.trim()) return visibleTodos;
    return visibleTodos.filter((item) => matches([item.kind, item.status, item.action, item.title, item.detail, item.assignee, TODO_CATEGORY_LABEL[item.category]], query));
  }, [query, visibleTodos]);

  const searchRows = useMemo<SearchRow[]>(() => {
    if (!query.trim()) return [];
    const running = new Set(D.running.map(({ v }) => normPlate(v.plate)));
    const idle = new Set(D.idleCars.map(({ v }) => normPlate(v.plate)));
    const sold = new Set(D.soldRows.map(({ v }) => normPlate(v.plate)));
    return D.rows.flatMap(({ v, av }) => {
      const plate = normPlate(v.plate);
      if (!matches([
        plate,
        v.carName,
        v.vin,
        av?.rec.contractNo,
        av?.rec.contractorName,
        av?.rec.contractorPhone,
      ], query)) return [];
      return [{
        vehicle: v,
        contract: av?.rec || null,
        plate,
        state: sold.has(plate) ? '매각 완료' : running.has(plate) ? '운행' : idle.has(plate) ? '휴차' : '확인 필요',
        debt: Math.max(0, Number(av?.net) || 0),
        debtCount: Number(av?.count) || 0,
        overdueDays: Number(av?.overdueDays) || 0,
      }];
    });
  }, [D.idleCars, D.rows, D.running, D.soldRows, query]);

  function openTodo(item: TodoItem) {
    if (item.plate) {
      const company = item.companyId ? `?company=${encodeURIComponent(item.companyId)}` : '';
      window.location.assign(`/sheet/reborn/vehicle/${encodeURIComponent(item.plate)}${company}`);
      return;
    }
    if (item.href) window.location.assign(item.href);
  }

  const todoCounts = useMemo(() => {
    const owners = { company: 0, customer: 0 };
    const categories: Record<TaskCategory, number> = { collection: 0, contract: 0, vehicle: 0, document: 0, finance: 0, other: 0 };
    const assignees = new Map<string, number>();
    const statuses = new Map<string, number>();
    todos.forEach((item) => {
      owners[item.owner] += 1;
      categories[item.category] += 1;
      const assignee = item.assignee || '미배정';
      assignees.set(assignee, (assignees.get(assignee) || 0) + 1);
      statuses.set(item.status, (statuses.get(item.status) || 0) + 1);
    });
    return { owners, categories, assignees, statuses };
  }, [todos]);
  const assigneeOptions = useMemo(() => [...todoCounts.assignees.keys()].sort((left, right) => left === '미배정' ? 1 : right === '미배정' ? -1 : left.localeCompare(right, 'ko')), [todoCounts.assignees]);
  const statusOptions = useMemo(() => [...todoCounts.statuses.keys()].sort((left, right) => statusRank(left) - statusRank(right) || left.localeCompare(right, 'ko')), [todoCounts.statuses]);
  const companyTodoCount = todoCounts.owners.company;
  const customerTodoCount = todoCounts.owners.customer;
  const activeFilterCount = Number(todoFilter !== 'all') + Number(categoryFilter !== 'all') + Number(statusFilter !== 'all') + Number(assigneeFilter !== 'all');
  const collectionSummary = useMemo(() => {
    const month = TODAY.slice(0, 7);
    const activeKeys = new Set(D.rows.flatMap(({ av }) => av ? [text(av.rec._key || av.rec.contractNo)] : []));
    const contracts = new Map<string, EntityRecord>();
    D.rows.forEach(({ av }) => {
      if (av) contracts.set(text(av.rec._key || av.rec.contractNo), av.rec);
    });
    D.overduePay.forEach(({ rec }) => contracts.set(text(rec._key || rec.contractNo), rec));

    let currentCharge = 0;
    let schedulePaid = 0;
    contracts.forEach((rec, key) => {
      const ledger = Array.isArray(rec.ledger) ? rec.ledger as EntityRecord[] : [];
      const monthRows = ledger.filter((entry) => text(entry.month, '').slice(0, 7) === month);
      if (monthRows.length) {
        currentCharge += monthRows.reduce((sum, entry) => sum + (Number(entry.charged) || Number(entry.amount) || 0), 0);
        schedulePaid += monthRows.reduce((sum, entry) => sum + (Number(entry.paid) || Number(entry.paidAmount) || 0), 0);
        return;
      }
      if (activeKeys.has(key)) currentCharge += Number(rec.monthlyRent) || 0;
      const payments = Array.isArray(rec._payments) ? rec._payments as EntityRecord[] : [];
      schedulePaid += payments
        .filter((payment) => text(payment.date, '').slice(0, 7) === month)
        .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
    });

    const monthBankTx = bankTx.filter((tx) => text(tx.txDate, '').slice(0, 7) === month);
    const bankPaid = monthBankTx
      .filter((tx) => (Number(tx.amount) || 0) > 0 && (!!tx.matchedContractId || !!tx.matchedScheduleSeq || /대여료|렌탈료|렌트료|CMS성공/.test(text(tx.category, ''))))
      .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
    const currentPaid = Math.max(schedulePaid, bankPaid);
    const balance = Math.max(0, Number(D.summary.misuTotal) || 0);
    const carry = Math.max(0, balance + currentPaid - currentCharge);
    const receivable = carry + currentCharge;
    const rate = receivable > 0 ? Math.round((balance / receivable) * 1_000) / 10 : 0;
    return { carry, currentCharge, currentPaid, balance, rate, hasData: monthBankTx.length > 0 };
  }, [D.overduePay, D.rows, D.summary.misuTotal, bankTx]);

  return <div className={styles.app}>
    <RebornHeader active="work" />

    <main className={styles.main}>
      <section className={styles.hero}>
        <div className={styles.toolbar}>
          <label className={styles.search}>
            <Search size={20} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="차량번호, 고객, 계약번호 검색" aria-label="업무 통합 검색" />
            {query ? <SheetButton onClick={() => setQuery('')} aria-label="검색어 지우기"><X size={18} /></SheetButton> : null}
          </label>
          <div className={styles.metricChips} aria-label="운영 요약">
            <span className={styles.metricChip}><small>전체</small><strong>{todos.length}건</strong></span>
            <span className={styles.metricChip} title={`운행 ${D.summary.running}대 · 전체 ${D.summary.held}대 · 휴차 ${D.summary.idle}대`}><small>가동률</small><strong>{D.summary.util}%</strong></span>
            <span className={`${styles.metricChip} ${collectionSummary.balance > 0 ? styles.metricChipDanger : ''}`} title={collectionSummary.hasData ? `미수율 ${collectionSummary.rate}% · 당월 수금 ${compactMoney(collectionSummary.currentPaid)}` : '수금자료 확인 필요'}><small>미수</small><strong>{compactMoney(collectionSummary.balance)}</strong></span>
          </div>
          <div className={styles.filterWrap}>
            <SheetButton className={`${styles.filterToggle} ${activeFilterCount ? styles.filterToggleActive : ''}`} onClick={() => setFilterOpen((open) => !open)} aria-expanded={filterOpen} aria-controls="work-filter-panel">
              <ListFilter size={17} />필터{activeFilterCount ? <b>{activeFilterCount}</b> : null}
            </SheetButton>
            {filterOpen ? <div className={styles.filterPopover} id="work-filter-panel" role="dialog" aria-label="업무 필터와 정렬">
              <div className={styles.filterPopoverHead}><strong>필터·정렬</strong><SheetButton onClick={() => { setTodoFilter('all'); setCategoryFilter('all'); setStatusFilter('all'); setAssigneeFilter('all'); setTodoSort('urgency'); }}>초기화</SheetButton></div>
              <div className={styles.filterGroup}>
                <span>책임 구분</span>
                <div className={styles.todoFilters}>
                  <TodoFilterButton active={todoFilter === 'all'} label="전체" count={todos.length} onClick={() => setTodoFilter('all')} />
                  <TodoFilterButton active={todoFilter === 'company'} label="우리 처리" count={companyTodoCount} onClick={() => setTodoFilter('company')} />
                  <TodoFilterButton active={todoFilter === 'customer'} label="고객 이행" count={customerTodoCount} onClick={() => setTodoFilter('customer')} />
                </div>
              </div>
              <div className={styles.filterGroup}>
                <span>업무 종류</span>
                <div className={styles.categoryFilters}>
                  {TODO_CATEGORY_OPTIONS.map((option) => <SheetButton key={option.key} className={categoryFilter === option.key ? styles.categoryFilterActive : undefined} onClick={() => setCategoryFilter(option.key)}>{option.label}<small>{option.key === 'all' ? todos.length : todoCounts.categories[option.key]}</small></SheetButton>)}
                </div>
              </div>
              <div className={styles.filterSelectGrid}>
                <label><span>상태</span><SheetSelect value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">상태 전체</option>{statusOptions.map((status) => <option key={status} value={status}>{status} ({todoCounts.statuses.get(status) || 0})</option>)}</SheetSelect></label>
                <label><span>담당자</span><SheetSelect value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}><option value="all">담당자 전체</option>{assigneeOptions.map((assignee) => <option key={assignee} value={assignee === '미배정' ? 'unassigned' : assignee}>{assignee} ({todoCounts.assignees.get(assignee) || 0})</option>)}</SheetSelect></label>
                <label><span>정렬</span><SheetSelect value={todoSort} onChange={(event) => setTodoSort(event.target.value as TodoSort)}><option value="urgency">긴급순</option><option value="assignee">담당자순</option><option value="category">분류순</option></SheetSelect></label>
              </div>
            </div> : null}
          </div>
        </div>
      </section>

      {loading ? <div className={styles.stateMessage}><Loader2 size={19} className={styles.spin} />불러오는 중</div> : null}
      {!loading && error ? <div className={styles.error}><AlertTriangle size={18} />{error}</div> : null}

      {!loading && !error && !query.trim() ? <section className={styles.todoSection}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}><h1>처리할 업무</h1><span>{visibleTodos.length}건</span></div>
        </div>
        <TodoTable items={visibleTodos} onOpen={openTodo} />
      </section> : null}

      {!loading && !error && query.trim() ? <section className={styles.results}>
        <div className={styles.sectionTitle}><h1>검색 결과</h1><span>업무 {searchedTodos.length}건 · 차량 {searchRows.length}대</span></div>
        {searchedTodos.length ? <TodoTable items={searchedTodos} onOpen={openTodo} /> : null}
        {searchRows.length ? <div className={styles.resultSubTitle}>차량 정보</div> : null}
        {searchRows.length ? <div className={styles.resultList}>
          {searchRows.map((row, index) => {
            const company = text(row.vehicle.companyId, '');
            const href = `/sheet/reborn/vehicle/${encodeURIComponent(row.plate)}${company ? `?company=${encodeURIComponent(company)}` : ''}`;
            return <div key={`${row.plate}:${index}`} className={styles.resultGroup}>
              <Link className={styles.resultRow} href={href}>
                <span className={styles.vehicleIcon}><CarFront size={19} /></span>
                <span className={styles.resultMain}><strong>{row.plate}</strong><small>{text(row.vehicle.carName, '차종 미확인')} · {companyLabel(row.vehicle.companyId || '')}</small></span>
                <span className={styles.resultContract}><strong>{text(row.contract?.contractorName, '활성 계약 없음')}</strong><small>{text(row.contract?.contractNo)}</small></span>
                <span className={styles.resultStatus}><strong>{row.state}</strong><small>{row.debt > 0 ? `${row.debtCount || 1}건 · ${compactMoney(row.debt)}` : '미수 없음'}</small></span>
                <ChevronRight size={17} />
              </Link>
            </div>;
          })}
        </div> : null}
        {!searchedTodos.length && !searchRows.length ? <div className={styles.empty}>검색 결과가 없습니다.</div> : null}
      </section> : null}
    </main>
  </div>;
}

function TodoFilterButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return <SheetButton className={`${styles.todoFilter} ${active ? styles.todoFilterActive : ''}`} onClick={onClick}><span>{label}</span><strong>{count}건</strong></SheetButton>;
}

function TodoTable({ items, onOpen }: { items: TodoItem[]; onOpen: (item: TodoItem) => void }) {
  return <div className={styles.todoList}>
    <div className={styles.todoHead} aria-hidden="true"><span>우선</span><span>구분</span><span>상태</span><span>처리할 일</span><span>대상</span><span>문제·기한</span><span>담당자</span><span>근거</span></div>
    {items.map((item) => {
      const evidenceHref = safeEvidenceHref(item.evidenceHref);
      const dueLabel = taskDueLabel(item.dueDate, item.dday);
      return <div key={item.id} className={styles.todoRow}>
        <SheetButton className={styles.todoRowMain} onClick={() => onOpen(item)} disabled={!item.plate && !item.href} aria-label={`${todoActionLabel(item)} · ${item.title}`}>
          <span className={`${styles.todoPriority} ${item.priority === 1 ? styles.todoPriorityHigh : item.priority === 2 ? styles.todoPriorityMedium : ''}`}>{taskPriorityLabel(item.priority)}</span>
          <span className={`${styles.todoType} ${item.owner === 'customer' ? styles.todoTypeCustomer : ''}`}>{item.owner === 'company' ? '우리' : '고객'}·{TODO_CATEGORY_LABEL[item.category]}</span>
          <span className={`${styles.todoStatus} ${/연체|기한경과|긴급|오류/.test(item.status) ? styles.todoStatusDanger : /오늘|임박|확인필요|미배정/.test(item.status) ? styles.todoStatusWarning : /진행/.test(item.status) ? styles.todoStatusProgress : ''}`}>{item.status}</span>
          <span className={styles.todoTask}><strong>{todoActionLabel(item)}</strong></span>
          <span className={styles.todoTarget}><strong>{item.title}</strong></span>
          <span className={styles.todoDetail}><span>{item.detail}</span>{dueLabel ? <small>{dueLabel}</small> : null}</span>
          <span className={`${styles.todoAssignee} ${item.assignee ? '' : styles.todoAssigneeEmpty}`}>{item.assignee || '미배정'}</span>
        </SheetButton>
        {evidenceHref ? evidenceHref.startsWith('/')
          ? <Link className={styles.todoEvidence} href={evidenceHref}>{item.evidenceLabel || '보기'}</Link>
          : <a className={styles.todoEvidence} href={evidenceHref} target="_blank" rel="noreferrer">{item.evidenceLabel || '원문'}</a>
          : <span className={styles.todoEvidenceEmpty}>—</span>}
      </div>;
    })}
    {!items.length ? <div className={styles.empty}>조건에 맞는 업무가 없습니다.</div> : null}
  </div>;
}
