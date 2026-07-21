'use client';
/**
 * 표준 문서 발급 다이얼로그 — 양식 선택 → 폼 입력 → A4 미리보기 → 인쇄·발급. (v5 document-issue-dialog 이식)
 *   · 발급자 회사 = 활성 회사(회사마스터에서 사업자번호·대표·주소 자동). 합본이면 회사 선택.
 *   · 대상(직원/거래처) = 수기 입력. 발급 시 getStore().save('issued_doc') → 감사로그 자동 기록.
 *   · 인쇄 = 격리 새창(window.open) — 앱 CSS 충돌 없이 A4 인쇄/PDF.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSession } from '@/lib/session';
import { getStore } from '@/lib/store';
import { COMPANIES, ALL_COMPANIES, companyLabel } from '@/lib/companies';
import { loadMaster } from '@/lib/company-master';
import { Modal, Btn, C, Input, Select, toggleStyle, fieldStyle } from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';
import {
  listTemplates, getTemplate, renderBody, buildDocNo, computeNextSeq, fmtKDate, fmtKMoney,
  DOC_CATEGORIES, DOC_PRINT_CSS, type DocCategory,
} from '@/lib/doc-templates';

const today = () => new Date().toISOString().slice(0, 10);

export function DocIssueDialog({ issued, onClose, onIssued }: {
  issued: { docNo?: string }[];
  onClose: () => void;
  onIssued: () => void;
}) {
  const { user, companyId, scopeAll } = useSession();
  const mobile = useIsMobile();
  const [category, setCategory] = useState<DocCategory>('인사');
  const [templateId, setTemplateId] = useState<string>('');
  const [issuerId, setIssuerId] = useState<string>(scopeAll ? '' : companyId);
  const [fieldData, setFieldData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const template = templateId ? getTemplate(templateId) : undefined;

  // 카테고리 변경 시 첫 양식
  useEffect(() => {
    if (template && template.category === category) return;
    const first = listTemplates({ category })[0];
    setTemplateId(first ? first.id : '');
  }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  // 양식 변경 시 폼 기본값
  useEffect(() => {
    if (!template) { setFieldData({}); return; }
    const initial: Record<string, string> = {};
    for (const f of template.fields) if (f.default) initial[f.key] = f.default;
    setFieldData(initial);
  }, [templateId]); // eslint-disable-line react-hooks/exhaustive-deps

  const master = issuerId ? loadMaster(issuerId) : {};
  const companyScope = {
    name: issuerId ? companyLabel(issuerId) : '',
    bizRegNo: master.bizNo || '', corpRegNo: '', ceo: master.ceo || '',
    address: master.address || '', mainPhone: master.phone || '',
  };
  const targetScope: Record<string, string> | undefined =
    template?.target === 'staff'
      ? { name: fieldData._targetName || '', birth: fmtKDate(fieldData._targetBirth || ''), address: fieldData._targetAddress || '' }
      : template?.target === 'partner'
        ? { name: fieldData._targetName || '', bizRegNo: fieldData._targetBizRegNo || '', ceo: fieldData._targetCeo || '', mainPhone: fieldData._targetPhone || '', address: fieldData._targetAddress || '' }
        : undefined;

  const nextSeq = template ? computeNextSeq(issued, template.prefix) : 1;
  const docNo = template ? buildDocNo(template.prefix, nextSeq) : '';

  const previewBody = useMemo(() => {
    if (!template) return '';
    const t: Record<string, string> = { ...fieldData };
    for (const f of template.fields) {
      const v = fieldData[f.key];
      if (!v) continue;
      if (f.type === 'date') t[f.key] = fmtKDate(v);
      if (f.type === 'number') t[f.key] = fmtKMoney(v);
    }
    return renderBody(template, { data: t, company: companyScope, target: targetScope, docNo, issuedAt: fmtKDate(today()) });
  }, [template, fieldData, issuerId, docNo]); // eslint-disable-line react-hooks/exhaustive-deps

  const setF = (k: string, v: string) => setFieldData((p) => ({ ...p, [k]: v }));

  function print() {
    const w = window.open('', '_blank', 'width=900,height=1200');
    if (!w) { setErr('팝업이 차단되었습니다 — 허용 후 다시 시도하세요.'); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${docNo}</title><style>@page{size:A4;margin:0}body{margin:0;background:#fff}${DOC_PRINT_CSS}</style></head><body><div class="doc-paper" style="position:relative">${docNo ? `<div class="doc-no">${docNo}</div>` : ''}${previewBody}</div><script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`);
    w.document.close();
  }

  async function issue() {
    if (!template) return;
    if (issuerId === ALL_COMPANIES || !issuerId) { setErr('발급 회사를 선택하세요.'); return; }
    const missing = template.fields.filter((f) => f.required && !fieldData[f.key]?.trim());
    if (missing.length) { setErr(`필수값 누락: ${missing.map((f) => f.label).join(', ')}`); return; }
    setErr(''); setSaving(true);
    try {
      await getStore().save('issued_doc', issuerId, [{
        docNo, templateId: template.id, templateTitle: template.title, category: template.category,
        targetType: template.target, targetName: targetScope?.name || '',
        data: fieldData, issuerCompanyName: companyLabel(issuerId),
        bodyHtml: previewBody, // 발급시점 동결(재인쇄·감사)
        issuedAt: new Date().toISOString(), issuedBy: user.name,
      }]);
      onIssued();
    } catch (e) { setErr(`발급 실패: ${(e as Error).message}`); setSaving(false); }
  }

  const lbl: React.CSSProperties = { fontSize: 11, color: C.mute, marginBottom: 4, fontWeight: 600 };
  const fld = { ...fieldStyle(false, mobile), width: '100%' } as React.CSSProperties;

  return (
    <Modal title="표준 문서 발급" meta={template?.title} width={1120} onClose={onClose}
      footer={<>
        <Btn onClick={issue} disabled={saving || !template}>{saving ? '발급 중…' : '발급 (기록 저장)'}</Btn>
        <Btn variant="ghost" onClick={print} disabled={!template}>인쇄 / PDF</Btn>
        {err && <span style={{ fontSize: 12, color: C.danger }}>{err}</span>}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: C.faint }}>문서번호 <b style={{ fontFamily: 'var(--font-mono)' }}>{docNo}</b> · {fmtKDate(today())}</span>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, minHeight: 560 }}>
        {/* 좌측 입력 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', maxHeight: '68vh', paddingRight: 4 }}>
          <div>
            <div style={lbl}>분류</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: mobile ? 8 : 6 }}>
              {DOC_CATEGORIES.filter((c) => listTemplates({ category: c }).length > 0).map((c) => (
                <button key={c} type="button" data-ui="toggle" style={toggleStyle(category === c, 'sm', mobile)} onClick={() => setCategory(c)} aria-pressed={category === c}>{c}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={lbl}>양식</div>
            <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={{ width: '100%' }}>
              {listTemplates({ category }).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </Select>
            {template?.description && <div style={{ fontSize: 10.5, color: C.faint, marginTop: 4 }}>{template.description}</div>}
          </div>
          {scopeAll && (
            <div>
              <div style={lbl}>발급 회사</div>
              <Select value={issuerId} onChange={(e) => setIssuerId(e.target.value)} style={{ width: '100%' }}>
                <option value="">— 회사 선택 —</option>
                {COMPANIES.map((c) => <option key={c} value={c}>{companyLabel(c)}</option>)}
              </Select>
            </div>
          )}
          {/* 대상 (수기) */}
          {template?.target === 'staff' && (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={lbl}>대상 직원</div>
              <Input placeholder="성명" value={fieldData._targetName || ''} onChange={(e) => setF('_targetName', e.target.value)} style={{ width: '100%' }} />
              <Input type="date" placeholder="생년월일" value={fieldData._targetBirth || ''} onChange={(e) => setF('_targetBirth', e.target.value)} style={{ width: '100%' }} />
              <Input placeholder="주소" value={fieldData._targetAddress || ''} onChange={(e) => setF('_targetAddress', e.target.value)} style={{ width: '100%' }} />
            </div>
          )}
          {template?.target === 'partner' && (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={lbl}>대상 거래처</div>
              <Input placeholder="상호(법인명)" value={fieldData._targetName || ''} onChange={(e) => setF('_targetName', e.target.value)} style={{ width: '100%' }} />
              <Input placeholder="사업자등록번호" value={fieldData._targetBizRegNo || ''} onChange={(e) => setF('_targetBizRegNo', e.target.value)} style={{ width: '100%' }} />
              <Input placeholder="대표자" value={fieldData._targetCeo || ''} onChange={(e) => setF('_targetCeo', e.target.value)} style={{ width: '100%' }} />
              <Input placeholder="연락처" value={fieldData._targetPhone || ''} onChange={(e) => setF('_targetPhone', e.target.value)} style={{ width: '100%' }} />
              <Input placeholder="주소" value={fieldData._targetAddress || ''} onChange={(e) => setF('_targetAddress', e.target.value)} style={{ width: '100%' }} />
            </div>
          )}
          {/* 양식 필드 */}
          {template?.fields.map((f) => (
            <div key={f.key}>
              <div style={lbl}>{f.label}{f.required && <span style={{ color: C.danger, marginLeft: 2 }}>*</span>}</div>
              {f.type === 'textarea'
                ? <textarea rows={3} value={fieldData[f.key] || ''} onChange={(e) => setF(f.key, e.target.value)} placeholder={f.placeholder} style={{ ...fld, height: 'auto', padding: '8px 9px', resize: 'vertical' }} />
                : f.type === 'select'
                  ? <Select value={fieldData[f.key] || ''} onChange={(e) => setF(f.key, e.target.value)} style={{ width: '100%' }}>{(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}</Select>
                  : <Input type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'} value={fieldData[f.key] || ''} onChange={(e) => setF(f.key, e.target.value)} placeholder={f.placeholder} style={{ width: '100%' }} />}
            </div>
          ))}
        </div>
        {/* 우측 미리보기 */}
        <div style={{ background: '#eceef1', overflow: 'auto', maxHeight: '68vh', padding: 14, borderRadius: 8 }}>
          <style dangerouslySetInnerHTML={{ __html: DOC_PRINT_CSS }} />
          {template
            ? <div className="doc-paper" style={{ position: 'relative', margin: '0 auto', boxShadow: '0 2px 12px rgba(0,0,0,0.18)' }}>
                <div className="doc-no">{docNo}</div>
                <div dangerouslySetInnerHTML={{ __html: previewBody }} />
              </div>
            : <div style={{ padding: 40, textAlign: 'center', color: C.faint, fontSize: 13 }}>양식을 선택하세요</div>}
        </div>
      </div>
    </Modal>
  );
}
