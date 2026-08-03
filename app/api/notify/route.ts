/**
 * 통지 발송 API — SMS / 알림톡 (Aligo). POST /api/notify
 *   { tel, message, subject?, templateCode? } → NotifyResult
 *   ALIGO_* env 미설정 시 mock. 발송이력(계약 연락기록)은 클라이언트가 saveIntake로 기록.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { sendNotify } from '@/lib/notify/aligo';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const limited = await enforceApiRateLimit('notify', auth.uid, { limit: 60, windowMs: 10 * 60_000 });
  if (limited) return limited;
  let body: { tel?: string; message?: string; subject?: string; templateCode?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 }); }
  const tel = String(body.tel || '').replace(/[^\d]/g, '');
  const message = String(body.message || '');
  const subject = String(body.subject || '');
  const templateCode = String(body.templateCode || '');
  if (!/^0\d{9,10}$/.test(tel)) return NextResponse.json({ ok: false, error: 'invalid tel' }, { status: 400 });
  if (!message.trim() || message.length > 2_000) return NextResponse.json({ ok: false, error: 'invalid message' }, { status: 400 });
  if (subject.length > 100 || templateCode.length > 100) return NextResponse.json({ ok: false, error: 'invalid metadata' }, { status: 400 });
  const res = await sendNotify({ tel, message, subject, templateCode: templateCode || undefined });
  return NextResponse.json(res);
}
