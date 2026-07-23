'use client';
import { useEffect, useMemo, useState } from 'react';
import { useIsMobile } from '@/lib/use-mobile';
import { useSession } from '@/lib/session';
import { useEntityLists } from '@/lib/use-entity-lists';
import { useSecOrder } from '@/lib/use-sec-order';
import { type EntityRecord } from '@/lib/intake/entities';
import { generateSchedules, recalcContract } from '@/lib/payments/payment-schedule';
import type { Contract } from '@/lib/payments/types';
import { Sec, Cards, Metric, ObjCard, Stepper, Btn, TextLink, Badge, FormGrid, KV, HiddenSecs, EmptyState, Message, th, thR, td, tdR, won, C, SH, PageLoading, ctrlH, ctrlInputFs, useConfirm, type Step, type KVRow } from '@/components/ui';
import { InfoDoc, type DocReplacePayload } from '@/components/InfoDoc';
import { docHistory, pushDocVersion, latestDoc } from '@/lib/docs';
import { deriveLocation, locationLabel } from '@/lib/vehicle-location';
import { contractSchedules, computeContractView, effectiveEndDate, patchDeliver, patchReturn, patchTerminate, patchExtend, patchEngineLock, earlyTerminationFee, isReturnable, deriveStatus } from '@/lib/contract-ops';
import { canTransition } from '@/lib/domain/status';
import { isCashPurchase } from '@/lib/domain/vehicle-finance';
import { FUEL_LEVELS } from '@/lib/domain/fuel';
import { normPlate } from '@/lib/plate';
import { isComm, matchesContract } from '@/lib/activity-match';
import { linkFleet, handoverHistory, recommendNextRent } from '@/lib/domain/model';
import { loanSchedule, loanSummary } from '@/lib/loan';
import { assetEconomics } from '@/lib/asset-econ';
import { depositView } from '@/lib/deposit';
import { matchDriver, penaltyStatus, penaltyTone } from '@/lib/penalty-reassign';
import { companyLabel } from '@/lib/companies';
import { loadMaster } from '@/lib/company-master';
import { openIngest, openPrintDoc } from '@/lib/ui-bus';
import { toast } from '@/lib/toast';
import { QuickLogForm } from '@/components/QuickLogForm';
import { WorkForm } from '@/components/WorkForm';
import { isWorkRecord, workSummary, workCategoryTone, workStatusTone } from '@/lib/work-ops';
import { saveIntake } from '@/lib/intake';
import { resolveWriteCompany, NEED_COMPANY } from '@/lib/scope';
import { commitUpdate, commitSave, commitRemove } from '@/lib/commit';
import { TODAY, dday } from '@/lib/dashboard-consts';

// 자산상세 섹션 기본 순서 — 현황 → 계약조건→수납스케줄(계약 다음 그 계약의 수납이 바로) → 보증금·관제,
//   사건·이력 중간, 스펙·문서·내부재무(할부) 아래. 드래그로 바꾸면 useSecOrder 저장 · '순서 초기화'로 복원.
const SEC_DEFAULT = ['v-status', 'v-contract', 'v-schedule', 'v-deposit', 'v-gps', 'v-penalty', 'v-work', 'v-history', 'v-handover', 'v-info', 'v-reg', 'v-insurance', 'v-econ', 'v-purchase', 'v-loan'];

// 날짜 표시 = yy-mm-dd (2자리 연도). 2023-11-21 → 23-11-21
const yy = (s: unknown) => { const t = String(s || ''); return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(2, 10) : (t || '—'); };
// 남은 기간 = "1년 2개월 3일 남음/지남" (일수 대신 사람이 읽는 단위)
function remainText(endStr: unknown, today: string): string {
  const e = String(endStr || ''); if (!/^\d{4}-\d{2}-\d{2}/.test(e)) return '—';
  const from = new Date(today + 'T00:00:00'), to = new Date(e.slice(0, 10) + 'T00:00:00');
  const past = to.getTime() < from.getTime();
  const a = past ? to : from, b = past ? from : to;
  let y = b.getFullYear() - a.getFullYear(), m = b.getMonth() - a.getMonth(), dd = b.getDate() - a.getDate();
  if (dd < 0) { m -= 1; dd += new Date(b.getFullYear(), b.getMonth(), 0).getDate(); }
  if (m < 0) { y -= 1; m += 12; }
  const parts: string[] = [];
  if (y) parts.push(`${y}년`); if (m) parts.push(`${m}개월`); if (dd) parts.push(`${dd}일`);
  return `${parts.length ? parts.join(' ') : '0일'} ${past ? '지남' : '남음'}`;
}
function scheduleTone(s: string): 'red' | 'amber' | 'gray' | 'green' {
  return s === '연체' ? 'red' : s === '부분납' ? 'amber' : s === '완료' ? 'green' : 'gray';
}
const fLab: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 };
const fLl: React.CSSProperties = { fontSize: 11, color: C.mute };
// fInp = 컴포넌트 안에서 mobile-aware로 정의(ctrlH/ctrlInputFs) — 모바일 40·폰트16(iOS줌방지)·같은 줄 Btn과 높이 일치.
function unpaidOf(rec: EntityRecord): number {
  const rent = Number(rec.monthlyRent) || 0, term = Number(rec.rentalMonths) || 0, start = String(rec.startDate || '');
  if (!rent || !term || !start) return 0;
  const sch = generateSchedules({ contractDate: start, termMonths: term, monthlyRent: rent, paymentDay: 25 }).map((s) => ({ ...s, id: 's' + s.seq, contractId: 'c' }));
  return recalcContract({ id: 'c', monthlyRent: rent, termMonths: term, status: '운행', schedules: sch } as unknown as Contract, TODAY).unpaidAmount || 0;
}
function lifecycleSteps(v: EntityRecord | null, contracts: EntityRecord[], today: string): Step[] {
  const status = String(v?.status || '');
  const active = contracts.find(isReturnable) || null;   // 운행중(인도완료·미반납) SSOT — /field 반납대상과 동일 집합
  const firstDeliver = String(active?.deliveredDate || active?.startDate || contracts[0]?.startDate || '');
  const lastReturned = contracts.map((c) => String(c.returnedDate || '')).filter(Boolean).sort().slice(-1)[0] || '';
  const sold = String(v?.saleDate || '');
  const extend = Math.max(0, contracts.length - 1);
  let cur = 0;
  if (['매각', '말소', '매각대기'].includes(status) || sold) cur = 3;
  else if (status === '운행' || active) cur = 1;
  else if (lastReturned) cur = 2;
  const st = (i: number): Step['state'] => (i < cur ? 'done' : i === cur ? 'current' : 'todo');
  return [
    { label: '출고', date: firstDeliver || undefined, state: st(0) },
    { label: '운행', date: active ? String(active.startDate || '') : undefined, state: st(1), note: extend > 0 ? `연장·재계약 ${extend}회` : undefined },
    { label: '반납', date: (lastReturned || String(active?.endDate || '')) || undefined, state: st(2) },
    { label: '매각', date: sold || undefined, state: st(3) },
  ];
}
const Add = ({ type, plate, label }: { type: string; plate: string; label: string }) => <Btn variant="ghost" onClick={() => openIngest(type, plate)}>{label}</Btn>;

/** 한 자산(차)의 360 — 카드 언어. 편집=이벤트/담기(수정·추가), 파생은 읽기전용. */
export function Vehicle360({ plate, focus }: { plate: string; focus?: string }) {
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
  const [form, setForm] = useState<EntityRecord>({});
  const [recMode, setRecMode] = useState<'pay' | 'disc' | null>(null);
  const [recForm, setRecForm] = useState({ seq: '1', date: TODAY, amount: '', method: '계좌', reason: '기타' });
  const [editIns, setEditIns] = useState(false);          // 보험(증권) 인라인 편집
  const [insForm, setInsForm] = useState<EntityRecord>({});
  const [logOpen, setLogOpen] = useState(false);          // 빠른 기록 — 그 자리에서 인라인 펼침(팝업 X)
  const [workOpen, setWorkOpen] = useState(false);        // 수선/작업 — 그 자리에서 인라인 펼침(팝업 X)
  // 상태전이(반납·연장·해지) — 버튼 클릭 시 즉시 처리 X, 아래로 인라인 확장해 상세 입력·확인 후 확정
  const [txMode, setTxMode] = useState<'return' | 'extend' | 'terminate' | null>(null);
  const [txForm, setTxForm] = useState({ date: TODAY, mileage: '', fuel: FUEL_LEVELS[0] as string, settleNote: '', months: '1', reason: '고객요청', penaltyNote: '' });
  const [dlvOpen, setDlvOpen] = useState(false); // 출고(인도) 캡처 패널
  const [dlvForm, setDlvForm] = useState({ date: TODAY, mileage: '', fuel: FUEL_LEVELS[0] as string });
  // 섹션 순서 — 사용자가 접힌 섹션을 드래그해 재정렬(저장) · resetSec로 기본순서 복원.
  const [secOrder, reorderSec, resetSec] = useSecOrder('jpk:order:vehicle360', SEC_DEFAULT);
  const secOrd = (id: string) => secOrder.indexOf(id);
  const mobile = useIsMobile();
  // 인라인 폼 입력 규격 — CTRL SSOT(모바일 40·폰트16 iOS줌방지). fInp는 손롤이지만 사이즈는 원자 헬퍼로 준수.
  const fInp: React.CSSProperties = { height: ctrlH(mobile), boxSizing: 'border-box', padding: '0 10px', border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', fontSize: ctrlInputFs(mobile), background: C.card, color: C.ink, fontFamily: 'inherit' };

  // 앱바 '수정' 버튼(openEdit) → 그 자리에서 차량정보 인라인 편집 진입
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

  // 손바꿈·재렌트 — loading 게이트 전에 hooks 고정(Rules of Hooks).
  const fleet = useMemo(() => linkFleet(allVehicles, allContracts, TODAY), [allVehicles, allContracts]);
  const myNode = fleet.byPlate.get(normPlate(plate)) || null;
  const hist = handoverHistory(myNode?.contracts ?? []);
  const reco = myNode ? recommendNextRent(myNode, fleet.vehicles) : null;

  if (loading) return <PageLoading />;

  const active = contracts.find(isReturnable) || null;   // 운행중(인도완료·미반납) SSOT — /field 반납대상·overdue 반납 처리 노출
  const totalUnpaid = contracts.reduce((s, c) => s + computeContractView(c, TODAY).net, 0);
  const d = active ? dday(effectiveEndDate(active)) : null;
  const schedule = active ? contractSchedules(active, TODAY) : []; // 계약중 → 회차별 수납스케줄
  const master = v ? loadMaster(String(v.companyId || '')) : {}; // 법인 마스터(법인번호·소재지)
  // 차량 소프트삭제 — 잘못 등록한 차. 매각·처분은 삭제 아니라 상태. store.remove(deletedAt)→/trash 복구.
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
  // 대기(비운행) 차량용 — 얼마나 놀았나·최종 반납·위치
  const lastReturn = contracts.filter((c) => c.returnedDate).map((c) => String(c.returnedDate)).sort().slice(-1)[0] || '';
  const idleFrom = (lastReturn || String(v?.acquisitionDate || v?.firstReg || '')).slice(0, 10);
  const idleDays = /^\d{4}-\d{2}-\d{2}/.test(idleFrom) ? Math.max(0, Math.round((new Date(TODAY).getTime() - new Date(idleFrom).getTime()) / 86400000)) : null;
  // 위치(현재 소재) 통일 — 대여중=계약자, 유휴=최근 '이동' 로그/차상태. /asset 표기와 동일 규칙.
  const loc = deriveLocation(v, contracts, history, TODAY);
  const locStr = locationLabel(loc);
  const target = resolveWriteCompany(companyId, v) || resolveWriteCompany(companyId, active) || '';
  const requireTarget = (): string | null => {
    const t = resolveWriteCompany(companyId, v) || resolveWriteCompany(companyId, active);
    if (!t) { toast(NEED_COMPANY, 'error'); return null; }
    return t;
  };
  // 수선(정비·사고수리·상품화·세차) = history(_kind:'work'). 목록은 이미 최신순 정렬된 history에서 추림.
  const workList = history.filter(isWorkRecord);
  // 현재 보험(증권) = 만기 최신 1건. 나머지는 '이전 증권'으로.
  const curIns = insurances.slice().sort((a, b) => String(b.endDate || '').localeCompare(String(a.endDate || '')))[0] || null;
  const olderIns = curIns ? insurances.filter((i) => i !== curIns) : [];
  // 자산 손익 — 이 차가 벌어온 돈 vs 비용(감가·보험·정비). 운영 지표(재무제표 아님).
  const econ = v ? assetEconomics(v, contracts, insurances, history, TODAY) : null;
  // 보증금 미반환 — 종료됐는데 정산 안 된 계약(가장 최근 것). 반환/충당 처리 대상.
  const pendDeposit = contracts.map((c) => ({ c, d: depositView(c, TODAY) })).filter((x) => x.d.pendingRefund)
    .sort((a, b) => String(b.c.returnedDate || '').localeCompare(String(a.c.returnedDate || '')))[0] || null;
  const waiting = !active ? (contracts.find((cc) => !cc.returnedDate && String(cc.status || '') !== '운행') || null) : null;
  const doTransition = async (patch: EntityRecord, key: string, rec: EntityRecord) => {
    if (!key) return;
    try {
      await commitUpdate({ entity: 'contract', sessionCompanyId: companyId, rec, key, patch });
    } catch { toast(NEED_COMPANY, 'error'); }
  };
  // 반납/연장/해지 확정 — 인라인 폼 입력값으로 패치 조립 후 커밋. 완료 시 패널 닫고 이력·현황에 반영.
  const commitTx = async () => {
    if (!active?._key) return; const key = String(active._key);
    if (txMode && !canTransition(deriveStatus(active), txMode)) { toast(`${deriveStatus(active)} 상태에선 ${txMode === 'return' ? '반납' : txMode === 'extend' ? '연장' : '해지'}할 수 없습니다`, 'error'); return; }
    if (txMode === 'return') {
      await doTransition(patchReturn(active, txForm.date, { returnMileage: txForm.mileage ? Number(txForm.mileage) : '', fuelIn: txForm.fuel, returnSettleNote: txForm.settleNote }), key, active);
    } else if (txMode === 'extend') {
      const m = Number(txForm.months); if (!m || m <= 0) return;
      await doTransition(patchExtend(active, m), key, active);
    } else if (txMode === 'terminate') {
      const et = earlyTerminationFee(active, txForm.date);
      await doTransition(patchTerminate(active, txForm.date, { terminateReason: txForm.reason, terminatePenaltyNote: txForm.penaltyNote, earlyTerminationFee: et.fee, earlyTerminationRemainingMonths: et.remainingMonths }), key, active);
    }
    setTxMode(null);
  };
  // 인도(출고) 확정 — 반납과 대칭: 출고 시점 주행거리·연료(원점) 캡처 + 인도 활동 이벤트 기록 + 상태 운행 전이.
  const commitDeliver = async () => {
    if (!waiting?._key) return; const key = String(waiting._key);
    if (!canTransition(deriveStatus(waiting), 'deliver')) { toast('인도할 수 있는 상태가 아닙니다', 'error'); return; }
    const t = requireTarget(); if (!t) return;
    await doTransition(patchDeliver(waiting, dlvForm.date, { mileageOut: dlvForm.mileage ? Number(dlvForm.mileage) : '', fuelOut: dlvForm.fuel }), key, waiting);
    await saveIntake('history', t, [{ plate, category: '인도', title: `출고(인도)${dlvForm.mileage ? ' · ' + dlvForm.mileage + 'km' : ''} · 연료 ${dlvForm.fuel}`, date: dlvForm.date, author: user.name, customer: String(waiting.contractorName || ''), contractNo: String(waiting.contractNo || ''), companyId: t, _kind: 'activity' }], { notify: false });
    setDlvOpen(false);
  };
  // 시동제어 — contract.engineDisabled 정본(SSOT). gpsControl=장비 능력(가능/불가)만.
  const engineLocked = !!active?.engineDisabled;
  const logIgnition = async (action: '제어' | '해제') => {
    if (!active?._key) { toast('운행중 계약이 없어 시동제어할 수 없습니다', 'info'); return; }
    const t = requireTarget(); if (!t) return;
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
  // 보증금 반환/충당 처리 — 정산완료 도장(depositSettledDate) + 이력 기록
  const settleDeposit = async () => {
    if (!pendDeposit?.c._key) return;
    const t = requireTarget(); if (!t) return;
    const { d } = pendDeposit;
    await doTransition({ depositSettledDate: TODAY }, String(pendDeposit.c._key), pendDeposit.c);
    await saveIntake('history', t, [{ plate, category: '보증금', title: d.addCharge > 0 ? `보증금 충당 후 추가청구 ${won(d.addCharge)}` : `보증금 반환 ${won(d.refund)}`, date: TODAY, author: user.name, companyId: t, _kind: 'activity' }], { notify: false });
  };
  // 차량정보(제조사·등록증·매입할부) 공유 인라인 편집
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
  // 보험(증권) 인라인 편집
  const insChg = (k: string, val: string) => setInsForm((f) => ({ ...f, [k]: val }));
  const startEditIns = () => { setInsForm({ ...(curIns || {}) }); setEditIns(true); };
  const saveIns = async () => {
    try {
      if (curIns?._key) await commitUpdate({ entity: 'insurance', sessionCompanyId: companyId, rec: curIns, key: String(curIns._key), patch: insForm });
      else await commitSave({ entity: 'insurance', sessionCompanyId: companyId, rec: v || curIns, records: [{ ...insForm, plate }] });
      setEditIns(false);
    } catch { toast(NEED_COMPANY, 'error'); }
  };
  // 서류 교체·재발급 — 파일 URL + OCR 병합 + 새 DocVersion 푸시 → 엔티티 저장. _ocrOriginal 보존.
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
      setRecMode(null); setRecForm((r) => ({ ...r, amount: '' }));
    } catch { toast(NEED_COMPANY, 'error'); }
  };

  // ── 미결·리스크 요약 (누적 데이터와 별개로, "지금 문제"만 위로) — 칩 클릭 = 진단→처리(해당 섹션/액션으로 이동) ──
  const cv = active ? computeContractView(active, TODAY) : null;
  const goSec = (id: string) => window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
  const issues: { label: string; detail: string; tone: 'red' | 'amber' | 'gray'; go?: () => void }[] = [];
  if (totalUnpaid > 0) issues.push({ label: '미수', detail: `${won(totalUnpaid)}${cv && cv.overdueDays > 0 ? ` · ${cv.overdueDays}일 연체` : ''}`, tone: cv && cv.overdueDays >= 30 ? 'red' : 'amber', go: active ? () => { setRecMode('pay'); goSec('v-schedule'); } : undefined });
  const openPen = penalties.filter((p) => penaltyStatus(p) !== '변경부과완료'); // 변경부과완료=처리됨, 그 외=미처리
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

  return (
    <div>
      {/* 차량번호는 DetailShell title(모바일=상단바·웹=h1). 여기는 상태·법인·핵심수치만. */}
      {/* 헤더 = 상태 배지 + 법인만. 미수·반납지남은 아래 미결·리스크 칩(정본)·현황으로 위임(중복 제거). */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Badge tone={statusTone}>{status}</Badge>
        {v?.companyId ? <span style={{ fontSize: 12.5, color: C.faint }}>{companyLabel(String(v.companyId))}</span> : null}
      </div>

      {/* 미결·리스크 — "지금 문제"만 맨 위(관리 by exception). 칩 클릭 = 해당 섹션/처리로 이동. 무박스(칩 흐름). */}
      {issues.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
            <span className="attn-dot" />
            <span style={{ fontSize: 12.5, fontWeight: 800, color: C.ink }}>미결 · 리스크</span>
            <span style={{ fontSize: 12, color: C.faint }}>{issues.length}건</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {issues.map((it, i) => (
              <button key={i} type="button" onClick={it.go} disabled={!it.go} title={it.go ? '눌러서 처리로 이동' : undefined}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: 'none', background: 'transparent', padding: '4px 4px', cursor: it.go ? 'pointer' : 'default', WebkitTapHighlightColor: 'transparent' }}>
                <Badge tone={it.tone === 'red' ? 'red' : it.tone === 'amber' ? 'amber' : 'gray'}>{it.label}</Badge>
                <span style={{ fontSize: 12, color: C.mute }}>{it.detail}</span>
                {it.go && <span style={{ fontSize: 12.5, color: C.faint, fontWeight: 700 }}>›</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 상태 전이 액션 — 클릭 시 즉시처리 X, 아래로 인라인 확장해 상세 입력·확인 후 확정. "어떻게 반납/연장됐는지" */}
      {active ? <>
        <div style={{ display: 'flex', gap: 6, marginBottom: txMode ? 8 : 14, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* 반납 = 이 화면 최다 액션 → primary(solid) 고정. 다른 모드 진입 시에만 dim. 중도해지=드묾·되돌리기 어려움 → 우측 분리·선택 시 danger */}
          <span className={focus === 'return' ? 'attn-btn' : undefined}><Btn variant={txMode === 'return' ? 'solid' : txMode ? 'ghost' : 'solid'} onClick={() => setTxMode(txMode === 'return' ? null : 'return')}>반납 처리</Btn></span>
          <Btn variant={txMode === 'extend' ? 'solid' : 'ghost'} onClick={() => setTxMode(txMode === 'extend' ? null : 'extend')}>연장</Btn>
          <span style={{ flex: 1 }} />
          <Btn variant={txMode === 'terminate' ? 'danger' : 'ghost'} onClick={() => setTxMode(txMode === 'terminate' ? null : 'terminate')}>중도해지</Btn>
        </div>
        {txMode && <div style={{ padding: 12, border: `1px solid ${C.accent}`, borderRadius: 'var(--radius)', background: 'var(--bg-card)', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{txMode === 'return' ? '반납 처리' : txMode === 'extend' ? '연장 처리' : '중도해지'}</span>
            <span style={{ flex: 1 }} />
            <Btn size="sm" variant="ghost" onClick={() => setTxMode(null)}>닫기</Btn>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {txMode === 'return' && <>
              <label style={fLab}><span style={fLl}>반납일</span><input type="date" value={txForm.date} onChange={(e) => setTxForm((f) => ({ ...f, date: e.target.value }))} style={fInp} /></label>
              <label style={fLab}><span style={fLl}>주행거리(km)</span><input inputMode="numeric" value={txForm.mileage} onChange={(e) => setTxForm((f) => ({ ...f, mileage: e.target.value.replace(/[^\d]/g, '') }))} placeholder="예: 45000" style={{ ...fInp, width: 110 }} /></label>
              <label style={fLab}><span style={fLl}>연료</span><select value={txForm.fuel} onChange={(e) => setTxForm((f) => ({ ...f, fuel: e.target.value }))} style={fInp}>{FUEL_LEVELS.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
              <label style={{ ...fLab, flex: 1, minWidth: 170 }}><span style={fLl}>정산 메모(연체·손상·환급 등)</span><input value={txForm.settleNote} onChange={(e) => setTxForm((f) => ({ ...f, settleNote: e.target.value }))} placeholder="예: 스크래치 2건, 미납 1회차 정산" style={fInp} /></label>
              {reco ? <div style={{ flexBasis: '100%', fontSize: 12, color: C.mute, paddingTop: 2 }}>반납 후 다음 임차인 추천 대여료 <b style={{ color: C.ink, fontFamily: 'var(--font-mono)' }}>{won(reco.recommended)}</b> <span style={{ color: C.faint }}>(현재 {won(reco.currentRent)} · 함대 손바뀜 {reco.dropPct}%↓ · 밴드 {won(reco.low)}~{won(reco.high)})</span></div> : null}
            </>}
            {txMode === 'extend' && <>
              <label style={fLab}><span style={fLl}>연장 개월</span><input inputMode="numeric" value={txForm.months} onChange={(e) => setTxForm((f) => ({ ...f, months: e.target.value.replace(/[^\d]/g, '') }))} style={{ ...fInp, width: 80 }} /></label>
              <div style={{ fontSize: 12.5, color: C.mute, paddingBottom: 7 }}>종료일 <b style={{ color: C.faint }}>{yy(active.endDate)}</b> → <b style={{ color: C.ink }}>{yy(patchExtend(active, Number(txForm.months) || 0).endDate)}</b><span style={{ marginLeft: 8, color: C.faint }}>총 {(Number(active.rentalMonths) || 0) + (Number(txForm.months) || 0)}개월</span></div>
            </>}
            {txMode === 'terminate' && <>
              <label style={fLab}><span style={fLl}>해지일</span><input type="date" value={txForm.date} onChange={(e) => setTxForm((f) => ({ ...f, date: e.target.value }))} style={fInp} /></label>
              <label style={fLab}><span style={fLl}>사유</span><select value={txForm.reason} onChange={(e) => setTxForm((f) => ({ ...f, reason: e.target.value }))} style={fInp}>{['고객요청', '연체', '차량회수', '사고전손', '기타'].map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
              <label style={{ ...fLab, flex: 1, minWidth: 170 }}><span style={fLl}>정산 메모</span><input value={txForm.penaltyNote} onChange={(e) => setTxForm((f) => ({ ...f, penaltyNote: e.target.value }))} placeholder="예: 손상·미납 정산" style={fInp} /></label>
              {(() => { const et = earlyTerminationFee(active, txForm.date); return (
                <div style={{ flexBasis: '100%', fontSize: 12.5, color: C.mute, paddingTop: 2 }}>중도해지 위약금 {et.isEarly ? <>잔여 <b style={{ color: C.ink }}>{et.remainingMonths}개월</b> × 월 {won(et.monthlyRent)} × <b style={{ color: C.ink }}>{et.rate}%</b> = <b style={{ color: et.fee > 0 ? C.danger : C.ink, fontFamily: 'var(--font-mono)' }}>{won(et.fee)}</b></> : <b style={{ color: C.ink }}>만기 도래 · 위약금 없음</b>}{!active.earlyTerminationRate ? <span style={{ marginLeft: 8, color: C.faint }}>(요율 미설정 — 계약조건에서 입력)</span> : null}</div>
              ); })()}
            </>}
            <Btn variant={txMode === 'terminate' ? 'danger' : 'solid'} onClick={commitTx}>{txMode === 'return' ? '반납 확정' : txMode === 'extend' ? '연장 확정' : '해지 확정'}</Btn>
          </div>
        </div>}
      </> : waiting ? <div style={{ marginBottom: 14 }}>
        {!dlvOpen
          ? <Btn onClick={() => setDlvOpen(true)}>인도(출고) 처리</Btn>
          : <div style={{ padding: 12, border: `1px solid ${C.accent}`, borderRadius: 'var(--radius)', background: 'var(--bg-card)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>인도(출고) 처리</span>
                <span style={{ fontSize: 11.5, color: C.faint }}>출고 시점 원점 — 반납 정산·손상판정의 기준</span>
                <span style={{ flex: 1 }} />
                <Btn size="sm" variant="ghost" onClick={() => setDlvOpen(false)}>닫기</Btn>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label style={fLab}><span style={fLl}>인도일</span><input type="date" value={dlvForm.date} onChange={(e) => setDlvForm((f) => ({ ...f, date: e.target.value }))} style={fInp} /></label>
                <label style={fLab}><span style={fLl}>출고 주행거리(km)</span><input inputMode="numeric" value={dlvForm.mileage} onChange={(e) => setDlvForm((f) => ({ ...f, mileage: e.target.value.replace(/[^\d]/g, '') }))} placeholder="계기판 km" style={{ ...fInp, width: 120 }} /></label>
                <label style={fLab}><span style={fLl}>출고 연료</span><select value={dlvForm.fuel} onChange={(e) => setDlvForm((f) => ({ ...f, fuel: e.target.value }))} style={fInp}>{FUEL_LEVELS.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
                <Btn onClick={commitDeliver}>인도 확정</Btn>
              </div>
            </div>}
      </div> : null}

      {/* 생애주기 Stepper 제거 — 상태는 헤딩 배지 하나로 충분(중복 제거) */}

      {/* ── 섹션 영역: 순서 = useSecOrder(flex order). 접힌 섹션 드래그로 재정렬 · 하단 '순서 초기화' ── */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* 기본정보 편집 세션 = 하나 — 차량정보·등록증·매입할부가 editInfo/saveInfo 공유. 저장/취소는 이 배너 1벌로 통일(중복 방지). */}
      {editInfo && (
        <div style={{ order: -2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12, padding: '9px 12px', border: `1px solid ${C.accent}`, borderRadius: 'var(--radius)', background: 'var(--bg-card)' }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: C.ink }}>기본정보 편집 중</span>
          <span style={{ fontSize: 11.5, color: C.mute }}>차량정보 · 등록증 · 매입/할부를 함께 저장합니다</span>
          <span style={{ flex: 1 }} />
          <Btn onClick={saveInfo}>저장</Btn>
          <Btn variant="ghost" onClick={cancelEdit}>취소</Btn>
        </div>
      )}
      {/* 현황 = 한눈 요약(읽기전용 파생). 대여 중이면 계약자·기간·대여료·보증금·반납까지 */}
      <Sec id="v-status" title="현황" desc="한눈 요약" order={secOrd('v-status')} onReorder={reorderSec}>
        <Cards min={128} fit>
          {/* 상태=헤더 배지 · 계약시작/기간/월대여료/보증금=계약조건 섹션 정본 → 현황은 '지금 급한 것'만 (중복 제거). */}
          {active ? <>
            <Metric label="계약자" value={String(active.contractorName || '—')} />
            <Metric label="반납예정" value={remainText(effectiveEndDate(active), TODAY)} tone={d != null && d < 0 ? 'danger' : d != null && d <= 7 ? 'warn' : 'ink'} />
            <Metric label="미수" value={won(totalUnpaid)} tone={totalUnpaid > 0 ? 'danger' : 'ink'} />
          </> : <>
            <Metric label="위치" value={locStr} tone={loc.work === '정비' || loc.work === '사고' ? 'warn' : 'ink'} />
            <Metric label="대기 일수" value={idleDays != null ? `${idleDays}일` : '—'} tone={idleDays != null && idleDays > 180 ? 'danger' : idleDays != null && idleDays > 60 ? 'warn' : 'ink'} />
            <Metric label="최종 반납" value={lastReturn ? yy(lastReturn) : '—'} />
            {v?.inspectionTo ? <Metric label="검사만기" value={yy(v.inspectionTo)} tone={(() => { const id = dday(v.inspectionTo); return id != null && id < 0 ? 'danger' : id != null && id <= 30 ? 'warn' : 'ink'; })()} /> : null}
            {totalUnpaid > 0 ? <Metric label="미수(과거 채권)" value={won(totalUnpaid)} tone="danger" /> : null}
          </>}
        </Cards>
      </Sec>

      {!v && <div style={{ marginTop: 12, order: -1 }}><Message variant="warning">등록증이 아직 안 들어왔습니다. 계약·보험·과태료만 표시. <b>정보 담기</b>로 등록하세요.</Message></div>}

      {/* 차량 정보 = 제조사 스펙(등록증에 없음 · 직접입력/차종마스터). 인라인 수정(값칸만). */}
      <Sec id="v-info" order={secOrd('v-info')} onReorder={reorderSec} title={editInfo ? '차량 정보 · 편집 중' : '차량 정보'} tone={editInfo ? 'ok' : undefined} desc="제조사 스펙 · 직접입력" right={
        editInfo
          ? <span style={{ fontSize: 11.5, color: C.faint }}>함께 편집 중</span>
          : <Btn variant="ghost" onClick={startEdit}>{v ? '수정' : '+ 등록'}</Btn>
      }>
        {(v || editInfo)
          ? <KV editing={editInfo} form={form} onChange={chg} rows={[
              ['제조사', 'maker', String(v?.maker ?? '')],
              ['차명', 'carName', String(v?.carName ?? '')],
              ['차종', 'vehicleType', String(v?.vehicleType ?? '')],
              ['배기량', 'displacement', String(v?.displacement ?? '')],
              ['연료', 'fuel', String(v?.fuel ?? '')],
            ] as KVRow[]} />
          : <EmptyState variant="sec">차량 미등록</EmptyState>}
      </Sec>

      {/* 등록증 = 정보 + 자동차등록증 원본 + 재발급 이력(InfoDoc). 인라인 수정은 차량정보와 공유. */}
      <InfoDoc id="v-reg" order={secOrd('v-reg')} title="등록증" desc="자동차등록증 원본과 한 몸"
        editing={editInfo} hideSaveCancel form={form} onChange={chg}
        onEditToggle={() => (editInfo ? cancelEdit() : startEdit())} onSave={saveInfo}
        docType="vehicle" docLabel="자동차등록증" docs={docHistory(v, 'vehicle')}
        companyId={target} recordKey={plate} onReplaceDoc={onReplaceReg}
        fields={[
          ['차량번호', null, plate],
          ['차대번호', 'vin', String(v?.vin ?? '')],
          ['최초등록', 'firstReg', String(v?.firstReg ?? '')],
          ['검사만기', 'inspectionTo', String(v?.inspectionTo ?? '')],
          ['법인번호', null, String(master.bizNo ?? '')],
        ] as KVRow[]} />

      {/* 보험 = 정보 + 증권 원본 + 재발급 이력(InfoDoc). 차량정보와 별도 섹션·별도 편집. */}
      <InfoDoc id="v-insurance" order={secOrd('v-insurance')} title="보험" desc={curIns ? `${String(curIns.insurer || '')} ${String(curIns.policyNo || '')}`.trim() || '자동차보험 증권' : '자동차보험 증권'}
        editing={editIns} form={insForm} onChange={insChg}
        onEditToggle={() => (editIns ? setEditIns(false) : startEditIns())} onSave={saveIns}
        docType="insurance" docLabel="자동차보험증권" docs={docHistory(curIns, 'insurance')}
        companyId={target} recordKey={String(curIns?._key || curIns?.policyNo || '')} onReplaceDoc={onReplaceIns}
        fields={[
          ['보험사', 'insurer', String(curIns?.insurer ?? '')],
          ['증권번호', 'policyNo', String(curIns?.policyNo ?? '')],
          ['시작일', 'startDate', String(curIns?.startDate ?? '')],
          ['만기일', 'endDate', String(curIns?.endDate ?? '')],
          ['운전범위', 'driverScope', String(curIns?.driverScope ?? '')],
          ['물적할증(만원)', 'deductibleMan', String(curIns?.deductibleMan ?? '')],
        ] as KVRow[]} />
      {curIns ? (() => {
        const covs: [string, string][] = ([
          ['대인Ⅰ', curIns.cov_personal_1], ['대인Ⅱ', curIns.cov_personal_2], ['대물', curIns.cov_property],
          ['자손/자상', curIns.cov_self_accident], ['무보험', curIns.cov_uninsured], ['자차', curIns.cov_self_vehicle], ['긴급출동', curIns.cov_emergency],
        ] as [string, unknown][]).map(([l, v]) => [l, String(v ?? '')] as [string, string]).filter(([, v]) => v);
        return covs.length ? <div style={{ marginTop: 10, padding: '10px 12px', border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', background: 'var(--bg-card)', order: secOrd('v-insurance') }}>
          <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 7, fontWeight: 700 }}>가입담보 · 보상한도</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '5px 14px' }}>
            {covs.map(([l, v]) => <div key={l} style={{ display: 'flex', gap: 6, fontSize: 12, minWidth: 0 }}><span style={{ color: C.mute, flex: '0 0 70px' }}>{l}</span><span style={{ color: C.ink, flex: 1, minWidth: 0 }}>{v}</span></div>)}
          </div>
        </div> : null;
      })() : null}
      {olderIns.length > 0 ? <div style={{ marginTop: 10, order: secOrd('v-insurance') }}>
        <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 6 }}>이전 증권 ({olderIns.length})</div>
        <Cards min={340}>{olderIns.map((ins, i) => { const id = dday(ins.endDate); return <ObjCard key={i} badge="이전" badgeTone="gray" name={String(ins.insurer || '보험')} carType={ins.policyNo ? String(ins.policyNo) : undefined} right={id == null ? undefined : <span style={{ color: C.faint }}>{id < 0 ? `만료 ${-id}일` : `D-${id}`}</span>} fields={[['기간', `${ins.startDate || ''}~${ins.endDate || ''}`], ['보험료', ins.totalPremium ? won(ins.totalPremium) : '—']]} />; })}</Cards>
      </div> : null}

      {/* 매입 · 할부 = 자산 취득/부채측(직접입력). 인라인 수정은 차량정보와 공유. */}
      {(v || editInfo) ? <Sec id="v-purchase" order={secOrd('v-purchase')} onReorder={reorderSec} title="매입 · 할부" desc="취득가·매입처·할부" tone={editInfo ? 'ok' : undefined} right={
        editInfo
          ? <span style={{ fontSize: 11.5, color: C.faint }}>함께 편집 중</span>
          : <Btn variant="ghost" onClick={startEdit}>수정</Btn>
      }>
        <KV editing={editInfo} form={form} onChange={chg} rows={[
          ['매입가', 'acquisitionPrice', v?.acquisitionPrice ? won(v.acquisitionPrice) : ''],
          ['매입처', 'supplier', String(v?.supplier ?? '')],
          ['할부/리스사', 'loanCompany', String(v?.loanCompany ?? '')],
          ['잔여원금', 'loanRemainingPrincipal', v?.loanRemainingPrincipal ? won(v.loanRemainingPrincipal) : ''],
        ] as KVRow[]} />
      </Sec> : null}

      {/* 자산 손익 — 이 차가 벌어온 돈 vs 비용. 매입·할부처럼 조용한 행 리스트(재무 대시보드화 금지). */}
      {econ ? <Sec id="v-econ" order={secOrd('v-econ')} onReorder={reorderSec} title="자산 손익" desc="이 차가 벌어온 돈 · 회수율">
        <KV rows={[
          ['수입(수금)', '', won(econ.revenue)],
          ['감가', '', won(econ.depreciation)],
          ['보험료', '', won(econ.insuranceCost)],
          ['정비·수리', '', won(econ.maintCost)],
          ['손익', '', won(econ.profit)],
          ...(econ.acquisition ? ([['회수율', '', `${Math.round(econ.recoveryRate * 100)}%`]] as KVRow[]) : []),
          ...(econ.bookValue != null ? ([['장부가', '', won(econ.bookValue)]] as KVRow[]) : []),
        ] as KVRow[]} />
      </Sec> : null}

      {/* 할부 상환 스케줄 — 차량 매입 부채측(원리금균등) */}
      {loan.length > 0 ? <Sec id="v-loan" order={secOrd('v-loan')} onReorder={reorderSec} title="할부 상환 스케줄" n={loan.length} desc={`${String(v?.loanCompany || '')} · 월 ${won(loanSum?.monthlyPayment || 0)} · 잔여원금 ${won(loanSum?.remainPrincipal || 0)} · 남은 ${loanSum?.remainSeq || 0}회`}>
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', overflow: 'hidden', background: C.card }}>
          <div style={{ maxHeight: 400, overflowY: 'auto', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
              <thead><tr><th style={th}>회차</th><th style={th}>상환일</th><th style={thR}>원금</th><th style={thR}>이자</th><th style={thR}>상환액</th><th style={thR}>잔액</th></tr></thead>
              <tbody>{loan.map((l) => <tr key={l.seq} style={{ background: loanSum && l.seq <= loanSum.paidSeq ? 'var(--bg-stripe)' : undefined }}>
                <td style={td}>{l.seq}</td><td style={td}>{l.date}</td><td style={tdR}>{won(l.principal)}</td><td style={tdR}>{won(l.interest)}</td><td style={tdR}>{won(l.payment)}</td><td style={tdR}>{won(l.balance)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </div>
      </Sec> : null}

      {/* GPS · 관제 (시동제어 연동) */}
      {v && (v.gpsDeviceId || v.gpsProvider) ? <Sec id="v-gps" order={secOrd('v-gps')} onReorder={reorderSec} title="GPS · 관제" desc="미납 원격 시동제어 연동" right={active ? <span style={{ display: 'inline-flex', gap: 6 }}><Btn variant="danger" onClick={() => logIgnition('제어')} disabled={engineLocked}>시동 제어</Btn><Btn variant="ghost" onClick={() => logIgnition('해제')} disabled={!engineLocked}>시동 해제</Btn></span> : null}>
        <KV rows={[
          ['공급사', null, String(v.gpsProvider ?? '')],
          ['단말번호', null, String(v.gpsDeviceId ?? '')],
          ['설치일', null, String(v.gpsInstalledDate ?? '')],
          ['장비 시동제어', null, String(v.gpsControl ?? '—')],
          ['계약 시동제어', null, engineLocked ? `적용중 (${String(active?.engineDisabledAt || '').slice(0, 10)})` : '—'],
        ] as [string, string | null, React.ReactNode][]} />
      </Sec> : null}

      {/* 계약 조건 — 계약서상 조건(어떤 조건으로 나갔는지). 미수는 아래 수납스케줄. */}
      <Sec id="v-contract" order={secOrd('v-contract')} onReorder={reorderSec} title="계약 조건" desc="계약서상 조건" right={active ? <span style={{ display: 'inline-flex', gap: 6 }}><Btn variant="ghost" onClick={() => openPrintDoc('contract', plate)}>계약서 출력</Btn><Add type="contract" plate={plate} label="수정" /></span> : <Add type="contract" plate={plate} label="+ 계약" />}>
        {active ? <KV rows={[
          ['계약번호', null, String(active.contractNo ?? '')],
          ['임차인', null, `${String(active.contractorName ?? '')}${active.contractorPhone ? ' · ' + String(active.contractorPhone) : ''}`],
          ['면허', null, `${String(active.contractorLicenseNo ?? '')}${active.licenseType ? ' (' + String(active.licenseType) + ')' : ''}`],
          ['추가운전자', null, String(active.additionalDrivers ?? '')],
          ['계약기간', null, `${active.startDate || ''} ~ ${effectiveEndDate(active) || '미정'}${active.rentalMonths ? `  (${active.rentalMonths}개월)` : ''}`],
          ['인수/반환장소', null, `${String(active.pickupPlace ?? '')}${active.returnPlace ? ' → ' + String(active.returnPlace) : ''}`],
          ['월 대여료', null, active.monthlyRent ? won(active.monthlyRent) : ''],
          ['자동이체일', null, active.paymentDay ? `매월 ${active.paymentDay}일${active.paymentTiming ? ` (${active.paymentTiming})` : ''}` : ''],
          ['보증금 / 예약금', null, `${active.deposit ? won(active.deposit) : '—'}${active.reservationFee ? ' / ' + won(active.reservationFee) : ''}`],
          ['자차보험(CDW)', null, `${String(active.cdw ?? '')}${active.deductible ? ' · 면책 ' + won(active.deductible) : ''}${active.superCover === '있음' ? ' · 완전면책' : ''}`],
          ['지연손해금율', null, active.lateFeeRate ? `${active.lateFeeRate}%` : ''],
          ['중도해지 위약금율', null, active.earlyTerminationRate ? `${active.earlyTerminationRate}%` : ''],
          ['기사포함', null, String(active.withDriver ?? '')],
          ['연료(인수→반납)', null, (active.fuelOut || active.fuelIn) ? `${active.fuelOut || '?'} → ${active.fuelIn || '?'}` : ''],
          ['주행거리(출고→반납)', null, (active.mileageOut || active.returnMileage) ? `${active.mileageOut || '?'} → ${active.returnMileage || '?'} km` : ''],
        ] as [string, string | null, React.ReactNode][]} /> : <EmptyState variant="sec">진행 중 계약 없음</EmptyState>}
        {active && (() => {
          const hd = docHistory(active, 'handover');   // 현장 인도·반납 위저드가 첨부한 출차/입고 사진·서명(분쟁 물증)
          return hd.length ? (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: C.mute, marginBottom: 6 }}>인도·반납 증거 (사진·서명)</div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {hd.map((d, i) => d.url ? (
                  <Btn key={i} size="sm" variant="ghost" onClick={() => window.open(d.url, '_blank')}>
                    {d.reason || '인도 증거'} · {String(d.uploadedAt || '').slice(0, 10)} 열기
                  </Btn>
                ) : null)}
              </div>
            </div>
          ) : null;
        })()}
      </Sec>

      {/* 손바뀜 이력 · 재렌트 추천 — 계약이력 SSOT(linkFleet). 손이 바뀔수록 대여료↓. 반납/유휴 차는 다음 대여료 추천(함대 손바뀜 인하율 시뮬레이션). */}
      {hist.count > 0 ? <Sec id="v-handover" order={secOrd('v-handover')} onReorder={reorderSec} title="손바뀜 이력" n={hist.count}
        desc={hist.count >= 2 ? `${hist.count}손 · 첫 ${won(hist.firstRent)} → 현재 ${won(hist.lastRent)}${hist.totalDropPct > 0 ? ` · 누적 ${hist.totalDropPct}%↓` : ''}` : '첫 대여 · 손바뀜 없음'}
        right={hist.count > 1 ? <a href={`/contract-history?plate=${encodeURIComponent(plate)}`} style={{ fontSize: 11.5, color: C.accent, fontWeight: 700, textDecoration: 'none' }}>계약이력 →</a> : undefined}>
        {/* 반납/유휴 차 → 다음 임차인 적정 대여료 추천 (시뮬레이션 데이터 활용) */}
        {!active && reco ? <div style={{ marginBottom: 12, padding: '12px 14px', border: `1px solid ${C.accent}`, borderRadius: 'var(--radius)', background: 'var(--bg-card)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: C.accent, letterSpacing: '0.02em' }}>재렌트 추천</span>
            <span style={{ fontSize: 21, fontWeight: 800, color: C.ink, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{won(reco.recommended)}</span>
            <span style={{ fontSize: 12.5, color: C.mute }}>현재 {won(reco.currentRent)} · <b style={{ color: C.danger }}>{reco.dropPct}%↓</b></span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: C.faint, fontFamily: 'var(--font-mono)' }}>밴드 {won(reco.low)}~{won(reco.high)}</span>
          </div>
          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 6 }}>{reco.basis}</div>
        </div> : null}
        {/* 손바뀜 타임라인 — 각 손: 계약자·대여료·인하폭 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {hist.steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 'var(--radius)', background: s.phase === '운행' ? 'var(--bg-card)' : 'var(--bg-stripe)', border: `1px solid ${s.phase === '운행' ? C.accent : C.line}` }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: s.phase === '운행' ? C.accent : C.mute, minWidth: 26 }}>{s.seq}손</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.customer || '—'}</div>
                <div style={{ fontSize: 11, color: C.faint }}>{yy(s.start)}{s.phase === '운행' ? ' · 운행중' : ' · 종료'}{s.net > 0 ? ` · 미수 ${won(s.net)}` : ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{won(s.rent)}</div>
                {s.drop > 0 ? <div style={{ fontSize: 11, color: C.danger, fontWeight: 700 }}>-{won(s.drop)} · {s.dropPct}%↓</div> : <div style={{ fontSize: 11, color: C.faint }}>{i === 0 ? '첫 대여' : '동결'}</div>}
              </div>
            </div>
          ))}
        </div>
      </Sec> : null}

      {/* 보증금 정산 — 종료 계약의 보증금 반환/충당 미처리 시. 정산서와 같은 셈 + 반환 처리 도장. */}
      {pendDeposit ? <Sec id="v-deposit" order={secOrd('v-deposit')} onReorder={reorderSec} title="보증금 정산" n={1} tone="warn" desc={`${String(pendDeposit.c.contractorName || '')} · 반납 ${String(pendDeposit.c.returnedDate || '')} · 미정산`}
        right={<span style={{ display: 'inline-flex', gap: 6 }}><Btn variant="ghost" onClick={() => openPrintDoc('settlement', plate)}>정산서</Btn><Btn onClick={settleDeposit}>보증금 반환 처리</Btn></span>}>
        <KV rows={[
          ['예치 보증금', '', won(pendDeposit.d.deposit)],
          ['미납 대여료(일할)', '', pendDeposit.d.unpaid ? won(pendDeposit.d.unpaid) : '—'],
          ['보증금 충당', '', pendDeposit.d.offset ? '-' + won(pendDeposit.d.offset) : '—'],
          pendDeposit.d.addCharge > 0
            ? ['추가 청구액', '', won(pendDeposit.d.addCharge)] as KVRow
            : ['반환액', '', won(pendDeposit.d.refund)] as KVRow,
        ] as KVRow[]} />
      </Sec> : null}

      {/* 수납 스케줄 — 계약중인 차의 계약기간 회차별. 미수관리의 근거. */}
      {active ? <Sec id="v-schedule" order={secOrd('v-schedule')} onReorder={reorderSec} title="수납 스케줄" n={schedule.length} desc="회차별 청구·미납 · 미수관리"
        right={<span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* 처리(+입금)=주액션 강조 · 출력(영수증·내용증명)=ghost 보조 */}
          <Btn onClick={() => setRecMode(recMode === 'pay' ? null : 'pay')}>+ 입금</Btn>
          <Btn variant="ghost" onClick={() => setRecMode(recMode === 'disc' ? null : 'disc')}>+ 청구할인</Btn>
          <Btn variant="ghost" onClick={() => openPrintDoc('receipt', plate)}>영수증</Btn>
          {totalUnpaid > 0 ? <Btn variant="ghost" onClick={() => openPrintDoc('notice', plate)}>내용증명</Btn> : null}
        </span>}>
        {recMode ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', padding: '10px 12px', border: `1px solid ${C.accent}`, borderRadius: 'var(--radius)', background: 'var(--bg-card)', marginBottom: 10 }}>
          <label style={fLab}><span style={fLl}>회차</span><select value={recForm.seq} onChange={(e) => setRecForm((r) => ({ ...r, seq: e.target.value }))} style={fInp}>{schedule.map((s) => <option key={s.seq} value={s.seq}>{s.seq} · {s.dueDate}</option>)}</select></label>
          <label style={fLab}><span style={fLl}>일자</span><input type="date" value={recForm.date} onChange={(e) => setRecForm((r) => ({ ...r, date: e.target.value }))} style={fInp} /></label>
          <label style={fLab}><span style={fLl}>금액</span><input type="number" value={recForm.amount} onChange={(e) => setRecForm((r) => ({ ...r, amount: e.target.value }))} style={fInp} placeholder="0" /></label>
          {recMode === 'pay'
            ? <label style={fLab}><span style={fLl}>수단</span><select value={recForm.method} onChange={(e) => setRecForm((r) => ({ ...r, method: e.target.value }))} style={fInp}>{['계좌', 'CMS', '카드', '현금', '수동'].map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
            : <label style={fLab}><span style={fLl}>사유</span><select value={recForm.reason} onChange={(e) => setRecForm((r) => ({ ...r, reason: e.target.value }))} style={fInp}>{['자가조치', '보상', '사은품', '캠페인', '기타'].map((m) => <option key={m} value={m}>{m}</option>)}</select></label>}
          <Btn onClick={saveRecord}>{recMode === 'pay' ? '입금 저장' : '할인 저장'}</Btn>
          <Btn variant="ghost" onClick={() => setRecMode(null)}>취소</Btn>
        </div> : null}
        {schedule.length === 0 ? <EmptyState variant="sec">스케줄 없음 (계약기간·월대여료 확인)</EmptyState> :
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', overflow: 'hidden', background: C.card }}>
            <div style={{ maxHeight: 460, overflowY: 'auto', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                <thead><tr>
                  <th style={th}>회차</th><th style={th}>납부기일</th><th style={thR}>청구</th><th style={thR}>할인</th><th style={thR}>납부</th><th style={thR}>미납</th><th style={th}>납부일</th><th style={th}>수단</th><th style={{ ...th, textAlign: 'center' }}>상태</th>
                </tr></thead>
                <tbody>
                  {schedule.map((s) => (
                    <tr key={s.seq}>
                      <td style={td}>{s.seq}</td>
                      <td style={td}>{s.dueDate}</td>
                      <td style={tdR}>{won(s.amount)}</td>
                      <td style={tdR}>{s.discount > 0 ? <span style={{ color: C.warn }}>-{won(s.discount)}</span> : '—'}</td>
                      <td style={tdR}>{s.paid > 0 ? <span style={{ color: 'var(--green-text)' }}>{won(s.paid)}</span> : '—'}</td>
                      <td style={tdR}>{s.balance > 0 ? <span style={{ color: C.danger, fontWeight: 700 }}>{won(s.balance)}</span> : '—'}</td>
                      <td style={td}>{s.paidAt || '—'}</td>
                      <td style={td}>{s.method || '—'}</td>
                      <td style={{ ...td, textAlign: 'center' }}><Badge tone={scheduleTone(String(s.status))}>{String(s.status)}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>}
      </Sec> : null}

      {/* 활동 · 이력 — 이동·통화·문자·방문·메모 + 정비·사고·검사. 빠른 기록으로 소소하게. */}
      <Sec id="v-history" order={secOrd('v-history')} onReorder={reorderSec} title="활동 · 이력" n={history.length} tone={logOpen ? 'ok' : undefined} right={<Btn variant="ghost" onClick={() => setLogOpen((o) => !o)}>{logOpen ? '닫기' : '+ 기록'}</Btn>}>
        {/* 운행중 계약을 함께 넘긴다 — contractNo 없이 저장하면 손바뀜 뒤 다음 임차인 이력에 섞인다(lib/activity-match). */}
        {logOpen ? <QuickLogForm
          ctx={{ plate, ...(active ? { contractNo: String(active.contractNo || active._key || ''), customer: String(active.contractorName || '') } : {}) }}
          onDone={() => setLogOpen(false)} onCancel={() => setLogOpen(false)} style={{ marginBottom: 12 }} /> : null}
        {history.length ? <Cards min={340}>{history.map((h, i) => { const cat = String(h.category || '이력'); const tone = (cat === '사고' ? 'red' : cat === '이동' ? 'blue' : (cat === '통화' || cat === '문자') ? 'green' : (cat === '방문' || cat === '상담') ? 'purple' : cat === '메모' ? 'gray' : cat === '검사' ? 'teal' : 'amber') as 'red' | 'blue' | 'green' | 'purple' | 'gray' | 'teal' | 'amber';
          // 소통 기록은 «누구와»가 핵심 — 차 한 대에 임차인이 여러 번 바뀌므로 상대를 안 보이면 섞여 읽힌다.
          const who = isComm(h) ? (contracts.find((c) => matchesContract(h, c))?.contractorName || h.customer || '') : '';
          return <ObjCard key={i} badge={cat} badgeTone={tone} title={String(h.title || '—')} right={h.cost ? won(h.cost) : (h.nextDate ? <span style={{ color: C.warn, fontSize: 11.5 }}>후속 {String(h.nextDate)}</span> : undefined)} fields={[['일자', String(h.date || '—')], ...(who ? [['상대', String(who)] as [string, string]] : []), [h.author ? '작성' : '업체', String(h.author || h.vendor || '—')]]} />; })}</Cards> : <EmptyState variant="sec">기록 없음 · 오른쪽 “+ 기록”으로 남기세요</EmptyState>}
      </Sec>

      {/* 차량 수선 · 정비·사고 — 모든 차에 항상 노출(대여중이어도 사고/정비 가능). history(_kind:'work').
          유휴차면 저장과 함께 자산상태 파생 전이(→ 휴차 워크벤치 자동 반영). 대여중이면 기록만(운행 유지). */}
      <Sec id="v-work" order={secOrd('v-work')} onReorder={reorderSec} title="차량 수선 · 정비·사고" n={workList.length} tone={workOpen ? 'ok' : undefined}
        desc="정비·사고수리·상품화·세차 — 유휴차는 작업상태가 휴차 워크벤치에 자동 반영"
        right={<Btn variant="ghost" onClick={() => setWorkOpen((o) => !o)}>{workOpen ? '닫기' : '+ 수선/작업'}</Btn>}>
        {workOpen ? <WorkForm plate={plate} companyId={target} vehicle={v} idle={!active} onDone={() => setWorkOpen(false)} onCancel={() => setWorkOpen(false)} style={{ marginBottom: 12 }} /> : null}
        {workList.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{workList.map((h, i) => {
          const cat = String(h.category || '수선'); const ws = String(h.work_status || ''); const doc = latestDoc(h); const amt = Number(h.amount) || 0;
          return (
            <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', background: C.card, padding: '10px 13px', boxShadow: SH.rest }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Badge tone={workCategoryTone(cat)}>{cat}</Badge>
                {ws ? <Badge tone={workStatusTone(ws)}>{ws}</Badge> : null}
                <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>{workSummary(h)}</span>
                <span style={{ flex: 1 }} />
                {amt > 0 ? <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{won(amt)}</span> : null}
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 7, fontSize: 11.5, color: C.mute }}>
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

      {/* 과태료 · 변경부과 — 위반일시로 실운전자(임차인) 자동매칭 */}
      <Sec id="v-penalty" order={secOrd('v-penalty')} onReorder={reorderSec} title="과태료 · 변경부과" n={penalties.length} right={<span style={{ display: 'inline-flex', gap: 6 }}>{penalties.length ? <Btn variant="ghost" onClick={() => openPrintDoc('penalty', plate)}>변경부과 공문</Btn> : null}<Add type="penalty" plate={plate} label="+ 추가" /></span>}>
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
      </div>{/* /섹션 영역(flex order) */}

      {/* 숨긴 섹션 복구 바 — 눈 아이콘으로 숨긴 섹션을 맨 아래에서 다시 켜기 */}
      <HiddenSecs />
      <div style={{ marginTop: 24, paddingTop: 14, borderTop: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* 좌: 레이아웃 컨트롤(발견가능성 힌트+초기화) · 우: 위험 액션 분리 */}
        <span style={{ fontSize: 11.5, color: C.faint }}>섹션 제목을 <b style={{ color: C.mute }}>접으면</b> 끌어서 순서를 바꿀 수 있어요</span>
        <Btn size="sm" variant="ghost" onClick={resetSec}>순서 초기화</Btn>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: C.faint }}>매각·처분은 상태로 · 삭제는 휴지통 복구 가능</span>
        <Btn size="sm" variant="danger" onClick={delVehicle}>차량 삭제</Btn>
      </div>
    </div>
  );
}
