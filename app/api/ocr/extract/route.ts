/**
 * Google Gemini 기반 문서 구조화 추출 엔드포인트.
 *
 *   POST /api/ocr/extract  (multipart/form-data)
 *     - file: File (PDF | JPG | PNG)
 *     - type: 'vehicle_reg' | 'business_reg' | 'penalty'
 *
 *   → { ok: true, extracted: { ... }, model: 'gemini-2.5-flash' }
 *
 * GEMINI_API_KEY 필요. 503/429는 자동 재시도.
 *
 * 스키마·유형 스펙·media 추론은 sibling 모듈로 분할(./schemas, ./type-specs, ./media).
 * 라우트 파일엔 POST 핸들러 + runtime/maxDuration + MODEL 만.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { requireAuth } from '@/lib/api-auth';
import { TYPE_SPECS } from './type-specs';
import { inferMediaTypeFromName } from './media';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MODEL = 'gemini-2.5-flash';

export async function POST(req: NextRequest) {
  // 인증 — Authorization: Bearer <Firebase ID token> (직원만)
  const actor = await requireAuth();
  if (actor instanceof NextResponse) return actor;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: 'GEMINI_API_KEY 환경변수 미설정' },
      { status: 500 },
    );
  }

  let docType: string | null;
  let file: File | null;
  try {
    const formData = await req.formData();
    docType = String(formData.get('type') || '');
    file = formData.get('file') as File | null;
  } catch (err) {
    return NextResponse.json({ ok: false, error: `FormData 파싱 실패: ${(err as Error).message}` }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ ok: false, error: 'file 필드 누락' }, { status: 400 });
  }
  const spec = TYPE_SPECS[docType ?? ''];
  if (!spec) {
    return NextResponse.json({ ok: false, error: `지원하지 않는 type: ${docType}` }, { status: 400 });
  }

  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: '파일 크기는 20MB 이하만 가능' }, { status: 413 });
  }

  const arrayBuf = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuf).toString('base64');
  const mediaType = file.type || inferMediaTypeFromName(file.name);

  const ai = new GoogleGenAI({ apiKey });

  async function callWithRetry(): Promise<Awaited<ReturnType<typeof ai.models.generateContent>>> {
    const maxRetries = 3;
    let lastErr: unknown;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await ai.models.generateContent({
          model: MODEL,
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: mediaType, data: base64 } },
              { text: spec.prompt },
            ],
          }],
          config: {
            responseMimeType: 'application/json',
            responseSchema: spec.schema,
            temperature: 0,
            ...(MODEL.startsWith('gemini-2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
            maxOutputTokens: 2048,
          },
        });
      } catch (err) {
        lastErr = err;
        const msg = (err as { message?: string })?.message ?? '';
        const isRetryable = msg.includes('503') || msg.includes('429') || msg.includes('UNAVAILABLE') || msg.includes('RESOURCE_EXHAUSTED');
        if (!isRetryable || attempt === maxRetries - 1) throw err;
        const delayMs = Math.min(1000 * Math.pow(2, attempt), 8000) + Math.random() * 1000;
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw lastErr;
  }

  try {
    const response = await callWithRetry();
    const text = response.text;
    if (!text) {
      return NextResponse.json({ ok: false, error: 'Gemini 응답에 텍스트 없음' }, { status: 502 });
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: `JSON 파싱 실패: ${(err as Error).message}`, raw: text },
        { status: 502 },
      );
    }

    // 차량번호 후처리 — 한국 plate 패턴 다단계 추출:
    //   1) 전각 숫자(０-９) → 반각 정규화
    //   2) wrapping text 안 plate 부분 매칭 ("차량번호: 15가4481" / "[15가4481]" 등)
    //   3) 그래도 없으면 전체 응답 JSON 에서 plate 패턴 fallback 찾기 (Gemini 가
    //      car_number 필드에 못 넣고 다른 곳에 흘려보낸 케이스 — 예: 외산차)
    //   VIN(영문+숫자 17자) 은 한글이 없으니 자동 배제.
    const PLATE_RE = /(\d{2,3})\s*[\-.·]?\s*([가-힣])\s*[\-.·]?\s*(\d{4})/;
    const normalize = (s: unknown): string => String(s ?? '')
      .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0));

    const plateDebug: {
      stage: 0 | 1 | 2 | 3;
      original: unknown;
      stage3_attempts?: Array<{ prompt_idx: number; raw: string; error?: string }>;
    } = { stage: 0, original: parsed.car_number };

    if (docType === 'vehicle_reg' || docType === 'penalty' || docType === 'insurance_policy' || docType === 'rental_contract') {
      // 1차: car_number 필드 매칭
      let extracted: string | null = null;
      if (parsed.car_number) {
        const m = normalize(parsed.car_number).match(PLATE_RE);
        if (m) { extracted = `${m[1]}${m[2]}${m[3]}`; plateDebug.stage = 1; }
      }
      // 2차 fallback: 전체 응답에서 plate 패턴 찾기 (Gemini 누락 대비)
      if (!extracted) {
        const blob = normalize(JSON.stringify(parsed));
        const m = blob.match(PLATE_RE);
        if (m) { extracted = `${m[1]}${m[2]}${m[3]}`; plateDebug.stage = 2; }
      }
      // 3차 fallback (vehicle_reg / insurance_policy): 병렬 plate-only Gemini 호출 (multi-prompt).
      // Gemini Vision 은 temperature:0 이어도 동일 입력에 대해 non-deterministic 한
      // 케이스가 있어 (특히 Tesla 같은 외산차 등록증, 또는 보험증권 "차량(차대)번호" 칸이 작은 경우)
      if (!extracted && (docType === 'vehicle_reg' || docType === 'insurance_policy')) {
        const isInsurance = docType === 'insurance_policy';
        const PLATE_PROMPTS = isInsurance ? [
          '이 한국 자동차보험증권에서 "차량(차대)번호" 또는 "차량번호" 칸에 적힌 차량번호판만 답하세요. 포맷: \\d{2,3}[가-힣]\\d{4} (예: 30어1926, 26부0281). 17자 차대번호(VIN)는 제외. 다른 설명 없이 번호판만.',
          '이 자동차보험증권의 "차량 사항" 섹션 안 차량번호를 옮겨 적으세요. 한국 번호판 포맷 (예: 30어1926). 차대번호(VIN) 절대 X.',
          'Read the Korean license plate from this Korean car insurance policy. Look for "차량(차대)번호" or "차량번호" cell. Format: digits + 한글 + digits (e.g. 30어1926). NOT the 17-char VIN. Output ONLY the plate string.',
        ] : [
          '이 한국 자동차등록증의 ① 자동차등록번호 칸에 적힌 차량번호판만 답하세요. 포맷: \\d{2,3}[가-힣]\\d{4} (예: 15가4481, 01도9893). 다른 설명 없이 번호판 문자열만.',
          '이 자동차등록증 첫 페이지의 가장 위쪽 표 ① 칸 (차종 / 용도 같은 행) 에 있는 한국 번호판을 그대로 옮겨 적으세요. 예: 15가4481. 다른 텍스트 금지.',
          'Read the Korean license plate from the ① 자동차등록번호 cell of this 자동차등록증 (top-left of the main table on page 1). Format: digits + 한글 + digits like 15가4481. Output ONLY the plate string.',
        ];
        plateDebug.stage3_attempts = [];
        const attempts = await Promise.all(PLATE_PROMPTS.map(async (prompt, idx) => {
          try {
            const r = await ai.models.generateContent({
              model: MODEL,
              contents: [{
                role: 'user',
                parts: [
                  { inlineData: { mimeType: mediaType, data: base64 } },
                  { text: prompt },
                ],
              }],
              config: {
                temperature: 0,
                // 3차 fallback 은 thinking 활성화 — 메인 schema-mode 가 못 잡은 어려운 케이스라
                // Gemini 가 직접 추론하게 두는 게 신뢰성↑. 출력은 plate 만이라 비용 영향 작음.
                ...(MODEL.startsWith('gemini-2.5') ? { thinkingConfig: { thinkingBudget: 1024 } } : {}),
                maxOutputTokens: 2048,
              },
            });
            const raw = normalize(r.text ?? '');
            return { prompt_idx: idx, raw };
          } catch (err) {
            return { prompt_idx: idx, raw: '', error: (err as Error).message };
          }
        }));
        plateDebug.stage3_attempts = attempts;
        for (const a of attempts) {
          const m = a.raw.match(PLATE_RE);
          if (m) { extracted = `${m[1]}${m[2]}${m[3]}`; plateDebug.stage = 3; break; }
        }
      }
      parsed.car_number = extracted;
    }

    if (docType === 'vehicle_reg' && !parsed.detail_model && parsed.car_name) {
      const cleanedName = String(parsed.car_name).replace(/\s*\([^)]*\)/g, '').trim();
      if (cleanedName) parsed.detail_model = cleanedName;
    }

    return NextResponse.json({
      ok: true,
      doc_type: docType,
      doc_label: spec.label,
      extracted: parsed,
      model: MODEL,
      _debug: { plate: plateDebug },
      usage: {
        input_tokens: response.usageMetadata?.promptTokenCount ?? 0,
        output_tokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      },
    });
  } catch (err) {
    const e = err as { status?: number; message?: string };
    const msg = e.message || String(err);
    const status = typeof e.status === 'number' ? e.status : 500;
    return NextResponse.json({ ok: false, error: `Gemini API 실패: ${msg}` }, { status });
  }
}
