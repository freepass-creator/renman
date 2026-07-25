'use client';
import { Sec, Cards, ObjCard, Btn, Badge, TextLink, EmptyState, won, C } from '@/components/ui';
import { QuickLogForm } from '@/components/QuickLogForm';
import { WorkForm } from '@/components/WorkForm';
import { latestDoc } from '@/lib/docs';
import { workSummary, workCategoryTone, workStatusTone } from '@/lib/work-ops';
import { isComm, matchesContract } from '@/lib/activity-match';
import { matchDriver, penaltyStatus, penaltyTone } from '@/lib/penalty-reassign';
import { openPrintDoc } from '@/lib/ui-bus';
import { toast } from '@/lib/toast';
import { NEED_COMPANY } from '@/lib/scope';
import { commitUpdate } from '@/lib/commit';
import { TODAY } from '@/lib/dashboard-consts';
import type { EntityRecord } from '@/lib/intake/entities';
import { yy } from '../useVehicleDetail';
import { Add, type PanelProps } from './shared';

export function PenaltyPanel({ plate, vd }: PanelProps) {
  const { penalties, contracts, companyId } = vd;
  return (
    <Sec id="v-penalty" title="과태료 · 변경부과" n={penalties.length} right={<span style={{ display: 'inline-flex', gap: 6 }}>{penalties.length ? <Btn variant="ghost" onClick={() => openPrintDoc('penalty', plate)}>변경부과 공문</Btn> : null}<Add type="penalty" plate={plate} label="+ 추가" /></span>}>
      {penalties.length ? <Cards min={360}>{penalties.map((p, i) => {
        const drv = matchDriver(p, contracts); const st = penaltyStatus(p);
        const NEXT: Record<string, string | null> = { '접수': '임차인확인', '임차인확인': '변경부과신청', '변경부과신청': '변경부과완료', '변경부과완료': '종결', '종결': null };
        const next = NEXT[st] || null;
        const advance = async () => {
          if (!p._key) return;
          const patch: EntityRecord = { reassignStatus: next };
          if (next === '임차인확인' && drv) { patch.driverName = drv.contractorName; patch.driverPhone = drv.contractorPhone; patch.billedToRenter = true; patch.reassignDate = TODAY; }
          try {
            await commitUpdate({ entity: 'penalty', sessionCompanyId: companyId, rec: p, key: String(p._key), patch });
          } catch { toast(NEED_COMPANY, 'error'); }
        };
        return <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}><ObjCard badge={st} badgeTone={penaltyTone(st)} title={String(p.description || p.docType || '과태료')} right={p.amount ? won(p.amount) : undefined} fields={[['위반', String(p.violationDate || '—')], ['실운전자', drv ? String(drv.contractorName || '—') : '미매칭'], ['기한', String(p.dueDate || '—')]]} /></div>
          {next ? <Btn variant="ghost" onClick={advance}>{next} →</Btn> : null}
        </div>;
      })}</Cards> : <EmptyState variant="sec">과태료 없음</EmptyState>}
    </Sec>
  );
}

export function WorkPanel({ plate, vd }: PanelProps) {
  const { workList, workOpen, setWorkOpen, target, v, active } = vd;
  return (
    <Sec id="v-work" title="차량 수선 · 정비·사고" n={workList.length} tone={workOpen ? 'ok' : undefined}
      desc="정비·사고수리·상품화·세차 — 휴차는 작업상태가 휴차 워크벤치에 자동 반영"
      right={<Btn variant="ghost" onClick={() => setWorkOpen((o) => !o)}>{workOpen ? '닫기' : '+ 수선/작업'}</Btn>}>
      {workOpen ? <WorkForm plate={plate} companyId={target} vehicle={v} idle={!active} onDone={() => setWorkOpen(false)} onCancel={() => setWorkOpen(false)} style={{ marginBottom: 12 }} /> : null}
      {workList.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{workList.map((h, i) => {
        const cat = String(h.category || '수선'); const ws = String(h.work_status || ''); const doc = latestDoc(h); const amt = Number(h.amount) || 0;
        return (
          <div key={i} style={{ padding: '9px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Badge tone={workCategoryTone(cat)}>{cat}</Badge>
              {ws ? <Badge tone={workStatusTone(ws)}>{ws}</Badge> : null}
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>{workSummary(h)}</span>
              <span style={{ flex: 1 }} />
              {amt > 0 ? <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{won(amt)}</span> : null}
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6, fontSize: 11.5, color: C.mute }}>
              <span>일자 <b style={{ color: C.ink }}>{yy(h.date)}</b></span>
              {h.vendor ? <span>업체 <b style={{ color: C.ink }}>{String(h.vendor)}</b></span> : null}
              {cat === '사고수리' && Number(h.insurance_amount) > 0 ? <span>보험처리 <b style={{ color: C.ink }}>{won(h.insurance_amount)}</b></span> : null}
              {cat === '사고수리' && Number(h.self_pay) > 0 ? <span>자기부담 <b style={{ color: C.ink }}>{won(h.self_pay)}</b></span> : null}
              {cat === '사고수리' && h.repair_out_date ? <span>출고예정 <b style={{ color: C.warn }}>{yy(h.repair_out_date)}</b></span> : null}
              {cat === '정비' && h.next_maint_date ? <span>다음정비 <b style={{ color: C.warn }}>{yy(h.next_maint_date)}</b></span> : null}
              {h.author ? <span>작성 <b style={{ color: C.ink }}>{String(h.author)}</b></span> : null}
              <span style={{ flex: 1 }} />
              {doc
                ? (doc.url
                    ? <TextLink onClick={() => window.open(doc.url, '_blank')}>{doc.type || '서류'} 열기</TextLink>
                    : <span style={{ color: C.faint }}>{doc.type || '서류'} · 미첨부</span>)
                : <span style={{ color: C.faint }}>서류 미첨부</span>}
            </div>
          </div>
        );
      })}</div> : <EmptyState variant="sec">수선/작업 이력 없음 · 오른쪽 “+ 수선/작업”으로 남기세요</EmptyState>}
    </Sec>
  );
}

export function HistoryPanel({ plate, vd }: PanelProps) {
  const { history, logOpen, setLogOpen, active, contracts } = vd;
  return (
    <Sec id="v-history" title="활동 · 이력" n={history.length} tone={logOpen ? 'ok' : undefined} right={<Btn variant="ghost" onClick={() => setLogOpen((o) => !o)}>{logOpen ? '닫기' : '+ 기록'}</Btn>}>
      {logOpen ? <QuickLogForm
        ctx={{ plate, ...(active ? { contractNo: String(active.contractNo || active._key || ''), customer: String(active.contractorName || '') } : {}) }}
        onDone={() => setLogOpen(false)} onCancel={() => setLogOpen(false)} style={{ marginBottom: 12 }} /> : null}
      {history.length ? <Cards min={340}>{history.map((h, i) => {
        const cat = String(h.category || '이력');
        const tone = (cat === '사고' ? 'red' : cat === '이동' ? 'blue' : (cat === '통화' || cat === '문자') ? 'green' : (cat === '방문' || cat === '상담') ? 'purple' : cat === '메모' ? 'gray' : cat === '검사' ? 'teal' : 'amber') as 'red' | 'blue' | 'green' | 'purple' | 'gray' | 'teal' | 'amber';
        const who = isComm(h) ? (contracts.find((c) => matchesContract(h, c))?.contractorName || h.customer || '') : '';
        return <ObjCard key={i} badge={cat} badgeTone={tone} title={String(h.title || '—')} right={h.cost ? won(h.cost) : (h.nextDate ? <span style={{ color: C.warn, fontSize: 11.5 }}>후속 {String(h.nextDate)}</span> : undefined)} fields={[['일자', String(h.date || '—')], ...(who ? [['상대', String(who)] as [string, string]] : []), [h.author ? '작성' : '업체', String(h.author || h.vendor || '—')]]} />;
      })}</Cards> : <EmptyState variant="sec">기록 없음 · 오른쪽 “+ 기록”으로 남기세요</EmptyState>}
    </Sec>
  );
}
