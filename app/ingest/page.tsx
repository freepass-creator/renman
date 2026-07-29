'use client';
/**
 * 데이터관리 — 전 엔티티 투입구 (OCR·엑셀·직접).
 * LedgerFrame 공용 셸 + body(시트) + sidePanel(투입). 엔진(saveIntake·OCR·xlsx) 유지.
 */
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ENTITY_LIST, ENTITIES, mapOcrToEntity, type EntityRecord } from '@/lib/intake/entities';
import { parseCsv } from '@/lib/intake/csv';
import { saveIntake } from '@/lib/intake';
import { useEntityList } from '@/lib/use-entity-lists';
import { callOcrExtract } from '@/lib/ocr-client';
import { useSession } from '@/lib/session';
import { companyLabel } from '@/lib/companies';
import { resolveWriteCompany, NEED_COMPANY, isAllScope } from '@/lib/scope';
import { layerOfEntity } from '@/lib/domain/layers';
import { UploadCloud, Trash2, FileSpreadsheet, X, PanelRight, PanelRightClose } from 'lucide-react';
import FileDrop from '@/components/FileDrop';
import { toast } from '@/lib/toast';
import {
  LedgerFrame, Btn, FormGrid, PillTabs, Select, Input, Search,
  C, Message, Loading, OcrCrosscheck, PageLoading, EmptyState, LedgerActions,
  ExcelSheet, LedgerPanelFooter, type SheetCol,
} from '@/components/ui';
import type { CrosscheckResult } from '@/lib/ocr-crosscheck';
import { useIsMobile } from '@/lib/use-mobile';
import { textMatch } from '@/lib/search-match';

export const dynamic = 'force-dynamic';

type Tab = 'ocr' | 'excel' | 'manual';
type SheetView = '대기' | '저장본';

type PendingRow = EntityRecord & { _rid: string };

const LAYER_TITLE: Record<string, string> = {
  ledger: '① 원장',
  event: '③ 이벤트',
  system: '도구',
};
const ENTITY_GROUPS = (['ledger', 'event', 'system'] as const)
  .map((layer) => ({
    title: LAYER_TITLE[layer],
    items: ENTITY_LIST.filter((e) => layerOfEntity(e.key) === layer),
  }))
  .filter((g) => g.items.length > 0);

function newRid() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function IngestInner() {
  const mobile = useIsMobile();
  const { companyId } = useSession();
  const sp = useSearchParams();
  const [entityKey, setEntityKey] = useState(() => sp.get('type') || 'vehicle');
  const [saving, setSaving] = useState(false);
  const [sheetView, setSheetView] = useState<SheetView>('대기');
  const [panelOpen, setPanelOpen] = useState(true);
  const { rows: savedList, loading: savedLoading, reload: reloadSaved } = useEntityList(entityKey);
  const [tab, setTab] = useState<Tab>(() => (sp.get('plate') ? 'manual' : 'ocr'));
  const [records, setRecords] = useState<PendingRow[]>([]);
  const [ocrRaw, setOcrRaw] = useState<Record<string, unknown> | null>(null);
  const [ocrCrosscheck, setOcrCrosscheck] = useState<CrosscheckResult | null>(null);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [form, setForm] = useState<EntityRecord>(() => {
    const p = sp.get('plate');
    return p ? { plate: p } : {};
  });
  const [savedQ, setSavedQ] = useState('');
  const [picked, setPicked] = useState<string | null>(null);

  const entity = ENTITIES[entityKey];
  useEffect(() => {
    if (tab === 'ocr' && !entity.ocrType) setTab('excel');
  }, [tab, entity.ocrType]);

  useEffect(() => {
    if (sheetView === '저장본') reloadSaved();
  }, [sheetView, companyId, entityKey, reloadSaved]);

  function resetQueue() {
    setRecords([]);
    setError('');
    setOcrRaw(null);
    setOcrCrosscheck(null);
    setPicked(null);
    setFile(null);
  }

  async function saveRecords() {
    if (!records.length) return;
    const target = resolveWriteCompany(companyId, null);
    if (!target) { toast(NEED_COMPANY, 'error'); return; }
    setSaving(true); setError('');
    try {
      const toSave = ocrRaw && records.length === 1
        ? [{ ...records[0], _ocrOriginal: { raw: ocrRaw, at: new Date().toISOString(), source: entity.source } }]
        : records.map(({ _rid, ...rest }) => rest);
      const r = await saveIntake(entityKey, target, toSave, {
        context: { source: ocrRaw ? 'ocr' : tab === 'excel' ? 'upload' : 'manual' },
      });
      const s = r.save;
      toast(`저장 ${s.saved}건 — ${entity.label} (${companyLabel(target)})`, 'success');
      resetQueue();
      setSheetView('저장본');
      reloadSaved();
    } catch (e) {
      setError('저장 실패: ' + (e as Error).message);
      toast('저장 실패: ' + (e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function runOcr() {
    if (!file) { setError('파일을 선택하세요'); return; }
    setLoading(true); setError(''); setOcrCrosscheck(null);
    try {
      const r = await callOcrExtract(file, entity.ocrType || '');
      if (!r.ok) { setError(r.error || '추출 실패'); toast('OCR 추출 실패', 'error'); return; }
      setOcrRaw(r.raw || {});
      setOcrCrosscheck(r.crosscheck || null);
      setRecords([{ ...mapOcrToEntity(entityKey, r.raw || {}), _rid: newRid() }]);
      setSheetView('대기');
      setPanelOpen(true);
      toast('OCR 추출 완료 — 검토 후 저장', 'success');
    } catch (e) {
      setError((e as Error).message);
      toast('OCR 실패: ' + (e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function onExcelFile(f: File) {
    setError(''); setParsing(true); setOcrRaw(null); setOcrCrosscheck(null);
    toast(`${f.name} 읽는 중…`, 'info');
    try {
      const isCsv = /\.csv$/i.test(f.name);
      const recs = isCsv
        ? parseCsv(entityKey, await f.text())
        : await (await import('@/lib/intake/xlsx')).parseSpreadsheet(entityKey, f);
      if (!recs.length) {
        setError(`인식된 행이 없습니다 — "${entity.label}" 형식 확인`);
        toast('인식된 행 0', 'error');
        return;
      }
      setRecords(recs.map((r) => ({ ...r, _rid: newRid() })));
      setSheetView('대기');
      toast(`${recs.length.toLocaleString()}행 — 검토 후 저장`, 'success');
    } catch (e) {
      setError('파싱 실패: ' + (e as Error).message);
      toast('파싱 실패', 'error');
    } finally {
      setParsing(false);
    }
  }

  function submitManual() {
    setError('');
    const filled = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '' && v != null));
    if (!Object.keys(filled).length) { setError('입력값이 없습니다'); return; }
    setOcrRaw(null);
    setOcrCrosscheck(null);
    setRecords([{ ...filled, _rid: newRid() }]);
    setSheetView('대기');
    toast('직접입력 1건 — 검토 후 저장', 'success');
  }

  const methodTabs = useMemo(() => {
    const list: { key: Tab; label: string }[] = [];
    if (entity.ocrType) list.push({ key: 'ocr', label: 'OCR' });
    list.push({ key: 'excel', label: '엑셀' }, { key: 'manual', label: '직접' });
    return list;
  }, [entity.ocrType]);

  const pendingCols = useMemo<SheetCol<PendingRow>[]>(() => {
    const fields = entity.fields.slice(0, sheetView === '대기' ? 10 : 6);
    return fields.map((f, i) => ({
      key: f.key,
      label: f.manual ? `${f.label}·직접` : f.label,
      pin: i === 0,
      priority: (i < 4 ? 1 : i < 7 ? 2 : 3) as 1 | 2 | 3,
      text: (r) => String(r[f.key] ?? ''),
      render: (r) => (
        sheetView === '대기' ? (
          <Input
            size="sm"
            value={String(r[f.key] ?? '')}
            onChange={(e) => {
              const v = e.target.value;
              setRecords((prev) => prev.map((row) => row._rid === r._rid ? { ...row, [f.key]: v } : row));
            }}
            style={{
              width: '100%',
              minWidth: f.type === 'text' ? 88 : 72,
              background: f.manual && !r[f.key] ? 'var(--orange-bg)' : undefined,
            }}
          />
        ) : (
          <span>{r[f.key] != null && r[f.key] !== '' ? String(r[f.key]) : '—'}</span>
        )
      ),
    }));
  }, [entity.fields, sheetView]);

  const savedRows = useMemo(() => {
    if (sheetView !== '저장본') return [];
    const list = savedList || [];
    if (!savedQ.trim()) return list;
    return list.filter((r) => textMatch(savedQ, ...entity.fields.slice(0, 8).map((f) => r[f.key])));
  }, [sheetView, savedList, savedQ, entity.fields]);

  const savedCols = useMemo<SheetCol<EntityRecord>[]>(() => [
    ...entity.fields.slice(0, 6).map((f, i) => ({
      key: f.key,
      label: f.label,
      pin: i === 0,
      priority: (i < 3 ? 1 : 2) as 1 | 2,
      text: (r: EntityRecord) => String(r[f.key] ?? ''),
      render: (r: EntityRecord) => String(r[f.key] != null && r[f.key] !== '' ? r[f.key] : '—'),
    })),
    {
      key: '_at',
      label: '저장시각',
      priority: 3 as const,
      text: (r: EntityRecord) => String(r.createdAt || ''),
      render: (r: EntityRecord) => String(r.createdAt || '').slice(0, 16).replace('T', ' ') || '—',
    },
  ], [entity.fields]);

  const sheetBusy = (sheetView === '저장본' && savedLoading) || loading;

  const sheetBody = sheetBusy ? (
    <PageLoading label={loading ? 'OCR 추출 중…' : '불러오는 중…'} />
  ) : sheetView === '대기' ? (
    !records.length ? (
      <EmptyState variant="sheet">
        대기 행이 없습니다. 오른쪽에서 {tab === 'ocr' ? 'OCR' : tab === 'excel' ? '엑셀' : '직접입력'} 후 검토·저장하세요.
      </EmptyState>
    ) : (
      <ExcelSheet
        cols={pendingCols.map((c) => ({ ...c, pin: false }))}
        rows={records}
        rowKey={(r) => r._rid}
        selectedRowKey={picked}
        onRow={(r) => setPicked(r._rid)}
        fit
      />
    )
  ) : isAllScope(companyId) ? (
    <EmptyState variant="sheet">저장 회사를 선택하세요</EmptyState>
  ) : (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0 0 8px', flexShrink: 0 }}>
        <Search
          size="sm"
          placeholder="저장본 검색"
          value={savedQ}
          onChange={(e) => setSavedQ(e.target.value)}
          style={{ width: mobile ? '100%' : 240 }}
        />
        <span style={{ fontSize: 12.5, color: C.mute }}>{savedRows.length}건</span>
      </div>
      {!savedRows.length ? (
        <EmptyState variant="sheet">저장본 없음</EmptyState>
      ) : (
        <ExcelSheet
          cols={savedCols}
          rows={savedRows}
          rowKey={(r, i) => String(r._key || r.id || i)}
          fit
        />
      )}
    </>
  );

  const inputPanel = panelOpen ? (
    <section className="ledger-record-panel">
      <header className="ledger-record-panel__header">
        <div className="ledger-record-panel__heading">
          <div className="ledger-record-panel__title">{entity.label} 투입</div>
          <div className="ledger-record-panel__subtitle">
            {tab === 'ocr' ? entity.source : tab === 'excel' ? 'xlsx · csv' : '폼 확정 → 대기'}
          </div>
        </div>
        <button type="button" className="ledger-record-panel__close" onClick={() => setPanelOpen(false)} aria-label="투입패널 닫기">
          <X size={14} />
        </button>
      </header>

      <div className="ledger-record-panel__body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tab === 'ocr' && (
          <>
            <FileDrop
              onFile={setFile}
              file={file}
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              hint={`${entity.source} (PDF·JPG·PNG)`}
            />
            {parsing || loading ? <Loading label={loading ? '추출 중…' : '읽는 중…'} color={C.accent} /> : null}
          </>
        )}
        {tab === 'excel' && (
          <>
            <FileDrop onFile={onExcelFile} accept=".xlsx,.xls,.csv" hint=".xlsx · .csv" />
            {parsing && <Loading label="읽는 중…" color={C.accent} />}
          </>
        )}
        {tab === 'manual' && (
          <FormGrid fields={entity.fields} form={form} onChange={(k, v) => setForm({ ...form, [k]: v })} />
        )}
      </div>

      <LedgerPanelFooter hint={records.length ? `대기 ${records.length}건 · 제목줄 저장` : undefined}>
        {tab === 'ocr' && (
          <Btn size="sm" variant="solid" onClick={runOcr} disabled={loading || !file}>
            {loading ? '추출 중…' : 'OCR 추출'}
          </Btn>
        )}
        {tab === 'excel' && (
          <Btn
            size="sm"
            variant="ghost"
            onClick={async () => {
              const { downloadXlsxTemplate } = await import('@/lib/intake/xlsx');
              downloadXlsxTemplate(entityKey);
            }}
          >
            빈 템플릿
          </Btn>
        )}
        {tab === 'manual' && (
          <Btn size="sm" variant="solid" onClick={submitManual}>입력 확정</Btn>
        )}
        {records.length > 0 && sheetView === '대기' && (
          <Btn size="sm" variant="ghost" onClick={resetQueue}>대기 비우기</Btn>
        )}
      </LedgerPanelFooter>
    </section>
  ) : null;

  return (
    <LedgerFrame
      title="데이터관리"
      meta="OCR·엑셀·직접 투입"
      showColView={false}
      filters={(
        <>
          <Select
            size="sm"
            aria-label="엔티티"
            value={entityKey}
            onChange={(e) => {
              setEntityKey(e.target.value);
              resetQueue();
              setForm({});
              setSheetView('대기');
            }}
            style={{ minWidth: mobile ? '100%' : 200 }}
          >
            {ENTITY_GROUPS.map((g) => (
              <optgroup key={g.title} label={g.title}>
                {g.items.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
              </optgroup>
            ))}
          </Select>
          <PillTabs
            size="sm"
            value={tab}
            onChange={(k) => { setTab(k as Tab); setError(''); setFile(null); setPanelOpen(true); }}
            tabs={methodTabs}
          />
        </>
      )}
      stats={(
        <span style={{ fontSize: 12.5, color: C.mute }}>
          대기 <b style={{ color: records.length ? C.warn : C.ink }}>{records.length}</b>
          {companyId ? <> · {companyLabel(companyId)}</> : null}
        </span>
      )}
      view={(
        <PillTabs
          size="sm"
          value={sheetView}
          onChange={setSheetView}
          tabs={[
            { key: '대기', label: '대기' },
            { key: '저장본', label: '저장본' },
          ]}
        />
      )}
      tools={(
        <LedgerActions aria-label="워크플로">
          <Btn
            size="sm"
            variant="ghost"
            iconOnly
            tip={panelOpen ? '투입패널 닫기' : '투입패널 열기'}
            onClick={() => setPanelOpen((o) => !o)}
          >
            {panelOpen ? <PanelRightClose size={14} /> : <PanelRight size={14} />}
          </Btn>
          <Btn
            size="sm"
            variant="ghost"
            iconOnly
            tip="엑셀 템플릿 받기"
            onClick={async () => {
              const { downloadXlsxTemplate } = await import('@/lib/intake/xlsx');
              downloadXlsxTemplate(entityKey);
            }}
          >
            <FileSpreadsheet size={14} />
          </Btn>
          <Btn size="sm" variant="ghost" iconOnly tip="대량 매칭" href="/ingest/bulk">
            <UploadCloud size={14} />
          </Btn>
          <Btn size="sm" variant="ghost" iconOnly tip="휴지통" href="/trash">
            <Trash2 size={14} />
          </Btn>
        </LedgerActions>
      )}
      right={(
        <LedgerActions aria-label="쓰기">
          <Btn
            size="sm"
            variant="solid"
            tip={records.length ? `대기 ${records.length}건 저장` : '저장할 대기 행 없음'}
            disabled={!records.length || saving || sheetView !== '대기'}
            onClick={saveRecords}
          >
            {saving ? '저장 중…' : records.length ? `저장 ${records.length}건` : '저장'}
          </Btn>
        </LedgerActions>
      )}
      hint={error || (ocrCrosscheck && sheetView === '대기') ? (
        <>
          {error ? <Message variant="danger">{error}</Message> : null}
          {ocrCrosscheck && sheetView === '대기' ? <OcrCrosscheck result={ocrCrosscheck} /> : null}
        </>
      ) : undefined}
      body={sheetBody}
      sidePanel={inputPanel}
    />
  );
}

export default function IngestPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <IngestInner />
    </Suspense>
  );
}
