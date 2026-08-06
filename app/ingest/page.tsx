'use client';
/**
 * 데이터관리 — 전 엔티티 투입구 (OCR·엑셀·직접).
 * LedgerFrame 공용 셸 + body(시트) + sidePanel(투입/상세). 엔진(saveIntake·OCR·xlsx) 유지.
 *
 * 표 = 문서종류·카테고리·분석요약(원장 행문법). 엔티티 필드는 우측 패널.
 */
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DATA_CENTER_TITLE, processingAttentionRank, summarizeProcessingQueue } from '@/lib/data-center-terms';
import { uploadToInbox } from '@/lib/inbox-upload';
import { uploadDoc, docPath } from '@/lib/storage';
import { pushDocVersion } from '@/lib/docs';
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
  LedgerFrame, LedgerRecordPanel, Badge, Btn, FormGrid, PillTabs, Select, Search,
  C, Message, OcrCrosscheck, PageLoading, EmptyState, LedgerActions,
  ExcelSheet, TwoLineCell, type SheetCol,
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
import { LEDGER_EMPTY } from '@/lib/ledger-empty';
import {
  buildPendingRow, refreshPendingRow, summarizeSavedRow,
  type IngestPendingRow,
} from '@/lib/ingest-summary';

export const dynamic = 'force-dynamic';

type Tab = 'ocr' | 'excel' | 'manual';
type SheetView = '대기' | '저장본';

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
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const { rows: savedList, loading: savedLoading, reload: reloadSaved } = useEntityList(entityKey);
  const [tab, setTab] = useState<Tab>(() => (sp.get('plate') ? 'manual' : 'ocr'));
  const [records, setRecords] = useState<IngestPendingRow[]>([]);
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
  const [selectedPending, setSelectedPending] = useState<IngestPendingRow | null>(null);
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
    setSelectedPending(null);
    setPicked(null);
  }, [companyId, entityKey, sheetView]);

  function resetQueue() {
    setRecords([]);
    setError('');
    setOcrRaw(null);
    setOcrCrosscheck(null);
    setPicked(null);
    setSelectedPending(null);
    setFile(null);
  }

  function cancelUniversal() {
    if (universalBusy) return;
    setStagedFiles([]);
    setUniversalOpen(false);
  }

  async function uploadOriginals(list: File[]) {
    const target = resolveWriteCompany(companyId, null);
    if (!target) { toast(NEED_COMPANY, 'error'); return; }
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
        setStagedFiles([]);
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
      const cleanRecords = records.map((row) => row.record);
      const toSave = ocrRaw && cleanRecords.length === 1
        ? [{ ...cleanRecords[0], _ocrOriginal: { raw: ocrRaw, at: new Date().toISOString(), source: entity.source } }]
        : cleanRecords;

      /* ★OCR 로 만든 레코드에는 **원본 파일도 함께 붙인다.** */
      if (ocrRaw && file && toSave.length === 1) {
        const rec = toSave[0];
        const key = String(rec.plate || rec.policyNo || 'new');
        const url = await uploadDoc(file, docPath(target, entityKey, key, file.name));
        if (url) {
          toSave[0] = {
            ...rec,
            _docs: pushDocVersion(rec, {
              type: entityKey, url, ocr: ocrRaw,
              reason: '데이터센터 OCR 투입', by: String(user?.name || user?.email || ''),
            }),
          };
        }
      }
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
      const mapped = mapOcrToEntity(entityKey, r.raw || {});
      const row = buildPendingRow({
        rid: newRid(),
        entityKey,
        record: mapped,
        source: 'ocr',
        crosscheck: r.crosscheck || null,
        filename: file.name,
        mime: file.type,
      });
      setRecords([row]);
      setSelectedPending(row);
      setPicked(row._rid);
      setSheetView('대기');
      setPanelOpen(false);
      setUniversalOpen(false);
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
      setRecords(recs.map((r) => buildPendingRow({ rid: newRid(), entityKey, record: r, source: 'excel' })));
      setSelectedPending(null);
      setPicked(null);
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
    const row = buildPendingRow({ rid: newRid(), entityKey, record: filled, source: 'manual' });
    setRecords([row]);
    setSelectedPending(row);
    setPicked(row._rid);
    setSheetView('대기');
    setPanelOpen(false);
    toast('직접입력 1건 — 검토 후 저장', 'success');
  }

  function patchPendingRecord(rid: string, next: EntityRecord) {
    setRecords((prev) => prev.map((row) => {
      if (row._rid !== rid) return row;
      const refreshed = refreshPendingRow(entityKey, row, next);
      setSelectedPending((cur) => (cur && cur._rid === rid ? refreshed : cur));
      return refreshed;
    }));
  }

  const methodTabs = useMemo(() => {
    const list: { key: Tab; label: string }[] = [];
    if (entity.ocrType) list.push({ key: 'ocr', label: 'OCR' });
    list.push({ key: 'excel', label: '엑셀' }, { key: 'manual', label: '직접' });
    return list;
  }, [entity.ocrType]);

  /** 대기 표 — 파일형태 · 문서종류 · 카테고리 · 분석요약 · 신뢰도 · 상태 */
  const pendingCols = useMemo<SheetCol<IngestPendingRow>[]>(() => [
    {
      key: 'fileForm',
      label: '파일',
      pin: true,
      priority: 1,
      text: (r) => r.fileForm,
      render: (r) => r.fileForm || LEDGER_EMPTY.dash,
    },
    {
      key: 'docKind',
      label: '문서종류',
      priority: 1,
      text: (r) => r.docKind,
      render: (r) => <span style={{ fontWeight: 700 }}>{r.docKind || LEDGER_EMPTY.dash}</span>,
    },
    {
      key: 'category',
      label: '카테고리',
      priority: 1,
      text: (r) => r.category,
      render: (r) => <Badge tone="blue">{r.category}</Badge>,
    },
    {
      key: 'analysisSummary',
      label: '분석 결과',
      priority: 1,
      text: (r) => r.analysisSummary,
      render: (r) => (
        <TwoLineCell
          main={r.analysisSummary}
          sub={r.unreadLabels.length ? `미인식 ${r.unreadLabels.length} · ${r.unreadLabels.slice(0, 3).join('·')}` : undefined}
        />
      ),
    },
    {
      key: 'confidence',
      label: '신뢰도',
      priority: 2,
      align: 'r',
      text: (r) => r.confidence == null ? '' : String(r.confidence),
      render: (r) => (r.confidence == null ? LEDGER_EMPTY.dash : `${r.confidence}%`),
    },
    {
      key: 'status',
      label: '상태',
      priority: 1,
      text: (r) => r.statusLabel,
      render: (r) => <Badge tone={r.statusTone}>{r.statusLabel}</Badge>,
    },
  ], []);

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
    {
      key: 'fileForm',
      label: '파일',
      pin: true,
      priority: 1,
      text: (r) => summarizeSavedRow(entityKey, r).fileForm,
      render: (r) => summarizeSavedRow(entityKey, r).fileForm || LEDGER_EMPTY.dash,
    },
    {
      key: 'docKind',
      label: '문서종류',
      priority: 1,
      text: (r) => summarizeSavedRow(entityKey, r).docKind,
      render: (r) => {
        const s = summarizeSavedRow(entityKey, r);
        return <span style={{ fontWeight: 700 }}>{s.docKind || LEDGER_EMPTY.dash}</span>;
      },
    },
    {
      key: 'category',
      label: '카테고리',
      priority: 1,
      text: (r) => summarizeSavedRow(entityKey, r).category,
      render: (r) => <Badge tone="blue">{summarizeSavedRow(entityKey, r).category}</Badge>,
    },
    {
      key: 'analysisSummary',
      label: '분석 결과',
      priority: 1,
      text: (r) => summarizeSavedRow(entityKey, r).analysisSummary,
      render: (r) => {
        const s = summarizeSavedRow(entityKey, r);
        return <TwoLineCell main={s.analysisSummary} sub={s.unreadHint || undefined} />;
      },
    },
    {
      key: 'confidence',
      label: '신뢰도',
      priority: 2,
      align: 'r',
      text: (r) => {
        const c = summarizeSavedRow(entityKey, r).confidence;
        return c == null ? '' : String(c);
      },
      render: (r) => {
        const c = summarizeSavedRow(entityKey, r).confidence;
        return c == null ? LEDGER_EMPTY.dash : `${c}%`;
      },
    },
    {
      key: 'status',
      label: '상태',
      priority: 1,
      text: (r) => summarizeSavedRow(entityKey, r).statusLabel,
      render: (r) => {
        const s = summarizeSavedRow(entityKey, r);
        return <Badge tone={s.statusTone}>{s.statusLabel}</Badge>;
      },
    },
    {
      key: '_at',
      label: '저장시각',
      priority: 3,
      text: (r) => String(r.createdAt || r.uploadedAt || ''),
      render: (r) => String(r.createdAt || r.uploadedAt || '').slice(0, 16).replace('T', ' ') || LEDGER_EMPTY.dash,
    },
  ], [entityKey]);

  const savedDetailCols = useMemo<SheetCol<EntityRecord>[]>(() => entity.fields.map((field) => ({
    key: field.key,
    label: field.label,
    text: (row) => String(row[field.key] ?? ''),
    render: (row) => {
      const value = String(row[field.key] ?? '').trim();
      if (!value) return LEDGER_EMPTY.dash;
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

  const pendingDetailCols = useMemo<SheetCol<EntityRecord>[]>(() => entity.fields.map((field) => ({
    key: field.key,
    label: field.manual ? `${field.label}·확인` : field.label,
    text: (row) => String(row[field.key] ?? ''),
    render: (row) => {
      const value = String(row[field.key] ?? '').trim();
      return value || LEDGER_EMPTY.dash;
    },
  })), [entity.fields]);

  const pendingDetailSections = useMemo(() => {
    const primaryKeys = new Set(manualPrimaryFields.map((field) => field.key));
    return [
      { title: '기본정보', open: true, cols: pendingDetailCols.filter((col) => primaryKeys.has(col.key)) },
      { title: '추가 운영정보', cols: pendingDetailCols.filter((col) => !primaryKeys.has(col.key)) },
    ];
  }, [manualPrimaryFields, pendingDetailCols]);

  // OCR 추출 중에는 시트 자리를 비우지 않는다 — 진행은 투입패널 FileDrop note.
  const sheetBusy = sheetView === '저장본' && savedLoading;

  const sheetBody = sheetBusy ? (
    <PageLoading label="불러오는 중…" />
  ) : sheetView === '대기' ? (
    <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0, gap: 8 }}>
      {/* 안내 배너 없음 — 헤더가 상시 서 있으므로 «뭘 올리면 뭐가 채워지는지»는 표가 말한다.
          올리기는 상단 툴바 [업로드] 버튼 하나로 충분하다(같은 일을 두 자리에서 시키지 않는다). */}
      <ExcelSheet
        cols={pendingCols}
        rows={records}
        rowKey={(r) => r._rid}
        selectedRowKey={picked}
        onRow={(r) => setPicked(r._rid)}
        onRowDoubleClick={(r) => {
          setPicked(r._rid);
          setSelectedPending((cur) => (cur && cur._rid === r._rid ? null : r));
          setPanelOpen(false);
          setUniversalOpen(false);
          setSelectedSaved(null);
        }}
        fit
      />
    </div>
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
      {/* 빈 저장본도 열 헤더는 상시 — EmptyState로 표를 갈아엎지 않음 */}
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
          setSelectedPending(null);
        }}
        fit
      />
      {!savedRows.length ? (
        <div style={{ padding: '8px 0 0' }}>
          <Message variant="info">저장본 없음 — 대기에서 검토 후 저장하면 여기 쌓입니다.</Message>
        </div>
      ) : null}
    </>
  );

  const universalPanel = universalOpen ? (
    <LedgerRecordPanel
      title="업로드"
      identity="종류를 몰라도 먼저 등록 · 이후 분석·분류"
      row={{}}
      cols={[]}
      onClose={cancelUniversal}
      actions={(
        <>
          <Btn size="sm" variant="ghost" disabled={universalBusy} onClick={cancelUniversal}>업로드 취소</Btn>
          <Btn
            size="sm"
            variant="solid"
            disabled={universalBusy || !stagedFiles.length || isAllScope(companyId)}
            onClick={() => { void uploadOriginals(stagedFiles); }}
          >
            {universalBusy ? '보관 중…' : `업로드${stagedFiles.length ? ` ${stagedFiles.length}건` : ''}`}
          </Btn>
        </>
      )}
    >
      {isAllScope(companyId) ? (
        <Message variant="warning">원본 자료가 잘못 귀속되지 않도록 상단에서 보관할 회사를 먼저 선택하세요.</Message>
      ) : (
        <>
          <FileDrop
            multiple
            disabled={universalBusy}
            onFiles={(files) => setStagedFiles((prev) => [...prev, ...Array.from(files)])}
            accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.csv"
            hint="등록증 · 계약서 · 보험증권 · 계좌엑셀 · 영수증 · 일반문서"
            note={universalBusy ? '원본 보관 중…' : stagedFiles.length ? `${stagedFiles.length}개 선택됨 — 업로드를 누르세요` : undefined}
            style={stagedFiles.length ? { borderColor: 'var(--green-border)', background: 'var(--green-bg)' } : undefined}
          />
              {stagedFiles.length > 0 && (
            <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.6 }}>
              {stagedFiles.map((f, i) => (
                <div key={`${f.name}-${i}`} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
              ))}
              <div style={{ marginTop: 6 }}>
                <Btn size="sm" variant="ghost" disabled={universalBusy} onClick={() => setStagedFiles([])}>선택 비우기</Btn>
              </div>
            </div>
          )}
          <Message variant="info">파일을 고른 뒤 [업로드]로 원본 건을 만듭니다. [업로드 취소]는 선택·패널을 닫습니다.</Message>
        </>
      )}
    </LedgerRecordPanel>
  ) : null;

  const inputPanel = panelOpen && !universalOpen && !selectedPending && !selectedSaved ? (
    <LedgerRecordPanel
      title={`${entity.label} 투입`}
      identity={tab === 'ocr' ? entity.source : tab === 'excel' ? 'xlsx · csv' : '폼 확정 → 대기'}
      row={{}}
      cols={[]}
      onClose={() => setPanelOpen(false)}
      actions={!isAllScope(companyId) ? (
        <>
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
        </>
      ) : undefined}
    >
      {isAllScope(companyId) ? (
        <Message variant="warning">분석 결과와 원본이 잘못 귀속되지 않도록 상단에서 대상 회사를 먼저 선택하세요.</Message>
      ) : (
        <>
          {tab === 'ocr' && (
            <FileDrop
              onFile={setFile}
              file={file}
              disabled={loading}
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              hint={`${entity.source} (PDF·JPG·PNG)`}
              note={loading ? 'OCR 추출 중…' : parsing ? '읽는 중…' : undefined}
            />
          )}
          {tab === 'excel' && (
            <FileDrop
              onFile={onExcelFile}
              disabled={parsing}
              accept=".xlsx,.xls,.csv"
              hint=".xlsx · .csv"
              note={parsing ? '엑셀 읽는 중…' : undefined}
            />
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
    </LedgerRecordPanel>
  ) : null;

  const pendingDetailPanel = sheetView === '대기' && selectedPending ? (
    <LedgerRecordPanel
      title={selectedPending.docKind}
      identity={selectedPending.category}
      statusBadge={<Badge tone={selectedPending.statusTone}>{selectedPending.statusLabel}</Badge>}
      row={selectedPending.record}
      cols={pendingDetailCols}
      sections={pendingDetailSections}
      onClose={() => setSelectedPending(null)}
      actions={(
        <>
          <Btn size="sm" variant="ghost" onClick={() => {
            setRecords((prev) => prev.filter((r) => r._rid !== selectedPending._rid));
            setSelectedPending(null);
            setPicked(null);
          }}>대기에서 제거</Btn>
          <Btn size="sm" variant="solid" disabled={saving} onClick={() => { void saveRecords(); }}>
            {saving ? '저장 중…' : records.length > 1 ? `전체 저장 ${records.length}건` : '저장'}
          </Btn>
        </>
      )}
    >
      <div style={{ marginBottom: 12 }}>
        <TwoLineCell
          main={selectedPending.analysisSummary}
          sub={selectedPending.confidence != null ? `신뢰도 ${selectedPending.confidence}%` : selectedPending.unreadLabels.length ? `미인식 ${selectedPending.unreadLabels.join('·')}` : undefined}
        />
      </div>
      {selectedPending.crosscheck ? <OcrCrosscheck result={selectedPending.crosscheck} /> : null}
      <div style={{ fontSize: 12, fontWeight: 800, color: C.ink, margin: '10px 0 8px' }}>필드 수정</div>
      <FormGrid
        fields={entity.fields.filter((f) => manualPrimaryFields.some((p) => p.key === f.key) || selectedPending.record[f.key] != null || f.required || f.manual)}
        form={selectedPending.record}
        onChange={(k, v) => patchPendingRecord(selectedPending._rid, { ...selectedPending.record, [k]: v })}
      />
    </LedgerRecordPanel>
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
              setSelectedPending(null);
              resetQueue();
              setForm({});
              setStagedFiles([]);
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
            onChange={(k) => { setTab(k as Tab); setError(''); setFile(null); setPanelOpen(true); setSelectedPending(null); }}
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
            tip={panelOpen || universalOpen || selectedPending || selectedSaved ? '패널 숨기기' : '투입패널 표시하기'}
            onClick={() => {
              if (selectedSaved) setSelectedSaved(null);
              else if (selectedPending) setSelectedPending(null);
              else if (universalOpen) setUniversalOpen(false);
              else setPanelOpen((o) => !o);
            }}
          >
            {panelOpen || universalOpen || selectedPending || selectedSaved ? <PanelRightClose size={14} /> : <PanelRight size={14} />}
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
            onClick={() => { setUniversalOpen(true); setPanelOpen(false); setSelectedSaved(null); setSelectedPending(null); setStagedFiles([]); }}
          >
            <UploadCloud size={14} /> 업로드
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
      hint={error || (ocrCrosscheck && sheetView === '대기' && !selectedPending) ? (
        <>
          {error ? <Message variant="danger">{error}</Message> : null}
          {ocrCrosscheck && sheetView === '대기' && !selectedPending ? <OcrCrosscheck result={ocrCrosscheck} /> : null}
        </>
      ) : parseNotice ? <Message variant="warning">{parseNotice}</Message> : undefined}
      body={sheetBody}
      sidePanel={savedDetailPanel || pendingDetailPanel || universalPanel || inputPanel}
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
