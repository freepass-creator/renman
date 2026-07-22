'use client';
import React, { useState } from 'react';
import { ENTITIES, type EntityRecord } from '@/lib/intake/entities';
import { callOcrExtract, mapOcrToEntity, type OcrResult, type OcrOriginal } from '@/lib/ocr-client';
import { uploadDoc, docPath, storageReady } from '@/lib/storage';
import type { DocVersion } from '@/lib/docs';
import { KV, Btn, Badge, OcrCrosscheck, Select, Input, C, type KVRow } from '@/components/ui';
import { type CrosscheckResult } from '@/lib/ocr-crosscheck';
import { ChevronDown, FileText } from 'lucide-react';
import FileDrop from '@/components/FileDrop';

/**
 * InfoDoc — "정보 + 그 서류(+이력)" 한 블록. 엔티티 불문 재사용(등록증·증권…).
 *  · 정보: KV(인라인 편집, 세부 360과 동일 패턴 재사용)
 *  · 서류: 현재 파일 열기/미첨부 + 서류 교체·재발급(파일→Storage 업로드 + OCR 재추출→확인→저장)
 *  · 이력: DocVersion[] 최신 먼저(재발급/변경). 과거 버전 OCR 스냅샷 영구보존.
 * 저장·버전푸시는 부모가 onReplaceDoc/onSave에서 수행(엔티티별 store.save/update 소유).
 */

// 서류 교체·재발급 확인 저장 시 부모로 넘기는 페이로드.
export type DocReplacePayload = {
  url: string;                       // 업로드된 원본 URL(없으면 '')
  ocr?: Record<string, unknown>;     // OCR raw(스냅샷) — 없으면 undefined
  ocrOriginal?: OcrOriginal;         // _ocrOriginal 감사 스냅샷
  fields: EntityRecord;              // OCR/사용자가 확인한 병합 필드(빈 값 제외)
  reason: string;                    // 재발급/변경/오류정정
};

type InfoDocProps = {
  id?: string;
  title: React.ReactNode;
  desc?: React.ReactNode;
  fields: KVRow[];                   // [label, editKey|null, displayValue][]
  editing: boolean;
  form: EntityRecord;
  onChange: (key: string, val: string) => void;
  onEditToggle: () => void;          // 편집 진입/취소 토글(부모가 editing 상태 보고 분기)
  onSave: () => void | Promise<void>;
  docType: string;                   // 엔티티 키(서류 종류) — 'vehicle'|'insurance'…
  docLabel?: string;                 // 서류 표시명(없으면 ENTITIES[docType].source)
  docs: DocVersion[];                // 최신 먼저(docHistory 결과)
  companyId: string;
  recordKey?: string;                // docPath용 자연키
  onReplaceDoc: (p: DocReplacePayload) => void | Promise<void>;
  canEditDoc?: boolean;
};

const REASONS = ['재발급', '변경', '오류정정'];
const fLab: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 };
const fLl: React.CSSProperties = { fontSize: 11, color: C.mute };
const link: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontSize: 11.5, color: C.mute, fontWeight: 600 };

export function InfoDoc({
  id, title, desc, fields, editing, form, onChange, onEditToggle, onSave,
  docType, docLabel, docs, companyId, recordKey, onReplaceDoc, canEditDoc = true,
}: InfoDocProps) {
  const [mode, setMode] = useState<'view' | 'replace'>('view');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ url: string; ocr?: Record<string, unknown>; ocrOriginal?: OcrOriginal; crosscheck?: CrosscheckResult; fileName: string } | null>(null);
  const [confirm, setConfirm] = useState<EntityRecord>({});
  const [reason, setReason] = useState(REASONS[0]);
  const [saving, setSaving] = useState(false);
  const [histOpen, setHistOpen] = useState(false);

  const current = docs[0] || null;
  const attached = !!(current && current.url);
  const hasOcr = docs.some((d) => d.ocr);
  const label = docLabel || ENTITIES[docType]?.source || docType;
  const editKeys = fields.filter((f): f is [string, string, React.ReactNode] => !!f[1]);

  function resetReplace() { setMode('view'); setPending(null); setConfirm({}); setBusy(false); }

  async function onFile(file: File | null | undefined) {
    if (!file) return;
    setBusy(true);
    const ent = ENTITIES[docType];
    const path = docPath(companyId, docType, recordKey || 'new', file.name);
    const upP = uploadDoc(file, path).catch(() => null);
    const ocrP: Promise<OcrResult> = ent?.ocrType ? callOcrExtract(file, ent.ocrType) : Promise.resolve({ ok: false });
    const [url, ocrRes] = await Promise.all([upP, ocrP]);
    const mapped = ocrRes.ok && ocrRes.raw ? mapOcrToEntity(docType, ocrRes.raw) : {};
    const seed: EntityRecord = {};
    for (const [, key] of editKeys) if (mapped[key] != null && mapped[key] !== '') seed[key] = mapped[key];
    setConfirm(seed);
    setPending({ url: url || '', ocr: ocrRes.ok ? ocrRes.raw : undefined, ocrOriginal: ocrRes.ocrOriginal, crosscheck: ocrRes.crosscheck, fileName: file.name });
    setBusy(false);
  }

  async function saveReplace() {
    if (!pending) return;
    setSaving(true);
    try {
      const merged: EntityRecord = {};
      for (const [k, val] of Object.entries(confirm)) if (val != null && String(val).trim() !== '') merged[k] = val;
      await onReplaceDoc({ url: pending.url, ocr: pending.ocr, ocrOriginal: pending.ocrOriginal, fields: merged, reason });
      resetReplace();
    } finally { setSaving(false); }
  }

  return (
    <div id={id} style={{ marginTop: 22, scrollMarginTop: 62 }}>
      {/* 헤더: 제목 + 첨부상태 배지 + 우측 액션(수정 / 서류 교체·재발급) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: '-0.01em', color: C.ink }}>{title}</span>
        <Badge tone={attached ? 'green' : hasOcr ? 'amber' : 'gray'}>{attached ? '첨부됨 ✓' : hasOcr ? 'OCR만 · 미첨부' : '미첨부'}</Badge>
        {desc ? <span style={{ fontSize: 11.5, color: C.faint, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{desc}</span> : <span style={{ flex: 1 }} />}
        {editing
          ? <span style={{ display: 'inline-flex', gap: 6 }}><Btn size="sm" onClick={onSave}>저장</Btn><Btn size="sm" variant="ghost" onClick={onEditToggle}>취소</Btn></span>
          : <Btn size="sm" variant="ghost" onClick={onEditToggle}>수정</Btn>}
        {canEditDoc && <Btn size="sm" variant="ghost" onClick={() => (mode === 'replace' ? resetReplace() : setMode('replace'))}>서류 등록·변경</Btn>}
      </div>

      {/* 정보 KV (인라인 편집 — 세부 360과 동일 패턴) */}
      <KV rows={fields} editing={editing} form={form} onChange={onChange} />

      {/* 서류 행 — 현재 파일 열기/미첨부 + 버전 메타 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '0 12px', minHeight: 34, border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', background: C.card, fontSize: 12.5, flexWrap: 'wrap' }}>
        <FileText size={14} color={C.sub} />
        <span style={{ color: C.mute }}>{label}</span>
        {current
          ? <span style={{ color: C.faint, fontSize: 11.5 }}>v{current.v}{current.reason ? ` · ${current.reason}` : ''}{current.uploadedAt ? ` · ${current.uploadedAt.slice(0, 10)}` : ''}</span>
          : <span style={{ color: C.faint, fontSize: 11.5 }}>등록된 서류 없음</span>}
        <span style={{ flex: 1 }} />
        {attached
          ? <Btn size="sm" variant="ghost" onClick={() => window.open(current!.url, '_blank')}>열기</Btn>
          : <span style={{ fontSize: 11.5, color: C.faint }}>미첨부</span>}
      </div>

      {/* 서류 교체·재발급 패널 */}
      {mode === 'replace' && (
        <div style={{ marginTop: 8, padding: 12, border: `1px solid ${C.accent}`, borderRadius: 'var(--radius)', background: 'var(--bg-card)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>서류 등록·변경</span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: C.mute }}>사유
              <Select size="sm" value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map((r) => <option key={r} value={r}>{r}</option>)}</Select>
            </label>
            <span style={{ flex: 1 }} />
            <Btn size="sm" variant="ghost" onClick={resetReplace}>닫기</Btn>
          </div>

          {!pending ? (
            /* 드롭존은 FileDrop SSOT — 손롤 금지(과태료·데이터센터와 같은 모양이어야 한다). */
            <FileDrop
              accept="image/*,application/pdf"
              onFile={(f) => onFile(f)}
              hint={`${label} · JPG · PNG · PDF · 올리면 OCR로 자동 채웁니다`}
              note={busy ? 'Storage 업로드 · OCR 재추출 중…' : undefined}
            />
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap', fontSize: 11.5 }}>
                <span style={{ color: C.mute, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pending.fileName}>{pending.fileName}</span>
                <Badge tone={pending.url ? 'green' : 'amber'}>{pending.url ? '첨부됨 ✓' : '파일 미첨부'}</Badge>
                <Badge tone={pending.ocr ? 'blue' : 'gray'}>{pending.ocr ? 'OCR 완료' : 'OCR 없음 · 수기'}</Badge>
                <span style={{ flex: 1 }} />
                <Btn size="sm" variant="ghost" onClick={() => { setPending(null); setConfirm({}); }}>다시 선택</Btn>
              </div>
              <OcrCrosscheck result={pending.crosscheck} />
              {editKeys.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 9, marginBottom: 10 }}>
                  {editKeys.map(([lab, key]) => (
                    <label key={key} style={fLab}><span style={fLl}>{lab}</span>
                      <Input size="sm" value={String(confirm[key] ?? '')} onChange={(e) => setConfirm((c) => ({ ...c, [key]: e.target.value }))} style={{ width: '100%' }} placeholder="비우면 기존값 유지" />
                    </label>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <Btn size="sm" onClick={saveReplace} disabled={saving}>{saving ? '저장 중…' : `${reason} 저장`}</Btn>
                <Btn size="sm" variant="ghost" onClick={resetReplace}>취소</Btn>
              </div>
            </div>
          )}
          {!storageReady() && <div style={{ marginTop: 8, fontSize: 11, color: C.warn }}>Firebase Storage 미설정 — 원본 파일 없이 정보·이력만 기록됩니다.</div>}
        </div>
      )}

      {/* 서류 이력 (접힘) — 최신 먼저 */}
      {docs.length > 1 && (
        <div style={{ marginTop: 6 }}>
          <button onClick={() => setHistOpen((o) => !o)} style={link}>
            <ChevronDown size={13} color={C.sub} style={{ transform: histOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} /> 서류 이력 {docs.length}
          </button>
          {histOpen && (
            <div style={{ marginTop: 6, border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', overflow: 'hidden', background: C.card }}>
              {docs.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', fontSize: 11.5, borderTop: i ? `1px solid var(--border-soft)` : 'none' }}>
                  <span style={{ fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>v{d.v}</span>
                  <span style={{ color: C.mute }}>{d.uploadedAt ? d.uploadedAt.slice(0, 10) : '—'}</span>
                  {d.reason ? <Badge tone="gray">{d.reason}</Badge> : null}
                  <span style={{ color: C.faint }}>{d.uploadedBy || '—'}</span>
                  <span style={{ flex: 1 }} />
                  {d.url
                    ? <Btn size="sm" variant="ghost" onClick={() => window.open(d.url, '_blank')}>파일 열기</Btn>
                    : <span style={{ color: C.faint }}>{d.ocr ? 'OCR만' : '미첨부'}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
