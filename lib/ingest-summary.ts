/**
 * 데이터센터 대기/저장본 행 요약 SSOT.
 * 표 = 파일형태·문서종류·카테고리·분석요약·신뢰도·상태.
 * **1건 = 문서, N장 = pages[]** (RENMAN-CURSOR §4-9).
 */
import { ENTITIES, mapOcrToEntity, type EntityRecord } from '@/lib/intake/entities';
import type { CrosscheckResult, CrosscheckIssue } from '@/lib/ocr-crosscheck';
import { crosscheckOcr } from '@/lib/ocr-crosscheck';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';
import {
  defaultDocKindForEntity, resolveDocKind, docDestination,
  type DocNature,
} from '@/lib/doc-kinds';
import type { WorkDivision } from '@/lib/work-taxonomy';

export type IngestBadgeTone = 'green' | 'amber' | 'red' | 'gray' | 'blue' | 'purple' | 'orange' | 'teal';

const IDENTITY_KEYS: Record<string, string[]> = {
  vehicle: ['plate', 'carName'],
  contract: ['contractorName', 'plate', 'contractNo'],
  customer: ['name', 'phone'],
  insurance: ['plate', 'policyNo', 'insurer'],
  penalty: ['plate', 'noticeNo'],
  bank_tx: ['counterparty', 'date', 'amount'],
  card_tx: ['merchant', 'date', 'amount'],
  work_item: ['title', 'plate'],
  inbox: ['filename', 'kind'],
};

export type IngestPendingSource = 'ocr' | 'excel' | 'manual';

/** 장(페이지) 상태 — 스피너는 «분석중» 행에만. */
export type IngestPageStatus = '대기' | '분석중' | '읽음' | '미인식';

export type IngestPage = {
  id: string;
  fileName: string;
  mime: string;
  status: IngestPageStatus;
  /** OCR raw (장별) */
  extracted?: Record<string, unknown> | null;
  error?: string;
  /** 메모리상 File — 미리보기·재추출·저장 첨부. 직렬화 안 함. */
  file?: File | null;
};

/** 파일 형태 — 확장자·MIME. 서류 종류(docKind)와 축이 다름. */
export function detectFileForm(input: { filename?: string; mime?: string; source?: IngestPendingSource }): string {
  if (input.source === 'excel') return '엑셀';
  if (input.source === 'manual') return '직접';
  const name = String(input.filename || '').toLowerCase();
  const mime = String(input.mime || '').toLowerCase();
  if (mime.includes('spreadsheet') || mime.includes('excel') || /\.(xlsx?|csv)$/.test(name)) return '엑셀';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'PDF';
  if (mime.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|bmp)$/.test(name)) return '이미지';
  if (name || mime) return '기타';
  return LEDGER_EMPTY.dash;
}

export function fileFormFromPages(pages: IngestPage[], source?: IngestPendingSource): string {
  if (!pages.length) return detectFileForm({ source });
  if (pages.length > 1) {
    const forms = new Set(pages.map((p) => detectFileForm({ filename: p.fileName, mime: p.mime, source })));
    if (forms.size === 1) return `${pages.length}장 · ${[...forms][0]}`;
    return `${pages.length}장 · 혼합`;
  }
  return detectFileForm({ filename: pages[0].fileName, mime: pages[0].mime, source });
}

export function makeIngestPage(file: File, id?: string): IngestPage {
  return {
    id: id || `pg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    fileName: file.name,
    mime: file.type || '',
    status: '대기',
    file,
  };
}

export type IngestPendingRow = {
  _rid: string;
  fileForm: string;
  /** ② 성격 */
  nature: DocNature;
  /** ③ 귀속 (WORK_DIVISIONS) */
  division: WorkDivision;
  docKind: string;
  category: string;
  /** 대상(차번·계약 등). 없으면 미배정 */
  target: string;
  targetAssigned: boolean;
  /** 행선지 라벨·href (계산값) */
  destLabel: string;
  destHref: string;
  /** 장 수 표시 */
  pageCountLabel: string;
  /** ⑤ 분석상태 파생 — 증빙=해당없음 */
  analysisLabel: string;
  analysisTone: IngestBadgeTone;
  analysisSummary: string;
  confidence: number | null;
  unreadLabels: string[];
  statusLabel: string;
  statusTone: IngestBadgeTone;
  record: EntityRecord;
  crosscheck?: CrosscheckResult | null;
  source: IngestPendingSource;
  pages: IngestPage[];
};

export function entityDocKind(entityKey: string): string {
  return defaultDocKindForEntity(entityKey) || ENTITIES[entityKey]?.source || ENTITIES[entityKey]?.label || entityKey;
}

export function entityCategory(entityKey: string): string {
  return ENTITIES[entityKey]?.label || entityKey;
}

function filledOcrLabels(entityKey: string, record: EntityRecord): string[] {
  const e = ENTITIES[entityKey];
  if (!e) return [];
  return e.fields
    .filter((f) => f.ocrFrom && record[f.key] != null && String(record[f.key]).trim() !== '')
    .map((f) => f.label);
}

export function unreadOcrLabels(entityKey: string, record: EntityRecord): string[] {
  const e = ENTITIES[entityKey];
  if (!e) return [];
  return e.fields
    .filter((f) => f.ocrFrom && (record[f.key] == null || String(record[f.key]).trim() === ''))
    .map((f) => f.label);
}

function identityLine(entityKey: string, record: EntityRecord): string {
  const keys = IDENTITY_KEYS[entityKey] || [ENTITIES[entityKey]?.idFrom || ''].filter(Boolean);
  const parts = keys.map((k) => String(record[k] ?? '').trim()).filter(Boolean);
  if (parts.length) return parts.join(' ');
  const e = ENTITIES[entityKey];
  if (e) {
    for (const f of e.fields.slice(0, 4)) {
      const v = String(record[f.key] ?? '').trim();
      if (v) return v;
    }
  }
  return LEDGER_EMPTY.unassigned;
}

export function buildAnalysisSummary(
  entityKey: string,
  record: EntityRecord,
  opts?: { crosscheck?: CrosscheckResult | null; source?: IngestPendingSource; pages?: IngestPage[] },
): string {
  const id = identityLine(entityKey, record);
  const read = filledOcrLabels(entityKey, record);
  let readBit: string;
  if (read.length) readBit = `${read.slice(0, 4).join('·')} 읽음`;
  else if (opts?.source === 'manual') readBit = '직접입력';
  else if (opts?.source === 'excel') {
    const filled = Object.values(record).filter((v) => v != null && String(v).trim() !== '').length;
    readBit = filled ? `엑셀 ${filled}필드` : '엑셀행';
  } else readBit = '인식값 없음';

  const pages = opts?.pages || [];
  if (pages.length > 1) {
    const ok = pages.filter((p) => p.status === '읽음').length;
    const busy = pages.filter((p) => p.status === '분석중').length;
    const fail = pages.filter((p) => p.status === '미인식').length;
    const bits = [`${pages.length}장`, ok ? `${ok}읽음` : '', busy ? `${busy}분석중` : '', fail ? `${fail}미인식` : ''].filter(Boolean);
    readBit = `${bits.join(' · ')} · ${readBit}`;
  }

  const issue = opts?.crosscheck?.issues?.[0]?.message;
  return issue ? `${id} / ${readBit} · ${issue}` : `${id} / ${readBit}`;
}

function statusFromPages(
  pages: IngestPage[],
  cc: CrosscheckResult | null | undefined,
  source: IngestPendingSource,
): { label: string; tone: IngestBadgeTone } {
  if (pages.some((p) => p.status === '분석중')) return { label: '분석중', tone: 'amber' };
  if (pages.some((p) => p.status === '미인식') && !pages.some((p) => p.status === '읽음')) {
    return { label: '미인식', tone: 'red' };
  }
  if (cc?.level === 'error') return { label: '확인필요', tone: 'red' };
  if (cc?.level === 'warn' || pages.some((p) => p.status === '미인식')) return { label: '검토', tone: 'amber' };
  if (source === 'ocr' && pages.some((p) => p.status === '읽음')) return { label: 'OCR대기', tone: 'green' };
  if (source === 'ocr') return { label: 'OCR대기', tone: 'green' };
  if (source === 'excel') return { label: '엑셀대기', tone: 'amber' };
  return { label: '직접대기', tone: 'gray' };
}

/** 장별 추출값을 한 레코드로 병합. 같은 키에 다른 값이면 첫 값 유지 + conflict. */
export function mergePageExtracts(
  entityKey: string,
  pages: IngestPage[],
): { record: EntityRecord; conflicts: CrosscheckIssue[]; mergedRaw: Record<string, unknown> } {
  const mapped = pages
    .filter((p) => p.extracted && Object.keys(p.extracted).length)
    .map((p) => ({ page: p, rec: mapOcrToEntity(entityKey, p.extracted || {}) }));

  const record: EntityRecord = {};
  const conflicts: CrosscheckIssue[] = [];
  const keys = new Set(mapped.flatMap((m) => Object.keys(m.rec)));
  for (const key of keys) {
    const vals = mapped
      .map((m) => ({ page: m.page.fileName, v: m.rec[key] }))
      .filter((x) => x.v != null && String(x.v).trim() !== '');
    if (!vals.length) continue;
    const uniq = [...new Map(vals.map((x) => [String(x.v), x])).values()];
    record[key] = uniq[0].v;
    if (uniq.length > 1) {
      const label = ENTITIES[entityKey]?.fields.find((f) => f.key === key)?.label || key;
      conflicts.push({
        field: key,
        message: `${label} 장별 불일치 — ${uniq.map((u) => u.v).join(' / ')}`,
        severity: 'warn',
      });
    }
  }

  const mergedRaw: Record<string, unknown> = {};
  for (const p of pages) {
    if (!p.extracted) continue;
    for (const [k, v] of Object.entries(p.extracted)) {
      if (v == null || v === '') continue;
      if (mergedRaw[k] == null || mergedRaw[k] === '') mergedRaw[k] = v;
    }
  }
  return { record, conflicts, mergedRaw };
}

export function buildMergedCrosscheck(
  ocrType: string | undefined,
  mergedRaw: Record<string, unknown>,
  conflicts: CrosscheckIssue[],
): CrosscheckResult {
  const base = ocrType ? crosscheckOcr(ocrType, mergedRaw) : { level: 'ok' as const, confidence: 100, issues: [] as CrosscheckIssue[] };
  const issues = [...base.issues, ...conflicts];
  const hasError = issues.some((i) => i.severity === 'error');
  const hasWarn = issues.some((i) => i.severity === 'warn');
  const penalty = issues.reduce((s, i) => s + (i.severity === 'error' ? 40 : 15), 0);
  return {
    level: hasError ? 'error' : hasWarn ? 'warn' : 'ok',
    confidence: Math.max(0, Math.min(100, 100 - penalty)),
    issues,
  };
}

function analysisFromPages(nature: DocNature, pages: IngestPage[], source: IngestPendingSource): { label: string; tone: IngestBadgeTone } {
  if (nature === '증빙') return { label: '해당없음', tone: 'gray' };
  if (source === 'manual') return { label: '해당없음', tone: 'gray' };
  if (source === 'excel') return { label: '읽음', tone: 'green' };
  if (!pages.length) return { label: '대기', tone: 'gray' };
  if (pages.some((p) => p.status === '분석중')) return { label: '분석중', tone: 'amber' };
  if (pages.every((p) => p.status === '미인식')) return { label: '미인식', tone: 'red' };
  if (pages.some((p) => p.status === '미인식')) return { label: '일부미인식', tone: 'amber' };
  if (pages.some((p) => p.status === '읽음')) return { label: '읽음', tone: 'green' };
  return { label: '대기', tone: 'gray' };
}

function targetOf(entityKey: string, record: EntityRecord): { target: string; assigned: boolean } {
  const line = identityLine(entityKey, record);
  const assigned = line !== LEDGER_EMPTY.unassigned && !!line.trim();
  return { target: assigned ? line : LEDGER_EMPTY.unassigned, assigned };
}

export function buildPendingRow(opts: {
  rid: string;
  entityKey: string;
  record: EntityRecord;
  source: IngestPendingSource;
  crosscheck?: CrosscheckResult | null;
  docKind?: string;
  filename?: string;
  mime?: string;
  pages?: IngestPage[];
}): IngestPendingRow {
  const { rid, entityKey, record, source, crosscheck } = opts;
  const pages = opts.pages || [];
  const unread = source === 'ocr' ? unreadOcrLabels(entityKey, record) : [];
  const st = statusFromPages(pages, crosscheck, source);
  const kind = opts.docKind || entityDocKind(entityKey);
  const resolved = resolveDocKind(kind);
  const entityForCat = resolved.entity || entityKey;
  const { target, assigned } = targetOf(entityKey, record);
  const dest = docDestination(resolved.nature, resolved.division, entityForCat);
  const analysis = analysisFromPages(resolved.nature, pages, source);
  return {
    _rid: rid,
    fileForm: pages.length
      ? fileFormFromPages(pages, source)
      : detectFileForm({ filename: opts.filename, mime: opts.mime, source }),
    nature: resolved.nature,
    division: resolved.division,
    docKind: kind,
    category: entityCategory(entityForCat),
    target,
    targetAssigned: assigned,
    destLabel: dest.label,
    destHref: dest.href,
    pageCountLabel: pages.length ? `${pages.length}장` : LEDGER_EMPTY.dash,
    analysisLabel: analysis.label,
    analysisTone: analysis.tone,
    analysisSummary: buildAnalysisSummary(entityKey, record, { crosscheck, source, pages }),
    confidence: crosscheck != null ? crosscheck.confidence : null,
    unreadLabels: unread,
    statusLabel: st.label,
    statusTone: st.tone,
    record,
    crosscheck: crosscheck ?? null,
    source,
    pages,
  };
}

/** 레코드·장 목록 갱신 후 요약 재계산. */
export function refreshPendingRow(
  entityKey: string,
  row: IngestPendingRow,
  patch: { record?: EntityRecord; pages?: IngestPage[]; crosscheck?: CrosscheckResult | null },
): IngestPendingRow {
  return buildPendingRow({
    rid: row._rid,
    entityKey,
    record: patch.record ?? row.record,
    source: row.source,
    crosscheck: patch.crosscheck !== undefined ? patch.crosscheck : row.crosscheck,
    docKind: row.docKind,
    pages: patch.pages ?? row.pages,
  });
}

export type IngestSavedSummary = {
  fileForm: string;
  docKind: string;
  category: string;
  analysisSummary: string;
  confidence: number | null;
  unreadHint: string;
  statusLabel: string;
  statusTone: IngestBadgeTone;
};

function confToScore(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.min(100, v));
  const s = String(v || '').toLowerCase();
  if (s === 'high') return 90;
  if (s === 'medium') return 60;
  if (s === 'low') return 30;
  const n = Number(s);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
}

export function summarizeSavedRow(entityKey: string, row: EntityRecord): IngestSavedSummary {
  if (entityKey === 'inbox') {
    const processing = String(row.processingState || '미분류');
    const tone: IngestBadgeTone = /완료/.test(processing) ? 'green'
      : /오류|중복/.test(processing) ? 'red'
      : /확인|미분류|분석/.test(processing) ? 'amber' : 'gray';
    const reason = String(row.classificationReason || '').trim();
    const warnings = Array.isArray(row.analysisWarnings) ? (row.analysisWarnings as unknown[]).map(String).filter(Boolean) : [];
    const parsed = row.parsedRowCount != null ? `분석 ${row.parsedRowCount}행` : '';
    const bits = [reason, parsed, warnings[0]].filter(Boolean);
    return {
      fileForm: detectFileForm({ filename: String(row.filename || ''), mime: String(row.originalMime || '') }),
      docKind: String(row.kind || '원본') || '원본',
      category: String(row.suggestedEntity || row.matchedEntity || '미분류'),
      analysisSummary: bits.length
        ? `${String(row.filename || LEDGER_EMPTY.unassigned)} / ${bits.join(' · ')}`
        : `${String(row.filename || LEDGER_EMPTY.unassigned)} / 원본 보관`,
      confidence: confToScore(row.classificationConfidence),
      unreadHint: String(row.assignmentState || '') === '미배정' ? '미배정' : '',
      statusLabel: processing,
      statusTone: tone,
    };
  }

  const unread = unreadOcrLabels(entityKey, row);
  const status = String(row.status || '').trim();
  return {
    fileForm: LEDGER_EMPTY.dash,
    docKind: entityDocKind(entityKey),
    category: entityCategory(entityKey),
    analysisSummary: buildAnalysisSummary(entityKey, row, { source: 'manual' }),
    confidence: null,
    unreadHint: unread.length ? `미인식 ${unread.length}` : '',
    statusLabel: status || '저장됨',
    statusTone: status ? 'green' : 'gray',
  };
}
