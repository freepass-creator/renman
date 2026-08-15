'use client';
/**
 * 데이터관리 — 전 엔티티 투입구. 메뉴 진입=파일 먼저(무엇이든 올리기). OCR·엑셀·직접은 종류 선택 후.
 * LedgerFrame 공용 셸 + body(시트) + sidePanel(투입/상세). 엔진(saveIntake·OCR·xlsx) 유지.
 *
 * 표 = 문서종류·카테고리·분석요약(원장 행문법). 엔티티 필드는 우측 패널.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { processingAttentionRank, summarizeProcessingQueue } from '@/lib/data-center-terms';
import { uploadToInbox } from '@/lib/inbox-upload';
import { uploadDoc, docPath } from '@/lib/storage';
import { pushDocVersion } from '@/lib/docs';
import { ENTITY_LIST, ENTITIES, type EntityRecord } from '@/lib/intake/entities';
import { parseCsv } from '@/lib/intake/csv';
import { saveIntake } from '@/lib/intake';
import { useEntityList } from '@/lib/use-entity-lists';
import { callOcrExtract } from '@/lib/ocr-client';
import { useSession } from '@/lib/session';
import { companyLabel } from '@/lib/companies';
import { resolveWriteCompany, NEED_COMPANY, isAllScope } from '@/lib/scope';
import { layerOfEntity } from '@/lib/domain/layers';
import { UploadCloud, Trash2, FileSpreadsheet, PanelRight, PanelRightClose, FileText, ExternalLink } from 'lucide-react';
import FileDrop from '@/components/FileDrop';
import { toast } from '@/lib/toast';
import {
  LedgerFrame, LedgerRecordPanel, Badge, Btn, FormGrid, PillTabs, Select, Search,
  C, Message, OcrCrosscheck, PageLoading, EmptyState, LedgerActions,
  ExcelSheet, TwoLineCell, Spinner, TextLink, type SheetCol,
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
  makeIngestPage, mergePageExtracts, buildMergedCrosscheck,
  type IngestPendingRow, type IngestPage,
} from '@/lib/ingest-summary';
import {
  DOC_KINDS, decodeIntakePick, docVersionType, encodeIntakePick, entitiesWithoutDocKind,
} from '@/lib/doc-kinds';
import RebornHeader from '@/app/sheet/reborn/_components/RebornHeader';

export const dynamic = 'force-dynamic';

type Tab = 'ocr' | 'excel' | 'manual';
type SheetView = '대기' | '저장본';

const LAYER_TITLE: Record<string, string> = {
  ledger: '① 원장',
  event: '③ 이벤트',
  system: '도구',
};
/**
 * 어떤 종이도 가리키지 않는 원장만 층별로 묶는다 — 종류 축(문서) 아래에 「원장 직접」으로 남긴다.
 * 종이가 있는 원장을 여기 또 넣으면 같은 목적지가 두 줄이 되어 어느 쪽을 골라야 하는지가 흐려진다.
 */
const ORPHAN_ENTITY_GROUPS = (() => {
  const orphans = new Set(entitiesWithoutDocKind(ENTITY_LIST.map((e) => e.key)));
  return (['ledger', 'event', 'system'] as const)
    .map((layer) => ({
      title: LAYER_TITLE[layer],
      items: ENTITY_LIST.filter((e) => orphans.has(e.key) && layerOfEntity(e.key) === layer),
    }))
    .filter((g) => g.items.length > 0);
})();

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

function pageStatusTone(status: IngestPage['status']): 'green' | 'amber' | 'red' | 'gray' {
  if (status === '읽음') return 'green';
  if (status === '분석중') return 'amber';
  if (status === '미인식') return 'red';
  return 'gray';
}

function openPageFile(page: IngestPage) {
  if (!page.file) return;
  const url = URL.createObjectURL(page.file);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function IngestInner() {
  const mobile = useIsMobile();
  const router = useRouter();
  const { companyId, user } = useSession();
  const sp = useSearchParams();
  /* 투입 축 = **종이(문서 종류)**. 엔티티는 종류에서 파생한다(규격 §3-2).
     `?type=` 딥링크는 엔티티를 직접 가리키므로 그대로 존중한다(기존 링크·북마크 보존). */
  const [pickSrc, setPickSrc] = useState(() => {
    const t = sp.get('type');
    return t ? encodeIntakePick('entity', t) : encodeIntakePick('kind', DOC_KINDS[0].kind);
  });
  const pick = useMemo(() => decodeIntakePick(pickSrc, (e) => ENTITIES[e]?.ocrType), [pickSrc]);
  const entityKey = pick.entity;
  /** 이 투입에 쓸 OCR 스키마 — **종이가 정한다**. 견적서처럼 종이에 OCR이 없으면 없는 것이다
   *  (엔티티 폴백을 쓰면 견적서에 자동차등록증 OCR 이 돌아 엉뚱한 값이 들어온다). */
  const activeOcrType = pick.ocrType;
  const [saving, setSaving] = useState(false);
  const [sheetView, setSheetView] = useState<SheetView>('대기');
  /** 메뉴로 들어오면 파일 먼저. `?type=`·`?plate=` 딥링크만 OCR/직접 투입 패널. */
  const typeQ = sp.get('type');
  const plateQ = sp.get('plate');
  const typedIntake = Boolean(typeQ || plateQ);
  const [panelOpen, setPanelOpen] = useState(typedIntake);
  const [universalOpen, setUniversalOpen] = useState(!typedIntake);
  const [universalBusy, setUniversalBusy] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const { rows: savedList, loading: savedLoading, reload: reloadSaved } = useEntityList(entityKey);
  const [tab, setTab] = useState<Tab>(() => (sp.get('plate') ? 'manual' : 'ocr'));
  const [records, setRecords] = useState<IngestPendingRow[]>([]);
  const [ocrRaw, setOcrRaw] = useState<Record<string, unknown> | null>(null);
  const [ocrCrosscheck, setOcrCrosscheck] = useState<CrosscheckResult | null>(null);
  const [error, setError] = useState('');
  /** OCR 투입용 장 후보(아직 건으로 묶기 전). */
  const [ocrFiles, setOcrFiles] = useState<File[]>([]);
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
    if (tab === 'ocr' && !activeOcrType) setTab('excel');
  }, [tab, activeOcrType]);

  useEffect(() => {
    if (typeQ || plateQ) {
      setUniversalOpen(false);
      setPanelOpen(true);
    }
  }, [typeQ, plateQ]);

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
    setOcrFiles([]);
  }

  function applyPending(rid: string, next: IngestPendingRow) {
    setRecords((prev) => prev.map((row) => (row._rid === rid ? next : row)));
    setSelectedPending((cur) => (cur && cur._rid === rid ? next : cur));
  }

  function cancelUniversal() {
    if (universalBusy) return;
    setStagedFiles([]);
    setUniversalOpen(false);
  }

  /* ★업로드 버튼은 «업로드 ⇄ 취소» 토글 1개다(사장님 확정). 나란히 두 개 두지 않는다 —
     멈출 수 있는 건 도는 동안뿐이니 자리도 같아야 한다. 파일 사이에서만 끊어
     이미 올라간 건은 살리고(부분 성공 보고) 남은 건만 버린다. */
  const abortUpload = useRef(false);

  async function uploadOriginals(list: File[]) {
    const target = resolveWriteCompany(companyId, null);
    if (!target) { toast(NEED_COMPANY, 'error'); return; }
    if (!list.length) return;
    abortUpload.current = false;
    setUniversalBusy(true);
    let saved = 0;
    let duplicates = 0;
    let aborted = false;
    const failures: string[] = [];
    try {
      for (const original of list) {
        if (abortUpload.current) { aborted = true; break; }
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
      if (aborted) {
        // 이미 올라간 건은 되돌리지 않는다 — 몇 건이 남았는지 알려주고 그 건들만 선택에 남긴다.
        setStagedFiles(list.slice(saved + failures.length));
        toast(`업로드 취소 — ${saved}건 접수 · ${list.length - saved - failures.length}건 남김`, 'info');
      } else if (!failures.length && saved) {
        toast(`원본 ${saved}건 접수${duplicates ? ` · 중복 ${duplicates}건` : ' · 처리대기'}`, 'success');
        setPickSrc(encodeIntakePick('entity', 'inbox'));
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
      abortUpload.current = false;
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

      /* ★OCR 건에는 **장마다 원본 파일**을 붙인다(앞·뒤 등록증 등). */
      const pendingWithPages = records.find((row) => row.pages.some((p) => p.file));
      if (ocrRaw && pendingWithPages && toSave.length === 1) {
        let rec = toSave[0];
        const key = String(rec.plate || rec.policyNo || 'new');
        for (const page of pendingWithPages.pages) {
          if (!page.file) continue;
          const url = await uploadDoc(page.file, docPath(target, entityKey, key, page.fileName));
          if (!url) continue;
          rec = {
            ...rec,
            _docs: pushDocVersion(rec, {
              type: docVersionType(pick.kind), url, ocr: page.extracted || ocrRaw,
              reason: `데이터센터 OCR · ${page.fileName}`, by: String(user?.name || user?.email || ''),
            }),
          };
        }
        toSave[0] = rec;
      } else if (ocrRaw && toSave.length === 1) {
        // pages 없이 단일 추출만 남은 폴백
        const rec = toSave[0];
        const key = String(rec.plate || rec.policyNo || 'new');
        const firstFile = records[0]?.pages[0]?.file;
        if (firstFile) {
          const url = await uploadDoc(firstFile, docPath(target, entityKey, key, firstFile.name));
          if (url) {
            toSave[0] = {
              ...rec,
              _docs: pushDocVersion(rec, {
                type: docVersionType(pick.kind), url, ocr: ocrRaw,
                reason: '데이터센터 OCR 투입', by: String(user?.name || user?.email || ''),
              }),
            };
          }
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
    if (!ocrFiles.length) { setError('파일을 선택하세요'); return; }
    if (!activeOcrType) { setError(`「${pick.kind}」은 OCR 스키마가 없습니다 — 엑셀·직접입력 또는 「무엇이든 올리기」로 원본을 보관하세요`); return; }
    setError('');
    setOcrCrosscheck(null);

    const pages = ocrFiles.map((f) => makeIngestPage(f));
    const rid = newRid();
    // 종류는 사용자가 이미 골랐다 — 엔티티에서 되짚어 추측하지 않는다(규격 §3-2).
    const docKind = pick.kind;
    let row = buildPendingRow({
      rid,
      entityKey,
      record: {},
      source: 'ocr',
      docKind,
      pages,
    });
    setRecords((prev) => [...prev, row]);
    setSelectedPending(row);
    setPicked(rid);
    setSheetView('대기');
    setPanelOpen(false);
    setUniversalOpen(false);
    setOcrFiles([]);
    toast(`${pages.length}장 OCR 시작`, 'info');

    const working = [...pages];
    for (let i = 0; i < working.length; i++) {
      working[i] = { ...working[i], status: '분석중', error: undefined };
      row = refreshPendingRow(entityKey, row, { pages: [...working] });
      applyPending(rid, row);

      try {
        const file = working[i].file;
        if (!file) {
          working[i] = { ...working[i], status: '미인식', error: '파일 없음' };
        } else {
          // 스키마는 고른 종이가 정한다(runOcr 진입에서 activeOcrType 유무를 이미 막았다).
          const r = await callOcrExtract(file, activeOcrType || '');
          if (!r.ok || !r.raw) {
            working[i] = { ...working[i], status: '미인식', error: r.error || '추출 실패', extracted: null };
          } else {
            working[i] = { ...working[i], status: '읽음', extracted: r.raw, error: undefined };
          }
        }
      } catch (e) {
        working[i] = {
          ...working[i],
          status: '미인식',
          error: (e as Error).message || 'OCR 실패',
          extracted: null,
        };
      }

      const { record, conflicts, mergedRaw } = mergePageExtracts(entityKey, working);
      const cc = buildMergedCrosscheck(entity.ocrType, mergedRaw, conflicts);
      row = refreshPendingRow(entityKey, row, { record, pages: [...working], crosscheck: cc });
      applyPending(rid, row);
      setOcrRaw(mergedRaw);
      setOcrCrosscheck(cc);
    }

    const ok = working.filter((p) => p.status === '읽음').length;
    const fail = working.filter((p) => p.status === '미인식').length;
    if (ok) toast(`OCR ${ok}장 읽음${fail ? ` · ${fail}장 미인식` : ''} — 검토 후 저장`, fail ? 'info' : 'success');
    else toast('OCR 실패 — 장을 확인하고 다시 시도하세요', 'error');
  }

  async function addPagesToPending(files: FileList | File[]) {
    if (!selectedPending || selectedPending.source !== 'ocr') return;
    const list = [...files];
    if (!list.length) return;
    const rid = selectedPending._rid;
    let working = [...selectedPending.pages, ...list.map((f) => makeIngestPage(f))];
    let row = refreshPendingRow(entityKey, selectedPending, { pages: working });
    applyPending(rid, row);

    for (let i = 0; i < working.length; i++) {
      if (working[i].status !== '대기') continue;
      working[i] = { ...working[i], status: '분석중' };
      row = refreshPendingRow(entityKey, row, { pages: [...working] });
      applyPending(rid, row);
      try {
        const file = working[i].file;
        if (!file || !entity.ocrType) {
          working[i] = { ...working[i], status: '미인식', error: 'OCR 불가' };
        } else {
          // 스키마는 고른 종이가 정한다(runOcr 진입에서 activeOcrType 유무를 이미 막았다).
          const r = await callOcrExtract(file, activeOcrType || '');
          working[i] = r.ok && r.raw
            ? { ...working[i], status: '읽음', extracted: r.raw }
            : { ...working[i], status: '미인식', error: r.error || '추출 실패' };
        }
      } catch (e) {
        working[i] = { ...working[i], status: '미인식', error: (e as Error).message };
      }
      const { record, conflicts, mergedRaw } = mergePageExtracts(entityKey, working);
      const cc = buildMergedCrosscheck(entity.ocrType, mergedRaw, conflicts);
      row = refreshPendingRow(entityKey, row, { record, pages: [...working], crosscheck: cc });
      applyPending(rid, row);
      setOcrRaw(mergedRaw);
      setOcrCrosscheck(cc);
    }
  }

  function removePageFromPending(pageId: string) {
    if (!selectedPending) return;
    const working = selectedPending.pages.filter((p) => p.id !== pageId);
    const { record, conflicts, mergedRaw } = mergePageExtracts(entityKey, working);
    const cc = working.length ? buildMergedCrosscheck(entity.ocrType, mergedRaw, conflicts) : null;
    const row = refreshPendingRow(entityKey, selectedPending, { record, pages: working, crosscheck: cc });
    applyPending(selectedPending._rid, row);
    setOcrRaw(working.length ? mergedRaw : null);
    setOcrCrosscheck(cc);
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
      const refreshed = refreshPendingRow(entityKey, row, { record: next });
      setSelectedPending((cur) => (cur && cur._rid === rid ? refreshed : cur));
      return refreshed;
    }));
  }

  const methodTabs = useMemo(() => {
    const list: { key: Tab; label: string }[] = [];
    if (activeOcrType) list.push({ key: 'ocr', label: 'OCR' });
    list.push({ key: 'excel', label: '엑셀' }, { key: 'manual', label: '직접' });
    return list;
  }, [activeOcrType]);

  /** 대기 표 — §4-9-2: 형태·성격·귀속·대상·행선지·장·분석 */
  const pendingCols = useMemo<SheetCol<IngestPendingRow>[]>(() => [
    {
      key: 'fileForm',
      label: '형태',
      pin: true,
      priority: 1,
      text: (r) => r.fileForm,
      render: (r) => r.fileForm || LEDGER_EMPTY.dash,
    },
    {
      key: 'nature',
      label: '성격',
      priority: 1,
      text: (r) => r.nature,
      render: (r) => <Badge tone="purple">{r.nature}</Badge>,
    },
    {
      key: 'division',
      label: '귀속',
      priority: 1,
      text: (r) => r.division,
      render: (r) => <Badge tone="blue">{r.division}</Badge>,
    },
    {
      key: 'target',
      label: '대상',
      priority: 1,
      text: (r) => r.target,
      render: (r) => (
        <span style={{ fontWeight: 700, color: r.targetAssigned ? C.ink : C.danger }}>
          {r.target}
        </span>
      ),
    },
    {
      key: 'dest',
      label: '행선지',
      priority: 1,
      text: (r) => r.destLabel,
      render: (r) => (
        <TextLink stop onClick={() => router.push(r.destHref)}>
          {r.destLabel}
        </TextLink>
      ),
    },
    {
      key: 'pages',
      label: '장',
      priority: 2,
      text: (r) => r.pageCountLabel,
      render: (r) => r.pageCountLabel,
    },
    {
      key: 'analysis',
      label: '분석',
      priority: 1,
      text: (r) => r.analysisLabel,
      render: (r) => <Badge tone={r.analysisTone}>{r.analysisLabel}</Badge>,
    },
    {
      key: 'docKind',
      label: '종류',
      priority: 2,
      text: (r) => r.docKind,
      render: (r) => <TwoLineCell main={r.docKind} sub={r.analysisSummary} />,
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
          <Btn
            size="sm"
            variant={universalBusy ? 'ghost' : 'solid'}
            disabled={universalBusy ? false : (!stagedFiles.length || isAllScope(companyId))}
            onClick={() => {
              if (universalBusy) { abortUpload.current = true; return; }
              void uploadOriginals(stagedFiles);
            }}
          >
            {universalBusy ? '업로드 취소' : stagedFiles.length ? `업로드 ${stagedFiles.length}장` : '업로드'}
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
            <Btn size="sm" variant="solid" onClick={runOcr} disabled={!ocrFiles.length}>
              {ocrFiles.length > 1 ? `OCR 추출 ${ocrFiles.length}장` : 'OCR 추출'}
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
            <>
              <FileDrop
                multiple
                onFiles={(files) => setOcrFiles((prev) => [...prev, ...Array.from(files)])}
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                hint={`${pick.kind} — 앞·뒤 등 여러 장 한 번에`}
                note={ocrFiles.length ? `${ocrFiles.length}장 선택됨 — 한 건으로 묶어 OCR` : undefined}
                style={ocrFiles.length ? { borderColor: 'var(--green-border)', background: 'var(--green-bg)' } : undefined}
              />
              {ocrFiles.length > 0 && (
                <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.6 }}>
                  {ocrFiles.map((f, i) => (
                    <div key={`${f.name}-${i}`}>{i + 1}장 · {f.name}</div>
                  ))}
                  <div style={{ marginTop: 6 }}>
                    <Btn size="sm" variant="ghost" onClick={() => setOcrFiles([])}>선택 비우기</Btn>
                  </div>
                </div>
              )}
              <Message variant="info">여러 장은 한 문서 건으로 묶입니다. 진행은 상세패널의 장 목록에서 보입니다.</Message>
            </>
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
      identity={`${selectedPending.category}${selectedPending.pages.length ? ` · ${selectedPending.pages.length}장` : ''}`}
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
          <Btn size="sm" variant="solid" disabled={saving || selectedPending.pages.some((p) => p.status === '분석중')} onClick={() => { void saveRecords(); }}>
            {saving ? '저장 중…' : records.length > 1 ? `전체 저장 ${records.length}건` : '저장'}
          </Btn>
        </>
      )}
    >
      {/* 상세 최상단 = 장 목록 (§4-9). 스피너는 장 행 안만. */}
      {selectedPending.pages.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.ink, marginBottom: 8 }}>
            장 {selectedPending.pages.length}개
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            {selectedPending.pages.map((page, index) => (
              <div
                key={page.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px',
                  borderTop: index ? `1px solid ${C.line}` : undefined,
                  background: C.bg,
                  minHeight: 40,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: C.mute, width: 28, flexShrink: 0 }}>{index + 1}장</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {page.fileName}
                </span>
                {page.status === '분석중' ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.accent, fontWeight: 700 }}>
                    <Spinner size={14} color={C.accent} /> 분석 중
                  </span>
                ) : (
                  <Badge tone={pageStatusTone(page.status)}>{page.status}</Badge>
                )}
                <Btn size="sm" variant="ghost" iconOnly tip="열기" disabled={!page.file} onClick={() => openPageFile(page)}>
                  <ExternalLink size={14} />
                </Btn>
                <Btn
                  size="sm"
                  variant="ghost"
                  iconOnly
                  tip="장 삭제"
                  disabled={page.status === '분석중'}
                  onClick={() => removePageFromPending(page.id)}
                >
                  <Trash2 size={14} />
                </Btn>
              </div>
            ))}
          </div>
          {selectedPending.source === 'ocr' && entity.ocrType && (
            <div style={{ marginTop: 10 }}>
              <FileDrop
                multiple
                onFiles={(files) => { void addPagesToPending(files); }}
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                hint="장 추가"
                style={{ minHeight: 72, padding: '12px 10px' }}
              />
            </div>
          )}
          {selectedPending.pages.some((p) => p.error) && (
            <Message variant="warning">
              {selectedPending.pages.filter((p) => p.error).map((p) => `${p.fileName}: ${p.error}`).join(' · ')}
            </Message>
          )}
        </div>
      )}
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
      title="자료올리기"
      meta="원본 접수 · AI 분석 · 데이터 연결"
      showColView={false}
      filters={(
        <>
          {/* 고르는 축 = **종이**(규격 §3-2). 실무자가 손에 든 건 「자동차등록증」이지 「차량」이 아니다.
              어느 원장·어느 OCR 로 갈지는 시스템이 정하고, 그 결과를 옆에 그대로 보여준다(숨기지 않는다). */}
          <Select
            size="sm"
            aria-label="문서 종류"
            value={pickSrc}
            onChange={(e) => {
              setPickSrc(e.target.value);
              setSelectedSaved(null);
              setSelectedPending(null);
              resetQueue();
              setForm({});
              setStagedFiles([]);
              setSheetView('대기');
            }}
            style={{ minWidth: mobile ? '100%' : 230 }}
          >
            <optgroup label="문서(종이)">
              {DOC_KINDS.map((d) => (
                <option key={d.kind} value={encodeIntakePick('kind', d.kind)}>{d.kind}</option>
              ))}
            </optgroup>
            {/* 종이가 없는 원장(이력·계좌·임대차·카드거래)도 직접입력·엑셀로 넣어야 한다 —
                종류 축으로만 좁히면 이 원장들이 화면에서 사라진다. */}
            {ORPHAN_ENTITY_GROUPS.map((g) => (
              <optgroup key={g.title} label={`${g.title} · 원장 직접`}>
                {g.items.map((e) => (
                  <option key={e.key} value={encodeIntakePick('entity', e.key)}>{e.label}</option>
                ))}
              </optgroup>
            ))}
          </Select>
          <span style={{ fontSize: 11.5, color: C.faint, whiteSpace: 'nowrap' }}>
            → {entity.label}{activeOcrType ? ` · OCR ${activeOcrType}` : ' · OCR 없음'}
          </span>
          <PillTabs
            size="sm"
            value={tab}
            onChange={(k) => { setTab(k as Tab); setError(''); setOcrFiles([]); setPanelOpen(true); setSelectedPending(null); }}
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
            variant={records.length && !universalOpen ? 'ghost' : 'solid'}
            onClick={() => {
              if (universalOpen) {
                cancelUniversal();
                return;
              }
              setUniversalOpen(true);
              setPanelOpen(false);
              setSelectedSaved(null);
              setSelectedPending(null);
              setStagedFiles([]);
            }}
          >
            <UploadCloud size={14} /> {universalOpen ? '취소' : '업로드'}
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
    <>
      <RebornHeader active="upload" />
      <Suspense fallback={<PageLoading />}>
        <IngestInner />
      </Suspense>
    </>
  );
}
