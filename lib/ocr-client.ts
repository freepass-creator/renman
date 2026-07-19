// 문서 OCR 클라이언트 — 파일 업로드 → /api/ocr/extract → 구조화 추출.
// 모든 문서 업로드의 단일 진입점. 원본 스냅샷(_ocrOriginal) 부착(감사·원본보존).
// 로컬(GEMINI_API_KEY 없음)에선 ok:false 반환 → 호출측이 수기입력 폴백.
import { ENTITIES, type EntityRecord } from './intake/entities';
import { crosscheckOcr, type CrosscheckResult } from './ocr-crosscheck';

export type OcrOriginal = { raw: Record<string, unknown>; at: string; source: string };
export type OcrResult = { ok: boolean; raw?: Record<string, unknown>; error?: string; ocrOriginal?: OcrOriginal; crosscheck?: CrosscheckResult };

export async function callOcrExtract(file: File, ocrType: string): Promise<OcrResult> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('type', ocrType);
  try {
    const res = await fetch('/api/ocr/extract', { method: 'POST', body: fd });
    let json: Record<string, unknown> = {};
    try { json = await res.json(); } catch { /* non-json */ }
    if (!res.ok || !json.ok) return { ok: false, error: String(json.error || `OCR 실패 (${res.status})`) };
    const raw = (json.extracted as Record<string, unknown>) || {};
    // 교차검증 — 추출값 내부정합 검산(오독 의심건에 ⚠). 저장은 막지 않음(원본보존).
    return { ok: true, raw, ocrOriginal: { raw, at: new Date().toISOString(), source: ocrType }, crosscheck: crosscheckOcr(ocrType, raw) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// OCR raw(JSON) → 엔티티 레코드. 각 필드의 ocrFrom 선언을 그대로 따름(SSOT).
export function mapOcrToEntity(entityKey: string, raw: Record<string, unknown>): EntityRecord {
  const ent = ENTITIES[entityKey];
  const rec: EntityRecord = {};
  if (!ent) return rec;
  for (const f of ent.fields) {
    const src = f.ocrFrom;
    if (src && raw[src] != null && raw[src] !== '') rec[f.key] = raw[src] as EntityRecord[string];
  }
  return rec;
}

// 여러 파일 동시 OCR(동시성 제한). 순서 보존.
export async function ocrBatch(files: File[], ocrType: string, concurrency = 4): Promise<OcrResult[]> {
  const out: OcrResult[] = new Array(files.length);
  let next = 0;
  async function worker() {
    while (next < files.length) {
      const i = next++;
      out[i] = await callOcrExtract(files[i], ocrType);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  return out;
}
