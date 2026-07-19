import 'server-only';
/**
 * Aligo 발송 엔진 (server-only) — 카카오 알림톡(templateCode 있을 때) / SMS·LMS. (v5 api/sms/send 이식)
 *   Env: ALIGO_API_KEY · ALIGO_USER_ID · ALIGO_SENDER_KEY(알림톡) · ALIGO_SENDER_TEL · ALIGO_FAILOVER('sms') · ALIGO_DRY_RUN('true')
 *   미설정 시 mock 응답 — 흐름 안 막힘(발송이력은 클라이언트가 계약 이력에 기록). 키 넣으면 실발송.
 */
export type NotifyResult = {
  ok: boolean; channel?: string; mock?: boolean; dryRun?: boolean; reason?: string; error?: string;
  [k: string]: unknown;
};

export async function sendNotify(input: { tel: string; message: string; subject?: string; templateCode?: string }): Promise<NotifyResult> {
  const tel = (input.tel || '').replace(/[^\d]/g, '');
  const message = input.message || '';
  const subject = input.subject || '';
  const templateCode = input.templateCode;
  if (!tel || !message) return { ok: false, error: 'tel & message required' };

  const apiKey = process.env.ALIGO_API_KEY;
  const userId = process.env.ALIGO_USER_ID;
  const senderKey = process.env.ALIGO_SENDER_KEY;
  const senderTel = process.env.ALIGO_SENDER_TEL;
  const failover = process.env.ALIGO_FAILOVER === 'sms' ? 'Y' : 'N';
  const dryRun = process.env.ALIGO_DRY_RUN === 'true';

  if (!apiKey || !userId || !senderTel) return { ok: false, mock: true, reason: 'ALIGO_* env not configured' };
  if (dryRun) return { ok: true, dryRun: true, tel, template_code: templateCode ?? null };

  // ── 알림톡 (사전 승인 템플릿) ──
  if (templateCode) {
    if (!senderKey) return { ok: false, error: 'ALIGO_SENDER_KEY 미설정 — 알림톡 발송 불가' };
    const form = new URLSearchParams();
    form.append('apikey', apiKey); form.append('userid', userId); form.append('senderkey', senderKey);
    form.append('tpl_code', templateCode); form.append('sender', senderTel);
    form.append('receiver_1', tel); form.append('subject_1', subject || ' '); form.append('message_1', message);
    if (failover === 'Y') { form.append('failover', 'Y'); form.append('fsubject_1', subject || ' '); form.append('fmessage_1', message); }
    try {
      const r = await fetch('https://kakaoapi.aligo.in/akv10/alimtalk/send/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
      const data = await r.json().catch(() => ({}));
      const ok = data.code === 0 || data.code === '0';
      return { ok, channel: 'alimtalk', ...data };
    } catch (e) { return { ok: false, channel: 'alimtalk', error: (e as Error).message }; }
  }

  // ── 일반 SMS/LMS ──
  const form = new URLSearchParams();
  form.append('key', apiKey); form.append('user_id', userId); form.append('sender', senderTel);
  form.append('receiver', tel); form.append('msg', message);
  if (subject) form.append('title', subject);
  if (message.length > 90) form.append('msg_type', 'LMS'); // 90자 초과 = LMS
  try {
    const r = await fetch('https://apis.aligo.in/send/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
    const data = await r.json().catch(() => ({}));
    const ok = data.result_code === '1' || data.result_code === 1;
    return { ok, channel: 'sms', ...data };
  } catch (e) { return { ok: false, channel: 'sms', error: (e as Error).message }; }
}
