/**
 * 데이터센터 대기/저장본 행 요약 SSOT.
 * 표에는 «문서종류 · 카테고리 · 분석요약 · 신뢰도»만 두고, 엔티티 필드는 상세패널에서 본다.
 */
import { ENTITIES, type EntityRecord } from '@/lib/intake/entities';
import type { CrosscheckResult } from '@/lib/ocr-crosscheck';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';

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

export type IngestPendingRow = {
  _rid: string;
  /** 엑셀 / PDF / 이미지 / 직접 */
  fileForm: string;
  /** 문서 종류(자동차등록증·계약서…) */
  docKind: string;
  /** 카테고리(차량·계약·원본…) */
  category: string;
  /** «신원 / 읽은 항목» 한 줄 */
  analysisSummary: string;
  /** 0~100. 없으면 null */
  confidence: number | null;
  unreadLabels: string[];
  statusLabel: string;
  statusTone: IngestBadgeTone;
  record: EntityRecord;
  crosscheck?: CrosscheckResult | null;
  source: IngestPendingSource;
};

export function entityDocKind(entityKey: string): string {
  const e = ENTITIES[entityKey];
  return e?.source || e?.label || entityKey;
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
  // 엑셀/직접: 첫 비어있지 않은 필드
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
  opts?: { crosscheck?: CrosscheckResult | null; source?: IngestPendingSource },
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

  const issue = opts?.crosscheck?.issues?.[0]?.message;
  return issue ? `${id} / ${readBit} · ${issue}` : `${id} / ${readBit}`;
}

function statusFromCrosscheck(cc: CrosscheckResult | null | undefined, source: IngestPendingSource): { label: string; tone: IngestBadgeTone } {
  if (cc?.level === 'error') return { label: '확인필요', tone: 'red' };
  if (cc?.level === 'warn') return { label: '검토', tone: 'amber' };
  if (source === 'ocr') return { label: 'OCR대기', tone: 'green' };
  if (source === 'excel') return { label: '엑셀대기', tone: 'amber' };
  return { label: '직접대기', tone: 'gray' };
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
}): IngestPendingRow {
  const { rid, entityKey, record, source, crosscheck } = opts;
  const unread = source === 'ocr' ? unreadOcrLabels(entityKey, record) : [];
  const st = statusFromCrosscheck(crosscheck, source);
  return {
    _rid: rid,
    fileForm: detectFileForm({ filename: opts.filename, mime: opts.mime, source }),
    docKind: opts.docKind || entityDocKind(entityKey),
    category: entityCategory(entityKey),
    analysisSummary: buildAnalysisSummary(entityKey, record, { crosscheck, source }),
    confidence: crosscheck != null ? crosscheck.confidence : null,
    unreadLabels: unread,
    statusLabel: st.label,
    statusTone: st.tone,
    record,
    crosscheck: crosscheck ?? null,
    source,
  };
}

/** 레코드 수정 후 요약·미인식만 다시 계산. */
export function refreshPendingRow(entityKey: string, row: IngestPendingRow, record: EntityRecord): IngestPendingRow {
  return {
    ...buildPendingRow({
      rid: row._rid,
      entityKey,
      record,
      source: row.source,
      crosscheck: row.crosscheck,
      docKind: row.docKind,
    }),
    fileForm: row.fileForm,
  };
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
