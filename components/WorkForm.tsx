'use client';
import React, { useState } from 'react';
import { useSession } from '@/lib/session';
import { saveIntake } from '@/lib/intake';
import { resolveWriteCompany, NEED_COMPANY } from '@/lib/scope';
import { uploadDoc, docPath, storageReady } from '@/lib/storage';
import { pushDocVersion } from '@/lib/docs';
import { callOcrExtract, type OcrOriginal } from '@/lib/ocr-client';
import type { EntityRecord } from '@/lib/intake/entities';
import {
  WORK_CATEGORIES, WORK_STATUSES, workStatusPatch, canApplyWorkStatus, workSummary,
  workCategoryTone, type WorkCategory,
} from '@/lib/work-ops';
import { Btn, Badge, Input, Select, C, fieldStyle, toggleStyle, ctrlH, ctrlFs } from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';
import { UploadCloud } from 'lucide-react';

/** 수선 폼의 작업구분별 필드 정의(jpkerp4 상품화센터 이식). wide=한 줄 전체(메모/경위). */
type WF = { key: string; label: string; type: 'text' | 'number' | 'date' | 'select'; options?: string[]; wide?: boolean };
const FIELDS: Record<WorkCategory, WF[]> = {
  '정비': [
    { key: 'maint_type', label: '정비유형', type: 'select', options: ['정기점검', '소모품교체', '수리', '판금·도색', '타이어', '기타'] },
    { key: 'vendor', label: '정비업체', type: 'text' },
    { key: 'amount', label: '비용(원)', type: 'number' },
    { key: 'mileage', label: '주행거리(km)', type: 'number' },
    { key: 'next_maint_date', label: '다음정비예정', type: 'date' },
    { key: 'note', label: '메모', type: 'text', wide: true },
  ],
  '사고수리': [
    { key: 'acc_role', label: '가해/피해', type: 'select', options: ['가해', '피해'] },
    { key: 'fault_pct', label: '내 과실(%)', type: 'number' },
    { key: 'damage_area', label: '사고부위', type: 'text' },
    { key: 'damage_frame', label: '골격손상', type: 'select', options: ['없음', '경미', '있음'] },
    { key: 'amount', label: '총수리비(원)', type: 'number' },
    { key: 'insurance_amount', label: '보험처리금(원)', type: 'number' },
    { key: 'self_pay', label: '자기부담금(원)', type: 'number' },
    { key: 'repair_in_date', label: '입고일', type: 'date' },
    { key: 'repair_out_date', label: '출고예정일', type: 'date' },
    { key: 'rental_car', label: '대차', type: 'select', options: ['미제공', '대차중', '대차반납'] },
    { key: 'note', label: '사고경위', type: 'text', wide: true },
  ],
  '상품화': [
    { key: 'exterior', label: '외관', type: 'select', options: ['양호', '경미흠집', '손상있음'] },
    { key: 'interior', label: '실내', type: 'select', options: ['양호', '보통', '청소필요'] },
    { key: 'tire_status', label: '타이어', type: 'select', options: ['양호', '교체필요', '편마모'] },
    { key: 'amount', label: '비용(원)', type: 'number' },
    { key: 'note', label: '메모', type: 'text', wide: true },
  ],
  '세차': [
    { key: 'wash_type', label: '세차유형', type: 'select', options: ['외부세차', '실내크리닝', '풀세차', '광택'] },
    { key: 'amount', label: '비용(원)', type: 'number' },
    { key: 'note', label: '메모', type: 'text', wide: true },
  ],
};
const DOC_KINDS = ['견적서', '수선사진'] as const;
const today = () => new Date().toISOString().slice(0, 10);

// 사고수리 전용 추가필드 — jpkerp4 사고접수 이식. 보험 처리 유형(복수선택) + 우리쪽/상대쪽 보험.
// 위 FIELDS['사고수리']와 함께 한 레코드로 저장(같은 vals 상태). 다른 작업구분엔 안 뜸.
const ACC_INS_TOGGLES: { key: string; label: string }[] = [
  { key: 'ins_car', label: '자차' },
  { key: 'ins_property', label: '대물' },
  { key: 'ins_person', label: '대인' },
  { key: 'ins_self', label: '자손' },
  { key: 'ins_uninsured', label: '무보험' },
];
const ACC_OURS: WF[] = [
  { key: 'insurance_company', label: '보험사', type: 'text' },
  { key: 'insurance_no', label: '접수번호', type: 'text' },
];
const ACC_OTHER: WF[] = [
  { key: 'other_car', label: '상대 차량번호', type: 'text' },
  { key: 'other_insurance', label: '상대 보험사', type: 'text' },
  { key: 'other_insurance_no', label: '상대 접수번호', type: 'text' },
];

const fLab: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 };
const fLl: React.CSSProperties = { fontSize: 11, color: C.mute };
const grpH: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: C.sub, marginBottom: 7, paddingBottom: 4, borderBottom: `1px solid ${C.line2}` };

/**
 * 차량 수선/작업 인라인 폼 — 그 자리에서 펼침(팝업 X, QuickLogForm 자매).
 *   작업구분 칩 + 작업상태 칩 + 작업구분별 필드 + 견적서/사진 첨부 → history(_kind:'work') 저장.
 *   유휴차면 저장과 함께 차량 자산상태 파생 전이(workStatusPatch) → 휴차 워크벤치 자동 반영.
 * vehicle/idle 은 상위(360)가 이미 계산해 넘긴다. 없으면 상태 전이는 건너뛰고 기록만 남긴다.
 */
export function WorkForm({ plate, companyId, vehicle, idle, onDone, onCancel, style }: {
  plate: string; companyId: string; vehicle: EntityRecord | null; idle: boolean;
  onDone: () => void; onCancel: () => void; style?: React.CSSProperties;
}) {
  const { user, companyId: sessionCompany } = useSession();
  const mobile = useIsMobile();
  const [category, setCategory] = useState<WorkCategory>('정비');
  const [workStatus, setWorkStatus] = useState('접수');
  const [date, setDate] = useState(today());
  const [vals, setVals] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [docKind, setDocKind] = useState<string>(DOC_KINDS[0]);
  const [saving, setSaving] = useState(false);
  // 견적서 OCR — 문서(견적서)만 자동 추출. 수선사진은 순수 이미지라 OCR 대상 아님.
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrDone, setOcrDone] = useState(false);
  const [ocrRaw, setOcrRaw] = useState<Record<string, unknown> | undefined>(undefined);
  const [ocrOriginal, setOcrOriginal] = useState<OcrOriginal | undefined>(undefined);

  // 파일 선택 즉시 처리 — 견적서면 OCR 자동 실행(금액·업체·항목 빈칸 프리필). 사진이면 첨부만.
  async function onPickFile(f: File | null, kind: string) {
    setFile(f);
    setOcrDone(false); setOcrRaw(undefined); setOcrOriginal(undefined);
    if (!f || kind !== '견적서') return; // 수선사진 등 순수 이미지는 OCR 안 함
    setOcrBusy(true);
    try {
      const res = await callOcrExtract(f, 'estimate');
      if (res.ok && res.raw) {
        const raw = res.raw;
        setOcrRaw(raw); setOcrOriginal(res.ocrOriginal);
        // 빈 칸만 프리필(수기 입력 보존). 실패해도 그냥 수기 입력 가능.
        setVals((s) => {
          const next = { ...s };
          const put = (k: string, val: unknown) => { if (val != null && val !== '' && (next[k] == null || next[k] === '')) next[k] = String(val); };
          put('amount', raw.amount);
          put('vendor', raw.vendor);
          put('note', raw.items);
          return next;
        });
        setOcrDone(true);
      }
    } catch { /* 조용히 수기 입력 폴백 */ }
    finally { setOcrBusy(false); }
  }

  // 귀속 회사 — 넘어온 회사(차의 회사) 우선, 없으면 세션 단일 스코프. 합본이라 모호하면 null → 저장 차단(임의 폴백 금지).
  const target = resolveWriteCompany(sessionCompany, { companyId });
  const fields = FIELDS[category];
  const chg = (k: string, v: string) => setVals((s) => ({ ...s, [k]: v }));
  // 작업구분 바꾸면 작업구분별 값은 초기화(다른 필드셋). 공통(일자·첨부)은 유지.
  const pickCategory = (c: WorkCategory) => { setCategory(c); setVals({}); };
  const targetStatus = workStatusPatch(category, workStatus);
  const willTransition = targetStatus && canApplyWorkStatus(idle, String(vehicle?.status || '')) && targetStatus !== String(vehicle?.status || '');

  async function save() {
    if (saving) return;
    if (!target) { window.alert(NEED_COMPANY); return; }
    setSaving(true);
    try {
      // 첨부(선택) — Storage 업로드 실패/미설정이면 url '' 로 미첨부 기록(InfoDoc·과태료와 동일 관대 처리).
      let docs: ReturnType<typeof pushDocVersion> | undefined;
      if (file) {
        const url = await uploadDoc(file, docPath(target, 'history', plate, file.name)).catch(() => null);
        // 견적서 OCR 원본 스냅샷은 해당 서류 버전에 영구 보존(원본 그대로).
        docs = pushDocVersion(null, { type: docKind, url: url || '', ocr: ocrRaw, reason: '수선 등록', by: user.name });
      }
      // 수치 필드는 숫자화. 나머지는 값 있는 것만.
      const numKeys = new Set(['amount', 'insurance_amount', 'self_pay', 'mileage', 'fault_pct']);
      // 사고수리는 우리쪽/상대쪽 보험 텍스트칸(커스텀 블록)도 같은 vals에서 함께 저장.
      const saveFields = category === '사고수리' ? [...fields, ...ACC_OURS, ...ACC_OTHER] : fields;
      const typed: EntityRecord = {};
      for (const f of saveFields) {
        const raw = vals[f.key];
        if (raw == null || raw === '') continue;
        typed[f.key] = numKeys.has(f.key) ? Number(raw) || 0 : raw;
      }
      // 보험 처리 유형(복수선택) — 켜진 것만 'Y'로 저장(jpkerp4 동일).
      if (category === '사고수리') {
        for (const t of ACC_INS_TOGGLES) if (vals[t.key] === 'Y') typed[t.key] = 'Y';
      }
      const amount = Number(vals.amount) || 0;
      const rec: EntityRecord = {
        plate, category, work_status: workStatus, date, author: user.name, companyId: target, _kind: 'work',
        ...typed,
        // 활동·이력(범용 로그)·집계 호환을 위한 파생 필드(같은 데이터, 다른 뷰).
        title: `${category} · ${workSummary({ category, ...typed })}`,
        cost: amount,
        ...(docs ? { _docs: docs } : {}),
        ...(ocrOriginal ? { _ocrOriginal: ocrOriginal } : {}),
      };
      // 단일 파이프라인 통과 — 저장 + 부수효과(유휴차 자산상태 파생 전이) + 반영을 파이프라인이 소유.
      // 상태전이는 workStatusSideEffect가 workStatusPatch/canApplyWorkStatus로 동일 판정(운행·처분 중이면 기록만).
      await saveIntake('history', target, [rec], { context: { vehicle, idle } });
      onDone();
    } finally { setSaving(false); }
  }

  // 칩 = toggleStyle(CTRL) · 작업구분만 카테고리 톤으로 활성색 오버라이드
  const chip = (on: boolean, size: 'sm' | 'md' = 'md', tone?: string): React.CSSProperties => {
    const base = toggleStyle(on, size, mobile);
    if (on && tone) return { ...base, border: `1px solid ${tone}`, background: tone };
    return base;
  };
  const catToneVar: Record<WorkCategory, string> = { '정비': 'var(--amber-text)', '사고수리': 'var(--red-text)', '상품화': 'var(--text-link)', '세차': 'var(--teal-text, #0e7490)' };
  const filePickH = ctrlH(mobile);

  return (
    <div style={{ border: `1px solid ${C.accent}`, borderRadius: 'var(--radius)', background: 'var(--bg-card)', boxShadow: '0 0 0 3px rgba(37,99,235,0.10)', padding: '13px 14px', boxSizing: 'border-box', ...style }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 11, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: C.ink }}>수선 / 작업</span>
        <span style={{ fontSize: 11.5, color: C.faint }}>{plate}에 남깁니다</span>
      </div>

      {/* 작업구분 — 큰 칩 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: mobile ? 8 : 6, marginBottom: 8 }}>
        {WORK_CATEGORIES.map((c) => <button key={c} type="button" data-ui="toggle" onClick={() => pickCategory(c)} aria-pressed={category === c} style={chip(category === c, 'md', catToneVar[c])}>{c}</button>)}
      </div>
      {/* 작업상태 — 칩 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: mobile ? 8 : 6, marginBottom: 11, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: C.mute, marginRight: 2 }}>작업상태</span>
        {WORK_STATUSES.map((w) => <button key={w} type="button" data-ui="toggle" onClick={() => setWorkStatus(w)} aria-pressed={workStatus === w} style={chip(workStatus === w, 'sm')}>{w}</button>)}
        <span style={{ flex: 1 }} />
        {willTransition
          ? <span style={{ fontSize: 11, color: C.mute }}>저장 시 차량상태 → <Badge tone={workCategoryTone(category)}>{targetStatus}</Badge></span>
          : !idle ? <span style={{ fontSize: 11, color: C.faint }}>운행 중 — 상태 미변경(기록만)</span> : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 9, marginBottom: 11 }}>
        <label style={fLab}><span style={fLl}>작업일</span><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: '100%' }} /></label>
        {fields.map((f) => (
          <label key={f.key} style={{ ...fLab, gridColumn: f.wide ? '1 / -1' : undefined }}>
            <span style={fLl}>{f.label}</span>
            {f.type === 'select'
              ? <Select value={vals[f.key] ?? ''} onChange={(e) => chg(f.key, e.target.value)} style={{ width: '100%' }}>
                  <option value="">—</option>
                  {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                </Select>
              : f.wide
                ? <textarea value={vals[f.key] ?? ''} onChange={(e) => chg(f.key, e.target.value)} rows={2} style={{ ...fieldStyle(), width: '100%', height: 'auto', padding: '8px 9px', resize: 'vertical', lineHeight: 1.5 }} />
                : <Input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} value={vals[f.key] ?? ''} onChange={(e) => chg(f.key, e.target.value)} style={{ width: '100%' }} />}
          </label>
        ))}
      </div>

      {category === '사고수리' ? (
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', background: '#fff', padding: '11px 12px', marginBottom: 11 }}>
          <div style={{ fontSize: 11, color: C.mute, marginBottom: 6 }}>보험 처리 유형 <span style={{ color: C.faint }}>· 복수선택</span></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: mobile ? 8 : 6, marginBottom: 12 }}>
            {ACC_INS_TOGGLES.map((t) => {
              const on = vals[t.key] === 'Y';
              return <button key={t.key} type="button" data-ui="toggle" onClick={() => chg(t.key, on ? '' : 'Y')} aria-pressed={on} style={chip(on, 'sm', 'var(--red-text)')}>{t.label}</button>;
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div>
              <div style={grpH}>우리쪽 보험</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 9 }}>
                {ACC_OURS.map((f) => (
                  <label key={f.key} style={fLab}><span style={fLl}>{f.label}</span>
                    <Input value={vals[f.key] ?? ''} onChange={(e) => chg(f.key, e.target.value)} style={{ width: '100%' }} /></label>
                ))}
              </div>
            </div>
            <div>
              <div style={grpH}>상대쪽</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 9 }}>
                {ACC_OTHER.map((f) => (
                  <label key={f.key} style={fLab}><span style={fLl}>{f.label}</span>
                    <Input value={vals[f.key] ?? ''} onChange={(e) => chg(f.key, e.target.value)} style={{ width: '100%' }} /></label>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 11 }}>
        <Select value={docKind} onChange={(e) => { setDocKind(e.target.value); setOcrDone(false); }}>{DOC_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</Select>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: filePickH, padding: mobile ? '0 14px' : '0 11px', border: `1px dashed ${C.line}`, borderRadius: 'var(--radius)', background: C.taupeBg, cursor: ocrBusy ? 'wait' : 'pointer', fontSize: ctrlFs(mobile), color: C.mute, boxSizing: 'border-box' }}>
          <UploadCloud size={14} color={C.sub} /> {ocrBusy ? '분석 중…' : file ? '파일 변경' : `${docKind} 파일 선택`}
          <input type="file" accept="image/*,application/pdf" disabled={ocrBusy} onChange={(e) => onPickFile(e.target.files?.[0] || null, docKind)} style={{ display: 'none' }} />
        </label>
        {file ? <span style={{ fontSize: 11.5, color: C.mute, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.name}>{file.name}</span> : null}
        {docKind === '견적서'
          ? (ocrBusy ? <Badge tone="gray">OCR 분석 중</Badge>
            : ocrDone ? <Badge tone="blue">OCR 완료 · 금액 자동입력</Badge>
            : file ? <Badge tone="amber">OCR 없음 · 수기</Badge>
            : <span style={{ fontSize: 11, color: C.faint }}>견적서는 올리면 금액을 자동 추출합니다</span>)
          : null}
        {file && !storageReady() ? <span style={{ fontSize: 11, color: C.warn }}>Storage 미설정 — 정보만 기록(원본 없이)</span> : null}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Btn onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장'}</Btn>
        <Btn variant="ghost" onClick={onCancel}>취소</Btn>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: C.faint }}>{user.name} · {date}</span>
      </div>
    </div>
  );
}
