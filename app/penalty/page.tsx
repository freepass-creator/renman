'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import { type EntityRecord } from '@/lib/intake/entities';
import { matchPenalty } from '@/lib/penalty-match';
import { dueMatcher, selectedInDim } from '@/lib/lens-filters';
import { textMatch } from '@/lib/search-match';
import { dday } from '@/lib/dashboard-consts';
import { Sec, Cards, Metric, EmptyState, Btn, FacetPage, ObjCard, won, C, SPACE_M, PageLoading, useConfirm } from '@/components/ui';
import { FacetRail } from '@/components/FacetRail';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { WorkHubBack } from '@/components/WorkHubTabs';
import { companyLabel } from '@/lib/companies';
import { PenaltyUpload } from '@/components/PenaltyUpload';
import { PenaltyDocs } from '@/components/PenaltyDocs';
import { openCar, openCustomer } from '@/lib/ui-bus';
import { customerKey } from '@/lib/customers';
import { Check, UploadCloud, FileText, Trash2 } from 'lucide-react';
import { useEntityLists } from '@/lib/use-entity-lists';
import { commitRemove } from '@/lib/commit';
import { NEED_COMPANY } from '@/lib/scope';
import { toast } from '@/lib/toast';
import { useSecOrder } from '@/lib/use-sec-order';

type Row = { p: EntityRecord; renter: string | null; contractNo: string | null };
const PEN_SECS = ['penalty-status', 'penalty-unmatched', 'penalty-progress', 'penalty-done'] as const;

export default function PenaltyProcess() {
  const { companyId, scopeAll } = useSession();
  const router = useRouter();
  const { data: [pens = [], cons = []], loading, reload } = useEntityLists(['penalty', 'contract']);
  const confirm = useConfirm();
  const rows = useMemo(
    () => pens.map((p) => {
      const m = matchPenalty(p, cons);
      return { p, renter: m ? m.renter : null, contractNo: m ? String(m.contract.contractNo || '') : null };
    }),
    [pens, cons],
  );
  const [facets, setFacets] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [upload, setUpload] = useState(false);
  const [docs, setDocs] = useState(false);
  const [order, reorder] = useSecOrder('jpk:order:penalty', [...PEN_SECS]);
  const toggleFacet = (label: string) => setFacets((s) => { const n = new Set(s); n.has(label) ? n.delete(label) : n.add(label); return n; });
  const resetFacets = () => setFacets(new Set());
  const setF = (labels: string[]) => setFacets(new Set(labels));

  // 소프트삭제 — store.remove(deletedAt+사유). /trash 에서 복구. (ERP 30원칙 Soft delete·Audit)
  const del = async (r: Row) => {
    if (!(await confirm({ message: `이 과태료를 삭제할까요? (휴지통에서 복구 가능)\n${String(r.p.plate || '')} · ${won(r.p.amount)}`, danger: true }))) return;
    try {
      await commitRemove({ entity: 'penalty', sessionCompanyId: companyId, rec: r.p, key: String(r.p._key || ''), reason: '수기 삭제' });
      reload();
    } catch { toast(NEED_COMPANY, 'error'); }
  };

  const matched = rows.filter((r) => r.renter).length;
  const total = rows.reduce((s, r) => s + (Number(r.p.amount) || 0), 0);
  // 실운전자 × 처리상태 × 납부기한 (LENS_FILTERS['과태료'])
  const sel매칭 = facets.has('매칭');
  const sel미매칭 = facets.has('미매칭');
  const statusSel = selectedInDim('과태료', '처리', facets);
  const dueMatch = dueMatcher('과태료', facets);
  const shown = rows.filter((r) => {
    if ((sel매칭 || sel미매칭) && !((sel매칭 && !!r.renter) || (sel미매칭 && !r.renter))) return false;
    if (statusSel.length) {
      const st = String(r.p.reassignStatus || '접수');
      if (!statusSel.includes(st)) return false;
    }
    if (dueMatch && !dueMatch(dday(r.p.dueDate))) return false;
    return textMatch(q, r.p.plate, r.p.description, r.p.docType, r.renter, r.contractNo, r.p.violationDate);
  });

  // 칩별 매칭 건수(erp3식 '라벨(N)') — 전체 데이터 정적 집계. 필터 술어와 동일 기준.
  const counts: Record<string, number> = (() => {
    const c: Record<string, number> = { 매칭: 0, 미매칭: 0, 접수: 0, 임차인확인: 0, 변경부과신청: 0, 변경부과완료: 0, 종결: 0, 지남: 0, 오늘: 0, 내일: 0, 이번주: 0, 이번달: 0 };
    for (const r of rows) {
      if (r.renter) c['매칭']++; else c['미매칭']++;
      const st = String(r.p.reassignStatus || '접수'); if (c[st] != null) c[st]++;
      const dd = dday(r.p.dueDate);
      if (dd != null) { if (dd < 0) c['지남']++; else if (dd === 0) c['오늘']++; else if (dd === 1) c['내일']++; else if (dd <= 7) c['이번주']++; else if (dd <= 30) c['이번달']++; }
    }
    return c;
  })();

  const unmatched = shown.filter((r) => !r.renter);
  const done = shown.filter((r) => ['변경부과완료', '종결'].includes(String(r.p.reassignStatus || '')));
  const progress = shown.filter((r) => r.renter && !['변경부과완료', '종결'].includes(String(r.p.reassignStatus || '')));
  const openRow = (r: Row) => {
    if (r.p.plate) openCar(r.p.plate, 'inspect');
    else router.push(`/list/penalty/${encodeURIComponent(String(r.p._key || ''))}`);
  };
  const renderQueue = (list: Row[]) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_M }}>
      {list.map((r) => (
        <div key={String(r.p._key)} style={{ display: 'flex', flexDirection: 'column', gap: SPACE_M }}>
          <ObjCard
            badge={String(r.p.reassignStatus || '접수')}
            badgeTone={r.renter ? 'green' : 'amber'}
            co={scopeAll ? String(r.p.companyId || '') : undefined}
            plate={String(r.p.plate || '')}
            name={r.renter || '미매칭 · 회사 부담'}
            carType={String(r.p.description || r.p.docType || '')}
            fields={[
              ['위반일', String(r.p.violationDate || '—')],
              ['납기', String(r.p.dueDate || '—')],
              ...(r.contractNo ? [['계약', r.contractNo] as [string, string]] : []),
            ]}
            right={<span style={{ color: C.warn }}>{won(r.p.amount)}</span>}
            onClick={() => openRow(r)}
          />
          <div style={{ display: 'flex', gap: SPACE_M, flexWrap: 'wrap' }}>
            {r.renter ? <Btn size="sm" variant="ghost" onClick={() => openCustomer(customerKey(r.renter, ''))}><Check size={14} /> 손님</Btn> : null}
            <Btn size="sm" variant="ghost" onClick={() => del(r)}><Trash2 size={14} /> 삭제</Btn>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <FacetPage
      title="과태료관리"
      meta={`${scopeAll ? '전체 회사' : companyLabel(companyId)} · 과태료 ${rows.length}건 · 매칭 ${matched}/${rows.length}`}
      tools={
        <WorkbenchBar
          mid={<WorkHubBack />}
          search={{ value: q, onChange: setQ, placeholder: '차량·위반·책임자' }}
          stat={<span style={{ fontSize: 13, fontWeight: 800, color: C.warn, whiteSpace: 'nowrap' }}>총 {won(total)}</span>}
          actions={<>
            {matched > 0 && <Btn variant="ghost" onClick={() => setDocs(true)}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><FileText size={15} /> 변경부과 공문 ({matched})</span></Btn>}
            <Btn onClick={() => setUpload(true)}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><UploadCloud size={15} /> 고지서 등록 (OCR)</span></Btn>
          </>}
        />
      }
      rail={!loading ? <FacetRail lensKey="과태료" facets={facets} onToggle={toggleFacet} onReset={resetFacets} counts={counts} /> : null}
    >
      {loading ? <PageLoading /> : order.map((id) => {
        if (id === 'penalty-status') {
          return (
            <Sec key={id} id={id} title="현황" desc="고지서 → 임차인 매칭 → 변경부과" onReorder={reorder}>
              <Cards min={128} fit>
                <Metric label="과태료 건수" value={rows.length} onClick={resetFacets} />
                <Metric label="매칭" value={matched} tone="ok" onClick={() => setF(['매칭'])} />
                <Metric label="미매칭" value={rows.length - matched} tone={rows.length - matched > 0 ? 'danger' : 'ink'} onClick={() => setF(['미매칭'])} />
                <Metric label="총 금액" value={won(total)} tone="warn" />
              </Cards>
            </Sec>
          );
        }
        if (rows.length === 0) {
          if (id !== 'penalty-unmatched') return null;
          return (
            <Sec key={id} id={id} title="과태료" desc="고지서 등록으로 시작" onReorder={reorder}>
              <EmptyState>아직 과태료가 없습니다 — 위 <b>고지서 등록 (OCR)</b>로 고지서를 올리면 시작됩니다</EmptyState>
            </Sec>
          );
        }
        if (id === 'penalty-unmatched') {
          return (
            <Sec key={id} id={id} title="미매칭" n={unmatched.length} desc="실운전자 미확인 · 회사 부담 위험" onReorder={reorder}>
              {unmatched.length === 0 ? <EmptyState variant="ok">미매칭 없음</EmptyState> : renderQueue(unmatched)}
            </Sec>
          );
        }
        if (id === 'penalty-progress') {
          return (
            <Sec key={id} id={id} title="변경부과 진행" n={progress.length} desc="매칭됨 · 미종결" onReorder={reorder}>
              {progress.length === 0 ? <EmptyState variant="sec">진행 건 없음</EmptyState> : renderQueue(progress)}
            </Sec>
          );
        }
        return (
          <Sec key={id} id={id} title="종결" n={done.length} desc="변경부과완료·종결" onReorder={reorder}>
            {done.length === 0 ? <EmptyState variant="sec">종결 건 없음</EmptyState> : renderQueue(done)}
          </Sec>
        );
      })}
      {upload && <PenaltyUpload onClose={() => setUpload(false)} onSaved={() => reload()} />}
      {docs && <PenaltyDocs penalties={rows.filter((r) => r.renter).map((r) => r.p)} companyId={companyId} onClose={() => setDocs(false)} onSubmitted={() => reload()} />}
    </FacetPage>
  );
}
