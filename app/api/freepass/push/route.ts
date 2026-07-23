/**
 * 프리패스(freepasserp4) 상품 push 포워더.
 *   renman 클라 → (requireAuth) → 이 라우트 → erp4 ingest 엔드포인트.
 *   erp4 시크릿은 서버 env(FREEPASS_API_SECRET)에만 보관(클라 노출 금지).
 *   erp4 수신 엔드포인트가 아직 없으면 FREEPASS_PRODUCT_API 미설정 → 400(미구성) 안내.
 */
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const actor = await requireAuth();
  if (actor instanceof NextResponse) return actor;

  const url = (process.env.FREEPASS_PRODUCT_API || '').trim();
  const secret = (process.env.FREEPASS_API_SECRET || '').trim();
  if (!url) {
    return NextResponse.json({ ok: false, error: '프리패스 연동 미구성 — FREEPASS_PRODUCT_API(env) 필요' }, { status: 400 });
  }

  let products: unknown;
  try {
    ({ products } = await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON 파싱 실패' }, { status: 400 });
  }
  if (!Array.isArray(products) || products.length === 0) {
    return NextResponse.json({ ok: false, error: 'products 배열 필요' }, { status: 400 });
  }

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(secret ? { 'x-api-key': secret } : {}) },
      body: JSON.stringify({ products, companyId: 'freepass' }),
    });
    const body = await r.text().catch(() => '');
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(body); } catch { /* 텍스트 응답 그대로 */ }
    return NextResponse.json({ ok: r.ok, status: r.status, body: body.slice(0, 2000), ...parsed }, { status: r.ok ? 200 : 502 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'erp4 전송 실패: ' + (e as Error).message }, { status: 502 });
  }
}
