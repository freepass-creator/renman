'use client';
import { Sec, Cards, ObjCard, Btn, KV, EmptyState, Message, Disclosure, th, thR, td, tdR, won, C, type KVRow } from '@/components/ui';
import { InfoDoc } from '@/components/InfoDoc';
import { docHistory } from '@/lib/docs';
import { isProductReady } from '@/lib/freepass/product-sync';
import { dday } from '@/lib/dashboard-consts';
import type { PanelProps } from './shared';

export function InfoPanel({ vd }: PanelProps) {
  const { v, editInfo, form, chg, startEdit } = vd;
  return (
    <Sec id="v-info" title={editInfo ? '차량 정보 · 편집 중' : '차량 정보'} tone={editInfo ? 'ok' : undefined} desc="제조사 제공 — 5단계·선택옵션·색상" right={
      editInfo
        ? <span style={{ fontSize: 11.5, color: C.faint }}>함께 편집 중</span>
        : <Btn variant="ghost" onClick={startEdit}>{v ? '수정' : '+ 등록'}</Btn>
    }>
      {(v || editInfo)
        ? <KV editing={editInfo} form={form} onChange={chg} rows={[
            ['제조사', 'maker', String(v?.maker ?? '')],
            ['모델', 'modelLine', String(v?.modelLine ?? '')],
            ['세부모델', 'subModel', String(v?.subModel ?? '')],
            ['파워트레인', 'variant', String(v?.variant ?? '')],
            ['세부트림', 'trim', String(v?.trim ?? '')],
            ['선택옵션', 'optionList', String(v?.optionList ?? '')],
            ['외부색상', 'exteriorColor', String(v?.exteriorColor ?? '')],
            ['내부색상', 'interiorColor', String(v?.interiorColor ?? '')],
            ['구동방식', 'driveType', String(v?.driveType ?? '')],
            ['변속기', 'transmission', String(v?.transmission ?? '')],
          ] as KVRow[]} />
        : <EmptyState variant="sec">차량 미등록</EmptyState>}
    </Sec>
  );
}

export function RegPanel({ plate, vd }: PanelProps) {
  const { v, editInfo, form, chg, cancelEdit, startEdit, saveInfo, master, target, onReplaceReg } = vd;
  return (
    <InfoDoc id="v-reg" title="등록증" desc="자동차등록증상 정보 그대로 · 원본과 한 몸"
      editing={editInfo} hideSaveCancel form={form} onChange={chg}
      onEditToggle={() => (editInfo ? cancelEdit() : startEdit())} onSave={saveInfo}
      docType="vehicle" docLabel="자동차등록증" docs={docHistory(v, 'vehicle')}
      companyId={target} recordKey={plate} onReplaceDoc={onReplaceReg}
      fields={[
        ['차량번호', null, plate],
        ['차대번호(VIN)', 'vin', String(v?.vin ?? '')],
        ['차명', 'carName', String(v?.carName ?? '')],
        ['차종', 'vehicleType', String(v?.vehicleType ?? '')],
        ['용도', 'usage', String(v?.usage ?? '')],
        ['연식', 'modelYear', String(v?.modelYear ?? '')],
        ['제작연월', 'yearMonth', String(v?.yearMonth ?? '')],
        ['최초등록일', 'firstReg', String(v?.firstReg ?? '')],
        ['배기량(cc)', 'displacement', String(v?.displacement ?? '')],
        ['연료', 'fuel', String(v?.fuel ?? '')],
        ['승차정원', 'seats', String(v?.seats ?? '')],
        ['주행거리(km)', 'mileage', String(v?.mileage ?? '')],
        ['검사만기', 'inspectionTo', String(v?.inspectionTo ?? '')],
        ['소유자', 'ownerName', String(v?.ownerName ?? '')],
        ['법인번호', null, String(master.bizNo ?? '')],
      ] as KVRow[]} />
  );
}

export function InsurancePanel({ vd }: PanelProps) {
  const {
    curIns, olderIns, editIns, setEditIns, insForm, insChg, startEditIns, saveIns,
    target, onReplaceIns,
  } = vd;
  return (
    <>
      <InfoDoc id="v-insurance" title="보험" desc={curIns ? `${String(curIns.insurer || '')} ${String(curIns.policyNo || '')}`.trim() || '자동차보험 증권' : '자동차보험 증권'}
        editing={editIns} form={insForm} onChange={insChg}
        onEditToggle={() => (editIns ? setEditIns(false) : startEditIns())} onSave={saveIns}
        docType="insurance" docLabel="자동차보험증권" docs={docHistory(curIns, 'insurance')}
        companyId={target} recordKey={String(curIns?._key || curIns?.policyNo || '')} onReplaceDoc={onReplaceIns}
        fields={[
          ['보험사', 'insurer', String(curIns?.insurer ?? '')],
          ['상품명', 'productName', String(curIns?.productName ?? '')],
          ['증권번호', 'policyNo', String(curIns?.policyNo ?? '')],
          ['계약자', 'contractor', String(curIns?.contractor ?? '')],
          ['피보험자', 'insured', String(curIns?.insured ?? '')],
          ['시작일', 'startDate', String(curIns?.startDate ?? '')],
          ['만기일', 'endDate', String(curIns?.endDate ?? '')],
          ['운전범위', 'driverScope', String(curIns?.driverScope ?? '')],
          ['운전연령', 'driverAge', String(curIns?.driverAge ?? '')],
          ['물적할증(만원)', 'deductibleMan', String(curIns?.deductibleMan ?? '')],
          ['총보험료(원)', 'totalPremium', String(curIns?.totalPremium ?? '')],
          ['납입보험료(원)', 'paidPremium', String(curIns?.paidPremium ?? '')],
          ['자동이체 은행', 'autoDebitBank', String(curIns?.autoDebitBank ?? '')],
        ] as KVRow[]} />
      {curIns ? (() => {
        const covs: [string, string][] = ([
          ['대인Ⅰ', curIns.cov_personal_1], ['대인Ⅱ', curIns.cov_personal_2], ['대물', curIns.cov_property],
          ['자손/자상', curIns.cov_self_accident], ['무보험', curIns.cov_uninsured], ['자차', curIns.cov_self_vehicle], ['긴급출동', curIns.cov_emergency],
        ] as [string, unknown][]).map(([l, val]) => [l, String(val ?? '')] as [string, string]).filter(([, val]) => val);
        return covs.length ? <div style={{ marginTop: 10, padding: '4px 0' }}>
          <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 7, fontWeight: 700 }}>가입담보 · 보상한도</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '5px 14px' }}>
            {covs.map(([l, val]) => <div key={l} style={{ display: 'flex', gap: 6, fontSize: 12, minWidth: 0 }}><span style={{ color: C.mute, flex: '0 0 70px' }}>{l}</span><span style={{ color: C.ink, flex: 1, minWidth: 0 }}>{val}</span></div>)}
          </div>
        </div> : null;
      })() : null}
      {olderIns.length > 0 ? <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 6 }}>이전 증권 ({olderIns.length})</div>
        <Cards min={340}>{olderIns.map((ins, i) => {
          const id = dday(ins.endDate);
          return <ObjCard key={i} badge="이전" badgeTone="gray" name={String(ins.insurer || '보험')} carType={ins.policyNo ? String(ins.policyNo) : undefined} right={id == null ? undefined : <span style={{ color: C.faint }}>{id < 0 ? `만료 ${-id}일` : `D-${id}`}</span>} fields={[['기간', `${ins.startDate || ''}~${ins.endDate || ''}`], ['보험료', ins.totalPremium ? won(ins.totalPremium) : '—']]} />;
        })}</Cards>
      </div> : null}
    </>
  );
}

export function PurchasePanel({ vd }: PanelProps) {
  const { v, editInfo, form, chg, startEdit, tax, loan, loanSum, loanOpen, setLoanOpen } = vd;
  if (!(v || editInfo)) return null;
  return (
    <Sec id="v-purchase" title="취득 · 구입" desc="소비자가·개소세 · 취득·매입 · 할부" tone={editInfo ? 'ok' : undefined} right={
      editInfo
        ? <span style={{ fontSize: 11.5, color: C.faint }}>함께 편집 중</span>
        : <Btn variant="ghost" onClick={startEdit}>수정</Btn>
    }>
      <KV editing={editInfo} form={form} onChange={chg} rows={[
        ['소비자가격', 'consumerPrice', v?.consumerPrice ? won(v.consumerPrice) : ''],
        ['옵션가', 'optionPrice', v?.optionPrice ? won(v.optionPrice) : ''],
        ['옵션할인', 'optionDiscount', v?.optionDiscount ? won(v.optionDiscount) : ''],
        ['과세/면세', 'taxExempt', String(v?.taxExempt ?? '')],
        ...(tax ? ([
          ['· 공급가액', null, won(tax.supplyPrice)],
          ['· 개소세', null, won(tax.exciseTax)],
          ['· 교육세', null, won(tax.eduTax)],
          ['· 부가세', null, won(tax.vat)],
          ['· 취득가액', null, won(tax.acquisitionBase)],
          ['· 취득세', null, won(tax.acquisitionTax)],
          ['· 취득원가', null, won(tax.totalAcquisitionCost)],
        ] as KVRow[]) : []),
        ['취득일', 'acquisitionDate', String(v?.acquisitionDate ?? '')],
        ['취득가·매입가', 'acquisitionPrice', v?.acquisitionPrice ? won(v.acquisitionPrice) : ''],
        ['매입완료일', 'purchasedDate', String(v?.purchasedDate ?? '')],
        ['매입처', 'supplier', String(v?.supplier ?? '')],
        ['할부사·리스사', 'loanCompany', String(v?.loanCompany ?? '')],
        ['할부원금', 'loanPrincipal', v?.loanPrincipal ? won(v.loanPrincipal) : ''],
        ['연이율(%)', 'loanRate', String(v?.loanRate ?? '')],
        ['할부개월', 'loanMonths', String(v?.loanMonths ?? '')],
        ['잔여원금', 'loanRemainingPrincipal', v?.loanRemainingPrincipal ? won(v.loanRemainingPrincipal) : ''],
      ] as KVRow[]} />
      {loan.length > 0 ? (
        <div id="v-loan" style={{ marginTop: 4 }}>
          <Disclosure
            open={loanOpen}
            onOpenChange={setLoanOpen}
            title={`할부 상환 스케줄 · ${String(v?.loanCompany || '')} · 월 ${won(loanSum?.monthlyPayment || 0)} · 잔여 ${won(loanSum?.remainPrincipal || 0)} · ${loanSum?.remainSeq || 0}회`}
          >
            <div style={{ maxHeight: 400, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                <thead><tr><th style={th}>회차</th><th style={th}>상환일</th><th style={thR}>원금</th><th style={thR}>이자</th><th style={thR}>상환액</th><th style={thR}>잔액</th></tr></thead>
                <tbody>{loan.map((l) => <tr key={l.seq} style={{ background: loanSum && l.seq <= loanSum.paidSeq ? 'var(--bg-stripe)' : undefined }}>
                  <td style={td}>{l.seq}</td><td style={td}>{l.date}</td><td style={tdR}>{won(l.principal)}</td><td style={tdR}>{won(l.interest)}</td><td style={tdR}>{won(l.payment)}</td><td style={tdR}>{won(l.balance)}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </Disclosure>
        </div>
      ) : null}
    </Sec>
  );
}

export function ProductPanel({ vd }: PanelProps) {
  const { v, editInfo, form, chg, startEdit, prodBusy, registerProduct } = vd;
  if (!(v || editInfo)) return null;
  return (
    <Sec id="v-product" title="상품 정보" desc="대여료·보증금·보험 — 프리패스 매물 등록" tone={editInfo ? 'ok' : undefined} right={
      editInfo ? <span style={{ fontSize: 11.5, color: C.faint }}>함께 편집 중</span> : <Btn variant="ghost" onClick={startEdit}>수정</Btn>
    }>
      <KV editing={editInfo} form={form} onChange={chg} rows={[
        ['대여료(월)', 'listRent', v?.listRent ? won(v.listRent) : ''],
        ['보증금', 'listDeposit', v?.listDeposit ? won(v.listDeposit) : ''],
        ['기준 기간(개월)', 'listTerm', String(v?.listTerm ?? '')],
        ['보험료', 'insuranceIncluded', String(v?.insuranceIncluded ?? '')],
      ] as KVRow[]} />
      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Btn onClick={registerProduct} disabled={prodBusy || !v}>{prodBusy ? '등록 중…' : '프리패스 상품 등록'}</Btn>
        <span style={{ fontSize: 11.5, color: C.faint }}>{isProductReady(v) ? '상태 상품대기 — 저장 시 자동 등록' : '상태를 «상품대기»로 두면 자동 등록'}</span>
      </div>
    </Sec>
  );
}

export function EconPanel({ vd }: PanelProps) {
  const { econ } = vd;
  if (!econ) return null;
  return (
    <Sec id="v-econ" title="자산 손익" desc="이 차가 벌어온 돈 · 회수율">
      <KV rows={[
        ['수입(수금)', '', won(econ.revenue)],
        ['감가', '', won(econ.depreciation)],
        ['보험료', '', won(econ.insuranceCost)],
        ['정비·수리', '', won(econ.maintCost)],
        ['할부이자', '', won(econ.loanInterest)],
        ['손익', '', won(econ.profit)],
        ...(econ.acquisition ? ([['회수율', '', `${Math.round(econ.recoveryRate * 100)}%`]] as KVRow[]) : []),
        ...(econ.bookValue != null ? ([['장부가', '', won(econ.bookValue)]] as KVRow[]) : []),
      ] as KVRow[]} />
    </Sec>
  );
}

export function CarMissingBanner({ vd }: Pick<PanelProps, 'vd'>) {
  if (vd.v) return null;
  return <Message variant="warning">등록증이 아직 안 들어왔습니다. 계약·보험·과태료만 표시. <b>정보 담기</b>로 등록하세요.</Message>;
}
