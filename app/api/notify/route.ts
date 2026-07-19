/**
 * 통지 발송 API — SMS / 알림톡 (Aligo). POST /api/notify
 *   { tel, message, subject?, templateCode? } → NotifyResult
 *   ALIGO_* env 미설정 시 mock. 발송이력(계약 연락기록)은 클라이언트가 saveIntake로 기록.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { sendNotify } from '@/lib/notify/aligo';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  let body: { tel?: string; message?: string; subject?: string; templateCode?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 }); }
  const res = await sendNotify({ tel: body.tel || '', message: body.message || '', subject: body.subject, templateCode: body.templateCode });
  return NextResponse.json(res);
}
