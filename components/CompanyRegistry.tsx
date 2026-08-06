'use client';
// 법인 목록 관리 — 평소엔 고정 표시(읽기 전용). 헤더 '수정'을 눌러 편집 모드로 들어가야 바꿀 수 있음.
import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, Check, FileScan } from 'lucide-react';
import {
  archiveManagedCompany,
  companyDefs,
  companyRegisteredName,
  createManagedCompany,
  ensureCompaniesHydrated,
  updateManagedCompany,
  type CompanyMasterInput,
} from '@/lib/companies';
import { useSession } from '@/lib/session';
import { Panel, Btn, Input, C, useConfirm } from '@/components/ui';
import FileDrop from '@/components/FileDrop';
import { callOcrExtract } from '@/lib/ocr-client';
import { businessRegToMaster } from '@/lib/business-reg-extract';
import { docPath, uploadDoc } from '@/lib/storage';
import { toast, toastError, toastInfo } from '@/lib/toast';

type CompanyDraft = CompanyMasterInput & { label: string };
const EMPTY_DRAFT: CompanyDraft = { label: '' };

function text(raw: Record<string, unknown>, key: string): string {
  return String(raw[key] || '').trim();
}

function list(raw: Record<string, unknown>, key: string): string[] | undefined {
  const value = text(raw, key);
  return value ? value.split(/[,\n]/).map((v) => v.trim()).filter(Boolean) : undefined;
}

/* 매핑 본체는 `lib/business-reg-extract` 가 SSOT — 경영관리 문서 섹션도 같은 것을 쓴다.
   여기 손롤로 두면 «어디서 올렸냐»에 따라 읽히는 항목이 달라진다(AUDIT §3). */
function draftFromBusinessRegistration(raw: Record<string, unknown>): CompanyDraft {
  const { label, master } = businessRegToMaster(raw);
  return { label, ...master };
}

export function CompanyRegistry() {
  const { isOperator, companyId } = useSession();
  const confirm = useConfirm();
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<CompanyDraft>(EMPTY_DRAFT);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<'ocr' | 'save' | 'row' | ''>('');
  const defs = companyDefs().filter((c) => isOperator || c.id === companyId);

  useEffect(() => {
    const changed = () => rerender();
    window.addEventListener('jpk:companies-change', changed);
    void ensureCompaniesHydrated().then(rerender);
    return () => window.removeEventListener('jpk:companies-change', changed);
  }, []);

  const del = async (id: string, label: string) => {
    if (!await confirm({ message: `법인 "${label}"을(를) 관리 목록에서 제외합니다.\n기존 업무·문서 데이터는 삭제되지 않습니다. 계속할까요?`, danger: true })) return;
    setBusy('row');
    try { await archiveManagedCompany(id); toast('관리회사 목록에서 제외했습니다.'); rerender(); }
    catch (error) { toastError((error as Error).message); }
    finally { setBusy(''); }
  };

  const pickBusinessRegistration = async (picked: File) => {
    setFile(picked);
    setBusy('ocr');
    const result = await callOcrExtract(picked, 'business_reg');
    if (!result.ok || !result.raw) {
      setBusy('');
      toastError(result.error || '사업자등록증을 읽지 못했습니다. 상호를 직접 입력할 수 있습니다.');
      return;
    }
    const next = draftFromBusinessRegistration(result.raw);
    setDraft(next);
    setBusy('');
    if (!next.label) toastInfo('상호를 읽지 못했습니다. 사업자등록증 상호를 직접 입력하세요.');
    else toast('사업자등록증을 읽었습니다. 내용을 확인한 뒤 등록하세요.');
  };

  const add = async () => {
    if (!draft.label.trim() || busy) return;
    setBusy('save');
    try {
      const { label, ...master } = draft;
      const id = await createManagedCompany(label, master);
      if (!id) throw new Error('회사를 등록하지 못했습니다.');
      if (file) {
        const url = await uploadDoc(file, docPath(id, 'company', 'business-registration', file.name));
        await updateManagedCompany(id, { label }, {
          businessRegistration: {
            ...master.businessRegistration,
            fileName: file.name,
            url: url || undefined,
            uploadedAt: new Date().toISOString(),
          },
        });
      }
      setDraft(EMPTY_DRAFT);
      setFile(null);
      toast('관리회사와 회사 마스터를 등록했습니다.');
      rerender();
    } catch (error) { toastError((error as Error).message); }
    finally { setBusy(''); }
  };

  return (
    <Panel title="법인 목록" action={isOperator ? (
      <Btn size="sm" variant={edit ? 'solid' : 'ghost'} onClick={() => setEdit((e) => !e)}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{edit ? <><Check size={13} /> 완료</> : <><Pencil size={13} /> 수정</>}</span>
      </Btn>
    ) : undefined}>
      <div style={{ padding: '10px 16px 14px' }}>
        <p style={{ fontSize: 12.5, color: C.mute, margin: '0 0 4px', lineHeight: 1.7 }}>
          {edit && isOperator
            ? '편집 모드 — ERP에서 관리할 회사를 추가·수정·제거합니다. 사업자등록증 상호를 입력하세요.'
            : isOperator
              ? '현재 ERP에서 관리하는 회사 목록입니다. 고정된 회사가 아니며 수정에서 범위를 바꿀 수 있습니다.'
              : '현재 계정에서 조회할 수 있는 회사 목록입니다. 관리 범위 변경은 본사 운영자 권한이 필요합니다.'}
        </p>

        {defs.map((c) => edit && isOperator ? (
          // 편집 모드 — 입력
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: `1px solid var(--border-soft)`, flexWrap: 'wrap' }}>
            <Input defaultValue={c.label} disabled={busy === 'row'} onBlur={async (e) => {
              const label = e.target.value.trim();
              if (!label || label === c.label) return;
              setBusy('row');
              try { await updateManagedCompany(c.id, { label }); toast('회사 상호를 수정했습니다.'); rerender(); }
              catch (error) { e.target.value = c.label; toastError((error as Error).message); }
              finally { setBusy(''); }
            }} placeholder="사업자등록증 상호" style={{ flex: 1, minWidth: 180 }} />
            <span style={{ fontSize: 11, color: C.faint, fontFamily: 'var(--font-mono)', minWidth: 70 }}>{c.id}</span>
            <Btn size="sm" variant="danger" iconOnly tip="회사 제거" onClick={() => del(c.id, c.label)}><Trash2 size={14} /></Btn>
          </div>
        ) : (
          // 고정 표시(읽기 전용)
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderTop: `1px solid var(--border-soft)` }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: C.ink }}>{companyRegisteredName(c.label)}</span>
            <span style={{ fontSize: 11, color: C.faint, fontFamily: 'var(--font-mono)', minWidth: 70 }}>{c.id}</span>
          </div>
        ))}

        {/* 법인 추가 — 편집 모드에서만 */}
        {edit && isOperator && (
          <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 6, paddingTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12.5, fontWeight: 800, color: C.ink }}>
              <FileScan size={14} /> 관리회사 등록
            </div>
            <FileDrop
              file={file}
              onFile={pickBusinessRegistration}
              accept="image/*,.pdf"
              hint="사업자등록증 PDF 또는 이미지 · OCR 후 확인 등록"
              note={busy === 'ocr' ? '사업자등록증 분석 중…' : undefined}
              style={{ minHeight: 92, padding: '14px 16px', marginBottom: 10 }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 8 }}>
              <Input value={draft.label} onChange={(e) => setDraft((v) => ({ ...v, label: e.target.value }))} placeholder="사업자등록증 상호 (필수)" />
              <Input value={draft.bizNo || ''} onChange={(e) => setDraft((v) => ({ ...v, bizNo: e.target.value }))} placeholder="사업자등록번호" />
              <Input value={draft.ceo || ''} onChange={(e) => setDraft((v) => ({ ...v, ceo: e.target.value }))} placeholder="대표자" />
              <Input value={draft.openDate || ''} onChange={(e) => setDraft((v) => ({ ...v, openDate: e.target.value }))} placeholder="개업일 YYYY-MM-DD" />
              <Input value={draft.address || ''} onChange={(e) => setDraft((v) => ({ ...v, address: e.target.value }))} placeholder="본점 소재지" style={{ gridColumn: '1 / -1' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <Btn size="sm" onClick={add} disabled={!draft.label.trim() || !!busy}><Plus size={13} /> {busy === 'save' ? '등록 중…' : '관리회사 등록'}</Btn>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
