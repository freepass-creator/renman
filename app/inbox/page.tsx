'use client';
/**
 * 수집함 — 현장에서 폰으로 먼저 올리고(사진·문서·서명), 나중에 차량·계약·자금에 매칭.
 *   업로드 = uploadDoc(Storage) → inbox 레코드(status='대기'). 매칭 = 대상 레코드 _docs 첨부 + status='매칭'.
 *   모바일 우선: 큰 업로드 버튼 + 대기 카드 + 대상(차량/계약/자금) 검색·첨부.
 */
import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/lib/session';
import { type EntityRecord } from '@/lib/intake/entities';
import { storageReady } from '@/lib/storage';
import { uploadToInbox } from '@/lib/inbox-upload';
import { openCar, openCustomer, openFinance } from '@/lib/ui-bus';
import { toast } from '@/lib/toast';
import { normPlate } from '@/lib/plate';
import { pushDocVersion } from '@/lib/docs';
import { linkFleet } from '@/lib/domain/model';
import { customerKey } from '@/lib/customers';
import { TODAY } from '@/lib/dashboard-consts';
import { resolveWriteCompany, NEED_COMPANY } from '@/lib/scope';
import { commitUpdate, commitAll } from '@/lib/commit';
import type { CommitUpdateArgs } from '@/lib/commit';
import { Page, Sec, Btn, EmptyState, Input, PillTabs, ListBox, ListRow, ObjCard, won, C, PageLoading, SPACE_M } from '@/components/ui';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { WorkHubBack } from '@/components/WorkHubTabs';
import { SignaturePad, dataUrlToFile } from '@/components/SignaturePad';
import { Camera, Paperclip, PenLine } from 'lucide-react';
import { useEntityLists } from '@/lib/use-entity-lists';
import { DATA_CENTER_QUEUE_TITLE, MOBILE_CAPTURE_TITLE, processingAttentionRank } from '@/lib/data-center-terms';
import { useIsMobile } from '@/lib/use-mobile';

type Target = 'vehicle' | 'contract' | 'insurance' | 'bank_tx';
type QueueFilter = '전체' | '오류' | '확인필요' | '미분류' | '중복';
const TARGET_LABEL: Record<Target, string> = { vehicle: '차량', contract: '계약', insurance: '보험', bank_tx: '자금' };
const norm = (s: unknown) => String(s || '').replace(/\s/g, '');
const processingState = (r: EntityRecord) => String(r.processingState || (r.status === '매칭' ? '처리완료' : '미분류'));
const suggestedTarget = (r: EntityRecord): Target => {
  const entity = String(r.suggestedEntity || '');
  return entity === 'contract' ? 'contract'
    : entity === 'insurance' ? 'insurance'
      : entity === 'bank_tx' ? 'bank_tx' : 'vehicle';
};

export default function InboxPage() {
  const mobile = useIsMobile();
  const { companyId, user } = useSession();
  const { data: [rows = [], vs = [], cs = [], ins = [], bts = []], loading, reload } = useEntityLists(['inbox', 'vehicle', 'contract', 'insurance', 'bank_tx']);
  const [busy, setBusy] = useState(false);
  const [sign, setSign] = useState(false);
  const [signData, setSignData] = useState<string | null>(null);
  const [matchRec, setMatchRec] = useState<EntityRecord | null>(null);
  const [mTarget, setMTarget] = useState<Target>('vehicle');
  const [mq, setMq] = useState('');
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('전체');
  const [requestedKey, setRequestedKey] = useState('');
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pending = rows.filter((r) => String(r.status || '대기') === '대기')
    .sort((a, b) => processingAttentionRank(a.processingState) - processingAttentionRank(b.processingState)
      || String(a.createdAt || a.date || '').localeCompare(String(b.createdAt || b.date || '')));
  const queueCounts = {
    전체: pending.length,
    오류: pending.filter((r) => processingState(r) === '오류').length,
    확인필요: pending.filter((r) => processingState(r) === '확인필요').length,
    미분류: pending.filter((r) => processingState(r) === '미분류').length,
    중복: pending.filter((r) => processingState(r) === '중복').length,
  };
  const visiblePending = queueFilter === '전체' ? pending : pending.filter((r) => processingState(r) === queueFilter);
  const processed = rows.filter((r) => ['매칭', '완료'].includes(String(r.status)))
    .sort((a, b) => String(b.matchedAt || b.createdAt || '').localeCompare(String(a.matchedAt || a.createdAt || '')));

  useEffect(() => {
    setRequestedKey(new URLSearchParams(window.location.search).get('open') || '');
  }, []);

  useEffect(() => {
    if (!requestedKey || !pending.length) return;
    const hit = pending.find((r) => String(r._key || r.inboxKey || r.id || '') === requestedKey);
    if (!hit) return;
    setQueueFilter('전체');
    setMatchRec(hit);
    setMTarget(suggestedTarget(hit));
    setMq(String(hit.plate || ''));
    setRequestedKey('');
  }, [requestedKey, pending]);

  async function upload(file: File, kind: string) {
    const target = resolveWriteCompany(companyId, null);
    if (!target) { toast(NEED_COMPANY, 'error'); return; }
    setBusy(true);
    const r = await uploadToInbox(file, kind, target, String(user.name || ''));
    setBusy(false);
    if (!r.ok) { toast(r.reason === 'unconfigured' ? '저장소(Firebase) 미설정 — 업로드하려면 설정 필요' : '업로드 실패', 'error'); return; }
    toast(r.duplicate ? '동일 원본 확인 — 중복 접수 이력으로 보관' : `${kind} 업로드 완료 — 원본 처리함 대기`, r.duplicate ? 'info' : 'success'); reload();
  }
  async function saveSignature() {
    if (!signData) { setSign(false); return; }
    const f = dataUrlToFile(signData, `서명_${Date.now()}.png`);
    if (f) await upload(f, '서명');
    setSign(false); setSignData(null);
  }

  async function confirmDuplicate(rec: EntityRecord) {
    if (!resolveWriteCompany(companyId, rec)) { toast(NEED_COMPANY, 'error'); return; }
    setBusy(true);
    try {
      await commitUpdate({
        entity: 'inbox', sessionCompanyId: companyId, rec,
        key: String(rec._key || rec.inboxKey),
        patch: {
          status: '완료', processingState: '처리완료', intakeState: '처리완료',
          assignmentState: '배정됨', assignee: String(rec.assignee || user.name || user.email || ''),
          matchedEntity: 'inbox', matchedKey: String(rec.duplicateOf || ''), matchedAt: new Date().toISOString(),
        },
      });
      if (String(matchRec?._key || matchRec?.inboxKey || '') === String(rec._key || rec.inboxKey || '')) {
        setMatchRec(null);
        setMq('');
      }
      toast('중복 원본 확인 완료 — 기존 원본 연결을 유지합니다.', 'success');
      reload();
    } catch (error) {
      toast((error as Error).message || NEED_COMPANY, 'error');
    } finally {
      setBusy(false);
    }
  }

  const cands: { rec: EntityRecord; key: string; title: string; sub: string }[] = (() => {
    if (!matchRec) return [];
    const q = norm(mq);
    if (mTarget === 'vehicle') return vs.filter((v) => !q || norm(v.plate).includes(q) || norm(v.carName).includes(q)).slice(0, 8).map((v) => ({ rec: v, key: String(v._key), title: String(v.plate || ''), sub: String(v.carName || '') }));
    if (mTarget === 'contract') return cs.filter((c) => !q || [c.contractorName, c.plate, c.contractNo, c.contractorPhone].some((f) => norm(f).includes(q))).slice(0, 8).map((c) => ({ rec: c, key: String(c._key), title: String(c.contractorName || '—'), sub: `${String(c.plate || '')} · ${String(c.contractNo || '')}` }));
    if (mTarget === 'insurance') return ins.filter((i) => !q || [i.policyNo, i.plate, i.insurer, i.endDate].some((f) => norm(f).includes(q))).slice(0, 8).map((i) => ({ rec: i, key: String(i._key), title: String(i.policyNo || i.plate || '보험'), sub: `${String(i.plate || '')} · ${String(i.insurer || '')} · ${String(i.endDate || '')}` }));
    return bts.filter((b) => q && (norm(b.counterparty).includes(q) || String(b.amount).includes(q) || String(b.txDate).includes(q))).slice(0, 8).map((b) => ({ rec: b, key: String(b._key), title: `${String(b.txDate || '')} · ${String(b.counterparty || '')}`, sub: won(Number(b.amount) || Number(b.withdraw) || 0) }));
  })();

  async function attach(target: Target, targetRec: EntityRecord) {
    if (!matchRec) return;
    if (!resolveWriteCompany(companyId, targetRec)) { toast(NEED_COMPANY, 'error'); return; }
    const next = pushDocVersion(targetRec, { type: 'inbox', url: String(matchRec.url || ''), reason: `수집함 매칭(${String(matchRec.kind || '')})`, by: String(user.name || '') });
    const ops: CommitUpdateArgs[] = [
      { entity: target, sessionCompanyId: companyId, rec: targetRec, key: String(targetRec._key), patch: { _docs: next } },
    ];
    if (target === 'vehicle') {
      const fleet = linkFleet(vs, cs, TODAY);
      const active = fleet.activeByPlate.get(normPlate(targetRec.plate));
      if (active?.view.rec._key) {
        const crec = active.view.rec;
        if (resolveWriteCompany(companyId, crec)) {
          const cDocs = pushDocVersion(crec, { type: 'inbox', url: String(matchRec.url || ''), reason: `수집함→차량경유(${String(matchRec.kind || '')})`, by: String(user.name || '') });
          ops.push({ entity: 'contract', sessionCompanyId: companyId, rec: crec, key: String(crec._key), patch: { _docs: cDocs } });
        }
      }
    }
    ops.push({
      entity: 'inbox', sessionCompanyId: companyId, rec: matchRec, key: String(matchRec._key || matchRec.inboxKey),
      patch: {
        status: '매칭', processingState: '처리완료', classificationState: '분류됨', intakeState: '처리완료',
        assignmentState: '배정됨', assignee: String(matchRec.assignee || user.name || user.email || ''), matchedEntity: target, matchedKey: String(targetRec._key),
        plate: String(targetRec.plate || ''), matchedAt: new Date().toISOString(),
      },
    });
    try {
      await commitAll(ops);
      toast(`${TARGET_LABEL[target]} 에 첨부·매칭`, 'success');
    } catch { toast(NEED_COMPANY, 'error'); return; }
    setMatchRec(null); setMq(''); reload();
    const plate = String(targetRec.plate || '');
    if (target === 'vehicle' || target === 'contract' || target === 'insurance') {
      if (plate) openCar(plate, 'doc');
      const ck = customerKey(targetRec.contractorName, targetRec.contractorPhone);
      if (target === 'contract' && ck) openCustomer(ck);
    } else if (target === 'bank_tx') {
      openFinance({
        unclassified: true,
        transactionId: targetRec._key,
        companyId: targetRec.companyId || companyId,
      });
    }
  }

  return (
    <Page title={mobile ? MOBILE_CAPTURE_TITLE : DATA_CENTER_QUEUE_TITLE} meta={`${user.name} · 대기 ${pending.length} · 처리완료 ${processed.length}`}
      tools={<WorkbenchBar search={false} mid={<WorkHubBack />} />}>
      <Sec title={mobile ? '촬영·업로드' : '원본 추가'} desc={mobile ? '현장에서 먼저 수집하고 데이터센터에서 이어서 처리' : '원본을 먼저 보관하고 차량·계약·자금에 연결'}>
        <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, '사진'); e.currentTarget.value = ''; }} />
        <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, '문서'); e.currentTarget.value = ''; }} />
        <div style={{ display: 'flex', gap: SPACE_M, flexWrap: 'wrap' }}>
          <Btn onClick={() => camRef.current?.click()} disabled={busy}><Camera size={15} /> 사진 촬영</Btn>
          <Btn variant="ghost" onClick={() => fileRef.current?.click()} disabled={busy}><Paperclip size={15} /> 파일 선택</Btn>
          <Btn variant={sign ? 'solid' : 'ghost'} onClick={() => { setSign((s) => !s); setSignData(null); }} disabled={busy}><PenLine size={15} /> 서명</Btn>
          {busy && <span style={{ fontSize: 12.5, color: C.mute, alignSelf: 'center' }}>업로드 중…</span>}
        </div>
        {!storageReady() && <div style={{ marginTop: 10, fontSize: 12, color: C.warn }}>※ 저장소(Firebase Storage) 미설정 — 실제 업로드는 설정 후 가능합니다.</div>}
        {/* 서명 = 그 자리 인라인 캡처(팝업 아님). */}
        {sign && (
          <div style={{ marginTop: 12, padding: 12, border: `1px solid ${C.accent}`, borderRadius: 'var(--radius)', background: 'var(--bg-card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>서명</span>
              <span style={{ flex: 1 }} />
              <Btn size="sm" variant="ghost" onClick={() => { setSign(false); setSignData(null); }}>취소</Btn>
              <Btn size="sm" onClick={saveSignature} disabled={!signData || busy}>업로드</Btn>
            </div>
            <SignaturePad onChange={setSignData} />
          </div>
        )}
      </Sec>

      <Sec title="대기" n={pending.length} desc="차량·계약·자금에 매칭하면 정리됩니다">
        <div style={{ marginBottom: 12 }}>
          <PillTabs
            size="sm"
            tabs={(Object.keys(queueCounts) as QueueFilter[]).map((key) => ({ key, label: `${key} ${queueCounts[key]}` }))}
            value={queueFilter}
            onChange={setQueueFilter}
          />
        </div>
        {loading ? <PageLoading />
          : visiblePending.length === 0 ? <EmptyState>{pending.length ? `${queueFilter} 자료 없음` : '대기 중인 업로드 없음'}</EmptyState>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_M }}>{visiblePending.map((r) => {
              // 매칭 = 그 자리 인라인 패널(팝업 아님). payments 수동연결 패턴.
              const isMatching = !!matchRec && String(matchRec._key || matchRec.inboxKey) === String(r._key || r.inboxKey);
              return (
                <div key={String(r._key || r.inboxKey)} style={{ display: 'flex', flexDirection: 'column', gap: SPACE_M }}>
                  <ObjCard
                    badge={String(r.kind || '문서')}
                    title={String(r.filename || '—')}
                    sub={`${String(r.processingState || '미분류')} · ${String(r.classificationReason || '내용 확인 필요')} · ${String(r.uploadedBy || '')} · ${String(r.uploadedAt || '').slice(0, 16).replace('T', ' ')}`}
                    right={processingState(r) === '중복'
                      ? <Btn size="sm" variant="ghost" disabled={busy} onClick={() => void confirmDuplicate(r)}>중복 확인 완료</Btn>
                      : <Btn size="sm" variant="ghost" disabled={busy} onClick={() => { if (isMatching) { setMatchRec(null); setMq(''); } else { setMatchRec(r); setMTarget(suggestedTarget(r)); setMq(String(r.plate || '')); } }}>{isMatching ? '닫기' : '확인·매칭'}</Btn>}
                  />
                  {isMatching && (
                    <div style={{ padding: 12, border: `1px solid ${C.accent}`, borderRadius: 'var(--radius)', background: 'var(--bg-card)' }}>
                      <PillTabs size="sm" tabs={(['vehicle', 'contract', 'insurance', 'bank_tx'] as Target[]).map((t) => ({ key: t, label: TARGET_LABEL[t] }))} value={mTarget} onChange={(k) => { setMTarget(k as Target); setMq(''); }} />
                      <Input value={mq} onChange={(e) => setMq(e.target.value)} placeholder={mTarget === 'vehicle' ? '차번·차명' : mTarget === 'contract' ? '계약자·차번·연락처' : mTarget === 'insurance' ? '증권번호·차번·보험사·만기' : '적요·금액·날짜'} style={{ width: '100%', marginTop: 10 }} autoFocus />
                      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                        {cands.length === 0 ? <EmptyState>{mq.trim() ? '일치 없음' : '검색어를 입력하세요'}</EmptyState>
                          : <ListBox>
                            {cands.map((c) => (
                              <ListRow key={c.key} onClick={() => attach(mTarget, c.rec)} main={c.title} sub={c.sub} />
                            ))}
                          </ListBox>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}</div>}
      </Sec>

      {processed.length > 0 && (
        <Sec title="처리완료" n={processed.length} desc="대상 첨부 또는 중복 확인 완료 · 연결 대상이 있으면 클릭해 이동">
          <ListBox>
            {processed.slice(0, 40).map((r) => {
              const plate = String(r.plate || '');
              const ent = String(r.matchedEntity || '');
              return (
                <ListRow
                  key={String(r._key || r.inboxKey)}
                  main={`${String(r.kind || '')} · ${String(r.filename || '')}`}
                  right={<span style={{ fontSize: 11.5, color: ent === 'inbox' ? C.mute : C.accent, fontWeight: 700 }}>{ent === 'inbox' ? '중복확인' : ent === 'bank_tx' ? '수납매칭' : (plate || TARGET_LABEL[ent as Target] || '—')}</span>}
                  onClick={ent === 'inbox' ? undefined : () => {
                    if (ent === 'bank_tx') openFinance({
                      unclassified: true,
                      transactionId: r.matchedKey,
                      companyId: r.companyId || companyId,
                    });
                    else if (plate) openCar(plate, 'doc');
                  }}
                />
              );
            })}
          </ListBox>
        </Sec>
      )}
    </Page>
  );
}
