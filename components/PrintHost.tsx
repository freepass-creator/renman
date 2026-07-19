'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import { useSession } from '@/lib/session';
import { getStore } from '@/lib/store';
import { type EntityRecord } from '@/lib/intake/entities';
import { computeContractView, computeReturnSettlement } from '@/lib/contract-ops';
import { loadMaster } from '@/lib/company-master';
import { companyLabel } from '@/lib/companies';
import { normPlate } from '@/lib/plate';
import { fmtKMoneyHangul } from '@/lib/won-korean';
import { matchDriver } from '@/lib/penalty-reassign';
import { buildNoticeClaim } from '@/lib/docs/notice-claim';
import { PageLoading, Btn } from '@/components/ui';
import { TODAY } from '@/lib/dashboard-consts';

// 전역 문서 인쇄 오버레이 — 'jpk:print-doc' {type,plate} → A4 문서 전체화면 + 인쇄/PDF.
// 라우트 없이 이벤트로(신규 라우트 등록 이슈 회피). 모든 client 문서(내용증명·계약서·서식)의 단일 진입.
const won = (n: unknown) => '₩' + (Number(n) || 0).toLocaleString('ko-KR');
const cellL: CSSProperties = { border: '1px solid #cbd5e1', padding: '8px 12px', background: '#f8fafc', fontWeight: 700, width: 110, whiteSpace: 'nowrap' };
const cellR: CSSProperties = { border: '1px solid #cbd5e1', padding: '8px 12px' };
const tbl: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 };
const secTitle: CSSProperties = { fontWeight: 700, fontSize: 13.5, margin: '18px 0 6px', color: '#0f172a' };
const s = (v: unknown) => (v == null || v === '' ? '—' : String(v));

export function PrintHost() {
  const { companyId } = useSession();
  const [doc, setDoc] = useState<{ type: string; plate: string; amount?: number; label?: string; contractKey?: string; contractKeys?: string[] } | null>(null);
  const [c, setC] = useState<EntityRecord | null>(null);
  const [bulkCs, setBulkCs] = useState<EntityRecord[]>([]);
  const [penalties, setPenalties] = useState<EntityRecord[]>([]);
  const [plateContracts, setPlateContracts] = useState<EntityRecord[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    function on(e: Event) {
      const d = (e as CustomEvent).detail || {};
      const keys = Array.isArray(d.contractKeys) ? d.contractKeys.map((k: unknown) => String(k || '')).filter(Boolean) : undefined;
      setDoc({
        type: String(d.type || 'notice'),
        plate: String(d.plate || ''),
        amount: d.amount != null ? Number(d.amount) : undefined,
        label: d.label ? String(d.label) : undefined,
        contractKey: d.contractKey ? String(d.contractKey) : undefined,
        contractKeys: keys?.length ? keys : undefined,
      });
    }
    window.addEventListener('jpk:print-doc', on);
    return () => window.removeEventListener('jpk:print-doc', on);
  }, []);
  useEffect(() => {
    if (!doc?.plate && !(doc?.contractKeys?.length)) { setC(null); setBulkCs([]); setPenalties([]); setPlateContracts([]); setReady(false); return; }
    setReady(false);
    const store = getStore();
    Promise.all([
      store.list('contract', companyId),
      doc.type === 'penalty' ? store.list('penalty', companyId) : Promise.resolve([] as EntityRecord[]),
    ]).then(([cs, ps]) => {
      if (doc.type === 'notice' && doc.contractKeys?.length) {
        const byKey = new Map(cs.map((x) => [String(x._key), x]));
        const ordered = doc.contractKeys.map((k) => byKey.get(k)).filter((x): x is EntityRecord => !!x);
        setBulkCs(ordered);
        setC(ordered[0] || null);
        setPlateContracts([]);
        setPenalties([]);
        setReady(true);
        return;
      }
      setBulkCs([]);
      const np = normPlate(doc.plate);
      const mine = cs.filter((x) => normPlate(x.plate) === np);
      setPlateContracts(mine);
      const byKey = doc.contractKey ? mine.find((x) => String(x._key) === doc.contractKey) : null;
      setC(byKey || mine.find((x) => !x.returnedDate) || mine[0] || null);
      setPenalties(ps.filter((x) => normPlate(x.plate) === np));
      setReady(true);
    }).catch(() => setReady(true));
  }, [doc, companyId]);

  if (!doc) return null;
  const close = () => setDoc(null);
  const isBulkNotice = doc.type === 'notice' && bulkCs.length > 1;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#e2e8f0', overflowY: 'auto' }}>
      <style>{`@media print { body { visibility: hidden !important; } .print-doc, .print-doc * { visibility: visible !important; } .print-stack, .print-doc { position: absolute !important; left: 0; top: 0; } .print-stack { width: 100%; } .print-stack .print-doc { position: relative !important; left: auto; top: auto; page-break-after: always; } .print-stack .print-doc:last-child { page-break-after: auto; } .print-doc { box-shadow: none !important; margin: 0 !important; } .no-print { display: none !important; } } @page { size: A4; margin: 14mm; }`}</style>
      <div className="no-print" style={{ maxWidth: 794, margin: '18px auto 12px', display: 'flex', gap: 8, padding: '0 10px', alignItems: 'center' }}>
        <Btn variant="ghost" onClick={close}>← 닫기</Btn>
        {isBulkNotice ? <span style={{ fontSize: 13, color: '#475569', fontWeight: 700 }}>내용증명 일괄 {bulkCs.length}건</span> : null}
        <span style={{ flex: 1 }} />
        <Btn onClick={() => window.print()}>인쇄 / PDF 저장</Btn>
      </div>
      {!ready ? <PageLoading />
        : doc.type === 'penalty' ? (penalties.length ? <PenaltyDoc penalties={penalties} contracts={plateContracts} companyId={companyId} /> : <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>이 차량의 과태료가 없습니다.</div>)
          : isBulkNotice ? (
            <div className="print-stack">
              {bulkCs.map((rec, i) => <NoticeDoc key={String(rec._key)} c={rec} companyId={companyId} pageIndex={i + 1} pageTotal={bulkCs.length} />)}
            </div>
          )
            : !c ? <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>계약을 찾을 수 없습니다.</div>
              : doc.type === 'contract' ? <ContractDoc c={c} companyId={companyId} />
                : doc.type === 'settlement' ? <SettlementDoc c={c} companyId={companyId} />
                  : doc.type === 'receipt' ? <ReceiptDoc c={c} companyId={companyId} amount={doc.amount} label={doc.label} />
                    : <NoticeDoc c={c} companyId={companyId} />}
    </div>
  );
}

function NoticeDoc({ c, companyId, pageIndex, pageTotal }: { c: EntityRecord; companyId: string; pageIndex?: number; pageTotal?: number }) {
  const co = String(c.companyId || companyId);
  const m = loadMaster(co);
  const n = buildNoticeClaim(c, TODAY);
  const t = new Date(n.asOf + 'T12:00:00');
  const dateStr = `${t.getFullYear()}년 ${t.getMonth() + 1}월 ${t.getDate()}일`;
  const due = new Date(n.dueDate + 'T12:00:00');
  const dueStr = `${due.getFullYear()}년 ${due.getMonth() + 1}월 ${due.getDate()}일`;
  const et = n.early;
  return (
    <div className="print-doc" style={{ width: 794, minHeight: 1123, margin: '0 auto 30px', background: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', padding: '80px 70px', boxSizing: 'border-box', color: '#111', fontSize: 15, lineHeight: 1.9 }}>
      <div style={{ textAlign: 'right', fontSize: 12, color: '#666', marginBottom: 8, fontFamily: 'monospace' }}>
        문서번호 {n.docNo}{pageTotal && pageTotal > 1 ? ` · ${pageIndex}/${pageTotal}` : ''}
      </div>
      <div style={{ textAlign: 'center', fontSize: 26, fontWeight: 800, letterSpacing: 8, marginBottom: 34 }}>내 용 증 명</div>
      <div style={{ fontSize: 19, fontWeight: 700, textAlign: 'center', marginBottom: 36 }}>대여료 납부 최고(催告) 및 계약해지 예고</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28, fontSize: 14 }}><tbody>
        <tr><td style={cellL}>수신인</td><td style={cellR}>{String(c.contractorName || '')} 귀하 {c.contractorAddress ? '(' + String(c.contractorAddress) + ')' : ''}</td></tr>
        <tr><td style={cellL}>발신인</td><td style={cellR}>{companyLabel(co)} {m.ceo ? '(대표 ' + m.ceo + ')' : ''}{m.address ? ' · ' + m.address : ''}{m.phone ? ' · ' + m.phone : ''}</td></tr>
        <tr><td style={cellL}>계약번호</td><td style={cellR}>{String(c.contractNo || '—')} · 차량 {String(c.plate || '')}{c.carName ? ` (${String(c.carName)})` : ''}</td></tr>
      </tbody></table>
      <p>1. 귀하의 무궁한 발전을 기원합니다.</p>
      <p>2. 귀하는 당사와 체결한 자동차대여 계약(계약기간 {String(c.startDate || '')} ~ {String(c.endDate || '')})에 따라 월 대여료 {won(c.monthlyRent)}을(를) 납부할 의무가 있습니다.</p>
      <p>3. 그러나 {n.asOf} 현재 대여료 <b>{n.unpaidCount}회차, 합계 {won(n.unpaidGross)}</b>이(가) 연체되어 있으며{et.isEarly && et.fee > 0 ? <>, 계약 잔여기간 <b>{et.remainMonths}개월</b>에 대하여 표준약관에 따른 중도해지 위약금(요율 {et.rate}%)이 발생합니다</> : '습니다'}.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', margin: '16px 0', fontSize: 14 }}><tbody>
        <tr><td style={cellL}>미납 대여료</td><td style={{ ...cellR, textAlign: 'right' }}>{won(n.unpaidGross)}</td></tr>
        {et.isEarly && et.fee > 0 ? <tr><td style={cellL}>중도해지 위약금 (잔여 {et.remainMonths}개월 × {et.rate}%)</td><td style={{ ...cellR, textAlign: 'right' }}>{won(et.fee)}</td></tr> : null}
        <tr><td style={cellL}>보증금 상계</td><td style={{ ...cellR, textAlign: 'right' }}>-{won(n.deposit)}</td></tr>
        <tr><td style={cellL}>최종 청구액</td><td style={{ ...cellR, textAlign: 'right', fontWeight: 800 }}>{won(n.claim)} <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>({n.claimHangul})</span></td></tr>
      </tbody></table>
      <p>4. 본 내용증명을 수령한 날로부터 <b>7일 이내</b>(납부기한 <b>{dueStr}</b>)에 위 청구액 <b>{won(n.claim)}</b>을(를) 당사가 지정하는 계좌로 납부하여 주시기 바랍니다.</p>
      <p>5. 위 기한 내에 납부하지 않을 경우, 당사는 별도 통지 없이 <b>본 계약을 해지</b>하고 차량 회수 및 미납금 청구를 위한 <b>법적 조치</b>를 진행할 것임을 최고합니다.</p>
      <div style={{ textAlign: 'center', marginTop: 56 }}>{dateStr}</div>
      <div style={{ textAlign: 'center', marginTop: 18, fontSize: 17, fontWeight: 700 }}>{companyLabel(co)} {m.ceo ? '대표 ' + m.ceo : ''} (인)</div>
    </div>
  );
}

function SettlementDoc({ c, companyId }: { c: EntityRecord; companyId: string }) {
  const co = String(c.companyId || companyId);
  const m = loadMaster(co);
  const v = computeContractView(c, TODAY);
  const returned = String(c.returnedDate || '');
  // 정산 계산 = 공용 SSOT(현장 반납폼과 동일). 손롤 금지.
  const { deposit, unpaid, offset, refund, addCharge } = computeReturnSettlement(Number(c.deposit) || 0, v);
  const t = new Date();
  const dateStr = `${t.getFullYear()}년 ${t.getMonth() + 1}월 ${t.getDate()}일`;
  const line = (l: string, val: React.ReactNode, strong?: boolean, minus?: boolean) => (
    <tr><td style={cellL}>{l}</td><td style={{ ...cellR, textAlign: 'right', fontWeight: strong ? 800 : 400, color: minus ? '#b91c1c' : undefined, fontSize: strong ? 15 : 13 }}>{val}</td></tr>
  );
  return (
    <div className="print-doc" style={{ width: 794, minHeight: 1123, margin: '0 auto 30px', background: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', padding: '70px 64px', boxSizing: 'border-box', color: '#111', fontSize: 13.5, lineHeight: 1.8 }}>
      <div style={{ textAlign: 'center', fontSize: 24, fontWeight: 800, letterSpacing: 6, marginBottom: 6 }}>반납 정산서</div>
      <div style={{ textAlign: 'center', fontSize: 12, color: '#64748b', marginBottom: 22 }}>{companyLabel(co)}{m.bizNo ? ' · 사업자 ' + m.bizNo : ''}</div>
      <table style={{ ...tbl, marginBottom: 18 }}><tbody>
        <tr><td style={cellL}>임차인</td><td style={cellR}>{s(c.contractorName)}</td><td style={cellL}>차량번호</td><td style={cellR}>{s(c.plate)}</td></tr>
        <tr><td style={cellL}>계약번호</td><td style={cellR}>{s(c.contractNo)}</td><td style={cellL}>월 대여료</td><td style={cellR}>{won(c.monthlyRent)}</td></tr>
        <tr><td style={cellL}>대여기간</td><td style={cellR}>{s(c.startDate)} ~ {s(c.endDate)}</td><td style={cellL}>실제 반납일</td><td style={cellR}>{returned || <span style={{ color: '#94a3b8' }}>미반납(예상 정산)</span>}</td></tr>
      </tbody></table>
      <div style={secTitle}>정산 내역</div>
      <table style={{ ...tbl, fontSize: 13.5 }}><tbody>
        {line('미납 대여료 (일할정산 반영)', won(unpaid))}
        {line('예치 보증금', won(deposit))}
        {line('보증금 충당액', '-' + won(offset), false, true)}
        <tr><td colSpan={2} style={{ borderTop: '2px solid #0f172a', padding: 0 }} /></tr>
        {addCharge > 0
          ? line('추가 청구액 (임차인 납부)', won(addCharge), true, true)
          : line('보증금 반환액 (임차인에게 환급)', won(refund), true)}
      </tbody></table>
      {c.returnSettleNote ? <p style={{ fontSize: 12.5, color: '#0f172a', marginTop: 14, fontWeight: 600 }}>※ 정산 특이사항: {String(c.returnSettleNote)}</p> : null}
      <p style={{ fontSize: 12, color: '#475569', marginTop: c.returnSettleNote ? 6 : 14 }}>※ 본 정산서는 {TODAY} 기준이며, 미회수 과태료·차량 손상·연료 차액 등 추가 정산 항목이 확인될 경우 별도 청구될 수 있습니다.</p>
      <div style={{ textAlign: 'center', marginTop: 44 }}>{dateStr}</div>
      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <div>임차인 확인 : ____________________ (서명)</div>
        <div>{companyLabel(co)} {m.ceo ? '대표 ' + m.ceo : ''} (인)</div>
      </div>
    </div>
  );
}

function ReceiptDoc({ c, companyId, amount, label }: { c: EntityRecord; companyId: string; amount?: number; label?: string }) {
  const co = String(c.companyId || companyId);
  const m = loadMaster(co);
  const amt = amount != null && amount > 0 ? amount : (Number(c.monthlyRent) || 0);
  const kind = label || '자동차 대여료';
  const t = new Date();
  const dateStr = `${t.getFullYear()}년 ${t.getMonth() + 1}월 ${t.getDate()}일`;
  return (
    <div className="print-doc" style={{ width: 794, minHeight: 1123, margin: '0 auto 30px', background: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', padding: '76px 66px', boxSizing: 'border-box', color: '#111', fontSize: 14, lineHeight: 1.9 }}>
      <div style={{ textAlign: 'center', fontSize: 30, fontWeight: 800, letterSpacing: 18, marginBottom: 8 }}>영 수 증</div>
      <div style={{ textAlign: 'center', fontSize: 12, color: '#64748b', marginBottom: 40 }}>No. {String(c.contractNo || c.plate || '')}-{`${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}`}</div>
      <table style={{ ...tbl, marginBottom: 22, fontSize: 14 }}><tbody>
        <tr><td style={cellL}>성명(상호)</td><td style={cellR}>{s(c.contractorName)} 귀하</td></tr>
        <tr><td style={cellL}>차량번호</td><td style={cellR}>{s(c.plate)}{c.carName ? ` (${String(c.carName)})` : ''}</td></tr>
        <tr><td style={cellL}>계약번호</td><td style={cellR}>{s(c.contractNo)}</td></tr>
      </tbody></table>
      <table style={{ width: '100%', borderCollapse: 'collapse', margin: '10px 0 6px' }}><tbody>
        <tr>
          <td style={{ border: '2px solid #0f172a', padding: '16px 18px', fontSize: 20, fontWeight: 800, background: '#f8fafc', width: 150 }}>금 액</td>
          <td style={{ border: '2px solid #0f172a', padding: '16px 18px', fontSize: 21, fontWeight: 800 }}>{fmtKMoneyHangul(amt)} <span style={{ fontSize: 15, fontWeight: 600, color: '#334155' }}>(₩{amt.toLocaleString('ko-KR')})</span></td>
        </tr>
      </tbody></table>
      <p style={{ fontSize: 15, marginTop: 22 }}>위 금액을 <b>{kind}</b>(으)로 정히 영수(領收)합니다.</p>
      <div style={{ textAlign: 'center', marginTop: 60 }}>{dateStr}</div>
      <div style={{ marginTop: 30, textAlign: 'right', fontSize: 15, lineHeight: 2 }}>
        <div>{companyLabel(co)}{m.bizNo ? `  (사업자 ${m.bizNo})` : ''}</div>
        {m.address ? <div style={{ fontSize: 12.5, color: '#475569' }}>{m.address}</div> : null}
        <div style={{ marginTop: 6, fontWeight: 700 }}>{m.ceo ? `대표 ${m.ceo}` : ''} (인)</div>
      </div>
    </div>
  );
}

function PenaltyDoc({ penalties, contracts, companyId }: { penalties: EntityRecord[]; contracts: EntityRecord[]; companyId: string }) {
  const co = String(penalties[0]?.companyId || companyId);
  const m = loadMaster(co);
  const t = new Date();
  const dateStr = `${t.getFullYear()}. ${t.getMonth() + 1}. ${t.getDate()}.`;
  const issuer = String(penalties.find((p) => p.issuer)?.issuer || '과태료 부과기관');
  const rows = penalties.map((p) => { const drv = matchDriver(p, contracts); return { p, name: String(p.driverName || drv?.contractorName || '—'), phone: String(p.driverPhone || drv?.contractorPhone || '') }; });
  const total = penalties.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const N = penalties.length;
  const hCell: CSSProperties = { ...cellL, width: 'auto', textAlign: 'center', fontSize: 11.5 };
  return (
    <div className="print-doc" style={{ width: 794, minHeight: 1123, margin: '0 auto 30px', background: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', padding: '62px 58px', boxSizing: 'border-box', color: '#111', fontSize: 13, lineHeight: 1.75 }}>
      <div style={{ textAlign: 'center', fontSize: 22, fontWeight: 800, letterSpacing: 3, marginBottom: 4 }}>{companyLabel(co)}</div>
      <div style={{ textAlign: 'center', fontSize: 12, color: '#64748b', marginBottom: 24 }}>{m.bizNo ? `사업자 ${m.bizNo}` : ''}{m.address ? ` · ${m.address}` : ''}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 18, fontSize: 13.5 }}><tbody>
        <tr><td style={cellL}>수신</td><td style={cellR}>{issuer}</td></tr>
        <tr><td style={cellL}>제목</td><td style={{ ...cellR, fontWeight: 800 }}>과태료(범칙금) 변경부과 요청 ({N}건)</td></tr>
      </tbody></table>
      <p>1. 귀 기관의 무궁한 발전을 기원하며, 평소 교통 업무 처리에 노고가 많으심에 깊은 감사를 드립니다.</p>
      <p>2. 귀 기관에서 당사에 부과한 과태료 고지서를 확인한 결과, 위반 당시 해당 차량은 <b>자동차 임대차 계약에 따라 임차인이 직접 인수하여 운행 중</b>이었던 것으로 확인되었습니다.</p>
      <p>3. 이에 실제 위반 주체인 임차인에게 과태료가 부과될 수 있도록 관련 증빙 서류를 제출하오니, 확인 후 <b>재부과 조치</b>하여 주시기 바랍니다.</p>
      <div style={{ textAlign: 'center', margin: '18px 0 12px', letterSpacing: 8, fontWeight: 700 }}>- 아 래 -</div>
      <div style={{ fontSize: 12, marginBottom: 6 }}>총 <b>{N}건</b> · 합계 <b>{won(total)}</b></div>
      <table style={{ ...tbl, fontSize: 12 }}><thead>
        <tr><th style={hCell}>위반일시</th><th style={hCell}>차량번호</th><th style={hCell}>위반내용</th><th style={hCell}>금액</th><th style={hCell}>실운전자(임차인)</th><th style={hCell}>연락처</th></tr>
      </thead><tbody>
        {rows.map(({ p, name, phone }, i) => (
          <tr key={i}>
            <td style={cellR}>{s(p.violationDate)}</td>
            <td style={{ ...cellR, textAlign: 'center' }}>{s(p.plate)}</td>
            <td style={cellR}>{s(p.description)}</td>
            <td style={{ ...cellR, textAlign: 'right' }}>{p.amount ? won(p.amount) : '—'}</td>
            <td style={{ ...cellR, textAlign: 'center' }}>{name}</td>
            <td style={{ ...cellR, textAlign: 'center' }}>{phone || '—'}</td>
          </tr>
        ))}
      </tbody></table>
      <p style={{ fontSize: 12, color: '#475569', marginTop: 14 }}><b>붙임</b>&nbsp;&nbsp;1. 건별 자동차 임대차계약 사실확인서 {N}부.&nbsp;&nbsp;2. 건별 과태료 고지서 사본 {N}부.&nbsp;&nbsp;끝.</p>
      <div style={{ textAlign: 'center', marginTop: 46 }}>{dateStr}</div>
      <div style={{ textAlign: 'center', marginTop: 16, fontSize: 17, fontWeight: 700 }}>{companyLabel(co)} {m.ceo ? `대표 ${m.ceo}` : ''} (인)</div>
    </div>
  );
}

function ContractDoc({ c, companyId }: { c: EntityRecord; companyId: string }) {
  const co = String(c.companyId || companyId);
  const m = loadMaster(co);
  const row = (l1: string, v1: React.ReactNode, l2: string, v2: React.ReactNode) => (
    <tr key={l1}><td style={cellL}>{l1}</td><td style={cellR}>{v1}</td><td style={cellL}>{l2}</td><td style={cellR}>{v2}</td></tr>
  );
  return (
    <div className="print-doc" style={{ width: 794, minHeight: 1123, margin: '0 auto 30px', background: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', padding: '58px 58px', boxSizing: 'border-box', color: '#111', fontSize: 13, lineHeight: 1.7 }}>
      <div style={{ textAlign: 'center', fontSize: 24, fontWeight: 800, letterSpacing: 4, marginBottom: 6 }}>자동차 대여 계약서</div>
      <div style={{ textAlign: 'center', fontSize: 12, color: '#64748b', marginBottom: 18 }}>{companyLabel(co)}{m.bizNo ? ' · 사업자 ' + m.bizNo : ''}{m.address ? ' · ' + m.address : ''}</div>
      <div style={secTitle}>1. 임차인</div>
      <table style={tbl}><tbody>
        {row('성명', s(c.contractorName), '연락처', s(c.contractorPhone))}
        {row('면허번호', s(c.contractorLicenseNo), '면허종별', s(c.licenseType))}
        {row('주소', s(c.contractorAddress), '추가운전자', s(c.additionalDrivers))}
      </tbody></table>
      <div style={secTitle}>2. 대여 차량</div>
      <table style={tbl}><tbody>{row('차량번호', s(c.plate), '차종', s(c.carName))}</tbody></table>
      <div style={secTitle}>3. 대여 조건</div>
      <table style={tbl}><tbody>
        {row('대여기간', `${s(c.startDate)} ~ ${s(c.endDate)} (${s(c.rentalMonths)}개월)`, '반환장소', s(c.returnPlace))}
        {row('월 대여료', won(c.monthlyRent), '자동이체일', c.paymentDay ? '매월 ' + c.paymentDay + '일' : '—')}
        {row('보증금', won(c.deposit), '예약금', won(c.reservationFee))}
        {row('자차보험(CDW)', s(c.cdw), '면책금', won(c.deductible))}
        {row('지연손해금율', c.lateFeeRate ? c.lateFeeRate + '%' : '—', '중도해지 위약금율', c.earlyTerminationRate ? c.earlyTerminationRate + '%' : '—')}
        {row('기사포함', s(c.withDriver), '인수 연료', s(c.fuelOut))}
      </tbody></table>
      <div style={secTitle}>4. 주요 약정 (자동차대여 표준약관)</div>
      <ol style={{ paddingLeft: 18, margin: '4px 0 0', fontSize: 12, lineHeight: 1.85 }}>
        <li>임차인은 대여 차량을 유상운송에 사용하거나 제3자에게 재대여(전대)할 수 없습니다. (여객자동차 운수사업법 제34조)</li>
        <li>임차인은 유효한 운전면허를 소지하여야 하며, 무면허·음주 등 운전 결격사유가 있는 자에게 운전하게 할 수 없습니다.</li>
        <li>사고 발생 시 임차인은 즉시 회사에 통지하고 보험처리에 협조하여야 하며, 미통지로 인한 손해 확대분은 임차인이 부담합니다.</li>
        <li>임차인 귀책 사고 시 자기부담금(면책금)을 부담하며, 자차보험 미가입 시 차량 손해를 실손 배상합니다.</li>
        <li>대여료 연체 시 지연손해금이 부과되며, 회사는 보증금에서 미납금·손해금을 충당할 수 있습니다.</li>
        <li>중도 해지 시 잔여기간 대여요금에 대하여 약정 위약금을 부담합니다.</li>
      </ol>
      <div style={{ marginTop: 40, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <div>임차인 : ____________________ (서명)</div>
        <div>{companyLabel(co)} {m.ceo ? '대표 ' + m.ceo : ''} (인)</div>
      </div>
    </div>
  );
}
