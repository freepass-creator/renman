'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, Plus, Save, X } from 'lucide-react';
import { COMPANIES, companyLabel } from '@/lib/companies';
import { ENTITIES, type EntityRecord, type Field } from '@/lib/intake/entities';
import { saveIntake } from '@/lib/intake';
import { resolveWriteCompany, NEED_COMPANY } from '@/lib/scope';
import { useSession } from '@/lib/session';
import { toast } from '@/lib/toast';
import { Btn, Input, Select } from './controls';

export type LedgerFormSection = {
  title: string;
  fields: string[];
  open?: boolean;
};

function normalizedForm(fields: Field[], form: EntityRecord): EntityRecord {
  const out: EntityRecord = { ...form };
  for (const field of fields) {
    const value = out[field.key];
    if (field.type === 'number' && value !== '' && value != null) {
      out[field.key] = Number(String(value).replace(/,/g, '')) || 0;
    }
  }
  return out;
}

export function LedgerCreatePanel({
  entityKey,
  title,
  sections,
  initial,
  quick,
  prefix,
  onClose,
  onSaved,
}: {
  entityKey: string;
  title: string;
  sections: LedgerFormSection[];
  initial?: EntityRecord;
  /** 회사만으로도 저장하되 아래 상세 입력은 선택적으로 유지한다. */
  quick?: boolean;
  prefix?: React.ReactNode;
  onClose: () => void;
  onSaved?: (record: EntityRecord) => void;
}) {
  const { companyId, scopeAll, user } = useSession();
  const entity = ENTITIES[entityKey];
  const [form, setForm] = useState<EntityRecord>(() => ({ ...(initial || {}) }));
  const [busy, setBusy] = useState(false);
  const selectedFields = useMemo(() => {
    const wanted = new Set(sections.flatMap((section) => section.fields));
    return entity?.fields.filter((field) => wanted.has(field.key)) || [];
  }, [entity, sections]);
  const fieldByKey = useMemo(() => new Map(selectedFields.map((field) => [field.key, field])), [selectedFields]);

  if (!entity) return null;
  const companyReady = !scopeAll || !!String(form.companyId || '').trim();
  const fieldsReady = quick
    ? !!String(form.title || '').trim()
    : selectedFields.every((field) => !field.required || !!String(form[field.key] ?? '').trim());
  const canSave = companyReady && fieldsReady;

  const change = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function save() {
    const targetCompany = resolveWriteCompany(companyId, { companyId: form.companyId });
    if (!targetCompany) {
      toast(NEED_COMPANY, 'error');
      return;
    }
    if (quick && !String(form.title || '').trim()) {
      toast('업무 내용을 입력하세요.', 'error');
      return;
    }
    const missing = quick
      ? []
      : selectedFields.filter((field) => field.required && !String(form[field.key] ?? '').trim());
    if (missing.length) {
      toast(`${missing.map((field) => field.label).join(', ')} 항목을 입력하세요`, 'error');
      return;
    }

    setBusy(true);
    try {
      const record = normalizedForm(selectedFields, {
        ...form,
        companyId: targetCompany,
        createdBy: user.email || user.name,
        createdAt: new Date().toISOString(),
        inputSource: '원장 직접입력',
      });
      const result = await saveIntake(entityKey, targetCompany, [record], {
        context: { source: 'manual' },
      });
      if (result.save.saved < 1) {
        toast('같은 식별정보의 항목이 이미 있습니다', 'info');
        return;
      }
      toast(`${title} 완료`, 'success');
      onSaved?.(result.records[0] || record);
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : '저장하지 못했습니다', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ledger-record-panel" aria-label={`${title} 입력`}>
      <header className="ledger-record-panel__header">
        <span className="ledger-record-panel__icon" aria-hidden="true"><Plus size={16} /></span>
        <div className="ledger-record-panel__heading">
          <div className="ledger-record-panel__eyebrow">신규 등록</div>
          <div className="ledger-record-panel__title">{title}</div>
        </div>
        <button type="button" className="ledger-record-panel__close" onClick={onClose} aria-label="신규등록 패널 닫기">
          <X size={16} />
        </button>
      </header>

      <div className="ledger-create-panel__body">
        {prefix}
        {scopeAll && (
          <div className="ledger-create-panel__company">
            <label>
              회사명 <span>*</span>
              <Select value={String(form.companyId || '')} onChange={(event) => change('companyId', event.target.value)}>
                <option value="">회사를 선택하세요</option>
                {COMPANIES.map((company) => <option value={company} key={company}>{companyLabel(company)}</option>)}
              </Select>
            </label>
          </div>
        )}

        {quick && (
          <div>
            <label className="ledger-create-panel__field">
              <span>업무 내용 <b>*</b></span>
              <Input
                autoFocus
                value={String(form.title || '')}
                onChange={(event) => change('title', event.target.value)}
                placeholder="업무 내용을 한 줄로 입력하세요"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void save();
                  }
                }}
              />
            </label>
          </div>
        )}

        {sections.map((section, sectionIndex) => (
          <details className="ledger-create-panel__section" open={section.open ?? sectionIndex === 0} key={section.title}>
            <summary><ChevronRight className="ledger-create-panel__chevron" size={14} aria-hidden="true" />{section.title}</summary>
            <div className="ledger-create-panel__grid">
              {section.fields.map((key) => {
                const field = fieldByKey.get(key);
                if (!field) return null;
                const value = String(form[field.key] ?? '');
                return (
                  <label key={field.key} className="ledger-create-panel__field">
                    <span>{field.label}{field.required && <b> *</b>}</span>
                    {field.type === 'select' ? (
                      <Select value={value} onChange={(event) => change(field.key, event.target.value)}>
                        <option value="">선택</option>
                        {(field.options || []).map((option) => <option value={option} key={option}>{option}</option>)}
                      </Select>
                    ) : (
                      <Input
                        type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                        value={value}
                        onChange={(event) => change(field.key, event.target.value)}
                      />
                    )}
                    {field.note && <small>{field.note}</small>}
                  </label>
                );
              })}
            </div>
          </details>
        ))}
      </div>

      <footer className="ledger-create-panel__footer">
        <span>등록일·등록자는 저장 시 자동 기록됩니다.</span>
        <div>
          <Btn size="sm" variant="ghost" disabled={busy} onClick={onClose}>취소</Btn>
          <Btn size="sm" disabled={busy || !canSave} onClick={save}><Save size={14} /> {busy ? '저장 중…' : '생성'}</Btn>
        </div>
      </footer>
    </section>
  );
}
