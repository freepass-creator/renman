'use client';
/**
 * 데이터관리 — 전 엔티티 투입구 (OCR·엑셀·직접).
 * LedgerFrame 공용 셸 + body(시트) + sidePanel(투입). 엔진(saveIntake·OCR·xlsx) 유지.
 */
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DATA_CENTER_TITLE, processingAttentionRank, summarizeProcessingQueue } from '@/lib/data-center-terms';
import { uploadToInbox } from '@/lib/inbox-upload';
import { ENTITY_LIST, ENTITIES, mapOcrToEntity, type EntityRecord } from '@/lib/intake/entities';
import { parseCsv } from '@/lib/intake/csv';
import { saveIntake } from '@/lib/intake';
import { useEntityList } from '@/lib/use-entity-lists';
import { callOcrExtract } from '@/lib/ocr-client';
import { useSession } from '@/lib/session';
import { companyLabel } from '@/lib/companies';
import { resolveWriteCompany, NEED_COMPANY, isAllScope } from '@/lib/scope';
import { layerOfEntity } from '@/lib/domain/layers';
import { UploadCloud, Trash2, FileSpreadsheet, PanelRight, PanelRightClose, FileText } from 'lucide-react';
import FileDrop from '@/components/FileDrop';
import { toast } from '@/lib/toast';
import {
  LedgerFrame, LedgerPanelCloseButton, LedgerRecordPanel, Badge, Btn, FormGrid, PillTabs, Select, Input, Search,
  C, Message, Loading, OcrCrosscheck, PageLoading, EmptyState, LedgerActions,
  ExcelSheet, LedgerPanelFooter, type SheetCol,
} from '@/components/ui';
import type { CrosscheckResult } from '@/lib/ocr-crosscheck';
import { useIsMobile } from '@/lib/use-mobile';
import { textMatch } from '@/lib/search-match';
import { storageReady } from '@/lib/storage';
import { commitUpdate } from '@/lib/commit';
import { getStore } from '@/lib/store';
import { buildMatchContract } from '@/lib/contract-ops';
import { analyzeMatchProposal, proposalPatch, toBankTransaction } from '@/lib/payments/match-proposal';
import { TODAY } from '@/lib/dashboard-consts';

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

/** 직접입력 첫 화면에는 실제 한 건 등록에 자주 쓰는 필드만 노출한다. */
const MANUAL_PRIMARY_KEYS: Record<string, readonly string[]> = {
  vehicle: ['plate', 'carName', 'status', 'ownerName', 'firstReg', 'vin', 'mileage', 'acquisitionPrice', 'acquisitionDate', 'maker', 'modelLine', 'modelYear'],
  contract: ['contractNo', 'contractorName', 'plate', 'status', 'rentalType', 'startDate', 'endDate', 'monthlyRent', 'deposit', 'paymentDay'],
  customer: ['name', 'phone', 'birth', 'licenseNo', 'licenseType', 'licenseExpiry', 'address'],
  work_item: ['date', 'category', 'status', 'priority', 'title', 'plate', 'contractKey', 'dueDate', 'assigneeName'],
};

function newRid() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function IngestInner() {
  const mobile = useIsMobile();
  const { companyId, user } = useSession();
  const sp = useSearchParams();
  const [entityKey, setEntityKey] = useState(() => sp.get('type') || 'vehicle');
  const [saving, setSaving] = useState(false);
  const [sheetView, setSheetView] = useState<SheetView>('대기');
  const [panelOpen, setPanelOpen] = useState(true);
  const [universalOpen, setUniversalOpen] = useState(false);
  const [universalBusy, setUniversalBusy] = useState(false);
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
  const [selectedSaved, setSelectedSaved] = useState<EntityRecord | null>(null);
  const [savedPickedKey, setSavedPickedKey] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [parseNotice, setParseNotice] = useState('');

  const entity = ENTITIES[entityKey];
  const [manualPrimaryFields, manualMoreFields] = useMemo(() => {
    const preferred = new Set(MANUAL_PRIMARY_KEYS[entityKey] || []);
    const primary = entity.fields.filter((field, index) => field.required || preferred.has(field.key) || (!MANUAL_PRIMARY_KEYS[entityKey] && index < 8));
    const primaryKeys = new Set(primary.map((field) => field.key));
    return [primary, entity.fields.filter((field) => !primaryKeys.has(field.key))];
  }, [entity, entityKey]);
  const manualMissingFields = useMemo(
    () => entity.fields.filter((field) => field.required && !String(form[field.key] ?? '').trim()),
    [entity.fields, form],
  );
  const manualReady = manualMissingFields.length === 0;
  useEffect(() => {
    if (tab === 'ocr' && !entity.ocrType) setTab('excel');
  }, [tab, entity.ocrType]);

  useEffect(() => {
    if (sheetView === '저장본') reloadSaved();
  }, [sheetView, companyId, entityKey, reloadSaved]);

  useEffect(() => {
    setSelectedSaved(null);
    setSavedPickedKey(null);
  }, [companyId, entityKey, sheetView]);

  function resetQueue() {
    setRecords([]);
    setError('');
    setOcrRaw(null);
    setOcrCrosscheck(null);
    setPicked(null);
    setFile(null);
  }

  async function uploadOriginals(files: FileList) {
    const target = resolveWriteCompany(companyId, null);
    if (!target) { toast(NEED_COMPANY, 'error'); return; }
    const list = [...files];
    if (!list.length) return;
    setUniversalBusy(true);
    let saved = 0;
    let duplicates = 0;
    const failures: string[] = [];
    try {
      for (const original of list) {
        try {
          const result = await uploadToInbox(original, '기타', target, String(user.name || user.email || ''));
          if (result.ok) {
            saved += 1;
            if (result.duplicate) duplicates += 1;
          } else {
            failures.push(`${original.name}: ${result.reason || '저장 실패'}`);
          }
        } catch (uploadError) {
          const reason = uploadError instanceof Error ? uploadError.message : String(uploadError || '저장 실패');
          failures.push(`${original.name}: ${reason}`);
        }
      }
      if (!failures.length && saved) {
        toast(`원본 ${saved}건 접수${duplicates ? ` · 중복 ${duplicates}건` : ' · 처리대기'}`, 'success');
        setEntityKey('inbox');
        setSheetView('저장본');
        setUniversalOpen(false);
        setPanelOpen(false);
      } else if (failures.length) {
        const sample = failures.slice(0, 2).join(' / ');
        const more = failures.length > 2 ? ` 외 ${failures.length - 2}건` : '';
        toast(`원본 ${saved}건 접수 · ${failures.length}건 실패 — ${sample}${more}`, 'error');
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error || '알 수 없는 오류');
      toast(`원본 업로드 중단 — ${reason}`, 'error');
    } finally {
      setUniversalBusy(false);
    }
  }

  async function saveRecords() {
    if (!records.length) return;
    const target = resolveWriteCompany(companyId, null);
    if (!target) { toast(NEED_COMPANY, 'error'); return; }
    setSaving(true); setError('');
    try {
      // _rid는 대기표 선택용 UI 키다. OCR·엑셀·직접입력 어느 경로에서도 원장에 저장하지 않는다.
      const cleanRecords = records.map(({ _rid: _pendingKey, ...rest }) => rest);
      const toSave = ocrRaw && cleanRecords.length === 1
        ? [{ ...cleanRecords[0], _ocrOriginal: { raw: ocrRaw, at: new Date().toISOString(), source: entity.source } }]
        : cleanRecords;
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
    setError(''); setParseNotice(''); setParsing(true); setOcrRaw(null); setOcrCrosscheck(null);
    toast(`${f.name} 읽는 중…`, 'info');
    try {
      const isCsv = /\.csv$/i.test(f.name);
      const target = resolveWriteCompany(companyId, null);
      let originalInboxKey = '';
      if (target && storageReady()) {
        const original = await uploadToInbox(f, entityKey === 'bank_tx' ? '계좌거래내역' : entity.label, target, String(user.name || user.email || ''));
        originalInboxKey = String(original.key || '');
        if (!original.ok) setParseNotice('원본 보관 실패 · 분석 결과는 저장 전 검토하세요.');
      } else if (!target) {
        setParseNotice('회사를 선택해야 원본과 분석 결과를 함께 보관할 수 있습니다.');
      } else {
        setParseNotice('Storage 미설정 · 현재는 분석만 가능하며 원본은 보관되지 않습니다.');
      }
      let recs: EntityRecord[];
      if (entityKey === 'bank_tx' && !isCsv) {
        const report = await (await import('@/lib/intake/parse-tx')).parseTxFileReport(f);
        if (target) {
          const contracts = (await getStore().list('contract', target).catch(() => [] as EntityRecord[]))
            .map((contract) => buildMatchContract(contract, TODAY));
          recs = report.records.map((record) => ({
            ...record,
            ...proposalPatch(analyzeMatchProposal(toBankTransaction(record), contracts)),
          }));
        } else {
          recs = report.records;
        }
        const notices = [
          report.rejected.length ? `확인 필요 ${report.rejected.length}행` : '',
          ...report.warnings,
        ].filter(Boolean);
        if (notices.length) setParseNotice((prev) => [prev, ...notices].filter(Boolean).join(' · '));
        if (target && originalInboxKey) {
          await commitUpdate({
            entity: 'inbox', sessionCompanyId: target, key: originalInboxKey,
            patch: {
              processingState: report.rejected.length || report.warnings.length ? '확인필요' : '분석중',
              analyzedAt: new Date().toISOString(), parsedRowCount: report.records.length,
              rejectedRowCount: report.rejected.length, analysisWarnings: report.warnings,
              rejectedRowSummary: report.rejected.slice(0, 20).map((row) => ({ sheet: row.sheet, row: row.row, reason: row.reason })),
            },
          });
        }
      } else {
        recs = isCsv ? parseCsv(entityKey, await f.text()) : await (await import('@/lib/intake/xlsx')).parseSpreadsheet(entityKey, f);
      }
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
    if (!manualReady) {
      setError(`필수값을 입력하세요: ${manualMissingFields.map((field) => field.label).join(', ')}`);
      return;
    }
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
    const pendingLimit = entityKey === 'bank_tx' ? 13 : 10;
    const fields = entity.fields.slice(0, sheetView === '대기' ? pendingLimit : 6);
    return fields.map((f, i) => ({
      key: f.key,
      label: f.manual ? `${f.label}·확인` : f.label,
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
  }, [entity.fields, entityKey, sheetView]);

  const savedRows = useMemo(() => {
    if (sheetView !== '저장본') return [];
    const searchFields = entityKey === 'inbox'
      ? ['filename', 'kind', 'processingState', 'classificationState', 'intakeState', 'assignmentState', 'assignee', 'dueDate', 'suggestedEntity', 'matchedEntity', 'classificationReason']
      : entity.fields.slice(0, 8).map((field) => field.key);
    const filtered = !savedQ.trim()
      ? [...(savedList || [])]
      : (savedList || []).filter((r) => textMatch(savedQ, ...searchFields.map((key) => r[key])));
    if (entityKey === 'inbox') {
      filtered.sort((a, b) => processingAttentionRank(a.processingState) - processingAttentionRank(b.processingState)
        || String(a.uploadedAt || a.createdAt || '').localeCompare(String(b.uploadedAt || b.createdAt || '')));
    }
    return filtered;
  }, [sheetView, savedList, savedQ, entity.fields, entityKey]);

  const inboxQueueSummary = useMemo(
    () => entityKey === 'inbox' ? summarizeProcessingQueue(savedList || []) : null,
    [entityKey, savedList],
  );

  const savedCols = useMemo<SheetCol<EntityRecord>[]>(() => [
    ...(entityKey === 'inbox'
      ? ['filename', 'kind', 'processingState', 'classificationState', 'intakeState', 'assignmentState', 'assignee', 'dueDate']
        .map((key) => entity.fields.find((field) => field.key === key))
        .filter((field): field is (typeof entity.fields)[number] => !!field)
      : entity.fields.slice(0, 6)).map((f, i) => ({
      key: f.key,
      label: f.label,
      pin: i === 0,
      priority: (i < 3 ? 1 : 2) as 1 | 2,
      text: (r: EntityRecord) => String(r[f.key] ?? ''),
      render: (r: EntityRecord) => {
        const value = String(r[f.key] ?? '').trim();
        if (!value) return '—';
        if (entityKey === 'inbox' && /State$/.test(f.key)) {
          const tone = /완료|분류됨|배정됨/.test(value) ? 'green' : /오류|중복/.test(value) ? 'red' : 'amber';
          return <Badge tone={tone}>{value}</Badge>;
        }
        return value;
      },
    })),
    {
      key: '_at',
      label: '저장시각',
      priority: 3 as const,
      text: (r: EntityRecord) => String(r.createdAt || ''),
      render: (r: EntityRecord) => String(r.createdAt || '').slice(0, 16).replace('T', ' ') || '—',
    },
  ], [entity.fields, entityKey]);

  const savedDetailCols = useMemo<SheetCol<EntityRecord>[]>(() => entity.fields.map((field) => ({
    key: field.key,
    label: field.label,
    text: (row) => String(row[field.key] ?? ''),
    render: (row) => {
      const value = String(row[field.key] ?? '').trim();
      if (!value) return '—';
      if (field.key === 'url') {
        return <a href={value} target="_blank" rel="noreferrer" style={{ color: C.accent, fontWeight: 700 }}>원본 열기</a>;
      }
      if (entityKey === 'inbox' && /State$/.test(field.key)) {
        const tone = /완료|분류됨|배정됨/.test(value) ? 'green' : /오류|중복/.test(value) ? 'red' : 'amber';
        return <Badge tone={tone}>{value}</Badge>;
      }
      return value;
    },
  })), [entity.fields, entityKey]);

  const savedDetailSections = useMemo(() => {
    const byKeys = (keys: string[]) => savedDetailCols.filter((col) => keys.includes(col.key));
    if (entityKey === 'inbox') return [
      { title: '원본', open: true, cols: byKeys(['url', 'filename', 'kind', 'uploadedBy', 'uploadedAt', 'originalMime', 'originalSize']) },
      { title: '처리상태', cols: byKeys(['processingState', 'classificationState', 'intakeState', 'assignmentState', 'assignee', 'dueDate', 'note']) },
      { title: '분류·연결', cols: byKeys(['suggestedEntity', 'classificationConfidence', 'classificationReason', 'matchedEntity', 'matchedKey', 'plate']) },
      { title: '원본 무결성', cols: byKeys(['originalHash', 'fingerprintAlgorithm', 'duplicateOf', 'duplicateDetectedAt', 'analysisWarnings']) },
    ];
    const primaryKeys = new Set(manualPrimaryFields.map((field) => field.key));
    return [
      { title: '기본정보', open: true, cols: savedDetailCols.filter((col) => primaryKeys.has(col.key)) },
      { title: '추가 운영정보', cols: savedDetailCols.filter((col) => !primaryKeys.has(col.key)) },
    ];
  }, [entityKey, manualPrimaryFields, savedDetailCols]);

  const sheetBusy = (sheetView === '저장본' && savedLoading) || loading;

  const sheetBody = sheetBusy ? (
    <PageLoading label={loading ? 'OCR 추출 중…' : '불러오는 중…'} />
  ) : sheetView === '대기' ? (
    !records.length ? (
      <EmptyState variant="sheet">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <strong style={{ color: C.ink }}>{isAllScope(companyId) ? '대상 회사를 먼저 선택하세요' : '분석 대기 자료가 없습니다'}</strong>
          <span>{isAllScope(companyId)
            ? '상단의 전체 회사에서 원본과 분석 결과를 보관할 법인을 선택하세요.'
            : <>오른쪽에서 {tab === 'ocr' ? '문서를 선택해 OCR을 실행' : tab === 'excel' ? '엑셀을 올려 행을 검토' : '기본정보를 입력'}하거나, 종류를 모르면 원본부터 보관하세요.</>}</span>
          {!isAllScope(companyId) && (
            <Btn size="sm" variant="ghost" onClick={() => { setUniversalOpen(true); setPanelOpen(false); }}>
              <UploadCloud size={14} /> 원본 먼저 올리기
            </Btn>
          )}
        </div>
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
          selectedRowKey={selectedSaved ? String(selectedSaved._key || selectedSaved.id || '') : savedPickedKey}
          onRow={(row) => {
            setSavedPickedKey(String(row._key || row.id || ''));
          }}
          onRowDoubleClick={(row) => {
            const key = String(row._key || row.id || '');
            setSavedPickedKey(key);
            setSelectedSaved((current) => {
              const currentKey = current ? String(current._key || current.id || '') : '';
              return currentKey === key ? null : row;
            });
            setPanelOpen(false);
            setUniversalOpen(false);
          }}
          fit
        />
      )}
    </>
  );

  const universalPanel = universalOpen ? (
    <section className="ledger-record-panel" aria-label="원본 자료 투입">
      <header className="ledger-record-panel__header">
        <div className="ledger-record-panel__heading">
          <div className="ledger-record-panel__title">무엇이든 올리기</div>
          <div className="ledger-record-panel__subtitle">종류를 몰라도 먼저 등록 · 이후 분석과 분류를 이어서 처리</div>
        </div>
        <LedgerPanelCloseButton onClose={() => setUniversalOpen(false)} label="원본 투입패널 닫기" />
      </header>
      <div className="ledger-record-panel__body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {isAllScope(companyId) && (
          <Message variant="warning">원본 자료가 잘못 귀속되지 않도록 상단에서 보관할 회사를 먼저 선택하세요.</Message>
        )}
        {!isAllScope(companyId) && <FileDrop
          multiple
          onFiles={(files) => { void uploadOriginals(files); }}
          accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.csv"
          hint="등록증 · 계약서 · 보험증권 · 계좌엑셀 · 영수증 · 일반문서"
          note={universalBusy ? '원본 보관 중…' : undefined}
        />}
        <Message variant="info">파일은 즉시 원본 건으로 보관됩니다. 아직 판정할 수 없는 자료는 미분류·미처리·미배정 상태로 남습니다.</Message>
      </div>
    </section>
  ) : null;

  const inputPanel = panelOpen && !universalOpen ? (
    <section className="ledger-record-panel">
      <header className="ledger-record-panel__header">
        <div className="ledger-record-panel__heading">
          <div className="ledger-record-panel__title">{entity.label} 투입</div>
          <div className="ledger-record-panel__subtitle">
            {tab === 'ocr' ? entity.source : tab === 'excel' ? 'xlsx · csv' : '폼 확정 → 대기'}
          </div>
        </div>
        <LedgerPanelCloseButton onClose={() => setPanelOpen(false)} label="투입패널 닫기" />
      </header>

      <div className="ledger-record-panel__body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {isAllScope(companyId) ? (
          <Message variant="warning">분석 결과와 원본이 잘못 귀속되지 않도록 상단에서 대상 회사를 먼저 선택하세요.</Message>
        ) : (
          <>
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
          <>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.ink }}>필수·기본정보</div>
            <FormGrid fields={manualPrimaryFields} form={form} onChange={(k, v) => setForm({ ...form, [k]: v })} />
            {manualMoreFields.length > 0 ? (
              <details style={{ borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 800, color: C.ink, padding: '6px 0' }}>
                  추가 운영정보 {manualMoreFields.length}개
                </summary>
                <div style={{ marginTop: 10 }}>
                  <FormGrid fields={manualMoreFields} form={form} onChange={(k, v) => setForm({ ...form, [k]: v })} />
                </div>
              </details>
            ) : null}
          </>
        )}
          </>
        )}
      </div>

      {!isAllScope(companyId) && <LedgerPanelFooter hint={records.length ? `대기 ${records.length}건 · 제목줄 저장` : undefined}>
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
          <Btn size="sm" variant="solid" onClick={submitManual} disabled={!manualReady}>입력 확정</Btn>
        )}
        {records.length > 0 && sheetView === '대기' && (
          <Btn size="sm" variant="ghost" onClick={resetQueue}>대기 비우기</Btn>
        )}
      </LedgerPanelFooter>}
    </section>
  ) : null;

  const savedDetailPanel = sheetView === '저장본' && selectedSaved ? (
    <LedgerRecordPanel
      title={String(selectedSaved.filename || selectedSaved[entity.fields[0]?.key] || entity.label)}
      identity={entityKey === 'inbox'
        ? `${String(selectedSaved.kind || '문서')} · ${String(selectedSaved.assignee || '미배정')}`
        : entity.label}
      statusBadge={entityKey === 'inbox'
        ? <Badge tone={/완료/.test(String(selectedSaved.processingState || '')) ? 'green' : 'amber'}>{String(selectedSaved.processingState || '미분류')}</Badge>
        : undefined}
      row={selectedSaved}
      cols={savedDetailCols}
      sections={savedDetailSections}
      onClose={() => setSelectedSaved(null)}
      actions={entityKey === 'inbox' ? (
        <>
          {String(selectedSaved.status || '') !== '매칭' && String(selectedSaved.processingState || '') !== '처리완료' ? (
            <Btn size="sm" href={`/inbox?open=${encodeURIComponent(String(selectedSaved._key || selectedSaved.inboxKey || selectedSaved.id || ''))}`}>
              <FileText size={14} /> 확인·매칭
            </Btn>
          ) : null}
          <Btn size="sm" variant="ghost" href={`/work?open=${encodeURIComponent(String(selectedSaved._key || selectedSaved.inboxKey || selectedSaved.id || ''))}`}>
            업무에서 보기
          </Btn>
        </>
      ) : undefined}
    />
  ) : null;

  return (
    <LedgerFrame
      title={DATA_CENTER_TITLE}
      meta="원본 투입 · 분석 · 연결 · 원장 반영"
      showColView={false}
      filters={(
        <>
          <Select
            size="sm"
            aria-label="엔티티"
            value={entityKey}
            onChange={(e) => {
              setEntityKey(e.target.value);
              setSelectedSaved(null);
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
          {sheetView === '저장본' && inboxQueueSummary ? <>
            확인필요 <b style={{ color: inboxQueueSummary.needsReview ? C.warn : C.ink }}>{inboxQueueSummary.needsReview}</b>
            {' · '}미분류 <b style={{ color: inboxQueueSummary.unclassified ? C.warn : C.ink }}>{inboxQueueSummary.unclassified}</b>
            {' · '}미배정 <b style={{ color: inboxQueueSummary.unassigned ? C.danger : C.ink }}>{inboxQueueSummary.unassigned}</b>
            {inboxQueueSummary.errors ? <>{' · '}오류 <b style={{ color: C.danger }}>{inboxQueueSummary.errors}</b></> : null}
          </> : <>
            대기 <b style={{ color: records.length ? C.warn : C.ink }}>{records.length}</b>
          </>}
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
            tip={panelOpen || universalOpen ? '투입패널 숨기기' : '투입패널 표시하기'}
            onClick={() => {
              if (selectedSaved) setSelectedSaved(null);
              else if (universalOpen) setUniversalOpen(false);
              else setPanelOpen((o) => !o);
            }}
          >
            {panelOpen || universalOpen ? <PanelRightClose size={14} /> : <PanelRight size={14} />}
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
            variant={records.length ? 'ghost' : 'solid'}
            onClick={() => { setUniversalOpen(true); setPanelOpen(false); setSelectedSaved(null); }}
          >
            <UploadCloud size={14} /> 무엇이든 올리기
          </Btn>
          {records.length > 0 ? (
            <Btn
              size="sm"
              variant="solid"
              tip={`대기 ${records.length}건 저장`}
              disabled={saving || sheetView !== '대기'}
              onClick={saveRecords}
            >
              {saving ? '저장 중…' : `저장 ${records.length}건`}
            </Btn>
          ) : null}
        </LedgerActions>
      )}
      hint={error || (ocrCrosscheck && sheetView === '대기') ? (
        <>
          {error ? <Message variant="danger">{error}</Message> : null}
          {ocrCrosscheck && sheetView === '대기' ? <OcrCrosscheck result={ocrCrosscheck} /> : null}
        </>
      ) : parseNotice ? <Message variant="warning">{parseNotice}</Message> : undefined}
      body={sheetBody}
      sidePanel={savedDetailPanel || universalPanel || inputPanel}
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
