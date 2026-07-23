'use client';
import { useState, useEffect } from 'react';
import { ENTITY_LIST, ENTITIES, mapOcrToEntity, type EntityRecord } from '@/lib/intake/entities';
import { parseCsv } from '@/lib/intake/csv';
import { downloadXlsxTemplate, parseSpreadsheet } from '@/lib/intake/xlsx';
import { saveIntake } from '@/lib/intake';
import { useEntityList } from '@/lib/use-entity-lists';
import { callOcrExtract } from '@/lib/ocr-client';
import { useSession } from '@/lib/session';
import { COMPANIES, companyLabel, ALL_COMPANIES } from '@/lib/companies';
import { resolveWriteCompany, NEED_COMPANY } from '@/lib/scope';
import { Check, AlertTriangle } from 'lucide-react';
import FileDrop from '@/components/FileDrop';
import { toast } from '@/lib/toast';

import { Page, Sec, Cards, Metric, Btn, FormGrid, Panel, PillTabs, Select, Input, th, td, C, Message, Loading } from '@/components/ui';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { WorkHubBack } from '@/components/WorkHubTabs';
import { layerOfEntity } from '@/lib/domain/layers';

type Tab = 'ocr' | 'excel' | 'manual';

/* 엔티티 선택기 = 데이터 3층 순서(원장 → 이벤트). layerOf 는 ENTITY_LAYER SSOT.
   여기가 «모든 데이터의 투입구»라는 걸 목록 구조로 보여준다 — 업무 기록(history·과태료)도 포함. */
const LAYER_TITLE: Record<string, string> = {
  ledger: '① 원장 — 자산이 생겼다',
  event: '③ 이벤트 — 가동 중 쌓이는 일',
  system: '도구',
};
const ENTITY_GROUPS = (['ledger', 'event', 'system'] as const)
  .map((layer) => ({
    title: LAYER_TITLE[layer],
    items: ENTITY_LIST.filter((e) => layerOfEntity(e.key) === layer),
  }))
  .filter((g) => g.items.length > 0);

export default function IngestPage() {
  const { companyId, user, scopeAll } = useSession();
  const [entityKey, setEntityKey] = useState('vehicle');
  const [saveTarget, setSaveTarget] = useState('');
  // 운영자 합본(ALL)에서는 저장 대상 회사를 명시 선택, 그 외엔 현재 회사
  const company = scopeAll ? saveTarget : companyId;
  const [saveMsg, setSaveMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [peekSaved, setPeekSaved] = useState(false);
  const { rows: savedList, reload: reloadSaved } = useEntityList(entityKey, { companyId: company || undefined });
  useEffect(() => { setPeekSaved(false); }, [company, entityKey]);
  async function saveRecords() {
    if (!records.length) return;
    const target = resolveWriteCompany(companyId, scopeAll ? { companyId: saveTarget } : null);
    if (!target) { toast(NEED_COMPANY, 'error'); return; }
    setSaving(true); setSaveMsg('');
    try {
      // 원본 OCR 스냅샷을 레코드에 영구 보존 (수기 교정해도 원본 추적 — feedback_ocr_preserve_original)
      const toSave = ocrRaw && records.length === 1
        ? [{ ...records[0], _ocrOriginal: { raw: ocrRaw, at: new Date().toISOString(), source: entity.source } }]
        : records;
      // 단일 통로 — 앵커 정규화·부수효과·jpk:saved 반영
      const r = await saveIntake(entityKey, target, toSave);
      const s = r.save;
      const fx = r.sideEffects.length ? ` · 부수효과 ${r.sideEffects.length}` : '';
      setSaveMsg(`저장 ${s.saved}건 · 중복건너뜀 ${s.duplicates} · 백엔드 ${s.backend}${fx}`);
      toast(`저장 ${s.saved}건${s.duplicates ? ` · 중복 ${s.duplicates}` : ''} — ${entity.label} (${companyLabel(target)})`, 'success');
      setRecords([]);
      setPeekSaved(true);
      reloadSaved();
    } catch (e) { setSaveMsg('저장 실패: ' + (e as Error).message); toast('저장 실패: ' + (e as Error).message, 'error'); }
    finally { setSaving(false); }
  }
  const saved = peekSaved ? savedList : null;
  function loadSaved() {
    if (!company) { toast(NEED_COMPANY, 'error'); return; }
    setPeekSaved(true);
    reloadSaved();
  }
  const [tab, setTab] = useState<Tab>('ocr');
  const [records, setRecords] = useState<EntityRecord[]>([]);
  const [ocrRaw, setOcrRaw] = useState<Record<string, unknown> | null>(null);   // 원본 OCR 보존 (감사추적)
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const entity = ENTITIES[entityKey];

  function reset() { setRecords([]); setError(''); setInfo(''); setOcrRaw(null); }

  // ── OCR ──
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  async function runOcr() {
    if (!file) { setError('파일을 선택하세요'); return; }
    setLoading(true); reset();
    try {
      const r = await callOcrExtract(file, entity.ocrType || '');
      if (!r.ok) { setError(r.error || '추출 실패'); toast('OCR 추출 실패: ' + (r.error || ''), 'error'); return; }
      setOcrRaw(r.raw || {});   // 원본 보존
      setRecords([mapOcrToEntity(entityKey, r.raw || {})]);
      setInfo('OCR 추출 완료');
      toast('OCR 추출 완료 — 아래에서 검토 후 저장', 'success');
    } catch (e) { setError((e as Error).message); toast('OCR 실패: ' + (e as Error).message, 'error'); }
    finally { setLoading(false); }
  }

  // ── 엑셀 (.xlsx / .csv) ──
  const [parsing, setParsing] = useState(false);
  async function onExcelFile(f: File) {
    reset(); setParsing(true);
    toast(`${f.name} 읽는 중…`, 'info');
    try {
      const isCsv = /\.csv$/i.test(f.name);
      const recs = isCsv ? parseCsv(entityKey, await f.text()) : await parseSpreadsheet(entityKey, f);
      if (!recs.length) { setError(`인식된 행이 없습니다 — "${entity.label}" 형식이 맞는지 확인하세요 (계좌·CMS는 엔티티를 "계좌 거래"로)`); toast('인식된 행 0 — 엔티티/형식 확인', 'error'); return; }
      setRecords(recs);
      setInfo(`엑셀 ${recs.length}행 파싱 (${isCsv ? 'CSV' : 'XLSX'})`);
      toast(`${recs.length.toLocaleString()}행 인식 — 아래에서 검토 후 저장`, 'success');
    } catch (e) { setError('파싱 실패: ' + (e as Error).message); toast('파싱 실패: ' + (e as Error).message, 'error'); }
    finally { setParsing(false); }
  }

  // ── 직접입력 ──
  const [form, setForm] = useState<EntityRecord>({});
  function submitManual() {
    reset();
    const filled = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '' && v != null));
    if (!Object.keys(filled).length) { setError('입력값이 없습니다'); return; }
    setRecords([filled]);
    setInfo('직접입력 1건');
  }

  const TABS: { k: Tab; label: string }[] = [
    ...(entity.ocrType ? [{ k: 'ocr' as Tab, label: 'OCR (증명서)' }] : []),
    { k: 'excel', label: entity.ocrType ? '엑셀 템플릿' : '엑셀 업로드' },
    { k: 'manual', label: '직접입력' },
  ];

  useEffect(() => {
    if (tab === 'ocr' && !entity.ocrType) {
      setTab('excel');
    }
  }, [tab, entity.ocrType]);

  return (
    <Page title="데이터센터" meta="모든 데이터 투입구 · OCR·엑셀·직접입력"
      tools={<WorkbenchBar mid={<WorkHubBack />} actions={<><Btn size="sm" variant="ghost" href="/ingest/freepass">프리패스 연동</Btn><Btn size="sm" variant="ghost" href="/ingest/classify">차종 분류</Btn><Btn size="sm" variant="ghost" href="/ingest/bulk">대량 자동매칭</Btn></>} />}
      right={<a href="/trash" style={{ fontSize: 13, color: C.mute, textDecoration: 'none', fontWeight: 600 }}>휴지통 →</a>}>
      <p style={{ color: C.mute, fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
        <b>모든 데이터</b>를 한곳에서 넣습니다 — 원장(차량·계약·고객·보험·계좌)뿐 아니라 <b>업무 기록(정비·통화·과태료)</b>까지.
        OCR·엑셀·직접입력 3방식 → 같은 표준 레코드. 차·계약 화면에서의 <b>그자리</b> 조치(반납·입금·기록)와 역할이 다릅니다 —
        여기는 <b>한곳에서 일괄</b>, 거기는 <b>일하면서 하나씩</b>. 삭제·복구는 <a href="/trash" style={{ color: C.accent }}>휴지통</a>.
      </p>

      <Sec title="수집 요약" desc="선택 엔티티·저장 대상 · 미확정(저장 전)·저장본(현재 회사)">
        <Cards min={128} fit>
          <Metric label="선택 엔티티" value={entity.label} tone="ink" />
          <Metric label="저장 대상" value={company ? companyLabel(company) : '회사 선택'} tone={company ? 'ok' : 'warn'} />
          <Metric label="미확정 레코드" value={records.length} tone={records.length ? 'warn' : 'ink'} />
          <Metric label="저장본" value={saved == null ? '조회 대기' : saved.length} tone={saved ? 'ok' : 'ink'} />
        </Cards>
      </Sec>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) 1fr', gap: 12, alignItems: 'center', marginTop: 18 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* 데이터 3층으로 묶어 보여준다 — 원장뿐 아니라 «이벤트(업무 기록)»도 여기서 넣는다는 걸
              선택기 자체가 말하게. 층 판정은 ENTITY_LAYER SSOT(lib/domain/layers). */}
          <Select value={entityKey} onChange={(e) => { setEntityKey(e.target.value); reset(); setForm({}); }} style={{ minWidth: 220 }}>
            {ENTITY_GROUPS.map((g) => (
              <optgroup key={g.title} label={g.title}>
                {g.items.map((e) => <option key={e.key} value={e.key}>{e.label} ← {e.source}</option>)}
              </optgroup>
            ))}
          </Select>
          <span style={{ fontSize: 12, color: C.faint }}>{entity.fields.length}개 필드 · 자연키 {entity.idFrom}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          {scopeAll ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: C.mute }}>
              <span>저장 대상 회사:</span>
              <Select value={saveTarget} onChange={(e) => setSaveTarget(e.target.value)} size="sm" style={{ fontWeight: 700 }}>
                <option value="">— 회사 선택 —</option>
                {COMPANIES.map((c) => <option key={c} value={c}>{companyLabel(c)}</option>)}
              </Select>
              <span style={{ color: C.faint }}>(합본 — 저장은 회사 지정)</span>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: C.mute }}>저장 대상 회사: <b>{companyLabel(company)}</b> <span style={{ color: C.faint }}>({user.role})</span></span>
          )}
        </div>
      </div>

      {/* 탭 — 앱 표준 PillTabs(각진 채움형) */}
      <div style={{ marginTop: 16 }}>
        <PillTabs tabs={TABS.map((t) => ({ key: t.k, label: t.label }))} value={tab} onChange={(k) => { setTab(k); reset(); }} />
      </div>

      <div style={{ padding: '16px 0' }}>
        {tab === 'ocr' && (
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <FileDrop onFile={setFile} file={file} accept=".pdf,.jpg,.jpeg,.png,.webp" hint={`${entity.source} (PDF·JPG·PNG)`} />
            <div style={{ marginTop: 28 }}><Btn variant="solid" onClick={runOcr} disabled={loading || !file}>{loading ? '추출 중…' : 'OCR 추출 → 매핑'}</Btn></div>
          </div>
        )}
        {tab === 'excel' && (
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <FileDrop onFile={onExcelFile} accept=".xlsx,.xls,.csv" hint="채운 템플릿 또는 계좌·카드 내역 (.xlsx · .csv)" />
            <div style={{ marginTop: 28, display: 'flex', gap: 10, alignItems: 'center' }}>
              <Btn variant="ghost" onClick={() => downloadXlsxTemplate(entityKey)}>＋ 빈 템플릿(.xlsx) 받기</Btn>
              {parsing && <Loading label="파일 읽는 중…" color={C.accent} />}
            </div>
          </div>
        )}
        {tab === 'manual' && (
          <div>
            <FormGrid fields={entity.fields} form={form} onChange={(k, v) => setForm({ ...form, [k]: v })} />
            <div style={{ marginTop: 12 }}><Btn variant="solid" onClick={submitManual}>입력 확정</Btn></div>
          </div>
        )}
      </div>

      {error && <Message variant="danger"><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><AlertTriangle size={16} />{error}</div></Message>}
      {info && <Message variant="success"><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Check size={16} />{info}</div></Message>}

      {records.length > 0 && (
        <Panel title="검토 및 저장">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: C.mute }}>표준 레코드 {records.length}건 · 저장 전 교정/보완</span>
            <Btn variant="solid" onClick={saveRecords} disabled={saving}>{saving ? '저장 중…' : '저장'}</Btn>
            {saveMsg && <span style={{ fontSize: 12, color: saveMsg.startsWith('저장 실패') ? C.danger : C.ok }}>{saveMsg}</span>}
          </div>
          <div style={{ overflowX: 'auto', border: `1px solid ${C.line}`, borderRadius: 'var(--radius)' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12.5, width: '100%' }}>
              <thead>
                <tr>{entity.fields.map((f) => <th key={f.key} style={{ ...th, color: f.manual ? C.warn : C.mute }}>{f.label}{f.manual ? ' ·직접' : ''}</th>)}</tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${C.line2}` }}>
                    {entity.fields.map((f) => (
                      <td key={f.key} style={{ padding: '3px 4px' }}>
                        <Input size="sm" value={(r[f.key] as string) ?? ''}
                          onChange={(e) => setRecords(records.map((rr, ri) => ri === i ? { ...rr, [f.key]: e.target.value } : rr))}
                          style={{ width: f.type === 'text' ? 120 : 90, background: f.manual && !(r[f.key]) ? 'var(--orange-bg)' : C.card }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel title="저장 데이터 확인">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Btn variant="ghost" onClick={loadSaved}>회사 「{companyLabel(company)}」 {entity.label} 저장본 보기</Btn>
          {saved && <span style={{ fontSize: 12, color: C.mute }}>{saved.length}건 존재</span>}
        </div>
        {saved && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: C.mute, marginBottom: 6 }}>{saved.length}건 (이 회사 스코프만 — 다른 회사 데이터는 안 보임)</div>
            {saved.length > 0 && (
              <div style={{ overflowX: 'auto', border: `1px solid ${C.line}`, borderRadius: 'var(--radius)' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 12.5, width: '100%' }}>
                  <thead><tr>{entity.fields.slice(0, 6).map((f) => <th key={f.key} style={th}>{f.label}</th>)}<th style={th}>저장시각</th></tr></thead>
                  <tbody>
                    {saved.map((r, i) => (
                      <tr key={i} style={{ borderTop: `1px solid ${C.line2}` }}>
                        {entity.fields.slice(0, 6).map((f) => <td key={f.key} style={td}>{r[f.key] != null && r[f.key] !== '' ? String(r[f.key]) : '—'}</td>)}
                        <td style={{ ...td, color: C.faint }}>{String(r.createdAt || '').slice(0, 16).replace('T', ' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Panel>
    </Page>
  );
}
