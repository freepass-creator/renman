'use client';
/**
 * 수집함 — 현장에서 폰으로 먼저 올리고(사진·문서·서명), 나중에 차량·계약·자금에 매칭.
 *   업로드 = uploadDoc(Storage) → inbox 레코드(status='대기'). 매칭 = 대상 레코드 _docs 첨부 + status='매칭'.
 *   모바일 우선: 큰 업로드 버튼 + 대기 카드 + 대상(차량/계약/자금) 검색·첨부.
 */
import { useRef, useState } from 'react';
import { useSession } from '@/lib/session';
import { type EntityRecord } from '@/lib/intake/entities';
import { storageReady } from '@/lib/storage';
import { uploadToInbox } from '@/lib/inbox-upload';
import { openCar, openCustomer, openPayments } from '@/lib/ui-bus';
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

type Target = 'vehicle' | 'contract' | 'bank_tx';
const TARGET_LABEL: Record<Target, string> = { vehicle: '차량', contract: '계약', bank_tx: '자금' };
const norm = (s: unknown) => String(s || '').replace(/\s/g, '');

export default function InboxPage() {
  const { companyId, user } = useSession();
  const { data: [rows = [], vs = [], cs = [], bts = []], loading, reload } = useEntityLists(['inbox', 'vehicle', 'contract', 'bank_tx']);
  const [busy, setBusy] = useState(false);
  const [sign, setSign] = useState(false);
  const [signData, setSignData] = useState<string | null>(null);
  const [matchRec, setMatchRec] = useState<EntityRecord | null>(null);
  const [mTarget, setMTarget] = useState<Target>('vehicle');
  const [mq, setMq] = useState('');
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pending = rows.filter((r) => String(r.status || '대기') === '대기')
    .sort((a, b) => String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || '')));
  const matched = rows.filter((r) => String(r.status) === '매칭')
    .sort((a, b) => String(b.matchedAt || b.createdAt || '').localeCompare(String(a.matchedAt || a.createdAt || '')));

  async function upload(file: File, kind: string) {
    setBusy(true);
    const r = await uploadToInbox(file, kind, companyId, String(user.name || ''));
    setBusy(false);
    if (!r.ok) { toast(r.reason === 'unconfigured' ? '저장소(Firebase) 미설정 — 업로드하려면 설정 필요' : '업로드 실패', 'error'); return; }
    toast(`${kind} 업로드 완료 — 수집함 대기`, 'success'); reload();
  }
  async function saveSignature() {
    if (!signData) { setSign(false); return; }
    const f = dataUrlToFile(signData, `서명_${Date.now()}.png`);
    if (f) await upload(f, '서명');
    setSign(false); setSignData(null);
  }

  const cands: { rec: EntityRecord; key: string; title: string; sub: string }[] = (() => {
    if (!matchRec) return [];
    const q = norm(mq);
    if (mTarget === 'vehicle') return vs.filter((v) => !q || norm(v.plate).includes(q) || norm(v.carName).includes(q)).slice(0, 8).map((v) => ({ rec: v, key: String(v._key), title: String(v.plate || ''), sub: String(v.carName || '') }));
    if (mTarget === 'contract') return cs.filter((c) => !q || [c.contractorName, c.plate, c.contractNo, c.contractorPhone].some((f) => norm(f).includes(q))).slice(0, 8).map((c) => ({ rec: c, key: String(c._key), title: String(c.contractorName || '—'), sub: `${String(c.plate || '')} · ${String(c.contractNo || '')}` }));
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
      patch: { status: '매칭', matchedEntity: target, matchedKey: String(targetRec._key), plate: String(targetRec.plate || ''), matchedAt: new Date().toISOString() },
    });
    try {
      await commitAll(ops);
      toast(`${TARGET_LABEL[target]} 에 첨부·매칭`, 'success');
    } catch { toast(NEED_COMPANY, 'error'); return; }
    setMatchRec(null); setMq(''); reload();
    const plate = String(targetRec.plate || '');
    if (target === 'vehicle' || target === 'contract') {
      if (plate) openCar(plate, 'doc');
      const ck = customerKey(targetRec.contractorName, targetRec.contractorPhone);
      if (target === 'contract' && ck) openCustomer(ck);
    } else if (target === 'bank_tx') {
      openPayments();
    }
  }

  return (
    <Page title="증빙수집" meta={`${user.name} · 대기 ${pending.length} · 매칭 ${matched.length}`}
      tools={<WorkbenchBar mid={<WorkHubBack />} />}>
      <Sec title="업로드" desc="현장에서 먼저 올리고, 나중에 차량·계약·자금에 매칭">
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
        {loading ? <PageLoading />
          : pending.length === 0 ? <EmptyState>대기 중인 업로드 없음</EmptyState>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_M }}>{pending.map((r) => {
              // 매칭 = 그 자리 인라인 패널(팝업 아님). payments 수동연결 패턴.
              const isMatching = !!matchRec && String(matchRec._key || matchRec.inboxKey) === String(r._key || r.inboxKey);
              return (
                <div key={String(r._key || r.inboxKey)} style={{ display: 'flex', flexDirection: 'column', gap: SPACE_M }}>
                  <ObjCard
                    badge={String(r.kind || '문서')}
                    title={String(r.filename || '—')}
                    sub={`${String(r.uploadedBy || '')} · ${String(r.uploadedAt || '').slice(0, 16).replace('T', ' ')}`}
                    right={<Btn size="sm" variant="ghost" onClick={() => { if (isMatching) { setMatchRec(null); setMq(''); } else { setMatchRec(r); setMTarget('vehicle'); setMq(''); } }}>{isMatching ? '닫기' : '매칭'}</Btn>}
                  />
                  {isMatching && (
                    <div style={{ padding: 12, border: `1px solid ${C.accent}`, borderRadius: 'var(--radius)', background: 'var(--bg-card)' }}>
                      <PillTabs size="sm" tabs={(['vehicle', 'contract', 'bank_tx'] as Target[]).map((t) => ({ key: t, label: TARGET_LABEL[t] }))} value={mTarget} onChange={(k) => { setMTarget(k as Target); setMq(''); }} />
                      <Input value={mq} onChange={(e) => setMq(e.target.value)} placeholder={mTarget === 'vehicle' ? '차번·차명' : mTarget === 'contract' ? '계약자·차번·연락처' : '적요·금액·날짜'} style={{ width: '100%', marginTop: 10 }} autoFocus />
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

      {matched.length > 0 && (
        <Sec title="매칭됨" n={matched.length} desc="대상에 첨부 완료 · 클릭 → 차/수납">
          <ListBox>
            {matched.slice(0, 40).map((r) => {
              const plate = String(r.plate || '');
              const ent = String(r.matchedEntity || '');
              return (
                <ListRow
                  key={String(r._key || r.inboxKey)}
                  main={`${String(r.kind || '')} · ${String(r.filename || '')}`}
                  right={<span style={{ fontSize: 11.5, color: C.accent, fontWeight: 700 }}>{ent === 'bank_tx' ? '수납매칭' : (plate || TARGET_LABEL[ent as Target] || '—')}</span>}
                  onClick={() => {
                    if (ent === 'bank_tx') openPayments();
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
