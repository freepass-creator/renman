'use client';
/**
 * 원장 우측 상세 — 그자리 수정.
 *   LedgerCreatePanel과 같은 섹션 스키마. 저장은 getStore().update.
 */
import { useMemo, useState } from 'react';
import { ChevronRight, Save, X } from 'lucide-react';
import { ENTITIES, type EntityRecord, type Field } from '@/lib/intake/entities';
import { getStore } from '@/lib/store';
import { resolveWriteCompany, NEED_COMPANY } from '@/lib/scope';
import { useSession } from '@/lib/session';
import { toast } from '@/lib/toast';
import { Btn, Input, Select } from './controls';
import { LedgerPanelFooter } from './ledger-actions';
import type { LedgerFormSection } from './ledger-create-panel';

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

export function LedgerEditPanel({
  entityKey,
  title,
  sections,
  record,
  onClose,
  onSaved,
}: {
  entityKey: string;
  title: string;
  sections: LedgerFormSection[];
  record: EntityRecord;
  onClose: () => void;
  onSaved?: (record: EntityRecord) => void;
}) {
  const { companyId, user } = useSession();
  const entity = ENTITIES[entityKey];
  const [form, setForm] = useState<EntityRecord>(() => ({ ...record }));
  const [busy, setBusy] = useState(false);
  const selectedFields = useMemo(() => {
    const wanted = new Set(sections.flatMap((section) => section.fields));
    return entity?.fields.filter((field) => wanted.has(field.key)) || [];
  }, [entity, sections]);
  const fieldByKey = useMemo(() => new Map(selectedFields.map((field) => [field.key, field])), [selectedFields]);
  const docKey = String(record._key || record.id || '');

  if (!entity || !docKey) {
    return (
      <section className="ledger-record-panel" aria-label="수정 불가">
        <header className="ledger-record-panel__header">
          <div className="ledger-record-panel__heading">
            <div className="ledger-record-panel__title">{title}</div>
            <div className="ledger-record-panel__subtitle">식별키가 없어 수정할 수 없습니다</div>
          </div>
          <button type="button" className="ledger-record-panel__close" onClick={onClose} aria-label="닫기">
            <X size={14} />
          </button>
        </header>
      </section>
    );
  }

  const change = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function save() {
    const targetCompany = resolveWriteCompany(companyId, { companyId: form.companyId || record.companyId });
    if (!targetCompany) {
      toast(NEED_COMPANY, 'error');
      return;
    }
    const missing = selectedFields.filter((field) => field.required && !String(form[field.key] ?? '').trim());
    if (missing.length) {
      toast(`${missing.map((field) => field.label).join(', ')} 항목을 입력하세요`, 'error');
      return;
    }

    setBusy(true);
    try {
      const patch = normalizedForm(selectedFields, {
        ...form,
        companyId: targetCompany,
        updatedAt: new Date().toISOString(),
        updatedBy: user.email || user.name,
      });
      await getStore().update(entityKey, targetCompany, docKey, patch);
      toast(`${title} 저장`, 'success');
      onSaved?.({ ...record, ...patch, _key: docKey, companyId: targetCompany });
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : '저장하지 못했습니다', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ledger-record-panel" aria-label={`${title} 수정`}>
      <header className="ledger-record-panel__header">
        <div className="ledger-record-panel__heading">
          <div className="ledger-record-panel__title">{title}</div>
          <div className="ledger-record-panel__subtitle">그자리 수정</div>
        </div>
        <button type="button" className="ledger-record-panel__close" onClick={onClose} aria-label="수정 취소">
          <X size={14} />
        </button>
      </header>

      <div className="ledger-create-panel__body">
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
                      <Select value={value} onChange={(event) => change(field.key, event.target.value)} disabled={busy}>
                        <option value="">선택</option>
                        {(field.options || []).map((option) => <option value={option} key={option}>{option}</option>)}
                      </Select>
                    ) : (
                      <Input
                        type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                        value={value}
                        onChange={(event) => change(field.key, event.target.value)}
                        disabled={busy}
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </details>
        ))}
      </div>

      <LedgerPanelFooter hint="저장 시 원장 목록이 바로 갱신됩니다.">
        <Btn size="sm" variant="ghost" disabled={busy} onClick={onClose}>취소</Btn>
        <Btn size="sm" disabled={busy} onClick={save}><Save size={14} /> {busy ? '저장 중…' : '저장'}</Btn>
      </LedgerPanelFooter>
    </section>
  );
}
