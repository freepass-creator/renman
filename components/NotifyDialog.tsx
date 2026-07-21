'use client';
/**
 * 문자 발송 다이얼로그 — 미수 계약에 SMS/알림톡. (v5 sms-dialog 이식)
 *   · 13종 템플릿 + 변수치환({{고객명}} 등) + 건별 발송(/api/notify)
 *   · 발송분 → saveIntake('history', category '문자') = 계약 연락기록(미수 화면 "최근 연락" 자동 갱신, 고아입력 금지)
 *   · ALIGO 키 없으면 mock(흐름 그대로). 발송이력은 그대로 남음.
 */
import { useMemo, useState } from 'react';
import { useSession } from '@/lib/session';
import { saveIntake } from '@/lib/intake';
import { notifySaved } from '@/lib/ui-bus';
import { Modal, Btn, C, toggleStyle } from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';

export type NotifyRecipient = {
  contractKey: string; companyId: string;
  name: string; plate: string; phone: string; contractNo?: string;
  unpaidAmount: number; unpaidSeqCount: number; currentSeq: number; monthlyRent: number;
  depositDue: number; depositReceived: number; depositUnreceived: number; depositRefund: number;
};

const TEMPLATES: { label: string; body: string }[] = [
  { label: '미납 1차 안내', body: '[렌터카매니저] {{고객명}} 님, {{차량번호}} 미수금 {{미수금}} ({{미납회차}}). 금일 중 입금 부탁드립니다.' },
  { label: '미납 2차 독촉', body: '[렌터카매니저] {{고객명}} 님, {{차량번호}} 미수금 {{미수금}} ({{미납회차}}) 미납이 계속되어 시동제어 등 조치가 진행될 수 있습니다. 즉시 입금 또는 연락 부탁드립니다.' },
  { label: '시동제어 예고', body: '[렌터카매니저] {{고객명}} 님, {{차량번호}} 미납 누적으로 시동제어가 곧 시행됩니다. 입금 또는 회신 부탁드립니다.' },
  { label: '시동제어 시행', body: '[렌터카매니저] {{고객명}} 님, {{차량번호}} 시동제어가 시행되었습니다. 입금 후 해제 가능합니다.' },
  { label: '검사지연 안내', body: '[렌터카매니저] {{고객명}} 님, {{차량번호}} 자동차 정기검사 기한이 지났습니다. 신속한 검사 부탁드립니다.' },
  { label: '계약해지·차량회수 예고', body: '[렌터카매니저] {{고객명}} 님, {{차량번호}} 계약상 의무 미이행으로 계약해지 및 차량 회수 절차가 진행될 예정임을 통지드립니다. 즉시 연락 부탁드립니다.' },
  { label: '반납 임박', body: '[렌터카매니저] {{고객명}} 님, {{차량번호}} 차량 반납 예정일이 임박했습니다. 일정 확인 부탁드립니다.' },
  { label: '정기점검 안내', body: '[렌터카매니저] {{고객명}} 님, {{차량번호}} 차량 정기점검 일정 안내드립니다. 가까운 영업소 방문 부탁드립니다.' },
  { label: '대여료 청구', body: '[렌터카매니저] {{고객명}} 님, {{차량번호}} {{이번회차}} 대여료 {{월대여료}} 결제일이 도래했습니다. 입금 부탁드립니다.' },
  { label: '보증금 입금 안내', body: '[렌터카매니저] {{고객명}} 님, {{차량번호}} 계약 보증금 {{보증금}} 입금 부탁드립니다 (미수령 {{보증금미수령}}). 입금 후 출고 일정 안내드리겠습니다.' },
  { label: '보증금 입금 확인', body: '[렌터카매니저] {{고객명}} 님, {{차량번호}} 보증금 {{보증금수령}} 입금 확인되었습니다. 출고 일정 별도 안내드리겠습니다.' },
  { label: '반납 정산 안내', body: '[렌터카매니저] {{고객명}} 님, {{차량번호}} 반납 정산 — 보증금 {{보증금수령}} 중 차감액 제외 후 환불 {{보증금환불}} 예정입니다. 환불계좌 확인 부탁드립니다.' },
  { label: '직접 입력', body: '' },
];

const won = (n: number) => `${(Number(n) || 0).toLocaleString('ko-KR')}원`;
function fill(body: string, r: NotifyRecipient): string {
  return body
    .replace(/\{\{고객명\}\}/g, r.name)
    .replace(/\{\{차량번호\}\}/g, r.plate)
    .replace(/\{\{미수금\}\}/g, won(r.unpaidAmount))
    .replace(/\{\{미납회차\}\}/g, `${r.unpaidSeqCount}회`)
    .replace(/\{\{이번회차\}\}/g, `${r.currentSeq}회차`)
    .replace(/\{\{월대여료\}\}/g, won(r.monthlyRent))
    .replace(/\{\{보증금\}\}/g, won(r.depositDue))
    .replace(/\{\{보증금수령\}\}/g, won(r.depositReceived))
    .replace(/\{\{보증금미수령\}\}/g, won(r.depositUnreceived))
    .replace(/\{\{보증금환불\}\}/g, won(r.depositRefund));
}
const today = () => new Date().toISOString().slice(0, 10);

export function NotifyDialog({ recipients, onClose, onSent }: {
  recipients: NotifyRecipient[];
  onClose: () => void;
  onSent?: () => void;
}) {
  const { user } = useSession();
  const mobile = useIsMobile();
  const [idx, setIdx] = useState(0);
  const [body, setBody] = useState(TEMPLATES[0].body);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>('');

  const targets = useMemo(() => recipients.filter((r) => r.phone), [recipients]);
  const isLong = body.length > 90;

  function applyTemplate(i: number) { setIdx(i); setBody(TEMPLATES[i].body); }

  async function send() {
    if (!body.trim() || targets.length === 0) return;
    setBusy(true); setResult('');
    const label = TEMPLATES[idx].label;
    let sent = 0, failed = 0, mocked = 0;
    const delivered: NotifyRecipient[] = [];
    for (const r of targets) {
      try {
        const res = await fetch('/api/notify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tel: r.phone, message: fill(body, r), subject: label }),
        });
        const json = await res.json();
        if (json.mock) { mocked++; delivered.push(r); }
        else if (json.ok) { sent++; delivered.push(r); }
        else failed++;
      } catch { failed++; }
    }
    // 연락기록 — 발송분을 계약 이력('문자')에 기록 → 미수 화면 "최근 연락" 자동 갱신
    for (const r of delivered) {
      if (!r.companyId) continue;
      try {
        await saveIntake('history', r.companyId, [{
          plate: r.plate, category: '문자', title: `${label} 문자 발송`, date: today(),
          author: user.name, customer: r.name, contractNo: r.contractNo || '',
          description: fill(body, r), _kind: 'activity', companyId: r.companyId,
        }], { notify: false });
      } catch { /* 이력 실패는 발송을 되돌리지 않음 */ }
    }
    notifySaved();
    setBusy(false);
    setResult(mocked > 0 && sent === 0 && failed === 0
      ? `ALIGO 미설정 — mock ${mocked}건 처리(실발송 X). .env.local에 ALIGO_* 등록 시 실발송.`
      : `발송 완료 — 성공 ${sent}${mocked ? ` · mock ${mocked}` : ''}${failed ? ` · 실패 ${failed}` : ''}`);
    onSent?.();
  }

  const lbl: React.CSSProperties = { fontSize: 10.5, color: C.faint, marginBottom: 6, fontWeight: 700, letterSpacing: '0.03em' };

  return (
    <Modal title="문자 발송" meta={`${targets.length}건`} width={860} onClose={onClose}
      footer={<>
        <Btn onClick={send} disabled={busy || !body.trim() || targets.length === 0}>{busy ? '발송 중…' : `${targets.length}건 발송`}</Btn>
        <Btn variant="ghost" onClick={onClose}>닫기</Btn>
        {result && <span style={{ fontSize: 12, color: result.startsWith('발송 완료') ? C.ok : C.warn }}>{result}</span>}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: C.faint }}>예상비용 {targets.length * (isLong ? 25 : 10)}원 ({isLong ? 'LMS 25' : 'SMS 10'}원 × {targets.length})</span>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, minHeight: 420 }}>
        {/* 수신자 */}
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 12px', borderBottom: `1px solid ${C.line}`, background: C.head, fontSize: 11.5, fontWeight: 700, color: C.mute }}>수신자 {targets.length}</div>
          <div style={{ overflowY: 'auto', maxHeight: 380 }}>
            {targets.length === 0 ? <div style={{ padding: 16, fontSize: 12, color: C.faint }}>연락처 있는 대상 없음</div>
              : targets.map((r) => (
                <div key={r.contractKey} style={{ padding: '9px 12px', borderBottom: `1px solid ${C.line2}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{r.name}</div>
                  <div style={{ fontSize: 11.5, color: C.mute, display: 'flex', gap: 6, marginTop: 2 }}>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{r.plate}</span><span>·</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{r.phone}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
        {/* 작성 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div>
            <div style={lbl}>템플릿</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: mobile ? 8 : 6 }}>
              {TEMPLATES.map((t, i) => <button key={t.label} type="button" data-ui="toggle" style={toggleStyle(idx === i, 'sm', mobile)} onClick={() => applyTemplate(i)} aria-pressed={idx === i}>{t.label}</button>)}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div style={{ ...lbl, display: 'flex', justifyContent: 'space-between' }}>
              <span>본문 · 변수 {'{{고객명}} {{차량번호}} {{미수금}} {{미납회차}} {{월대여료}} {{보증금}}'}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: isLong ? C.warn : C.mute }}>{body.length}자 · {isLong ? 'LMS' : 'SMS'}</span>
            </div>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="문자 본문을 입력하세요"
              style={{ flex: 1, minHeight: 150, padding: 12, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical', outline: 'none', color: C.ink, background: '#fff' }} />
          </div>
          {targets[0] && (
            <div style={{ fontSize: 12, color: C.mute }}>
              미리보기: <span style={{ background: C.zebra, padding: '3px 8px', borderRadius: 6, display: 'inline-block', marginTop: 4 }}>{fill(body, targets[0])}</span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
