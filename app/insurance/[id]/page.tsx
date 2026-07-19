'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import { getStore } from '@/lib/store';
import { normPlate } from '@/lib/plate';
import { type EntityRecord } from '@/lib/intake/entities';
import { buildInsurancePolicyFromOcr, daysToExpiry, installmentSum, installmentMatchesTotal } from '@/lib/payments/insurance-calc';
import type { InsurancePolicy } from '@/lib/payments/types';
import { Page, DetailShell, Panel, Sec, Cards, Metric, Section, DetailGrid, EmptyState, PageLoading, th, thR, td, tdR, won, C } from '@/components/ui';

export default function Insurance360() {
  const params = useParams();
  const id = decodeURIComponent(String(params.id));
  const { companyId } = useSession();
  const router = useRouter();
  const [rec, setRec] = useState<EntityRecord | null>(null);
  const [vehKey, setVehKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const store = getStore();
    Promise.all([store.get('insurance', companyId, id), store.list('vehicle', companyId)]).then(([ins, vs]) => {
      setRec(ins);
      if (ins) { const v = vs.find((x) => normPlate(x.plate) === normPlate(ins.plate)); setVehKey(v ? String(v.plate) : null); }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id, companyId]);

  if (loading) return <Page title="보험 상세"><PageLoading /></Page>;
  if (!rec) return <Page title="보험 없음"><EmptyState><a href="/list/insurance" style={{ color: C.accent }}>보험 목록으로</a></EmptyState></Page>;

  // 보존된 OCR 원본으로 분납 정책 복원 (insurance-calc 엔진)
  const ocr = (rec._ocrOriginal as { raw?: Record<string, unknown> } | undefined)?.raw;
  const policy: InsurancePolicy = ocr ? buildInsurancePolicyFromOcr(ocr) : ({
    policyNo: String(rec.policyNo || ''), startDate: String(rec.startDate || ''), endDate: String(rec.endDate || ''),
    totalPremium: Number(rec.totalPremium) || undefined, paidPremium: Number(rec.paidPremium) || undefined,
  } as InsurancePolicy);
  const d = daysToExpiry(policy);
  const insts = policy.installments || [];
  const sumOk = insts.length ? installmentMatchesTotal(policy) : null;

  return (
    <DetailShell onBack={() => router.back()} title={`${rec.insurer || '보험'}${rec.policyNo ? ` · ${rec.policyNo}` : ''}`}
      actions={<a href={`/list/insurance/${encodeURIComponent(id)}`} style={{ fontSize: 13, color: C.accent, textDecoration: 'none', fontWeight: 700 }}>수정</a>}>
      <Sec title="현황" desc="만기·총보험료·분납·계약 차량 요약">
        <Cards min={128} fit>
          <Metric label="만기" value={d == null ? '—' : d < 0 ? `만료 ${-d}일` : `D-${d}`} tone={d != null && d < 30 ? 'danger' : 'ink'} />
          <Metric label="총보험료" value={won(policy.totalPremium)} tone="ink" />
          <Metric label="분납" value={insts.length ? `${insts.length}회` : '일시납'} tone="ink" />
          <Metric label="계약 차량" value={vehKey ? <a href={`/vehicle/${encodeURIComponent(vehKey)}`} style={{ color: C.accent }}>{String(rec.plate)}</a> : String(rec.plate ?? '미등록')} tone="warn" />
        </Cards>
      </Sec>

      <Panel title="보험 정보">
        <DetailGrid rows={[['보험사', String(rec.insurer ?? '')], ['상품명', String(rec.productName ?? '')], ['차량', vehKey ? <a href={`/vehicle/${encodeURIComponent(vehKey)}`} style={{ color: C.accent }}>{String(rec.plate)}</a> : String(rec.plate ?? '미등록')],
          ['계약자', String(rec.contractor ?? '')], ['기간', `${rec.startDate || ''} ~ ${rec.endDate || ''}`], ['운전범위', String(rec.driverScope ?? '')], ['운전연령', String(rec.driverAge ?? '')]]} />
      </Panel>

      {insts.length > 0 && (
        <Panel title={`분납 회차 (insurance-calc 산출${sumOk === false ? ' · ⚠ 합계 불일치' : sumOk ? ' · 합계 일치' : ''})`}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr><th style={th}>회차</th><th style={th}>납기일</th><th style={thR}>금액</th><th style={th}>상태</th></tr></thead>
            <tbody>
              {insts.map((it) => (
                <tr key={it.cycle} style={{ borderTop: `1px solid ${C.line2}` }}>
                  <td style={td}>{it.cycle}회</td>
                  <td style={td}>{it.dueDate || '—'}</td>
                  <td style={tdR}>{won(it.amount)}</td>
                  <td style={td}>{it.paid ? <span style={{ color: C.ok, fontWeight: 700 }}>납입</span> : <span style={{ color: C.faint }}>예정</span>}</td>
                </tr>
              ))}
              <tr style={{ borderTop: `2px solid ${C.line}` }}>
                <td style={td} colSpan={2}><b>합계</b></td>
                <td style={tdR}><b>{won(installmentSum(policy))}</b></td>
                <td style={td}>{sumOk === false ? <span style={{ color: C.danger }}>총보험료와 불일치</span> : ''}</td>
              </tr>
            </tbody>
          </table>
        </Panel>
      )}
    </DetailShell>
  );
}
