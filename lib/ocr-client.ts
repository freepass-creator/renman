import { apiAuthHeaders } from './api-headers';
import { crosscheckOcr, type CrosscheckResult } from './ocr-crosscheck';

// OCR raw → 엔티티 매핑은 intake/entities 한 곳만 정본으로 둔다.
// 일반 투입·대량 투입·상세 문서교체가 서로 다른 매퍼를 쓰면 반복 원자(분납표 등)가
// 입력 경로에 따라 유실되므로 이 모듈에서는 재구현하지 않고 그대로 재수출한다.
export { mapOcrToEntity } from './intake/entities';

export type OcrOriginal = { raw: Record<string, unknown>; at: string; source: string };
export type OcrResult = { ok: boolean; raw?: Record<string, unknown>; error?: string; ocrOriginal?: OcrOriginal; crosscheck?: CrosscheckResult };

export async function callOcrExtract(file: File, ocrType: string): Promise<OcrResult> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('type', ocrType);
  try {
    const res = await fetch('/api/ocr/extract', { method: 'POST', body: fd, headers: await apiAuthHeaders() });
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
