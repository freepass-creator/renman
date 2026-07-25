'use client';
/**
 * 자산 상세 — /dev/car-desk 시안 IA.
 * 탭 = 자산 | 계약 | 수납 · 데이터·저장 = useVehicleDetail.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Badge, Btn, PageLoading, EmptyState, Input, Select, PillTabs, won, C,
} from '@/components/ui';
import { companyLabel } from '@/lib/companies';
import { useIsMobile } from '@/lib/use-mobile';
import { effectiveEndDate, patchExtend, earlyTerminationFee } from '@/lib/contract-ops';
import { openIngest, openPrintDoc } from '@/lib/ui-bus';
import { TODAY, dday } from '@/lib/dashboard-consts';
import { FUEL_LEVELS } from '@/lib/domain/fuel';
import { isCashPurchase } from '@/lib/domain/vehicle-finance';
import { penaltyStatus, matchDriver } from '@/lib/penalty-reassign';
import { workSummary } from '@/lib/work-ops';
import { QuickLogForm } from '@/components/QuickLogForm';
import { WorkForm } from '@/components/WorkForm';
import { useVehicleDetail, yy, remainText } from './useVehicleDetail';
import {
  DeskPanel, ScrollBody, Glance, SchTable, HistTable, RepairTable,
  deskDocSlots, deskDocsFromList, DeskPane, SchFoot, DESK,
  deskGrid, deskSlot, type GlanceRow,
} from './desk';
import { commitUpdate } from '@/lib/commit';
import { classifyContract } from '@/lib/domain/model';
import type { EntityRecord } from '@/lib/intake/entities';

type Tab = '자산' | '계약' | '수납';
type VehScope = 'reg' | 'spec' | 'purchase' | 'ops' | 'gps';

const lab: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 };
const ll: CSSProperties = { fontSize: 11, color: C.mute, fontWeight: 600 };

function toneBadge(t: 'ok' | 'warn' | 'danger' | 'mute'): 'green' | 'amber' | 'red' | 'gray' {
  return t === 'ok' ? 'green' : t === 'warn' ? 'amber' : t === 'danger' ? 'red' : 'gray';
}

function dash(v: unknown): string {
  return String(v ?? '').trim();
}

function fmtNum(v: unknown, suffix = ''): string {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `${n.toLocaleString('ko-KR')}${suffix}`;
}

function inspPeriod(from: unknown, to: unknown): string {
  if (!from && !to) return '';
  if (from && to) return `${yy(from)} ~ ${yy(to)}`;
  if (to) return `~ ${yy(to)}`;
  return yy(from);
}

function focusTab(focus?: string): Tab {
  if (focus === 'unpaid') return '수납';
  if (focus === 'return' || focus === 'deploy') return '계약';
  return '자산';
}

export function VehiclePage({ plate, focus }: { plate: string; focus?: string }) {
  const mobile = useIsMobile();
  const vd = useVehicleDetail(plate, focus);
  const [tab, setTab] = useState<Tab>(() => focusTab(focus));
  const [vehScope, setVehScope] = useState<VehScope | null>(null);
  const [ctEdit, setCtEdit] = useState(false);
  const [ctForm, setCtForm] = useState<EntityRecord>({});
  const [ignOpen, setIgnOpen] = useState(false);

  useEffect(() => {
    if (!focus) return;
    setTab(focusTab(focus));
    if (focus === 'unpaid') vd.setRecMode('pay');
  }, [focus]); // eslint-ok: 진입 1회

  if (vd.loading) return <PageLoading />;

  const {
    v, active, status, statusTone, d, locStr, idleDays,
    curIns, olderIns, schedule, pendDeposit, loanSum, penalties, workList, history, contracts,
    engineLocked, reco, econ, cv, companyId,
    txMode, setTxMode, txForm, setTxForm, commitTx,
    dlvOpen, setDlvOpen, dlvForm, setDlvForm, commitDeliver, waiting,
    recMode, setRecMode, recForm, setRecForm, saveRecord,
    editInfo, form, chg, startEdit, cancelEdit, saveInfo,
    editIns, insForm, insChg, startEditIns, setEditIns, saveIns,
    logOpen, setLogOpen, workOpen, setWorkOpen, target, delVehicle, settleDeposit, logIgnition,
  } = vd;

  const openVeh = (s: VehScope) => { startEdit(); setVehScope(s); };
  const saveVeh = async () => { await saveInfo(); setVehScope(null); };
  const cancelVeh = () => { cancelEdit(); setVehScope(null); };
  const vehEdit = (s: VehScope) => (vehScope === s && editInfo ? { form, onChange: chg } : undefined);
  const vehRight = (s: VehScope) => (vehScope === s
    ? <SaveCancel onSave={saveVeh} onCancel={cancelVeh} />
    : <Btn size="sm" variant="ghost" onClick={() => openVeh(s)}>수정</Btn>);

  const ctChg = (k: string, val: string) => setCtForm((f) => ({ ...f, [k]: val }));
  const startCt = () => { if (!active) return; setCtForm({ ...active }); setCtEdit(true); };
  const cancelCt = () => setCtEdit(false);
  const saveCt = async () => {
    if (!active?._key) return;
    try {
      await commitUpdate({
        entity: 'contract', sessionCompanyId: companyId, rec: active, key: String(active._key),
        patch: {
          contractNo: ctForm.contractNo,
          contractDate: ctForm.contractDate,
          contractorName: ctForm.contractorName,
          contractorPhone: ctForm.contractorPhone,
          contractorBirth: ctForm.contractorBirth,
          startDate: ctForm.startDate,
          endDate: ctForm.endDate,
          rentalMonths: ctForm.rentalMonths,
          monthlyRent: ctForm.monthlyRent,
          deposit: ctForm.deposit,
          paymentDay: ctForm.paymentDay,
          paymentTiming: ctForm.paymentTiming,
          cdw: ctForm.cdw,
          deductible: ctForm.deductible,
          earlyTerminationRate: ctForm.earlyTerminationRate,
        },
      });
      setCtEdit(false);
    } catch { /* commit toast */ }
  };

  const inspD = dday(v?.inspectionTo);
  const insExp = curIns?.endDate || v?.insuranceExpiryDate;
  const insD = dday(insExp);
  const cashOnly = v ? isCashPurchase(v.loanCashOnly) : false;

  const penRows = penalties.map((p) => {
    const st = penaltyStatus(p);
    const drv = matchDriver(p, contracts);
    return {
      at: yy(p.violationDate),
      kind: '과태료',
      body: `${String(p.description || '과태료')}${p.amount ? ` · ${won(p.amount)}` : ''}${st !== '종결' ? ` · ${st}` : ''}`,
      who: drv ? String(drv.contractorName) : String(p.issuer || ''),
    };
  });

  const repairRows = workList.map((h) => ({
    at: yy(h.date),
    kind: String(h.category || '정비'),
    body: workSummary(h),
    amt: Number(h.cost || h.amount) || 0,
  }));

  const payHist = history
    .filter((h) => ['입금', '할인', '보증', '보증금'].includes(String(h.category || '')))
    .slice(0, 20)
    .map((h) => ({
      at: yy(h.date),
      kind: String(h.category || '이력'),
      body: String(h.title || '—'),
      who: String(h.author || ''),
    }));

  const contractHist = history
    .filter((h) => !isWorkish(String(h.category || '')) && !['입금', '할인', '보증', '보증금', '과태료'].includes(String(h.category || '')))
    .slice(0, 24)
    .map((h) => ({
      at: yy(h.date),
      kind: String(h.category || '이력'),
      body: String(h.title || '—'),
      who: String(h.author || active?.contractorName || ''),
    }));

  const switchTab = (t: Tab) => {
    setTab(t);
    setTxMode(null);
    setRecMode(null);
    setDlvOpen(false);
    setIgnOpen(false);
    setCtEdit(false);
    setVehScope(null);
    cancelEdit();
    setEditIns(false);
  };

  const ctClass = cv ? classifyContract(cv) : null;
  const nextSch = schedule.find((s) => Number(s.balance) > 0) || null;
  const schBill = schedule.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const schPaid = schedule.reduce((s, x) => s + (Number(x.paid) || 0), 0);
  const schDone = schedule.filter((s) => Number(s.balance) <= 0).length;
  const schUnpaid = schedule.reduce((s, x) => s + (Number(x.balance) || 0), 0);
  const overdueN = schedule.filter((s) => String(s.status) === '연체').length;
  const unpaidBadge = schUnpaid > 0 ? schedule.filter((s) => Number(s.balance) > 0).length || 1 : undefined;
  const depositLabel = pendDeposit
    ? '미정산'
    : active?.depositSettledDate ? '정산완료'
    : active ? '운행중' : '';
  const cdwLine = [active?.cdw, active?.deductible ? (Number(active.deductible) >= 10000 ? won(active.deductible) : `${active.deductible}만`) : '']
    .filter(Boolean).map(String).join(' · ') || '';
  const transferLine = [
    active?.paymentDay ? `매월 ${active.paymentDay}` : '',
    active?.paymentTiming ? String(active.paymentTiming) : '',
  ].filter(Boolean).join(' · ');
  const deliverLine = [
    active?.deliveredDate ? yy(active.deliveredDate) : '',
    active?.mileageOut != null && active?.mileageOut !== '' ? `${Number(active.mileageOut).toLocaleString('ko-KR')}km` : '',
  ].filter(Boolean).join(' · ');
  const returnPlanLine = active
    ? [yy(effectiveEndDate(active)), remainText(effectiveEndDate(active), TODAY)].filter(Boolean).join(' · ')
    : '';
  const endLine = active?.returnedDate ? yy(active.returnedDate) : '';
  const g = deskGrid(mobile);
  const s = (slot: Parameters<typeof deskSlot>[1]) => deskSlot(mobile, slot);

  const acqCost = (() => {
    const c = Number(v?.consumerPrice) || 0;
    const o = Number(v?.optionPrice) || 0;
    const d = Number(v?.optionDiscount) || 0;
    if (c || o) return c + o - d;
    return Number(v?.acquisitionPrice) || 0;
  })();
  const insInstallments = Array.isArray(curIns?.installments)
    ? (curIns!.installments as { cycle?: number; amount?: number; paid?: boolean }[])
    : null;

  const insPremiumLine = (() => {
    if (!curIns?.totalPremium) return '';
    const total = Number(curIns.totalPremium);
    const paid = Number(curIns.paidPremium) || 0;
    if (!paid) return `총 ${won(total)}`;
    const insts = insInstallments || [];
    const byFlag = insts.filter((i) => i.paid).sort((a, b) => (Number(b.cycle) || 0) - (Number(a.cycle) || 0));
    if (byFlag[0]) {
      const c = byFlag[0].cycle || byFlag.length;
      const amt = Number(byFlag[0].amount) || paid;
      return `총 ${won(total)} / 납부 ${c}회차 ${won(amt)}`;
    }
    const match = insts.find((i) => Number(i.amount) === paid);
    if (match?.cycle) return `총 ${won(total)} / 납부 ${match.cycle}회차 ${won(paid)}`;
    if (insts[0] && Number(insts[0].amount) === paid) {
      return `총 ${won(total)} / 납부 ${insts[0].cycle || 1}회차 ${won(paid)}`;
    }
    return `총 ${won(total)} / 납부 ${won(paid)}`;
  })();

  // 시안 AttFoot — 패널별 필요 서류 슬롯 + rec._docs
  const docsReg = deskDocSlots(v, [{ type: 'vehicle', label: '자동차등록증' }]);
  const docsSpec = deskDocSlots(v, [
    { type: 'quote', label: '제조사견적' },
    { type: 'order', label: '발주서' },
    { type: 'fact', label: '계약사실확인' },
  ]);
  const docsPurchase = deskDocSlots(v, [
    { type: 'loan', label: '할부스케줄' },
    { type: 'sale', label: '매매계약서' },
  ]);
  const docsIns = deskDocSlots(curIns, [{ type: 'insurance', label: '보험증권' }]);
  const docsGps = deskDocSlots(v, [{ type: 'gps', label: 'GPS설치확인' }]);
  const docsPen = deskDocsFromList(
    penalties,
    'penalty',
    (r) => String(r.description || '과태료고지'),
    '과태료고지',
  );
  const docsRepair = deskDocsFromList(
    workList,
    'history',
    (r) => workSummary(r) || '정비명세서',
    '정비명세서',
  );
  const docsCt = deskDocSlots(active, [{ type: 'contract', label: '렌트계약서' }]);
  const docsReceipt = deskDocSlots(active, [{ type: 'receipt', label: '입금영수증' }]);
  const docsDeposit = deskDocSlots(active, [{ type: 'deposit', label: '보증입금증' }]);

  const assetGrid = (
    <div style={g}>
      <DeskPanel n={1} title="등록정보" hero fill
        style={s('left')}
        docs={docsReg} onAttach={() => openIngest('vehicle', plate)}
        right={vehRight('reg')}>
        <ScrollBody scroll>
          <Glance wrap edit={vehEdit('reg')} rows={[
            ['문서확인', dash(v?.documentNo), 'documentNo'],
            ['등록증발급', v?.certIssueDate ? yy(v.certIssueDate) : '', 'certIssueDate'],
            ['최초등록', v?.firstReg ? yy(v.firstReg) : '', 'firstReg'],
            ['차량번호', dash(v?.plate || plate), 'plate'],
            ['차종', dash(v?.vehicleType), 'vehicleType'],
            ['용도', dash(v?.usage), 'usage'],
            ['차명', dash(v?.carName), 'carName'],
            ['형식', dash(v?.typeNumber), 'typeNumber'],
            ['제작연월', dash(v?.yearMonth), 'yearMonth'],
            ['차대번호', dash(v?.vin), 'vin'],
            ['원동기형식', dash(v?.engineType), 'engineType'],
            ['사용본거지', dash(v?.useAddress || v?.address), 'useAddress'],
            ['소유자', dash(v?.ownerName), 'ownerName'],
            ['법인번호', dash(v?.ownerBizNo), 'ownerBizNo'],
            ['제원관리번호', dash(v?.approvalNumber), 'approvalNumber'],
            ['길이', fmtNum(v?.lengthMm, 'mm'), 'lengthMm'],
            ['너비', fmtNum(v?.widthMm, 'mm'), 'widthMm'],
            ['높이', fmtNum(v?.heightMm, 'mm'), 'heightMm'],
            ['총중량', fmtNum(v?.grossWeightKg, 'kg'), 'grossWeightKg'],
            ['승차정원', v?.seats != null && v?.seats !== '' ? String(v.seats) : '', 'seats'],
            ['최대적재', fmtNum(v?.maxLoadKg, 'kg'), 'maxLoadKg'],
            ['배기량', fmtNum(v?.displacement, 'cc'), 'displacement'],
            ['정격출력', dash(v?.ratedOutput), 'ratedOutput'],
            ['기통수', dash(v?.cylinders), 'cylinders'],
            ['연료', dash(v?.fuel), 'fuel'],
            ['연비', v?.fuelEfficiency != null && v?.fuelEfficiency !== '' ? `${v.fuelEfficiency}km/L` : '', 'fuelEfficiency'],
            ['검사기간', inspPeriod(v?.inspectionFrom, v?.inspectionTo), ['inspectionFrom', 'inspectionTo']],
            ['검사구분', dash(v?.inspectionType), 'inspectionType'],
            ['검사시km', fmtNum(v?.mileage), 'mileage'],
            ['출고가격', v?.acquisitionPrice ? won(v.acquisitionPrice) : '', 'acquisitionPrice'],
          ] satisfies GlanceRow[]} />
        </ScrollBody>
      </DeskPanel>

      <DeskPanel n={2} title="제조사제원" hero fill
        style={s('mid2')}
        docs={docsSpec} onAttach={() => openIngest('vehicle', plate)}
        right={vehRight('spec')}>
        <ScrollBody scroll>
          <Glance wrap edit={vehEdit('spec')} rows={[
            ['제조사', dash(v?.maker), 'maker'],
            ['모델', dash(v?.modelLine), 'modelLine'],
            ['세부모델', dash(v?.subModel), 'subModel'],
            ['파워트레인', dash(v?.variant), 'variant'],
            ['세부트림', dash(v?.trim), 'trim'],
            ['연식', dash(v?.modelYear), 'modelYear'],
            ['구동방식', dash(v?.driveType), 'driveType'],
            ['변속기', dash(v?.transmission), 'transmission'],
            ['외부색상', dash(v?.exteriorColor), 'exteriorColor'],
            ['내부색상', dash(v?.interiorColor), 'interiorColor'],
            ['선택옵션', dash(v?.optionList), 'optionList'],
            ['취급대리점', dash(v?.dealerAgency), 'dealerAgency'],
            ['담당자', [v?.dealerContact, v?.dealerPhone].filter(Boolean).map(String).join(' · ') || '', ['dealerContact', 'dealerPhone']],
          ] satisfies GlanceRow[]} />
        </ScrollBody>
      </DeskPanel>

      <DeskPanel n={3} title="취득정보" hero fill
        style={s('mid3')}
        docs={docsPurchase} onAttach={() => openIngest('vehicle', plate)}
        right={vehRight('purchase')}>
        <ScrollBody scroll>
          <Glance edit={vehEdit('purchase')} rows={[
            ['취득방법', cashOnly ? <Badge tone="gray">현금</Badge> : loanSum ? <Badge tone="blue">할부</Badge> : '—', 'loanCashOnly'],
            ['매입처', dash(v?.supplier), 'supplier'],
            ['취득일', yy(v?.acquisitionDate || v?.firstReg), 'acquisitionDate'],
            ['매입완료', yy(v?.purchasedDate), 'purchasedDate'],
            ['매입가', v?.acquisitionPrice ? won(v.acquisitionPrice) : '', 'acquisitionPrice'],
            ['소비자가', v?.consumerPrice ? won(v.consumerPrice) : '', 'consumerPrice'],
            ['옵션가', v?.optionPrice ? won(v.optionPrice) : '', 'optionPrice'],
            ['옵션할인', v?.optionDiscount ? won(v.optionDiscount) : '', 'optionDiscount'],
            ['취득원가', acqCost ? won(acqCost) : ''],
            ['과세/면세', dash(v?.taxExempt), 'taxExempt'],
            ...(cashOnly || !loanSum ? [] as GlanceRow[] : [
              ['할부사', dash(v?.loanCompany), 'loanCompany'] as GlanceRow,
              ['원금', v?.loanPrincipal ? won(v.loanPrincipal) : '', 'loanPrincipal'] as GlanceRow,
              ['이율', v?.loanRate != null && v?.loanRate !== '' ? `${v.loanRate}%` : '', 'loanRate'] as GlanceRow,
              ['개월', v?.loanMonths != null && v?.loanMonths !== '' ? String(v.loanMonths) : '', 'loanMonths'] as GlanceRow,
              ['시작', yy(v?.loanStartDate), 'loanStartDate'] as GlanceRow,
              ['월상환', loanSum.monthlyPayment ? won(loanSum.monthlyPayment) : ''] as GlanceRow,
              ['잔액', <b style={{ color: C.danger }}>{won(loanSum.remainPrincipal)}</b>] as GlanceRow,
              ['잔여회차', `${loanSum.remainSeq}회`] as GlanceRow,
            ]),
          ] satisfies GlanceRow[]} />
        </ScrollBody>
      </DeskPanel>

      <DeskPanel n={5} title="보험" fill
        style={s('mid4')}
        docs={docsIns} onAttach={() => openIngest('insurance', plate)}
        right={editIns
          ? <SaveCancel onSave={saveIns} onCancel={() => setEditIns(false)} />
          : (
            <>
              <Btn size="sm" variant="ghost" onClick={startEditIns}>
                {curIns ? '수정' : '+ 등록'}
              </Btn>
              <Btn size="sm" variant="ghost" onClick={() => openIngest('insurance', plate)}>담기</Btn>
            </>
          )}>
        <ScrollBody scroll>
          {(curIns || editIns) ? (
            <>
              <Glance wrap edit={editIns ? { form: insForm, onChange: insChg } : undefined} rows={[
                ['보험사', dash(curIns?.insurer || v?.insuranceCompany), 'insurer'],
                ['상품명', dash(curIns?.productName), 'productName'],
                ['증권', dash(curIns?.policyNo || v?.insurancePolicyNo), 'policyNo'],
                ['계약자', dash(curIns?.contractor), 'contractor'],
                ['피보험자', dash(curIns?.insured), 'insured'],
                ['기간', `${yy(curIns?.startDate)} ~ ${yy(curIns?.endDate)}`, ['startDate', 'endDate']],
                ['만기', insD != null ? <span style={{ color: insD <= 30 ? C.warn : C.ink }}>{insD < 0 ? `${Math.abs(insD)}일 지남` : `D-${insD}`}</span> : ''],
                ['대인Ⅰ·Ⅱ', [curIns?.cov_personal_1, curIns?.cov_personal_2].filter(Boolean).map(String).join(' / ') || '', ['cov_personal_1', 'cov_personal_2']],
                ['대물', dash(curIns?.cov_property), 'cov_property'],
                ['자기신체', dash(curIns?.cov_self_accident), 'cov_self_accident'],
                ['무보험', dash(curIns?.cov_uninsured), 'cov_uninsured'],
                ['자차', dash(curIns?.cov_self_vehicle), 'cov_self_vehicle'],
                ['긴급출동', dash(curIns?.cov_emergency), 'cov_emergency'],
                ['물적할증', curIns?.deductibleMan != null && curIns?.deductibleMan !== '' ? `${curIns.deductibleMan}만원` : '', 'deductibleMan'],
                ['운전범위', dash(curIns?.driverScope), 'driverScope'],
                ['운전연령', dash(curIns?.driverAge), 'driverAge'],
                ['분납', insInstallments?.length
                  ? `${insInstallments.length}회`
                  : (curIns?.installmentCount ? `${curIns.installmentCount}회` : ''), 'installmentCount'],
                ['보험료', insPremiumLine, ['totalPremium', 'paidPremium']],
                ['대리점', dash(curIns?.agency || curIns?.agentName), 'agency'],
                ['담당자', [curIns?.agencyContact, curIns?.agencyPhone].filter(Boolean).map(String).join(' · ') || '', ['agencyContact', 'agencyPhone']],
              ] satisfies GlanceRow[]} />
              {!editIns && olderIns.length > 0 && (
                <div style={{ padding: DESK.footPad, borderTop: `1px solid ${C.line2}` }}>
                  <div style={{ fontSize: DESK.labelFs, fontWeight: 700, color: C.mute, marginBottom: 2 }}>이전 증권 ({olderIns.length})</div>
                  {olderIns.map((ins, i) => {
                    const od = dday(ins.endDate);
                    return (
                      <div key={String(ins._key || i)} style={{
                        fontSize: DESK.valueFs, color: C.ink, padding: '2px 0',
                        display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap',
                      }}>
                        <span style={{ fontWeight: 700 }}>{dash(ins.insurer) || '보험'}</span>
                        <span style={{ color: C.mute }}>{dash(ins.policyNo)}</span>
                        <span style={{ color: C.faint }}>{yy(ins.startDate)} ~ {yy(ins.endDate)}</span>
                        {od != null && (
                          <span style={{ color: C.faint, marginLeft: 'auto' }}>
                            {od < 0 ? `만료 ${-od}일` : `D-${od}`}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (v?.insuranceCompany || v?.insurancePolicyNo || v?.insuranceExpiryDate) ? (
            <Glance rows={[
              ['보험사', dash(v?.insuranceCompany)],
              ['증권', dash(v?.insurancePolicyNo)],
              ['만기', v?.insuranceExpiryDate
                ? <span style={{ color: insD != null && insD <= 30 ? C.warn : C.ink }}>{yy(v.insuranceExpiryDate)}</span>
                : ''],
            ]} />
          ) : <EmptyState variant="sec">보험 없음</EmptyState>}
        </ScrollBody>
      </DeskPanel>

      <DeskPanel n={4} title="운영상태" fill
        style={s('right1')}
        right={vehRight('ops')}>
        <ScrollBody scroll>
          <Glance edit={vehEdit('ops')} rows={[
            ['자산코드', dash(v?.assetCode), 'assetCode'],
            ['자산상태', <Badge tone={statusTone}>{status}</Badge>],
            ['소유×가동', dash(v?.status), 'status'],
            ['주행거리', v?.mileage != null && v?.mileage !== '' ? `${Number(v.mileage).toLocaleString('ko-KR')}km` : '', 'mileage'],
            ['검사만기', v?.inspectionTo
              ? <span style={{ color: inspD != null && inspD <= 30 ? C.warn : C.ink }}>{yy(v.inspectionTo)}</span>
              : '', 'inspectionTo'],
            ['위치', dash(locStr)],
            ['대기일', idleDays != null ? `${idleDays}일` : ''],
            ['매각일', yy(v?.saleDate), 'saleDate'],
            ['매각가', v?.salePrice ? won(v.salePrice) : '', 'salePrice'],
          ] satisfies GlanceRow[]} />
        </ScrollBody>
      </DeskPanel>

      <DeskPanel n={6} title="GPS" fill
        style={s('right2')}
        docs={docsGps} onAttach={() => openIngest('vehicle', plate)}
        right={vehRight('gps')}>
        <ScrollBody scroll>
          <Glance edit={vehEdit('gps')} rows={[
            ['공급사', dash(v?.gpsProvider), 'gpsProvider'],
            ['단말', dash(v?.gpsDeviceId), 'gpsDeviceId'],
            ['설치', yy(v?.gpsInstalledDate), 'gpsInstalledDate'],
            ['시동제어', dash(v?.gpsControl), 'gpsControl'],
          ] satisfies GlanceRow[]} />
        </ScrollBody>
      </DeskPanel>

      <DeskPanel n={7} title="과태료" fill
        style={s('right3')}
        docs={docsPen} onAttach={() => openIngest('penalty', plate)}
        right={<Btn size="sm" variant="ghost" onClick={() => openIngest('penalty', plate)}>+ 접수</Btn>}>
        <ScrollBody scroll>
          {penRows.length === 0 ? <EmptyState variant="sec">없음</EmptyState> : <HistTable rows={penRows} />}
        </ScrollBody>
      </DeskPanel>

      <DeskPanel n={8} title="수선 · 사고" fill
        style={s('bottom')}
        docs={docsRepair} onAttach={() => openIngest('history', plate)}
        right={<Btn size="sm" variant="ghost" onClick={() => setWorkOpen(!workOpen)}>{workOpen ? '닫기' : '+ 정비'}</Btn>}>
        <ScrollBody scroll>
          {workOpen ? (
            <WorkForm plate={plate} companyId={target} vehicle={v} idle={!active}
              onDone={() => setWorkOpen(false)}
              onCancel={() => setWorkOpen(false)}
              style={{ margin: 6 }} />
          ) : null}
          {repairRows.length === 0 && !workOpen
            ? <EmptyState variant="sec">없음</EmptyState>
            : <RepairTable rows={repairRows} />}
        </ScrollBody>
      </DeskPanel>

    </div>
  );

  /* 계약·수납 = 자산과 동일 DESK_SLOT (5×3 · 하단 col2–4) */
  const contractTab = (
    <div style={g}>
      <DeskPanel n={1} title="계약 조건" hero fill
        style={s('left')}
        docs={docsCt} onAttach={() => openIngest('contract', plate)}
        right={active ? (
          ctEdit
            ? <SaveCancel onSave={saveCt} onCancel={cancelCt} />
            : (
              <>
                <Btn size="sm" variant="ghost" onClick={() => openPrintDoc('contract', plate)}>출력</Btn>
                <Btn size="sm" variant="ghost" onClick={startCt}>수정</Btn>
                <Btn size="sm" variant="ghost" onClick={() => openIngest('contract', plate)}>담기</Btn>
              </>
            )
        ) : (
          <Btn size="sm" variant="ghost" onClick={() => openIngest('contract', plate)}>+ 계약</Btn>
        )}>
        <ScrollBody scroll>
          {active ? (
            <Glance wrap edit={ctEdit ? { form: ctForm, onChange: ctChg } : undefined} rows={[
              ['계약번호', dash(active.contractNo || active._key), 'contractNo'],
              ['성립일', yy(active.contractDate || active.startDate), 'contractDate'],
              ['계약자', dash(active.contractorName), 'contractorName'],
              ['연락 · 생년', [active.contractorPhone, active.contractorBirth ? yy(active.contractorBirth) : ''].filter(Boolean).join(' · ') || '', ['contractorPhone', 'contractorBirth']],
              ['차량', dash(plate)],
              ['기간', `${yy(active.startDate)} ~ ${yy(effectiveEndDate(active))}`, ['startDate', 'endDate']],
              ['개월', active.rentalMonths != null && active.rentalMonths !== '' ? String(active.rentalMonths) : '', 'rentalMonths'],
              ['월대여료', active.monthlyRent ? won(active.monthlyRent) : '', 'monthlyRent'],
              ['이체', transferLine, ['paymentDay', 'paymentTiming']],
              ['보증금', active.deposit ? won(active.deposit) : '', 'deposit'],
              ['CDW · 면책', cdwLine, ['cdw', 'deductible']],
              ['위약금율', active.earlyTerminationRate != null && active.earlyTerminationRate !== '' ? `${active.earlyTerminationRate}%` : '', 'earlyTerminationRate'],
            ] satisfies GlanceRow[]} />
          ) : <EmptyState variant="sec">진행 계약 없음</EmptyState>}
        </ScrollBody>
      </DeskPanel>

      <DeskPanel n={2} title="진행 · 조치" fill
        style={s('mid2')}
        right={active ? (
          <>
            <Btn size="sm" variant={txMode === 'return' ? 'solid' : undefined} onClick={() => { setTxMode(txMode === 'return' ? null : 'return'); setDlvOpen(false); }}>반납</Btn>
            <Btn size="sm" variant={txMode === 'extend' ? 'solid' : 'ghost'} onClick={() => { setTxMode(txMode === 'extend' ? null : 'extend'); setDlvOpen(false); }}>연장</Btn>
            <Btn size="sm" variant={txMode === 'terminate' ? 'danger' : 'ghost'} onClick={() => { setTxMode(txMode === 'terminate' ? null : 'terminate'); setDlvOpen(false); }}>중도해지</Btn>
          </>
        ) : waiting ? (
          <Btn size="sm" onClick={() => setDlvOpen(!dlvOpen)}>인도</Btn>
        ) : undefined}>
        {active && txMode === 'return' && (
          <DeskPane title="반납" onClose={() => setTxMode(null)}>
            <label style={lab}><span style={ll}>반납일</span><Input size="sm" type="date" value={txForm.date} onChange={(e) => setTxForm((f) => ({ ...f, date: e.target.value }))} style={{ width: 140 }} /></label>
            <label style={lab}><span style={ll}>km</span><Input size="sm" inputMode="numeric" value={txForm.mileage} onChange={(e) => setTxForm((f) => ({ ...f, mileage: e.target.value.replace(/[^\d]/g, '') }))} style={{ width: 88 }} /></label>
            <label style={lab}><span style={ll}>연료</span><Select size="sm" value={txForm.fuel} onChange={(e) => setTxForm((f) => ({ ...f, fuel: e.target.value }))}>{FUEL_LEVELS.map((x) => <option key={x} value={x}>{x}</option>)}</Select></label>
            <Btn size="sm" onClick={commitTx}>확정</Btn>
            {reco ? <span style={{ fontSize: 11, color: C.faint }}>재렌트 {won(reco.recommended)}</span> : null}
          </DeskPane>
        )}
        {active && txMode === 'extend' && (
          <DeskPane title="연장" onClose={() => setTxMode(null)}>
            <label style={lab}><span style={ll}>개월</span><Input size="sm" inputMode="numeric" value={txForm.months} onChange={(e) => setTxForm((f) => ({ ...f, months: e.target.value.replace(/[^\d]/g, '') }))} style={{ width: 48 }} /></label>
            <span style={{ fontSize: 11.5, color: C.mute }}>{yy(active.endDate)} → {yy(patchExtend(active, Number(txForm.months) || 0).endDate)}</span>
            <Btn size="sm" onClick={commitTx}>확정</Btn>
          </DeskPane>
        )}
        {active && txMode === 'terminate' && (
          <DeskPane title="중도해지" onClose={() => setTxMode(null)}>
            <label style={lab}><span style={ll}>해지일</span><Input size="sm" type="date" value={txForm.date} onChange={(e) => setTxForm((f) => ({ ...f, date: e.target.value }))} style={{ width: 140 }} /></label>
            <label style={lab}><span style={ll}>사유</span><Select size="sm" value={txForm.reason} onChange={(e) => setTxForm((f) => ({ ...f, reason: e.target.value }))}>{['고객요청', '연체', '차량회수', '사고전손', '기타'].map((x) => <option key={x} value={x}>{x}</option>)}</Select></label>
            {(() => {
              const et = earlyTerminationFee(active, txForm.date);
              return <span style={{ fontSize: 11.5, color: C.mute }}>위약금 {et.isEarly ? won(et.fee) : '없음'}</span>;
            })()}
            <Btn size="sm" variant="danger" onClick={commitTx}>확정</Btn>
          </DeskPane>
        )}
        {waiting && dlvOpen && (
          <DeskPane title="인도" onClose={() => setDlvOpen(false)}>
            <label style={lab}><span style={ll}>인도일</span><Input size="sm" type="date" value={dlvForm.date} onChange={(e) => setDlvForm((f) => ({ ...f, date: e.target.value }))} style={{ width: 140 }} /></label>
            <label style={lab}><span style={ll}>출고km</span><Input size="sm" inputMode="numeric" value={dlvForm.mileage} onChange={(e) => setDlvForm((f) => ({ ...f, mileage: e.target.value.replace(/[^\d]/g, '') }))} style={{ width: 88 }} /></label>
            <label style={lab}><span style={ll}>연료</span><Select size="sm" value={dlvForm.fuel} onChange={(e) => setDlvForm((f) => ({ ...f, fuel: e.target.value }))}>{FUEL_LEVELS.map((x) => <option key={x} value={x}>{x}</option>)}</Select></label>
            <Btn size="sm" onClick={commitDeliver}>확정</Btn>
          </DeskPane>
        )}
        <ScrollBody scroll>
          {active ? (
            <Glance rows={[
              ['분류', ctClass ? <Badge tone={toneBadge(ctClass.tone)}>{ctClass.label}</Badge> : <Badge tone={statusTone}>{status}</Badge>],
              ['인도', deliverLine],
              ['반납예정', <span style={{ color: d != null && d < 0 ? C.danger : d != null && d <= 7 ? C.warn : C.ink }}>{returnPlanLine}</span>],
              ['종료실적', endLine],
              ['연락처', dash(active.contractorPhone)],
            ]} />
          ) : waiting ? (
            <Glance rows={[
              ['분류', <Badge tone="amber">인도대기</Badge>],
              ['계약자', dash(waiting.contractorName)],
              ['시작예정', yy(waiting.startDate)],
              ['연락처', dash(waiting.contractorPhone)],
            ]} />
          ) : <EmptyState variant="sec">조치 없음</EmptyState>}
        </ScrollBody>
      </DeskPanel>

      <DeskPanel n={3} title="계약 이력" fill
        style={s('mid3')}
        right={<Btn size="sm" variant="ghost" onClick={() => setLogOpen((o) => !o)}>{logOpen ? '닫기' : '+ 기록'}</Btn>}>
        {logOpen ? (
          <DeskPane title="기록" onClose={() => setLogOpen(false)}>
            <QuickLogForm
              ctx={{ plate, ...(active ? { contractNo: String(active.contractNo || active._key || ''), customer: String(active.contractorName || '') } : {}) }}
              onDone={() => setLogOpen(false)} onCancel={() => setLogOpen(false)} style={{ flex: 1, minWidth: 180 }}
            />
          </DeskPane>
        ) : null}
        <ScrollBody scroll>
          {contractHist.length === 0 && !logOpen
            ? <EmptyState variant="sec">없음</EmptyState>
            : <HistTable rows={contractHist} withWho />}
        </ScrollBody>
      </DeskPanel>

      <DeskPanel n={5} title="한눈(지표)" fill
        style={s('mid4')}
        right={<Btn size="sm" variant="ghost" onClick={() => switchTab('수납')}>수납</Btn>}>
        <ScrollBody scroll>
          <Glance rows={[
            ['미수', schUnpaid > 0
              ? <button type="button" onClick={() => switchTab('수납')} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: C.danger, fontWeight: 800 }}>{won(schUnpaid)}</button>
              : won(0)],
            ['다음', nextSch ? `${nextSch.seq}회 · ${String(nextSch.status || '')}` : (schedule.length ? '완료' : '—')],
            ['진도', schedule.length ? `${schDone}/${schedule.length}` : '—'],
            ['연체', overdueN > 0 ? <span style={{ color: C.danger }}>{overdueN}회</span> : '0'],
            ['시동', engineLocked ? <span style={{ color: C.warn }}>잠금</span> : '해제'],
            ['보증', depositLabel],
          ]} />
        </ScrollBody>
      </DeskPanel>

      <DeskPanel n={4} title="다음회차" fill
        style={s('right1')}
        right={nextSch ? <Btn size="sm" variant="ghost" onClick={() => switchTab('수납')}>수납</Btn> : undefined}>
        <ScrollBody scroll>
          <Glance rows={nextSch ? [
            ['회차', String(nextSch.seq)],
            ['기일', yy(nextSch.dueDate)],
            ['청구', won(nextSch.amount)],
            ['잔액', Number(nextSch.balance) > 0
              ? <b style={{ color: C.danger }}>{won(nextSch.balance)}</b>
              : won(0)],
            ['상태', <Badge tone={String(nextSch.status) === '연체' ? 'red' : String(nextSch.status) === '부분납' ? 'amber' : 'gray'}>{String(nextSch.status || '—')}</Badge>],
          ] : [
            ['상태', schedule.length ? '완납' : '스케줄 없음'],
          ]} />
        </ScrollBody>
      </DeskPanel>

      <DeskPanel n={6} title="시동" fill style={s('right2')}>
        <ScrollBody scroll>
          <Glance rows={[
            ['상태', engineLocked ? <span style={{ color: C.warn }}>잠금</span> : '해제'],
            ['사유', engineLocked ? dash(active?.engineDisabledReason) : ''],
          ]} />
        </ScrollBody>
      </DeskPanel>

      <DeskPanel n={7} title="보증" fill style={s('right3')}>
        <ScrollBody scroll>
          <Glance rows={[
            ['보증금', active?.deposit ? won(active.deposit) : ''],
            ['정산', depositLabel],
          ]} />
        </ScrollBody>
      </DeskPanel>

      <DeskPanel n={8} title="수납 스케줄" fill
        style={s('bottom')}
        right={<Btn size="sm" variant="ghost" onClick={() => switchTab('수납')}>수납 탭</Btn>}>
        <ScrollBody scroll>
          {schedule.length === 0
            ? <EmptyState variant="sec">스케줄 없음</EmptyState>
            : (
              <SchTable
                rows={schedule.map((row) => ({
                  seq: row.seq, due: String(row.dueDate), amt: row.amount, paid: row.paid, bal: row.balance, st: String(row.status),
                }))}
                onRow={() => switchTab('수납')}
              />
            )}
        </ScrollBody>
      </DeskPanel>
    </div>
  );

  const payTab = (
    <div style={g}>
      <DeskPanel n={1} title="회차 · 이행" hero fill
        style={s('left')}
        docs={docsReceipt} onAttach={() => openIngest('contract', plate)}
        right={active ? (
          <>
            <Btn size="sm" variant={recMode === 'pay' ? 'solid' : undefined} onClick={() => setRecMode(recMode === 'pay' ? null : 'pay')}>입금</Btn>
            <Btn size="sm" variant={recMode === 'disc' ? 'solid' : 'ghost'} onClick={() => setRecMode(recMode === 'disc' ? null : 'disc')}>할인</Btn>
          </>
        ) : undefined}>
        {active && recMode === 'pay' && (
          <DeskPane title="입금" onClose={() => setRecMode(null)}>
            <label style={lab}><span style={ll}>회차</span><Select size="sm" value={recForm.seq} onChange={(e) => setRecForm((r) => ({ ...r, seq: e.target.value }))}>{schedule.map((row) => <option key={row.seq} value={row.seq}>{row.seq}</option>)}</Select></label>
            <label style={lab}><span style={ll}>금액</span><Input size="sm" type="number" value={recForm.amount} onChange={(e) => setRecForm((r) => ({ ...r, amount: e.target.value }))} style={{ width: 100 }} /></label>
            <label style={lab}><span style={ll}>수단</span><Select size="sm" value={recForm.method} onChange={(e) => setRecForm((r) => ({ ...r, method: e.target.value }))}>{['계좌', 'CMS', '카드', '현금', '수동'].map((m) => <option key={m} value={m}>{m}</option>)}</Select></label>
            <Btn size="sm" onClick={saveRecord}>저장</Btn>
          </DeskPane>
        )}
        {active && recMode === 'disc' && (
          <DeskPane title="할인" onClose={() => setRecMode(null)}>
            <label style={lab}><span style={ll}>회차</span><Select size="sm" value={recForm.seq} onChange={(e) => setRecForm((r) => ({ ...r, seq: e.target.value }))}>{schedule.map((row) => <option key={row.seq} value={row.seq}>{row.seq}</option>)}</Select></label>
            <label style={lab}><span style={ll}>금액</span><Input size="sm" type="number" value={recForm.amount} onChange={(e) => setRecForm((r) => ({ ...r, amount: e.target.value }))} style={{ width: 88 }} /></label>
            <label style={lab}><span style={ll}>사유</span><Select size="sm" value={recForm.reason} onChange={(e) => setRecForm((r) => ({ ...r, reason: e.target.value }))}>{['자가조치', '보상', '사은품', '캠페인', '기타'].map((m) => <option key={m} value={m}>{m}</option>)}</Select></label>
            <Btn size="sm" onClick={saveRecord}>저장</Btn>
          </DeskPane>
        )}
        <ScrollBody scroll>
          {!active && schedule.length === 0 ? (
            <EmptyState variant="sec">스케줄 없음</EmptyState>
          ) : (
            <SchTable
              rows={schedule.map((row) => ({
                seq: row.seq, due: String(row.dueDate), amt: row.amount, paid: row.paid, bal: row.balance, st: String(row.status),
              }))}
              onRow={(seq) => {
                const row = schedule.find((x) => String(x.seq) === seq);
                setRecForm((r) => ({ ...r, seq, amount: row && row.balance > 0 ? String(row.balance) : '' }));
                setRecMode('pay');
              }}
            />
          )}
        </ScrollBody>
        {schedule.length > 0 && (
          <SchFoot items={[
            <>청구 {won(schBill)}</>,
            <>수금 {won(schPaid)}</>,
            <span style={{ color: C.danger, fontWeight: 800 }}>미수 {won(schUnpaid)}</span>,
            <>{schDone}/{schedule.length}{overdueN ? ` · 연체 ${overdueN}` : ''}</>,
          ]} />
        )}
      </DeskPanel>

      <DeskPanel n={2} title="수납 이력" fill
        style={s('mid2')}
        docs={docsReceipt} onAttach={() => openIngest('contract', plate)}>
        <ScrollBody scroll>
          {payHist.length === 0 ? <EmptyState variant="sec">없음</EmptyState> : <HistTable rows={payHist} withWho />}
        </ScrollBody>
      </DeskPanel>

      <DeskPanel n={3} title="손익(지표)" fill style={s('mid3')}>
        <ScrollBody scroll>
          <Glance rows={[
            ['수금합', econ?.revenue != null ? won(econ.revenue) : ''],
            ['비용', econ?.cost != null ? won(econ.cost) : ''],
            ['손익', econ?.profit != null
              ? <b style={{ color: Number(econ.profit) >= 0 ? C.ok : C.danger }}>{won(econ.profit)}</b>
              : ''],
            ['회수율', econ?.acquisition ? `${Math.round(econ.recoveryRate * 100)}%` : ''],
            ['재렌트', reco?.recommended != null ? won(reco.recommended) : ''],
          ]} />
        </ScrollBody>
      </DeskPanel>

      <DeskPanel n={5} title="청구 · 수금" fill style={s('mid4')}>
        <ScrollBody scroll>
          <Glance rows={[
            ['청구', won(schBill)],
            ['수금', won(schPaid)],
            ['미수', schUnpaid > 0 ? <b style={{ color: C.danger }}>{won(schUnpaid)}</b> : won(0)],
            ['진도', schedule.length ? `${schDone}/${schedule.length}` : '—'],
            ['연체', overdueN > 0 ? <span style={{ color: C.danger }}>{overdueN}회</span> : '0'],
          ]} />
        </ScrollBody>
      </DeskPanel>

      <DeskPanel n={4} title="보증 · 시동" fill
        style={s('right1')}
        docs={docsDeposit} onAttach={() => openIngest('contract', plate)}
        right={(
          <>
            {pendDeposit ? <Btn size="sm" onClick={settleDeposit}>정산</Btn> : null}
            {active && (v?.gpsDeviceId || v?.gpsProvider) ? (
              <Btn size="sm" variant="danger" onClick={() => setIgnOpen(!ignOpen)}>시동</Btn>
            ) : null}
          </>
        )}>
        {ignOpen && active && (
          <DeskPane title="시동제어" onClose={() => setIgnOpen(false)}>
            <Btn size="sm" variant="danger" onClick={() => { void logIgnition('제어'); setIgnOpen(false); }} disabled={engineLocked}>잠금</Btn>
            <Btn size="sm" variant="ghost" onClick={() => { void logIgnition('해제'); setIgnOpen(false); }} disabled={!engineLocked}>해제</Btn>
          </DeskPane>
        )}
        <ScrollBody scroll>
          <Glance rows={[
            ['보증금', active?.deposit ? won(active.deposit) : ''],
            ['정산', depositLabel],
            ['시동', engineLocked ? <span style={{ color: C.warn }}>잠금</span> : '해제'],
            ['잠금사유', engineLocked ? dash(active?.engineDisabledReason) : ''],
          ]} />
        </ScrollBody>
      </DeskPanel>

      <DeskPanel n={6} title="다음회차" fill style={s('right2')}>
        <ScrollBody scroll>
          <Glance rows={nextSch ? [
            ['회차', `${nextSch.seq}`],
            ['기일', yy(nextSch.dueDate)],
            ['잔액', Number(nextSch.balance) > 0
              ? <b style={{ color: C.danger }}>{won(nextSch.balance)}</b>
              : won(0)],
            ['상태', String(nextSch.status || '—')],
          ] : [['상태', schedule.length ? '완납' : '없음']]} />
        </ScrollBody>
      </DeskPanel>

      <DeskPanel n={7} title="미수(스케줄)" fill style={s('right3')}>
        <ScrollBody scroll>
          <Glance rows={[
            ['미수합', schUnpaid > 0 ? <b style={{ color: C.danger }}>{won(schUnpaid)}</b> : won(0)],
            ['미납회차', `${schedule.filter((row) => Number(row.balance) > 0).length}`],
            ['연체', overdueN > 0 ? <span style={{ color: C.danger }}>{overdueN}회</span> : '0'],
            ['진도', schedule.length ? `${schDone}/${schedule.length}` : '—'],
          ]} />
        </ScrollBody>
      </DeskPanel>

      <DeskPanel n={8} title="미납 회차" fill style={s('bottom')}>
        <ScrollBody scroll>
          {(() => {
            const unpaid = schedule.filter((row) => Number(row.balance) > 0);
            if (unpaid.length === 0) return <EmptyState variant="sec">미납 없음</EmptyState>;
            return (
              <SchTable
                rows={unpaid.map((row) => ({
                  seq: row.seq, due: String(row.dueDate), amt: row.amount, paid: row.paid, bal: row.balance, st: String(row.status),
                }))}
                onRow={(seq) => {
                  const row = schedule.find((x) => String(x.seq) === seq);
                  setRecForm((r) => ({ ...r, seq, amount: row && row.balance > 0 ? String(row.balance) : '' }));
                  setRecMode('pay');
                }}
              />
            );
          })()}
        </ScrollBody>
      </DeskPanel>
    </div>
  );

  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      height: mobile ? undefined : '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      overflow: mobile ? 'auto' : 'hidden',
    }}>
      {/* 크롬: 번호판 + 탭 (시안과 동일 · 앱바는 ← 만) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, minHeight: 28, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: C.ink, whiteSpace: 'nowrap' }}>{plate}</span>
        <Badge tone={statusTone}>{status}</Badge>
        {v?.carName ? <span style={{ fontSize: 12.5, color: C.mute }}>{String(v.carName)}</span> : null}
        {v?.companyId ? <span style={{ fontSize: 12, color: C.faint }}>{companyLabel(String(v.companyId))}</span> : null}
        <span style={{ flex: 1 }} />
        <PillTabs
          size="md"
          value={tab}
          onChange={switchTab}
          tabs={[
            { key: '자산', label: '자산' },
            { key: '계약', label: '계약' },
            { key: '수납', label: '수납', badge: unpaidBadge },
          ]}
        />
        <Btn size="sm" variant="danger" onClick={delVehicle}>삭제</Btn>
      </div>

      {vd.issues.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', flexShrink: 0 }}>
          {vd.issues.map((it, i) => (
            <button key={i} type="button" onClick={() => it.go?.()} disabled={!it.go}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', padding: 0, cursor: it.go ? 'pointer' : 'default' }}>
              <Badge tone={it.tone === 'red' ? 'red' : it.tone === 'amber' ? 'amber' : 'gray'}>{it.label}</Badge>
              <span style={{ fontSize: 12, color: C.mute }}>{it.detail}</span>
            </button>
          ))}
        </div>
      )}

      {tab === '자산' && assetGrid}
      {tab === '계약' && contractTab}
      {tab === '수납' && payTab}
    </div>
  );
}

function isWorkish(cat: string) {
  return ['정비', '사고', '검사', '세차', '주유', '소모품', '부품교체'].includes(cat);
}

function SaveCancel({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  return (
    <>
      <Btn size="sm" onClick={onSave}>저장</Btn>
      <Btn size="sm" variant="ghost" onClick={onCancel}>취소</Btn>
    </>
  );
}
