'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { revealSectionInPanel } from './ledger-panel-scroll';
import { Message } from './misc';
import { C } from './tokens';

export type LedgerFormSection = {
  title: string;
  fields: string[];
  open?: boolean;
};

/** kind 값 → 일반 폼 대신 게이트웨이(저장 금지 · 외부/인라인 등록). */
export type LedgerKindGatewayCtx = {
  /** 생성 패널 상단에서 고른 저장 회사. */
  companyId: string;
};
export type LedgerKindGateway = {
  /** 패널 안 접이식 섹션 제목. 기본=해당 kind명. */
  sectionTitle?: string;
  message?: ReactNode;
  /** render 없을 때 액션 버튼. */
  actionLabel?: string;
  href?: string;
  onAction?: () => void;
  /** 있으면 href/actionLabel UI 대신 이 노드(또는 회사 전달 함수). */
  render?: ReactNode | ((ctx: LedgerKindGatewayCtx) => ReactNode);
};

export function CreateSection({
  title,
  initiallyOpen,
  children,
}: {
  title: string;
  initiallyOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const userToggleRef = useRef(false);

  return (
    <details
      className="ledger-create-panel__section"
      open={open}
      onToggle={(event) => {
        const el = event.currentTarget;
        const next = el.open;
        setOpen(next);
        // 사용자가 summary를 눌러 펼친 경우만 — 패널 최초 오픈 시 아래로 끌지 않음.
        if (next && userToggleRef.current) {
          userToggleRef.current = false;
          revealSectionInPanel(el);
        } else {
          userToggleRef.current = false;
        }
      }}
    >
      <summary onClick={() => { userToggleRef.current = true; }}>
        <ChevronRight className="ledger-create-panel__chevron" size={14} aria-hidden="true" />
        {title}
      </summary>
      {children}
    </details>
  );
}

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
  fileIngest,
  initial,
  quick,
  continuable,
  prefix,
  prepareRecord,
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
  /** 파일·OCR 대량 투입 진입(헤더 ⋯ 대신 [+생성] 패널). */
  fileIngest?: { label: string; onClick: () => void };
  initial?: EntityRecord;
  /** 회사만으로도 저장하되 아래 상세 입력은 선택적으로 유지한다. */
  quick?: boolean;
  /** 내용부터 먼저 저장하고 분류·대상·담당·기한은 같은 건에서 이어서 보완한다. */
  continuable?: boolean;
  prefix?: React.ReactNode;
  /** 직접입력 전용 표시 필드를 실제 저장 스키마로 변환한다. */
  prepareRecord?: (record: EntityRecord) => EntityRecord;
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
  const bodyRef = useRef<HTMLDivElement>(null);

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

  // 패널 열릴 때 본문은 항상 맨 위.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, []);

  const fieldByKey = useMemo(() => new Map(selectedFields.map((field) => [field.key, field])), [selectedFields]);

  const kindValue = String(form[kindField] || '');
  const gateway = kindGateways?.[kindValue];
  const companyReady = !scopeAll || !!String(form.companyId || '').trim();
  const hasContinuableInput = ['title', 'description', 'note'].some((key) => String(form[key] || '').trim());
  const fieldsReady = gateway
    ? false
    : continuable
      ? hasContinuableInput
    : quick
      ? !!String(form.title || '').trim()
      : selectedFields.every((field) => !field.required || !!String(form[field.key] ?? '').trim());
  const canSave = !gateway && companyReady && fieldsReady;

  if (!entity) return null;

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
    if (continuable && !hasContinuableInput) {
      toast('내용을 한 줄 이상 입력하세요. 분류·대상·담당자는 나중에 보완할 수 있습니다.', 'error');
      return;
    }
    if (quick && !continuable && !String(form.title || '').trim()) {
      toast('업무 내용을 입력하세요.', 'error');
      return;
    }
    const missing = quick || continuable
      ? []
      : selectedFields.filter((field) => field.required && !String(form[field.key] ?? '').trim());
    if (missing.length) {
      toast(`${missing.map((field) => field.label).join(', ')} 항목을 입력하세요`, 'error');
      return;
    }

    setBusy(true);
    try {
      const continuableWork = continuable && entityKey === 'work_item';
      const normalized = normalizedForm(selectedFields, {
        ...form,
        ...(continuableWork ? {
          category: String(form.category || '').trim() || '미분류',
          status: String(form.status || '').trim() || '대기',
          title: String(form.title || form.description || form.note || '').trim().slice(0, 80) || '내용 확인 필요',
          intakeState: '미처리',
          classificationState: String(form.category || '').trim() ? '분류됨' : '미분류',
          assignmentState: String(form.assigneeName || '').trim() ? '배정됨' : '미배정',
        } : {}),
        companyId: targetCompany,
        workType: continuableWork
          ? String(form.workType || form.category || '').trim() || '미분류'
          : form.workType || form.category,
        createdBy: user.email || user.name,
        createdAt: new Date().toISOString(),
        inputSource: '원장 직접입력',
      });
      const record = prepareRecord ? prepareRecord(normalized) : normalized;
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

      <div ref={bodyRef} className="ledger-create-panel__body">
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

        {fileIngest && !gateway && (
          <Message variant="info">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              여러 건은 파일로 한 번에 담을 수 있습니다.
              <Btn size="sm" variant="ghost" onClick={fileIngest.onClick}>
                <UploadCloud size={14} /> {fileIngest.label}
              </Btn>
            </span>
          </Message>
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
            {continuable ? (
              <div style={{ marginTop: 6, fontSize: 11.5, color: C.mute }}>
                내용만 입력해도 미분류·미배정 업무로 먼저 저장됩니다. 분류·대상·담당자는 같은 업무에서 이어서 보완할 수 있습니다.
              </div>
            ) : null}
          </div>
        )}

        {activeSections.map((section, sectionIndex) => {
          const sectionFields = section.fields
            .map((key) => fieldByKey.get(key))
            .filter((field): field is Field => !!field);
          if (!sectionFields.length) return null;
          // key에 kind 포함 — 업무구분 바꾸면 섹션 remount → initiallyOpen 재적용.
          return (
            <CreateSection
              key={`${kindValue}::${section.title}`}
              title={section.title}
              initiallyOpen={section.open ?? sectionIndex === 0}
            >
              <FormGrid fields={sectionFields} form={form} onChange={change} onPatch={patch} cols={1} showNotes={false} />
            </CreateSection>
          );
        })}

        {gateway && (
          <CreateSection
            key={`gateway::${kindValue}`}
            title={gateway.sectionTitle || kindValue || '등록'}
            initiallyOpen
          >
            <div className="ledger-create-panel__gateway">
              {gateway.message != null ? <Message variant="info">{gateway.message}</Message> : null}
              {gateway.render != null
                ? (typeof gateway.render === 'function'
                  ? gateway.render({ companyId: String(form.companyId || '') })
                  : gateway.render)
                : (gateway.actionLabel ? (
                  <Btn size="sm" href={gateway.href} onClick={gateway.onAction}>
                    <UploadCloud size={14} /> {gateway.actionLabel}
                  </Btn>
                ) : null)}
            </div>
          </CreateSection>
        )}
      </div>

      <LedgerPanelFooter hint={gateway ? '과태료는 work_item이 아니라 고지서 엔티티로 등록됩니다.' : '등록일·등록자는 저장 시 자동 기록됩니다.'}>
        <Btn size="sm" variant="ghost" disabled={busy} onClick={onClose}>취소</Btn>
        <Btn size="sm" disabled={busy || !canSave} onClick={save}><Save size={14} /> {busy ? '저장 중…' : '생성'}</Btn>
      </LedgerPanelFooter>
    </section>
  );
}
