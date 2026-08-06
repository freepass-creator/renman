'use client';
import React, { useState } from 'react';
import { useSession } from '@/lib/session';
import { saveIntake } from '@/lib/intake';
import { resolveWriteCompany, NEED_COMPANY } from '@/lib/scope';
import { Btn, Checkbox, Input, TextArea, PillTabs, C } from '@/components/ui';
import { todayKST } from '@/lib/contracts/dates'; // KST 기준 오늘
import { toastError } from '@/lib/toast'; // 손롤 alert 금지 — 공용 토스트로 통일(confirm.tsx 원칙)

export type QuickLogCtx = { plate?: string; customer?: string; contractNo?: string; companyId?: string };

// 활동 종류 — 실무자가 소소하게 남기는 것. 이동·소통 + 정비·사고·검사.
const KINDS = ['이동', '통화', '문자', '방문', '상담', '메모', '정비', '사고', '검사'] as const;
const HINTS: Record<string, string> = {
  '이동': '어디 → 어디 (이 기록이 곧 현재 위치)',
  '통화': '통화 요지 · 고객이 뭐라 했는지',
  '문자': '보낸/받은 내용 요지',
  '방문': '방문 · 대면 요지',
  '상담': '상담 요지 · 고객 요청/안내 내용',
  '메모': '자유 메모',
  '정비': '정비 내용',
  '사고': '사고 내용',
  '검사': '검사 내용',
};
const today = todayKST;

/** 빠른 기록 폼 — 그 자리에서 인라인(팝업 X). 종류 칩 + 텍스트 + 후속 체크·날짜 + 저장/취소.
 *  저장·취소 모두 onDone/onCancel 콜백으로 상위(펼침 상태)를 접는다. 저장 로직은 전역 QuickLog와 동일. */
export function QuickLogForm({ ctx, onDone, onCancel, autoFocus = true, style }: { ctx: QuickLogCtx; onDone: () => void; onCancel: () => void; autoFocus?: boolean; style?: React.CSSProperties }) {
  const { user, companyId } = useSession();
  const [kind, setKind] = useState<string>('메모');
  const [text, setText] = useState('');
  const [follow, setFollow] = useState(false);
  const [nextDate, setNextDate] = useState('');
  const [saving, setSaving] = useState(false);

  const target = resolveWriteCompany(companyId, { companyId: ctx.companyId });   // 임의 폴백 금지 — 모호하면 null
  const hint = HINTS[kind] || '';
  const anchor = ctx.plate || ctx.customer || '';

  async function save() {
    if (!text.trim()) return;
    if (!target) { toastError(NEED_COMPANY); return; }
    setSaving(true);
    try {
      await saveIntake('history', target, [{
        plate: ctx.plate || '', category: kind, title: text.trim(), date: today(),
        author: user.name, customer: ctx.customer || '', contractNo: ctx.contractNo || '',
        nextDate: follow ? nextDate : '', companyId: target, _kind: 'activity',
      }]);
      onDone();
    } finally { setSaving(false); }
  }

  return (
    <div style={{ border: `1px solid ${C.accent}`, borderRadius: 'var(--radius)', background: 'var(--bg-card)', boxShadow: '0 0 0 3px rgba(37,99,235,0.10)', padding: '13px 14px', boxSizing: 'border-box', ...style }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 11, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: C.ink }}>빠른 기록</span>
        {anchor ? <span style={{ fontSize: 11.5, color: C.faint }}>{anchor}에 남깁니다</span> : null}
      </div>
      <div style={{ marginBottom: 8 }}>
        <PillTabs size="sm" value={kind} onChange={setKind} tabs={KINDS.map((key) => ({ key, label: key }))} />
      </div>
      <TextArea autoFocus={autoFocus} value={text} onChange={(e) => setText(e.target.value)} placeholder={hint}
        style={{ minHeight: 80, marginTop: 8 }} />
      <div style={{ marginTop: 6, color: C.mute }}>
        <Checkbox checked={follow} onChange={setFollow} label="다음 할 일 있음 — 일정에 뜨게" stop={false} />
      </div>
      {follow && <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} style={{ display: 'block', marginTop: 8 }} />}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
        <Btn onClick={save} disabled={saving || !text.trim()}>{saving ? '저장 중…' : '저장'}</Btn>
        <Btn variant="ghost" onClick={onCancel}>취소</Btn>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: C.faint }}>{user.name} · {today()}</span>
      </div>
    </div>
  );
}
