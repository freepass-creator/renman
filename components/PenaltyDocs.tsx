'use client';
import { useState, type CSSProperties } from 'react';
import { getStore } from '@/lib/store';
import { type EntityRecord } from '@/lib/intake/entities';
import { matchPenalty } from '@/lib/penalty-match';
import { loadMaster } from '@/lib/company-master';
import { companyLabel } from '@/lib/companies';
import { PageLoading, Btn, EmptyState, C } from '@/components/ui';
import { TODAY } from '@/lib/dashboard-consts';
import { useEntityList } from '@/lib/use-entity-lists';

// 과태료 변경부과 문서 — 관할기관 수신 [요청 공문] + 위반 건별 [임대차 계약 사실확인서]. window.print(A4).
// 명의자(회사)로 온 과태료를 위반 당시 실운전자(임차인)에게 변경부과 요청. 발행 후 reassignStatus='변경부과신청' 전환.
const won = (n: unknown) => '₩' + (Number(n) || 0).toLocaleString('ko-KR');
const s = (v: unknown) => (v == null || v === '' ? '—' : String(v));
/* ── A4 문서면(종이) — 토큰 금지, 하드코딩이 정답. 의도된 예외. ──
 * 이건 화면 UI가 아니라 **관할기관에 보내는 공문서**다. 테마를 따라가면 안 된다:
 *   · 다크테마에서 C.card/C.ink를 쓰면 종이가 검게 되고 글자가 흰색이 된다
 *   · 그 상태로 인쇄하면 브라우저가 배경색을 빼므로 **흰 종이에 흰 글자** = 판독 불가
 * 종이는 항상 흰색, 잉크는 항상 검정. 화면 크롬(배경·툴바)만 토큰을 쓴다. */
const PAPER = '#fff', INK = '#111', INK_SUB = '#666', RULE = '#cbd5e1', RULE_H = '#94a3b8', FILL = '#f8fafc', FILL_H = '#eef2f7';
const cellL: CSSProperties = { border: `1px solid ${RULE}`, padding: '7px 11px', background: FILL, fontWeight: 700, width: 96, whiteSpace: 'nowrap', fontSize: 12.5 };
const cellR: CSSProperties = { border: `1px solid ${RULE}`, padding: '7px 11px', fontSize: 12.5 };
const th: CSSProperties = { border: `1px solid ${RULE_H}`, padding: '6px 8px', background: FILL_H, fontWeight: 700, fontSize: 11.5, whiteSpace: 'nowrap' };
const tdc: CSSProperties = { border: `1px solid ${RULE}`, padding: '6px 8px', fontSize: 11.5 };
const sheet: CSSProperties = { width: 794, minHeight: 1123, margin: '0 auto 30px', background: PAPER, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', padding: '64px 60px', boxSizing: 'border-box', color: INK };

type P = { p: EntityRecord; c: EntityRecord };

export function PenaltyDocs({ penalties, companyId, onClose, onSubmitted }: { penalties: EntityRecord[]; companyId: string; onClose: () => void; onSubmitted: () => void }) {
  const { rows: contracts, loading } = useEntityList('contract');
  const ready = !loading;
  const [busy, setBusy] = useState(false);

  // 매칭된 것만 문서 대상(임차인 확인 가능) — renter 공란이면 실운전자 확인 불가라 제외(공란 명의 공문 방지).
  const items: P[] = penalties.map((p) => { const m = matchPenalty(p, contracts); return m && m.renter ? { p, c: m.contract } : null; }).filter(Boolean) as P[];
  // (회사, 발급기관)별 그룹 — 공문은 수신처(발급기관)마다 1장
  const groups = new Map<string, P[]>();
  for (const it of items) { const key = `${String(it.p.companyId || companyId)}||${String(it.p.issuer || '발급기관')}`; (groups.get(key) || groups.set(key, []).get(key)!).push(it); }

  const t = new Date();
  const dateStr = `${t.getFullYear()}년 ${t.getMonth() + 1}월 ${t.getDate()}일`;

  async function submit() {
    setBusy(true);
    try {
      const store = getStore();
      for (const it of items) {
        const co = String(it.p.companyId || companyId);
        if (it.p._key) await store.update('penalty', co, String(it.p._key), { reassignStatus: '변경부과신청', reassignDate: TODAY, driverName: String(it.c.contractorName || ''), billedToRenter: '청구' } as EntityRecord);
      }
      onSubmitted(); onClose();
    } finally { setBusy(false); }
  }

  return (
    <>
      <style>{`@media print { body { visibility: hidden !important; } .print-doc, .print-doc * { visibility: visible !important; } .print-doc { position: static !important; box-shadow: none !important; margin: 0 auto !important; } .no-print { display: none !important; } } @page { size: A4; margin: 12mm; }`}</style>
      <div className="no-print" style={{ maxWidth: 794, margin: '0 auto 12px', display: 'flex', gap: 8, padding: '0 10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <Btn variant="ghost" onClick={onClose}>← 과태료</Btn>
        <span style={{ fontSize: 12.5, color: C.mute }}>매칭 {items.length}건 · 공문 {groups.size}장 + 사실확인서 {items.length}부</span>
        <span style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={submit} disabled={busy || !items.length}>{busy ? '처리 중…' : '변경부과 신청 처리'}</Btn>
        <Btn onClick={() => window.print()}>인쇄 / PDF 저장</Btn>
      </div>

      {!ready ? <PageLoading />
        : !items.length ? <EmptyState>매칭된 과태료가 없습니다 — 임차인이 확인된 건만 변경부과 문서를 만들 수 있습니다.</EmptyState>
          : <>
            {Array.from(groups.entries()).map(([key, gr]) => {
              const co = key.split('||')[0]; const issuer = key.split('||')[1]; const m = loadMaster(co);
              const docNo = `PCR-${TODAY.replace(/-/g, '')}-${(co + (issuer || '').replace(/[^가-힣0-9A-Za-z]/g, '').slice(0, 2)).toUpperCase()}`;
              return (
                <div className="print-doc" style={sheet} key={key}>
                  <div style={{ textAlign: 'right', fontSize: 11, color: INK_SUB, marginBottom: 6, fontFamily: 'monospace' }}>문서번호 {docNo}</div>
                  <div style={{ textAlign: 'center', fontSize: 22, fontWeight: 800, letterSpacing: 3, marginBottom: 4 }}>과태료 변경부과 요청</div>
                  <div style={{ textAlign: 'center', fontSize: 12, color: INK_SUB, marginBottom: 26 }}>자동차대여사업자 명의 과태료의 실운전자(임차인) 변경부과 요청</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 18 }}><tbody>
                    <tr><td style={cellL}>수신</td><td style={cellR}>{issuer} 귀중</td></tr>
                    <tr><td style={cellL}>발신</td><td style={cellR}>{companyLabel(co)}{m.ceo ? ` (대표 ${m.ceo})` : ''}{m.address ? ` · ${m.address}` : ''}</td></tr>
                    <tr><td style={cellL}>제목</td><td style={cellR}>과태료 변경부과 요청 ({gr.length}건)</td></tr>
                  </tbody></table>
                  <div style={{ fontSize: 13.5, lineHeight: 1.9 }}>
                    <p>1. 귀 기관의 노고에 감사드립니다.</p>
                    <p>2. 아래 차량은 당사가 「여객자동차 운수사업법」에 따른 자동차대여사업자로서 소유·등록한 차량으로, 위반 당시 실제 운행자는 아래 임차인입니다.</p>
                    <p>3. 「질서위반행위규제법」 및 관계 법령에 따라 위반 당시 실제 운행자(임차인)에게 <b>변경부과</b>하여 주시기 바랍니다. (붙임: 자동차 임대차 계약 사실확인서 각 1부)</p>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', margin: '14px 0 8px' }}><tbody>
                    <tr>{['No', '차량번호', '임차인', '계약기간', '위반일시', '위반내용', '금액'].map((h) => <td key={h} style={th}>{h}</td>)}</tr>
                    {gr.map((it, i) => (
                      <tr key={i}>
                        <td style={{ ...tdc, textAlign: 'center' }}>{i + 1}</td>
                        <td style={{ ...tdc, fontWeight: 700 }}>{s(it.p.plate)}</td>
                        <td style={tdc}>{s(it.c.contractorName)}</td>
                        <td style={{ ...tdc, whiteSpace: 'nowrap' }}>{s(it.c.startDate)}~{s(it.c.endDate)}</td>
                        <td style={{ ...tdc, whiteSpace: 'nowrap' }}>{s(it.p.violationDate)}</td>
                        <td style={tdc}>{s(it.p.description || it.p.docType)}</td>
                        <td style={{ ...tdc, textAlign: 'right' }}>{won(it.p.amount)}</td>
                      </tr>
                    ))}
                  </tbody></table>
                  <p style={{ fontSize: 12, color: INK_SUB, marginTop: 10 }}>붙임 : 자동차 임대차 계약 사실확인서 {gr.length}부. 끝.</p>
                  <div style={{ textAlign: 'center', marginTop: 40 }}>{dateStr}</div>
                  <div style={{ textAlign: 'center', marginTop: 14, fontSize: 16, fontWeight: 700 }}>{companyLabel(co)} {m.ceo ? `대표 ${m.ceo}` : ''} (인)</div>
                </div>
              );
            })}

            {items.map((it, i) => {
              const co = String(it.p.companyId || companyId); const m = loadMaster(co);
              return (
                <div className="print-doc" style={sheet} key={'c' + i}>
                  <div style={{ textAlign: 'center', fontSize: 22, fontWeight: 800, letterSpacing: 3, marginBottom: 4 }}>자동차 임대차 계약 사실 확인서</div>
                  <div style={{ textAlign: 'center', fontSize: 12, color: INK_SUB, marginBottom: 24 }}>위반 당시 실제 운행자(임차인) 확인</div>
                  <div style={{ fontWeight: 700, fontSize: 13.5, margin: '14px 0 6px' }}>1. 임차인</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
                    <tr><td style={cellL}>성명</td><td style={cellR}>{s(it.c.contractorName)}</td><td style={cellL}>연락처</td><td style={cellR}>{s(it.c.contractorPhone)}</td></tr>
                    <tr><td style={cellL}>면허번호</td><td style={cellR}>{s(it.c.contractorLicenseNo)}</td><td style={cellL}>주소</td><td style={cellR}>{s(it.c.contractorAddress)}</td></tr>
                  </tbody></table>
                  <div style={{ fontWeight: 700, fontSize: 13.5, margin: '16px 0 6px' }}>2. 대여 차량 · 계약</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
                    <tr><td style={cellL}>차량번호</td><td style={cellR}>{s(it.p.plate)}</td><td style={cellL}>차명</td><td style={cellR}>{s(it.c.carName)}</td></tr>
                    <tr><td style={cellL}>계약기간</td><td style={cellR} colSpan={3}>{s(it.c.startDate)} ~ {s(it.c.endDate)}</td></tr>
                  </tbody></table>
                  <div style={{ fontWeight: 700, fontSize: 13.5, margin: '16px 0 6px' }}>3. 위반 내역</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
                    <tr><td style={cellL}>고지서번호</td><td style={cellR}>{s(it.p.noticeNo)}</td><td style={cellL}>위반일시</td><td style={cellR}>{s(it.p.violationDate)}</td></tr>
                    <tr><td style={cellL}>위반내용</td><td style={cellR}>{s(it.p.description || it.p.docType)}</td><td style={cellL}>금액</td><td style={cellR}>{won(it.p.amount)}</td></tr>
                  </tbody></table>
                  <p style={{ fontSize: 13, lineHeight: 1.9, marginTop: 20 }}>위 위반행위 발생 당시 해당 차량은 위 임차인이 임차하여 실제 운행 중이었음을 확인하며, 이에 관련 과태료(범칙금)의 변경부과를 요청합니다.</p>
                  <div style={{ textAlign: 'center', marginTop: 30 }}>{dateStr}</div>
                  <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <div>임차인 : ____________________ (서명)</div>
                    <div>{companyLabel(co)} {m.ceo ? `대표 ${m.ceo}` : ''} (인)</div>
                  </div>
                </div>
              );
            })}
          </>}
    </>
  );
}
