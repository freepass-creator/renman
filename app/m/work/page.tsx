'use client';
/** 모바일 업무관리 — work_item 실행 목록. 웹의 원장 행 변환·상태·기한 규칙을 그대로 공유한다. */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { MHead } from '@/components/m/MHead';
import { C, EmptyState, ErrorState, IconBtn, ObjRow, PageLoading, PillTabs, Rows, Search } from '@/components/ui';
import { useEntityLists } from '@/lib/use-entity-lists';
import { textMatch } from '@/lib/search-match';
import { todayKST } from '@/lib/contracts/dates';
import { buildDirectiveLedgerRows, buildWorkItemLedgerRows, workAttentionRank, workDueSignal, workStatusTone, type WorkLedgerRow } from '@/lib/work-ledger';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';
import { buildAgenda } from '@/lib/agenda';
import { isSnoozed, reconcileDirectives } from '@/lib/directives';
import { commitSave } from '@/lib/commit';
import { useSession } from '@/lib/session';
import { NEED_COMPANY } from '@/lib/scope';
import { toast } from '@/lib/toast';
import type { EntityRecord } from '@/lib/intake/entities';

type View = '할 일' | '미배정' | '완료' | '전체';

export default function MWork() {
  const router = useRouter();
  const { companyId } = useSession();
  const [view, setView] = useState<View>('할 일');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: [items = [], contracts = [], vehicles = [], insurances = [], penalties = []], loading, error, reload } =
    useEntityLists(['work_item', 'contract', 'vehicle', 'insurance', 'penalty']);
  const today = todayKST();
  /** 웹과 같은 지시 엔진 — 자동 제안도 폰에서 보인다. 스누즈한 건 접어 둔다(모바일엔 펼치기 토글 없음). */
  const directives = useMemo(
    () => reconcileDirectives(buildAgenda(contracts, vehicles, insurances, penalties), items),
    [contracts, vehicles, insurances, penalties, items],
  );
  const allRows = useMemo(
    () => [
      ...buildWorkItemLedgerRows(items, contracts, vehicles).filter((r) => !isSnoozed(r.raw, today)),
      ...buildDirectiveLedgerRows(directives.proposals, contracts, vehicles, today),
    ],
    [items, contracts, vehicles, directives, today],
  );

  /** 제안을 누르면 그 자리에서 내 일이 된다 — 폰에서는 「맡기」가 곧 여는 동작이다. */
  const takeOn = async (row: WorkLedgerRow) => {
    if (busy) return;
    setBusy(true);
    try {
      const rec: EntityRecord = { ...row.raw, status: '대기' };
      await commitSave({ entity: 'work_item', sessionCompanyId: companyId, rec, records: [rec] });
      reload();
      toast('업무로 등록됨', 'success');
    } catch (e) {
      toast((e as Error).message || NEED_COMPANY, 'error');
    } finally {
      setBusy(false);
    }
  };
  const rows = useMemo(() => allRows
    .filter((row) => {
      if (view === '할 일') return row.status !== '완료';
      if (view === '미배정') return row.status === '미배정';
      if (view === '완료') return row.status === '완료';
      return true;
    })
    .filter((row) => textMatch(query, row.title, row.kind, row.status, row.target, row.assignee))
    .sort((a, b) => workAttentionRank(a, today) - workAttentionRank(b, today)
      || a.dueDate.localeCompare(b.dueDate)
      || b.createdAt.localeCompare(a.createdAt)), [allRows, query, today, view]);

  const openCount = allRows.filter((row) => row.status !== '완료').length;
  const unassigned = allRows.filter((row) => row.status === '미배정').length;

  return (
    <>
      <MHead
        title="업무"
        sub={`할 일 ${openCount} · 미배정 ${unassigned}`}
        color={C.warn}
        right={<IconBtn title="업무 생성" onClick={() => router.push('/m/work/new')}><Plus size={18} /></IconBtn>}
      />
      <div style={{ padding: '12px 14px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Search
          size="sm"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="업무 · 차번 · 계약자 검색"
          style={{ width: '100%' }}
        />
        <PillTabs<View>
          size="sm"
          value={view}
          onChange={setView}
          tabs={(['할 일', '미배정', '완료', '전체'] as const).map((key) => ({ key, label: key }))}
        />
        {loading ? <PageLoading />
          : error ? <ErrorState message={error} onRetry={reload} />
          : rows.length === 0 ? <EmptyState variant="sec">조건에 맞는 업무가 없습니다</EmptyState>
          : (
            <Rows title={view} tone={view === '완료' ? 'green' : view === '미배정' ? 'amber' : 'gray'} n={rows.length} id={`m-work-${view}`}>
              {rows.map((row) => {
                const due = workDueSignal(row.dueDate, row.status, today);
                const key = String(row.raw._key || row.raw.id || '');
                return (
                  <ObjRow
                    key={row.id}
                    co={row.companyId}
                    plate={row.plate || undefined}
                    name={row.plate ? undefined : row.title || LEDGER_EMPTY.dash}
                    badge={row.source === 'agenda' ? '자동' : row.status}
                    badgeTone={row.source === 'agenda' ? 'blue' : workStatusTone(row.status)}
                    meta={row.plate ? (row.title || LEDGER_EMPTY.dash) : row.kind}
                    fields={[
                      ['구분', row.kind],
                      ['기한', row.dueDate ? `${row.dueDate}${due.label ? ` · ${due.label}` : ''}` : '미지정'],
                      ['담당', row.source === 'agenda' ? '눌러서 맡기' : (row.assignee || LEDGER_EMPTY.unassigned)],
                    ]}
                    onClick={row.source === 'agenda'
                      ? () => { void takeOn(row); }
                      : key ? () => router.push(`/m/work/${encodeURIComponent(key)}`) : undefined}
                  />
                );
              })}
            </Rows>
          )}
      </div>
    </>
  );
}
