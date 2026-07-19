'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import { getStore, listsCached } from '@/lib/store';
import { useReloadOnSaved } from '@/lib/use-reload-on-saved';
import { type EntityRecord } from '@/lib/intake/entities';
import { matchPenalty } from '@/lib/penalty-match';
import { dueMatcher, selectedInDim } from '@/lib/lens-filters';
import { textMatch } from '@/lib/search-match';
import { dday } from '@/lib/dashboard-consts';
import { Sec, Cards, Metric, DataTable, EmptyState, Btn, FacetPage, won, C, type Col, PageLoading } from '@/components/ui';
import { FacetRail } from '@/components/FacetRail';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { WorkHubBack } from '@/components/WorkHubTabs';
import { companyLabel } from '@/lib/companies';
import { PenaltyUpload } from '@/components/PenaltyUpload';
import { PenaltyDocs } from '@/components/PenaltyDocs';
import { openCar, openCustomer } from '@/lib/ui-bus';
import { customerKey } from '@/lib/customers';
import { Check, UploadCloud, FileText, Trash2 } from 'lucide-react';

type Row = { p: EntityRecord; renter: string | null; contractNo: string | null };

export default function PenaltyProcess() {
  const { companyId, scopeAll } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [facets, setFacets] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [upload, setUpload] = useState(false);
  const [docs, setDocs] = useState(false);
  const toggleFacet = (label: string) => setFacets((s) => { const n = new Set(s); n.has(label) ? n.delete(label) : n.add(label); return n; });
  const resetFacets = () => setFacets(new Set());
  const setF = (labels: string[]) => setFacets(new Set(labels));

  const load = useCallback((silent = false) => {
    const warm = listsCached(['penalty', 'contract'], companyId);
    if (!silent && !warm) setLoading(true);
    const store = getStore();
    Promise.all([store.list('penalty', companyId), store.list('contract', companyId)]).then(([pens, cons]) => {
      setRows(pens.map((p) => {
        const m = matchPenalty(p, cons);
        return { p, renter: m ? m.renter : null, contractNo: m ? String(m.contract.contractNo || '') : null };
      }));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [companyId]);
  useEffect(() => { load(); }, [load]);
  useReloadOnSaved(useCallback(() => load(true), [load]));

  // 소프트삭제 — store.remove(deletedAt+사유). /trash 에서 복구. (ERP 30원칙 Soft delete·Audit)
  const del = async (r: Row) => {
    if (!window.confirm(`이 과태료를 삭제할까요? (휴지통에서 복구 가능)\n${String(r.p.plate || '')} · ${won(r.p.amount)}`)) return;
    await getStore().remove('penalty', String(r.p.companyId || companyId), String(r.p._key || ''), '수기 삭제');
    load();
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

  const cols: Col<Row>[] = [
    ...(scopeAll ? [{ key: '_co', label: '회사', render: (r: Row) => <span style={{ color: C.mute }}>{companyLabel(r.p.companyId)}</span> }] : []),
    { key: 'plate', label: '차량', render: (r) => (
      <button type="button" onClick={(e) => { e.stopPropagation(); if (r.p.plate) openCar(r.p.plate, 'inspect'); }}
        style={{ border: 'none', background: 'none', cursor: r.p.plate ? 'pointer' : 'default', padding: 0, fontWeight: 700, color: C.ink }}>{String(r.p.plate || '—')}</button>
    ) },
    { key: 'desc', label: '위반내용', render: (r) => String(r.p.description || r.p.docType || '—') },
    { key: 'date', label: '위반일시', render: (r) => String(r.p.violationDate || '—') },
    { key: 'amount', label: '금액', align: 'r', render: (r) => won(r.p.amount) },
    { key: 'renter', label: '책임자(매칭)', render: (r) => r.renter
        ? <button type="button" onClick={(e) => { e.stopPropagation(); openCustomer(customerKey(r.renter, '')); }}
            style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: C.ok, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Check size={14} /> {r.renter} <span style={{ fontSize: 11, color: C.faint }}>({r.contractNo})</span>
          </button>
        : <span style={{ color: C.warn }}>미매칭 · 회사 부담</span> },
    { key: '_del', label: '', align: 'r', render: (r) => <Btn size="sm" variant="ghost" onClick={() => del(r)}><Trash2 size={14} /></Btn> },
  ];

  const unmatched = shown.filter((r) => !r.renter);
  const done = shown.filter((r) => ['변경부과완료', '종결'].includes(String(r.p.reassignStatus || '')));
  const progress = shown.filter((r) => r.renter && !['변경부과완료', '종결'].includes(String(r.p.reassignStatus || '')));
  const openRow = (r: Row) => {
    if (r.p.plate) openCar(r.p.plate, 'inspect');
    else router.push(`/list/penalty/${encodeURIComponent(String(r.p._key || ''))}`);
  };

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
      rail={!loading ? <FacetRail lensKey="과태료" facets={facets} onToggle={toggleFacet} onReset={resetFacets} /> : null}
    >
      <Sec title="현황" desc="고지서 → 임차인 매칭 → 변경부과">
        <Cards min={128} fit>
          <Metric label="과태료 건수" value={loading ? '…' : rows.length} onClick={resetFacets} />
          <Metric label="매칭" value={loading ? '…' : matched} tone="ok" onClick={() => setF(['매칭'])} />
          <Metric label="미매칭" value={loading ? '…' : rows.length - matched} tone={rows.length - matched > 0 ? 'danger' : 'ink'} onClick={() => setF(['미매칭'])} />
          <Metric label="총 금액" value={loading ? '…' : won(total)} tone="warn" />
        </Cards>
      </Sec>
      {loading ? <PageLoading />
        : rows.length === 0 ? (
          <Sec title="과태료" desc="고지서 등록으로 시작">
            <EmptyState>아직 과태료가 없습니다 — 위 <b>고지서 등록 (OCR)</b>로 고지서를 올리면 시작됩니다</EmptyState>
          </Sec>
        ) : (
          <>
            <Sec id="penalty-unmatched" title="미매칭" n={unmatched.length} desc="실운전자 미확인 · 회사 부담 위험">
              {unmatched.length === 0 ? <EmptyState variant="ok">미매칭 없음</EmptyState>
                : <DataTable cols={cols} rows={unmatched} onRow={openRow} />}
            </Sec>
            <Sec id="penalty-progress" title="변경부과 진행" n={progress.length} desc="매칭됨 · 미종결">
              {progress.length === 0 ? <EmptyState variant="sec">진행 건 없음</EmptyState>
                : <DataTable cols={cols} rows={progress} onRow={openRow} />}
            </Sec>
            <Sec id="penalty-done" title="종결" n={done.length} desc="변경부과완료·종결">
              {done.length === 0 ? <EmptyState variant="sec">종결 건 없음</EmptyState>
                : <DataTable cols={cols} rows={done} onRow={openRow} />}
            </Sec>
          </>
        )}
      {upload && <PenaltyUpload onClose={() => setUpload(false)} onSaved={() => load()} />}
      {docs && <PenaltyDocs penalties={rows.filter((r) => r.renter).map((r) => r.p)} companyId={companyId} onClose={() => setDocs(false)} onSubmitted={() => load()} />}
    </FacetPage>
  );
}
