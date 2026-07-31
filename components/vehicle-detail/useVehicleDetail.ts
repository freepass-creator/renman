'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from '@/lib/session';
import { useEntityLists } from '@/lib/use-entity-lists';
import { type EntityRecord } from '@/lib/intake/entities';
import { generateSchedules, recalcContract } from '@/lib/payments/payment-schedule';
import type { Contract } from '@/lib/payments/types';
import { won, useConfirm } from '@/components/ui';
import { type DocReplacePayload } from '@/components/InfoDoc';
import { pushDocVersion } from '@/lib/docs';
import { deriveLocation, locationLabel } from '@/lib/vehicle-location';
import { contractSchedules, computeContractView, effectiveEndDate, patchTerminate, patchExtend, patchEngineLock, earlyTerminationFee, isReturnable, deriveStatus } from '@/lib/contract-ops';
import { canTransition } from '@/lib/domain/status';
import { isCashPurchase } from '@/lib/domain/vehicle-finance';
import { computeVehicleTax } from '@/lib/domain/vehicle-tax';
import { pushToFreepass, vehicleToProduct } from '@/lib/freepass/product-sync';
import { FUEL_LEVELS } from '@/lib/domain/fuel';
import { normPlate } from '@/lib/plate';
import { linkFleet, handoverHistory, recommendNextRent } from '@/lib/domain/model';
import { loanSchedule, loanSummary } from '@/lib/loan';
import { assetEconomics } from '@/lib/asset-econ';
import { depositView, buildDepositOffsetPayments } from '@/lib/deposit';
import { penaltyStatus } from '@/lib/penalty-reassign';
import { loadMaster } from '@/lib/company-master';
import { toast } from '@/lib/toast';
import { isWorkRecord } from '@/lib/work-ops';
import { saveIntake } from '@/lib/intake';
import { runTransition } from '@/lib/contracts/commit-transition';
import { resolveWriteCompany, NEED_COMPANY } from '@/lib/scope';
import { commitUpdate, commitSave, commitRemove } from '@/lib/commit';
import { TODAY, dday } from '@/lib/dashboard-consts';
import type { DlvForm, RecForm, RecMode, TxForm, TxMode, VehicleIssue } from './types';

/** 날짜 표시 = yy-mm-dd (2자리 연도). 2023-11-21 → 23-11-21 */
export const yy = (s: unknown) => {
  const t = String(s || '');
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(2, 10) : (t || '—');
};

/** 남은 기간 = "1년 2개월 3일 남음/지남" */
export function remainText(endStr: unknown, today: string): string {
  const e = String(endStr || '');
  if (!/^\d{4}-\d{2}-\d{2}/.test(e)) return '—';
  const from = new Date(today + 'T00:00:00');
  const to = new Date(e.slice(0, 10) + 'T00:00:00');
  const past = to.getTime() < from.getTime();
  const a = past ? to : from;
  const b = past ? from : to;
  let y = b.getFullYear() - a.getFullYear();
  let m = b.getMonth() - a.getMonth();
  let dd = b.getDate() - a.getDate();
  if (dd < 0) { m -= 1; dd += new Date(b.getFullYear(), b.getMonth(), 0).getDate(); }
  if (m < 0) { y -= 1; m += 12; }
  const parts: string[] = [];
  if (y) parts.push(`${y}년`);
  if (m) parts.push(`${m}개월`);
  if (dd) parts.push(`${dd}일`);
  return `${parts.length ? parts.join(' ') : '0일'} ${past ? '지남' : '남음'}`;
}

export function scheduleTone(s: string): 'red' | 'amber' | 'gray' | 'green' {
  return s === '연체' ? 'red' : s === '부분납' ? 'amber' : s === '완료' ? 'green' : 'gray';
}

export function unpaidOf(rec: EntityRecord): number {
  const rent = Number(rec.monthlyRent) || 0;
  const term = Number(rec.rentalMonths) || 0;
  const start = String(rec.startDate || '');
  if (!rent || !term || !start) return 0;
  const sch = generateSchedules({ contractDate: start, termMonths: term, monthlyRent: rent, paymentDay: 25 }).map((s) => ({ ...s, id: 's' + s.seq, contractId: 'c' }));
  return recalcContract({ id: 'c', monthlyRent: rent, termMonths: term, status: '운행', schedules: sch } as unknown as Contract, TODAY).unpaidAmount || 0;
}

/** 한 자산(차) 360 — 데이터·상태·핸들러 (UI 없음). */
export function useVehicleDetail(plate: string, focus?: string) {
  const confirm = useConfirm();
  const { companyId, user } = useSession();
  const { data: [allContracts = [], insAll = [], penAll = [], hisAll = [], allVehicles = []], loading } =
    useEntityLists(['contract', 'insurance', 'penalty', 'history', 'vehicle']);
  const np = normPlate(plate);

  const v = useMemo(
    () => allVehicles.find((x) => normPlate(x.plate) === np || String(x._key) === plate) ?? null,
    [allVehicles, np, plate],
  );
  const contracts = useMemo(() => allContracts.filter((c) => normPlate(c.plate) === np), [allContracts, np]);
  const insurances = useMemo(() => insAll.filter((c) => normPlate(c.plate) === np), [insAll, np]);
  const penalties = useMemo(() => penAll.filter((c) => normPlate(c.plate) === np), [penAll, np]);
  const history = useMemo(
    () => hisAll.filter((h) => normPlate(h.plate) === np).sort((a, b) => (String(a.date) < String(b.date) ? 1 : -1)),
    [hisAll, np],
  );

  const [editInfo, setEditInfo] = useState(false);
  const [form, setForm] = useState({} as EntityRecord);
  const [recMode, setRecMode] = useState(null as RecMode | null);
  const [recForm, setRecForm] = useState({ seq: '1', date: TODAY, amount: '', method: '계좌', reason: '기타' } as RecForm);
  const [editIns, setEditIns] = useState(false);
  const [prodBusy, setProdBusy] = useState(false);
  const [insForm, setInsForm] = useState({} as EntityRecord);
  const [logOpen, setLogOpen] = useState(false);
  const [workOpen, setWorkOpen] = useState(false);
  const [txMode, setTxMode] = useState(null as TxMode | null);
  const [txForm, setTxForm] = useState({
    date: TODAY, mileage: '', fuel: FUEL_LEVELS[0] as string, settleNote: '', months: '1', reason: '고객요청', penaltyNote: '',
  } as TxForm);
  const [dlvOpen, setDlvOpen] = useState(false);
  const [dlvForm, setDlvForm] = useState({ date: TODAY, mileage: '', fuel: FUEL_LEVELS[0] as string } as DlvForm);
  const [loanOpen, setLoanOpen] = useState(false);

  // 앱바 '수정' 버튼(openEdit) → 차량정보 인라인 편집
  useEffect(() => {
    function onEdit(e: Event) {
      if (String((e as CustomEvent).detail?.plate) !== plate) return;
      setForm({ plate, ...(v || {}) });
      setEditInfo(true);
      window.setTimeout(() => document.getElementById('v-info')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }
    window.addEventListener('jpk:edit-vehicle', onEdit);
    return () => window.removeEventListener('jpk:edit-vehicle', onEdit);
  }, [plate, v]);

  // ?do= focus — 한눈에서 바로 처리 모드
  useEffect(() => {
    if (!focus) return;
    if (focus === 'return') { setTxMode('return'); return; }
    if (focus === 'unpaid') { setRecMode('pay'); return; }
    if (focus === 'loan') {
      setLoanOpen(true);
      window.setTimeout(() => document.getElementById('v-purchase')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      return;
    }
    if (focus === 'insurance') {
      window.setTimeout(() => document.getElementById('v-insurance')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }
  }, [focus]);

  const fleet = useMemo(() => linkFleet(allVehicles, allContracts, TODAY), [allVehicles, allContracts]);
  const myNode = fleet.byPlate.get(normPlate(plate)) || null;
  const hist = handoverHistory(myNode?.contracts ?? []);
  const reco = myNode ? recommendNextRent(myNode, fleet.vehicles) : null;

  const active = contracts.find(isReturnable) || null;
  const totalUnpaid = contracts.reduce((s, c) => s + computeContractView(c, TODAY).net, 0);
  const d = active ? dday(effectiveEndDate(active)) : null;
  const schedule = active ? contractSchedules(active, TODAY) : [];
  const master = v ? loadMaster(String(v.companyId || '')) : {};

  async function delVehicle() {
    if (!v || !(await confirm({ message: `차량 ${plate}을(를) 삭제할까요? (휴지통에서 복구 가능)\n※ 매각·처분은 삭제가 아니라 상태(매각/말소)로 처리하세요.`, danger: true }))) return;
    try {
      await commitRemove({ entity: 'vehicle', sessionCompanyId: companyId, rec: v, key: plate, reason: '수기 삭제' });
      toast('차량 삭제 — 휴지통에서 복구 가능', 'info');
    } catch { toast(NEED_COMPANY, 'error'); }
  }

  const status = String(v?.status || (active ? '운행' : '대기'));
  const statusTone: 'green' | 'amber' | 'gray' | 'blue' = status === '운행' ? 'green' : (['정비', '사고'].includes(status) ? 'amber' : (['매각', '말소', '매각대기'].includes(status) ? 'gray' : 'blue'));
  const loan = (v && !isCashPurchase(v.loanCashOnly) && (Number(v.loanPrincipal) || Number(v.loanRemainingPrincipal)) && Number(v.loanMonths))
    ? loanSchedule(Number(v.loanPrincipal || v.loanRemainingPrincipal) || 0, Number(v.loanRate) || 0, Number(v.loanMonths) || 0, String(v.loanStartDate || ''))
    : [];
  const loanSum = loan.length ? loanSummary(loan, TODAY) : null;
  const lastReturn = contracts.filter((c) => c.returnedDate).map((c) => String(c.returnedDate)).sort().slice(-1)[0] || '';
  const idleFrom = (lastReturn || String(v?.acquisitionDate || v?.firstReg || '')).slice(0, 10);
  const idleDays = /^\d{4}-\d{2}-\d{2}/.test(idleFrom) ? Math.max(0, Math.round((new Date(TODAY).getTime() - new Date(idleFrom).getTime()) / 86400000)) : null;
  const loc = deriveLocation(v, contracts, history, TODAY);
  const locStr = locationLabel(loc);
  const target = resolveWriteCompany(companyId, v) || resolveWriteCompany(companyId, active) || '';
  const requireTarget = (): string | null => {
    const t = resolveWriteCompany(companyId, v) || resolveWriteCompany(companyId, active);
    if (!t) { toast(NEED_COMPANY, 'error'); return null; }
    return t;
  };
  const workList = history.filter(isWorkRecord);
  const curIns = insurances.slice().sort((a, b) => String(b.endDate || '').localeCompare(String(a.endDate || '')))[0] || null;
  const olderIns = curIns ? insurances.filter((i) => i !== curIns) : [];
  const econ = v ? assetEconomics(v, contracts, insurances, history, TODAY) : null;
  const tax = v && Number(v.consumerPrice) ? computeVehicleTax({ consumerPrice: Number(v.consumerPrice) || 0, optionPrice: Number(v.optionPrice) || 0, optionDiscount: Number(v.optionDiscount) || 0, exempt: String(v.taxExempt) === '면세' }) : null;
  const pendDeposit = contracts.map((c) => ({ c, d: depositView(c, TODAY) })).filter((x) => x.d.pendingRefund)
    .sort((a, b) => String(b.c.returnedDate || '').localeCompare(String(a.c.returnedDate || '')))[0] || null;
  const waiting = !active ? (contracts.find((cc) => !cc.returnedDate && String(cc.status || '') !== '운행') || null) : null;

  const doTransition = async (patch: EntityRecord, key: string, rec: EntityRecord) => {
    if (!key) return;
    try {
      await commitUpdate({ entity: 'contract', sessionCompanyId: companyId, rec, key, patch });
    } catch { toast(NEED_COMPANY, 'error'); }
  };

  const commitTx = async () => {
    if (!active?._key) return;
    const key = String(active._key);
    if (txMode && !canTransition(deriveStatus(active), txMode)) {
      toast(`${deriveStatus(active)} 상태에선 ${txMode === 'return' ? '반납' : txMode === 'extend' ? '연장' : '해지'}할 수 없습니다`, 'error');
      return;
    }
    if (txMode === 'return') {
      const t = requireTarget();
      if (!t) return;
      const extra: EntityRecord = { fuelIn: txForm.fuel };
      if (txForm.mileage) extra.returnMileage = Number(txForm.mileage);
      if (txForm.settleNote?.trim()) extra.returnSettleNote = txForm.settleNote.trim();
      const res = await runTransition({ action: 'return', contract: active, date: txForm.date, extra, actor: user.name, sessionCompanyId: companyId, target: t });
      if (!res.ok) {
        toast(res.reason === 'ALREADY' ? '이미 반납/종료 처리된 계약입니다' : res.reason === 'SAVE_FAIL' ? '반납 저장 실패 — 다시 시도' : NEED_COMPANY, 'error');
        return;
      }
    } else if (txMode === 'extend') {
      const m = Number(txForm.months);
      if (!m || m <= 0) return;
      await doTransition(patchExtend(active, m), key, active);
    } else if (txMode === 'terminate') {
      const et = earlyTerminationFee(active, txForm.date);
      await doTransition(patchTerminate(active, txForm.date, {
        terminateReason: txForm.reason,
        terminatePenaltyNote: txForm.penaltyNote,
        earlyTerminationFee: et.fee,
        earlyTerminationRemainingMonths: et.remainingMonths,
      }), key, active);
    }
    setTxMode(null);
  };

  const commitDeliver = async () => {
    if (!waiting?._key) return;
    if (!canTransition(deriveStatus(waiting), 'deliver')) { toast('인도할 수 있는 상태가 아닙니다', 'error'); return; }
    const t = requireTarget();
    if (!t) return;
    const extra: EntityRecord = { fuelOut: dlvForm.fuel };
    if (dlvForm.mileage) extra.mileageOut = Number(dlvForm.mileage);
    const res = await runTransition({ action: 'deliver', contract: waiting, date: dlvForm.date, extra, actor: user.name, sessionCompanyId: companyId, target: t });
    if (!res.ok) {
      toast(res.reason === 'ALREADY' ? '이미 인도 처리된 계약입니다' : res.reason === 'SAVE_FAIL' ? '인도 저장 실패 — 다시 시도' : NEED_COMPANY, 'error');
      return;
    }
    setDlvOpen(false);
  };

  const engineLocked = !!active?.engineDisabled;
  const logIgnition = async (action: '제어' | '해제') => {
    if (!active?._key) { toast('운행중 계약이 없어 시동제어할 수 없습니다', 'info'); return; }
    const t = requireTarget();
    if (!t) return;
    const vview = computeContractView(active, TODAY);
    const who = String(active.contractorName || plate);
    const actor = user?.email || user?.name || '';
    if (action === '해제') {
      if (!(await confirm({ message: `${who} · ${plate}\n입금이 확인되어 시동제어를 해제합니까?` }))) return;
      await doTransition(patchEngineLock(false, { today: TODAY, actor, reason: '' }), String(active._key), active);
    } else {
      if (!(await confirm({ message: `${who} · ${plate}\n미납 ${won(vview.net)} · ${vview.overdueDays}일 연체\n\n원격 시동제어를 겁니까?`, danger: true }))) return;
      await doTransition(patchEngineLock(true, { today: TODAY, actor, reason: `미납 ${won(vview.net)} · ${vview.overdueDays}일 연체` }), String(active._key), active);
    }
    await saveIntake('history', t, [{ plate, category: '시동제어', title: `시동 ${action}`, date: TODAY, author: user.name, memo: vview.net > 0 ? `미납 ${won(vview.net)}` : '', companyId: t, _kind: 'activity' }], { notify: false });
    toast(action === '제어' ? `시동제어 적용 · ${plate}` : `시동제어 해제 · ${plate}`, action === '제어' ? 'info' : 'success');
  };

  const settleDeposit = async () => {
    if (!pendDeposit?.c._key) return;
    const t = requireTarget();
    if (!t) return;
    const { d: dep, c: contract } = pendDeposit;
    const existing = Array.isArray(contract._payments) ? (contract._payments as unknown[]) : [];
    const offsetPays = buildDepositOffsetPayments(contract, TODAY);
    await doTransition({
      depositSettledDate: TODAY,
      ...(offsetPays.length ? { _payments: [...existing, ...offsetPays] } : {}),
    }, String(contract._key), contract);
    await saveIntake('history', t, [{
      plate, category: '보증금',
      title: dep.addCharge > 0 ? `보증금 충당 후 추가청구 ${won(dep.addCharge)}` : `보증금 반환 ${won(dep.refund)}`,
      date: TODAY, author: user.name, companyId: t, _kind: 'activity',
    }], { notify: false });
  };

  const chg = (k: string, val: string) => setForm((f) => ({ ...f, [k]: val }));
  const startEdit = () => { setForm({ plate, ...(v || {}) }); setEditInfo(true); };
  const cancelEdit = () => setEditInfo(false);
  const saveInfo = async () => {
    try {
      if (v?._key) await commitUpdate({ entity: 'vehicle', sessionCompanyId: companyId, rec: v, key: String(v._key), patch: { ...form, plate } });
      else await commitSave({ entity: 'vehicle', sessionCompanyId: companyId, rec: v, records: [{ ...form, plate }] });
      setEditInfo(false);
    } catch { toast(NEED_COMPANY, 'error'); }
  };

  const registerProduct = async () => {
    if (!v) return;
    setProdBusy(true);
    const r = await pushToFreepass([vehicleToProduct(v)]);
    setProdBusy(false);
    if (r.ok) toast('프리패스 매물 등록됨', 'success');
    else toast('등록 실패(연동 확인): ' + (r.error || r.body || ('HTTP ' + r.status)), 'error');
  };

  const insChg = (k: string, val: string) => setInsForm((f) => ({ ...f, [k]: val }));
  const startEditIns = () => { setInsForm({ ...(curIns || {}) }); setEditIns(true); };
  const saveIns = async () => {
    try {
      if (curIns?._key) await commitUpdate({ entity: 'insurance', sessionCompanyId: companyId, rec: curIns, key: String(curIns._key), patch: insForm });
      else await commitSave({ entity: 'insurance', sessionCompanyId: companyId, rec: v || curIns, records: [{ ...insForm, plate }] });
      setEditIns(false);
    } catch { toast(NEED_COMPANY, 'error'); }
  };

  const onReplaceReg = async ({ url, ocr, ocrOriginal, fields, reason }: DocReplacePayload) => {
    const base = v || { plate };
    const nextDocs = pushDocVersion(base, { type: 'vehicle', url, ocr, reason });
    const patch: EntityRecord = { ...fields, _docs: nextDocs, ...(ocrOriginal ? { _ocrOriginal: ocrOriginal } : {}) };
    try {
      if (v?._key) await commitUpdate({ entity: 'vehicle', sessionCompanyId: companyId, rec: v, key: String(v._key), patch });
      else await commitSave({ entity: 'vehicle', sessionCompanyId: companyId, rec: v, records: [{ ...base, ...patch, plate }] });
    } catch { toast(NEED_COMPANY, 'error'); }
  };

  const onReplaceIns = async ({ url, ocr, ocrOriginal, fields, reason }: DocReplacePayload) => {
    const base = curIns || { plate };
    const nextDocs = pushDocVersion(base, { type: 'insurance', url, ocr, reason });
    const patch: EntityRecord = { ...fields, _docs: nextDocs, ...(ocrOriginal ? { _ocrOriginal: ocrOriginal } : {}) };
    try {
      if (curIns?._key) await commitUpdate({ entity: 'insurance', sessionCompanyId: companyId, rec: curIns, key: String(curIns._key), patch });
      else await commitSave({ entity: 'insurance', sessionCompanyId: companyId, rec: v || curIns, records: [{ ...base, ...patch, plate }] });
    } catch { toast(NEED_COMPANY, 'error'); }
  };

  const saveRecord = async () => {
    if (!active?._key || !recForm.amount) return;
    const key = String(active._key);
    try {
      if (recMode === 'pay') {
        const list = Array.isArray(active._payments) ? (active._payments as unknown[]) : [];
        await commitUpdate({
          entity: 'contract', sessionCompanyId: companyId, rec: active, key,
          patch: { _payments: [...list, { seq: Number(recForm.seq), date: recForm.date, amount: Number(recForm.amount), source: recForm.method }] },
        });
      } else {
        const list = Array.isArray(active._discounts) ? (active._discounts as unknown[]) : [];
        await commitUpdate({
          entity: 'contract', sessionCompanyId: companyId, rec: active, key,
          patch: { _discounts: [...list, { seq: Number(recForm.seq), date: recForm.date, amount: Number(recForm.amount), reason: recForm.reason }] },
        });
      }
      setRecMode(null);
      setRecForm((r) => ({ ...r, amount: '' }));
    } catch { toast(NEED_COMPANY, 'error'); }
  };

  const cv = active ? computeContractView(active, TODAY) : null;
  // 같은 화면 안 앵커로 스크롤 (작업탭 없음)
  const goSec = (id: string) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('jpk:vehicle-nav', { detail: { id } }));
    }
  };

  const issues: VehicleIssue[] = [];
  if (totalUnpaid > 0) {
    issues.push({
      label: '미수',
      detail: `${won(totalUnpaid)}${cv && cv.overdueDays > 0 ? ` · ${cv.overdueDays}일 연체` : ''}`,
      tone: cv && cv.overdueDays >= 30 ? 'red' : 'amber',
      go: active ? () => { setRecMode('pay'); } : undefined,
    });
  }
  const openPen = penalties.filter((p) => penaltyStatus(p) !== '변경부과완료');
  if (openPen.length) issues.push({ label: '과태료', detail: `미처리 ${openPen.length}건`, tone: 'amber', go: () => goSec('v-penalty') });
  const inspDday = dday(v?.inspectionTo);
  if (inspDday != null && inspDday < 0) issues.push({ label: '검사 지연', detail: `${yy(v?.inspectionTo)} · ${-inspDday}일 경과`, tone: 'red', go: () => goSec('v-reg') });
  else if (inspDday != null && inspDday <= 30) issues.push({ label: '검사 임박', detail: `${yy(v?.inspectionTo)} · D-${inspDday}`, tone: 'amber', go: () => goSec('v-reg') });
  const insExp = curIns?.endDate || v?.insuranceExpiryDate;
  const insDday = dday(insExp);
  if (insDday != null && insDday < 0) issues.push({ label: '보험 만료', detail: `${yy(insExp)} · ${-insDday}일 경과`, tone: 'red', go: () => goSec('v-insurance') });
  else if (insDday != null && insDday <= 30) issues.push({ label: '보험 임박', detail: `${yy(insExp)} · D-${insDday}`, tone: 'amber', go: () => goSec('v-insurance') });
  if (active) {
    const rd = dday(active.returnScheduledDate || active.endDate);
    if (rd != null && rd < 0) issues.push({ label: '반납 지남', detail: `${-rd}일 · ${yy(active.returnScheduledDate || active.endDate)}`, tone: 'red', go: () => setTxMode('return') });
    else if (rd != null && rd <= 7) issues.push({ label: '반납 임박', detail: `D-${rd}`, tone: 'amber', go: () => setTxMode('return') });
  }
  if (engineLocked) issues.push({ label: '시동제어 중', detail: String(active?.engineDisabledReason || '원격 시동잠금'), tone: 'gray', go: () => goSec('v-gps') });
  if (pendDeposit) issues.push({ label: '보증금 미정산', detail: '반환/충당 필요', tone: 'amber', go: () => goSec('v-deposit') });

  const pastContracts = contracts.filter((c) => c !== active && !!c.returnedDate)
    .sort((a, b) => String(b.returnedDate || '').localeCompare(String(a.returnedDate || '')));

  return {
    plate,
    focus,
    loading,
    companyId,
    user,
    v,
    contracts,
    insurances,
    penalties,
    history,
    allContracts,
    allVehicles,
    active,
    waiting,
    totalUnpaid,
    d,
    schedule,
    master,
    status,
    statusTone,
    loan,
    loanSum,
    lastReturn,
    idleFrom,
    idleDays,
    loc,
    locStr,
    target,
    workList,
    curIns,
    olderIns,
    econ,
    tax,
    pendDeposit,
    engineLocked,
    cv,
    fleet,
    myNode,
    hist,
    reco,
    issues,
    pastContracts,
    openPen,
    editInfo, setEditInfo,
    form, setForm,
    recMode, setRecMode,
    recForm, setRecForm,
    editIns, setEditIns,
    prodBusy, setProdBusy,
    insForm, setInsForm,
    logOpen, setLogOpen,
    workOpen, setWorkOpen,
    txMode, setTxMode,
    txForm, setTxForm,
    dlvOpen, setDlvOpen,
    dlvForm, setDlvForm,
    loanOpen, setLoanOpen,
    delVehicle,
    commitTx,
    commitDeliver,
    logIgnition,
    settleDeposit,
    chg,
    startEdit,
    cancelEdit,
    saveInfo,
    registerProduct,
    insChg,
    startEditIns,
    saveIns,
    onReplaceReg,
    onReplaceIns,
    saveRecord,
    goSec,
    requireTarget,
    doTransition,
  };
}