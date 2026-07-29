'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronRight, Plus, Save, UploadCloud, X } from 'lucide-react';
import { COMPANIES, companyLabel, companyShort } from '@/lib/companies';
import { ENTITIES, type EntityRecord, type Field } from '@/lib/intake/entities';
import { saveIntake } from '@/lib/intake';
import { resolveWriteCompany, NEED_COMPANY } from '@/lib/scope';
import { useSession } from '@/lib/session';
import { toast } from '@/lib/toast';
import { Btn, Input, PillTabs, Select } from './controls';
import { FormGrid } from './detail';
import { LedgerPanelFooter } from './ledger-actions';
import { Message } from './misc';
import { C } from './tokens';

export type LedgerFormSection = {
  title: string;
  fields: string[];
  open?: boolean;
};

/** kind 값 → 일반 폼 대신 게이트웨이(저장 금지 · 외부 등록 경로). */
export type LedgerKindGateway = {
  message: ReactNode;
  actionLabel: string;
  href?: string;
  onAction?: () => void;
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
  sectionsByKind,
  kindField = 'category',
  fallbackKind = '기타',
  kindGateways,
  onKindChange,
  initial,
  quick,
  prefix,
  onClose,
  onSaved,
}: {
  entityKey: string;
  title: string;
  /** 고정 섹션. sectionsByKind 있으면 kind 값으로 대체. */
  sections?: LedgerFormSection[];
  /** erp4 field-group — 구분(Select) 값 → 섹션 목록. */
  sectionsByKind?: Record<string, LedgerFormSection[]>;
  /** sectionsByKind 키로 쓸 폼 필드(기본 category). */
  kindField?: string;
  fallbackKind?: string;
  /** kind 선택 시 폼 대신 안내+외부액션(해당 kind는 saveIntake 차단). */
  kindGateways?: Record<string, LedgerKindGateway>;
  /** kindField 값 변경 콜백(탭 전환 등). */
  onKindChange?: (kind: string) => void;
  initial?: EntityRecord;
  /** 회사만으로도 저장하되 아래 상세 입력은 선택적으로 유지한다. */
  quick?: boolean;
  prefix?: React.ReactNode;
  onClose: () => void;
  onSaved?: (record: EntityRecord) => void;
}) {
  const { companyId, scopeAll, user } = useSession();
  const entity = ENTITIES[entityKey];
  const [form, setForm] = useState<EntityRecord>(() => {
    const base = { ...(initial || {}) };
    // 단일 회사일 때만 폼 기본값 · 저장은 resolveWriteCompany 게이트
    if (!base.companyId && COMPANIES.length === 1) base.companyId = COMPANIES[0];
    return base;
  });
  const [busy, setBusy] = useState(false);

  const activeSections = useMemo(() => {
    if (sectionsByKind) {
      const kind = String(form[kindField] || '');
      return sectionsByKind[kind] || sectionsByKind[fallbackKind] || sections || [];
    }
    return sections || [];
  }, [sectionsByKind, sections, form, kindField, fallbackKind]);

  const selectedFields = useMemo(() => {
    const wanted = new Set(activeSections.flatMap((section) => section.fields));
    return entity?.fields.filter((field) => wanted.has(field.key)) || [];
  }, [entity, activeSections]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || !entity) return;
    const known = new Set(entity.fields.map((field) => field.key));
    // 생성 패널 공통 메타(엔티티 fields 밖) — silent-drop 경고 제외.
    const allow = new Set(['companyId', 'title', 'workType', 'createdBy', 'createdAt', 'inputSource']);
    for (const section of activeSections) {
      for (const key of section.fields) {
        if (!known.has(key) && !allow.has(key)) {
          console.warn(`[LedgerCreatePanel] entity "${entityKey}"에 없는 필드: "${key}" (섹션 silent-drop)`);
        }
      }
    }
  }, [entity, activeSections, entityKey]);

  const fieldByKey = useMemo(() => new Map(selectedFields.map((field) => [field.key, field])), [selectedFields]);

  if (!entity) return null;
  const kindValue = String(form[kindField] || '');
  const gateway = kindGateways?.[kindValue];
  const companyReady = !scopeAll || !!String(form.companyId || '').trim();
  const fieldsReady = gateway
    ? false
    : quick
      ? !!String(form.title || '').trim()
      : selectedFields.every((field) => !field.required || !!String(form[field.key] ?? '').trim());
  const canSave = !gateway && companyReady && fieldsReady;

  const change = (key: string, value: string) => {
    setForm((current) => {
      const next: EntityRecord = { ...current, [key]: value };
      if (key === 'category') next.workType = value;
      return next;
    });
    if (key === kindField) onKindChange?.(value);
  };
  const patch = (next: Record<string, string>) => setForm((current) => ({ ...current, ...next }));

  async function save() {
    if (gateway) {
      toast('이 구분은 업로드/전용 경로로 등록합니다.', 'info');
      return;
    }
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
        workType: form.workType || form.category,
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
          <X size={14} />
        </button>
      </header>

      <div className="ledger-create-panel__body">
        {prefix}
        {scopeAll && (
          quick ? (
            <div className="ledger-create-panel__company" role="group" aria-label="회사 선택">
              <div className="ledger-create-panel__company-label">
                회사명 <span>*</span>
                {!String(form.companyId || '').trim() && (
                  <em style={{ fontStyle: 'normal', fontWeight: 600, color: C.mute, marginLeft: 6 }}>탭해서 선택</em>
                )}
              </div>
              <PillTabs
                size="sm"
                value={String(form.companyId || '')}
                onChange={(id) => change('companyId', id)}
                tabs={COMPANIES.map((id) => ({
                  key: id,
                  label: companyShort(id),
                  title: companyLabel(id),
                }))}
              />
            </div>
          ) : (
            <div className="ledger-create-panel__company">
              <label>
                회사명 <span>*</span>
                <Select value={String(form.companyId || '')} onChange={(event) => change('companyId', event.target.value)}>
                  <option value="">회사를 선택하세요</option>
                  {COMPANIES.map((company) => <option value={company} key={company}>{companyLabel(company)}</option>)}
                </Select>
              </label>
            </div>
          )
        )}

        {quick && !gateway && (
          <div>
            <label className="ledger-create-panel__field">
              <span>업무 내용 <span style={{ color: C.danger }}>*</span></span>
              <Input
                autoFocus={!scopeAll || !!String(form.companyId || '').trim()}
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

        {activeSections.map((section, sectionIndex) => {
          const sectionFields = section.fields
            .map((key) => fieldByKey.get(key))
            .filter((field): field is Field => !!field);
          if (!sectionFields.length) return null;
          return (
            <details className="ledger-create-panel__section" open={section.open ?? sectionIndex === 0} key={section.title}>
              <summary><ChevronRight className="ledger-create-panel__chevron" size={14} aria-hidden="true" />{section.title}</summary>
              <FormGrid fields={sectionFields} form={form} onChange={change} onPatch={patch} cols={1} showNotes={false} />
            </details>
          );
        })}

        {gateway && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
            <Message variant="info">{gateway.message}</Message>
            <Btn
              size="sm"
              href={gateway.href}
              onClick={gateway.onAction}
            >
              <UploadCloud size={14} /> {gateway.actionLabel}
            </Btn>
          </div>
        )}
      </div>

      <LedgerPanelFooter hint={gateway ? '과태료는 work_item이 아니라 고지서 엔티티로 등록됩니다.' : '등록일·등록자는 저장 시 자동 기록됩니다.'}>
        <Btn size="sm" variant="ghost" disabled={busy} onClick={onClose}>취소</Btn>
        <Btn size="sm" disabled={busy || !canSave} onClick={save}><Save size={14} /> {busy ? '저장 중…' : '생성'}</Btn>
      </LedgerPanelFooter>
    </section>
  );
}
