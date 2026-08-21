'use client';

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  FileText,
  FileUp,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { checkCompliance } from '@/lib/compliance';
import { companyLabel } from '@/lib/companies';
import { buildScheduleLedger } from '@/lib/contracts/schedule-ledger';
import { TODAY } from '@/lib/dashboard-consts';
import { docHistory } from '@/lib/docs';
import type { EntityRecord } from '@/lib/intake/entities';
import { contractMasterRow } from '@/lib/master-ledgers';
import { buildMobileVehicleScope, scopeMobileVehicleRecords } from '@/lib/mobile-vehicle-scope';
import { normPlate } from '@/lib/plate';
import { safeEvidenceHref } from '@/lib/reborn/task-model';
import { buildRiskSheetRows } from '@/lib/risk-ledger';
import { buildWorkItemLedgerRows } from '@/lib/work-ledger';
import { useEntityLists } from '@/lib/use-entity-lists';
import RebornHeader from '../../_components/RebornHeader';
import styles from '../../records.module.css';

type Props = { plate: string; companyId: string };
type TimelineItem = {
  id: string;
  at: string;
  kind: string;
  title: string;
  detail: string;
  amount?: number;
};
type DocumentItem = {
  id: string;
  kind: string;
  label: string;
  at: string;
  url: string;
  missing?: boolean;
};

const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });

function text(value: unknown, fallback = '—'): string {
  const resolved = String(value ?? '').trim();
  return resolved || fallback;
}

function money(value: unknown): string {
  return `${number.format(Number(value) || 0)}원`;
}

function date(value: unknown): string {
  return String(value || '').slice(0, 10) || '—';
}

function keyOf(record: EntityRecord, fallback: string): string {
  return String(record._key || record.id || record.contractNo || fallback);
}

function recordDate(record: EntityRecord): string {
  return String(record.date || record.txDate || record.occurredAt || record.updatedAt || record.createdAt || '').slice(0, 10);
}

function recordTitle(record: EntityRecord): string {
  return text(record.title || record.description || record.memo || record.note || record.kind || record.type, '기록');
}

function directDocument(id: string, kind: string, label: string, url: unknown, at: unknown): DocumentItem | null {
  const resolved = safeEvidenceHref(url);
  return resolved ? { id, kind, label, at: date(at), url: resolved } : null;
}

export default function VehicleRecord({ plate, companyId }: Props) {
  const { data, loading, error } = useEntityLists([
    'vehicle', 'contract', 'insurance', 'history', 'penalty', 'bank_tx', 'work_item', 'inbox', 'card_tx',
  ]);
  const [vehicles = [], contracts = [], insurances = [], histories = [], penalties = [], bankTx = [], workItems = [], inbox = [], cardTx = []] = data;

  const scope = useMemo(() => buildMobileVehicleScope(vehicles, contracts, plate, companyId), [companyId, contracts, plate, vehicles]);
  const canonicalPlate = normPlate(scope.canonicalPlate || plate);
  const project = (records: EntityRecord[]) => scopeMobileVehicleRecords(scope, records);
  const byPlate = (records: EntityRecord[]) => project(records).filter((record) => normPlate(record.plate || record.vehiclePlate || record.linkedVehiclePlate) === canonicalPlate);

  const vehicle = scope.vehicle || null;
  const vehicleContracts = useMemo(() => byPlate(contracts), [canonicalPlate, contracts, scope]);
  const vehicleInsurances = useMemo(() => byPlate(insurances), [canonicalPlate, insurances, scope]);
  const vehicleHistories = useMemo(() => byPlate(histories), [canonicalPlate, histories, scope]);
  const vehiclePenalties = useMemo(() => byPlate(penalties), [canonicalPlate, penalties, scope]);
  const contractKeys = useMemo(() => new Set(vehicleContracts.flatMap((record) => [record._key, record.id, record.contractNo].map((value) => String(value || '')).filter(Boolean))), [vehicleContracts]);
  const vehicleBankTx = useMemo(() => project(bankTx).filter((record) => {
    if (normPlate(record.linkedVehiclePlate || record.plate) === canonicalPlate) return true;
    if (contractKeys.has(String(record.matchedContractId || ''))) return true;
    return Array.isArray(record.matches) && (record.matches as EntityRecord[]).some((match) => contractKeys.has(String(match.contractId || '')));
  }), [bankTx, canonicalPlate, contractKeys, scope]);
  const vehicleCardTx = useMemo(() => project(cardTx).filter((record) => normPlate(record.linkedVehiclePlate || record.plate) === canonicalPlate || contractKeys.has(String(record.matchedContractId || ''))), [canonicalPlate, cardTx, contractKeys, scope]);
  const vehicleWork = useMemo(() => buildWorkItemLedgerRows(project(workItems), vehicleContracts, vehicle ? [vehicle] : [])
    .filter((row) => normPlate(row.plate) === canonicalPlate || (row.contractKey && contractKeys.has(row.contractKey)))
    .sort((left, right) => Number(left.status === '완료') - Number(right.status === '완료') || right.updatedAt.localeCompare(left.updatedAt)),
  [canonicalPlate, contractKeys, scope, vehicle, vehicleContracts, workItems]);
  const vehicleInbox = useMemo(() => project(inbox).filter((record) => normPlate(record.plate) === canonicalPlate || contractKeys.has(String(record.matchedKey || record.contractKey || ''))), [canonicalPlate, contractKeys, inbox, scope]);

  const contractRows = useMemo(() => vehicleContracts.map((record) => contractMasterRow(record, TODAY))
    .sort((left, right) => Number(left.ended) - Number(right.ended) || right.startDate.localeCompare(left.startDate)), [vehicleContracts]);
  const currentContract = contractRows.find((row) => !row.ended) || null;
  const currentContractRecord = currentContract?.raw || null;
  const schedules = useMemo(() => buildScheduleLedger(vehicleContracts, TODAY)
    .sort((left, right) => right.dueDate.localeCompare(left.dueDate) || right.seq - left.seq), [vehicleContracts]);
  const risks = useMemo(() => buildRiskSheetRows(vehicle ? [vehicle] : [], vehicleContracts, vehicleInsurances, vehiclePenalties, vehicleHistories, TODAY, vehicleBankTx)
    .filter((row) => !row.plate || normPlate(row.plate) === canonicalPlate),
  [canonicalPlate, vehicle, vehicleBankTx, vehicleContracts, vehicleHistories, vehicleInsurances, vehiclePenalties]);
  const compliance = useMemo(() => currentContractRecord ? checkCompliance(currentContractRecord, vehicle, TODAY) : [], [currentContractRecord, vehicle]);

  const documents = useMemo<DocumentItem[]>(() => {
    const items: DocumentItem[] = [];
    const addVersions = (record: EntityRecord, kind: string, label: string) => docHistory(record).forEach((doc) => {
      const url = safeEvidenceHref(doc.url);
      if (!url) return;
      items.push({
        id: `${kind}:${keyOf(record, label)}:${doc.v}`,
        kind,
        label: doc.name || `${label} v${doc.v}`,
        at: date(doc.uploadedAt),
        url,
      });
    });

    if (vehicle) {
      addVersions(vehicle, '차량', '자동차등록증');
      [
        directDocument('vehicle-reg', '차량', '자동차등록증', vehicle.registrationCertUrl, vehicle.registrationCertUploadedAt),
        directDocument('vehicle-ins', '보험', '보험증권', vehicle.insuranceCertUrl, vehicle.insuranceCertUploadedAt),
        directDocument('vehicle-loan', '금융', '할부계약서', vehicle.loanContractUrl, vehicle.loanContractUploadedAt),
        directDocument('vehicle-quote', '취득', '제조사 견적서', vehicle.manufacturerQuoteUrl, vehicle.manufacturerQuoteUploadedAt),
        directDocument('vehicle-order', '취득', '발주서', vehicle.purchaseOrderUrl, vehicle.purchaseOrderUploadedAt),
        directDocument('vehicle-inspection', '검사', '정기검사증', vehicle.inspectionCertUrl, vehicle.inspectionCertUploadedAt),
        directDocument('vehicle-gps', '차량', 'GPS 설치 증빙', vehicle.gpsInstallUrl, vehicle.gpsInstallUploadedAt),
        directDocument('vehicle-disposal', '처분', '매각 서류', vehicle.disposalCertUrl, vehicle.disposalCertUploadedAt),
      ].forEach((item) => { if (item) items.push(item); });
    }
    vehicleContracts.forEach((record) => {
      addVersions(record, '계약', `계약서 ${text(record.contractNo, '')}`.trim());
      const contract = directDocument(`contract:${keyOf(record, 'contract')}`, '계약', `계약서 ${text(record.contractNo, '')}`.trim(), record.contractDocUrl, record.contractDocUploadedAt);
      const license = directDocument(`license:${keyOf(record, 'license')}`, '면허', `${text(record.contractorName, '운전자')} 면허증`, record.customerLicenseCertUrl, record.customerLicenseCertUploadedAt);
      if (contract) items.push(contract);
      if (license) items.push(license);
    });
    vehicleInsurances.forEach((record) => addVersions(record, '보험', '보험증권'));
    vehicleHistories.forEach((record) => addVersions(record, '이력', recordTitle(record)));
    vehiclePenalties.forEach((record) => addVersions(record, '과태료', recordTitle(record)));
    vehicleInbox.forEach((record) => addVersions(record, '자료', text(record.filename || record.docKind, '업로드 자료')));

    const unique = new Map<string, DocumentItem>();
    items.filter((item) => item.url).forEach((item) => unique.set(item.url, item));
    const resolved = [...unique.values()].sort((left, right) => right.at.localeCompare(left.at));
    const has = (pattern: RegExp) => resolved.some((item) => pattern.test(`${item.kind} ${item.label}`));
    if (!has(/등록증/)) resolved.push({ id: 'missing-reg', kind: '필수', label: '자동차등록증', at: '미첨부', url: '', missing: true });
    if (vehicleContracts.length > 0 && !has(/계약서/)) resolved.push({ id: 'missing-contract', kind: '필수', label: '계약서', at: '미첨부', url: '', missing: true });
    if (!has(/보험|증권/)) resolved.push({ id: 'missing-ins', kind: '필수', label: '보험증권', at: '미첨부', url: '', missing: true });
    return resolved;
  }, [vehicle, vehicleContracts, vehicleHistories, vehicleInbox, vehicleInsurances, vehiclePenalties]);

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    contractRows.forEach((row) => {
      items.push({ id: `contract:${row.contractNo}:start`, at: row.startDate || row.contractDate, kind: '계약', title: `${row.contractorName || '계약자 미확인'} 계약 시작`, detail: `${row.contractNo || '계약번호 없음'} · 월 ${money(row.monthlyRent)}` });
      if (row.ended) items.push({ id: `contract:${row.contractNo}:end`, at: row.returnedDate || row.endDate, kind: '계약종료', title: `${row.contractorName || '계약자 미확인'} 계약 종료`, detail: row.endReason || row.status, amount: row.net });
    });
    schedules.filter((row) => row.paid > 0).forEach((row) => items.push({ id: `payment:${row.id}`, at: row.paidAt || row.dueDate, kind: '수납', title: `${row.seq}회차 납부`, detail: `${row.contractorName} · ${row.status}`, amount: row.paid }));
    vehicleBankTx.forEach((record, index) => items.push({ id: `bank:${keyOf(record, String(index))}`, at: recordDate(record), kind: Number(record.withdraw) > 0 ? '지출' : '입금', title: text(record.counterparty, '계좌 거래'), detail: text(record.memo || record.note || record.subject), amount: Number(record.withdraw) > 0 ? -Number(record.withdraw) : Number(record.amount) }));
    vehicleHistories.forEach((record, index) => items.push({ id: `history:${keyOf(record, String(index))}`, at: recordDate(record), kind: text(record.category || record.kind || record.type, '이력'), title: recordTitle(record), detail: text(record.description || record.vendor || record.status), amount: Number(record.cost || record.amount) || undefined }));
    vehiclePenalties.forEach((record, index) => items.push({ id: `penalty:${keyOf(record, String(index))}`, at: recordDate(record), kind: '과태료', title: recordTitle(record), detail: text(record.reassignStatus || record.status), amount: Number(record.amount || record.fineAmount) || undefined }));
    vehicleWork.forEach((row) => items.push({ id: row.id, at: row.updatedAt || row.createdAt, kind: '업무', title: row.title || row.kind, detail: `${row.status} · ${row.assignee || '담당 미정'}`, amount: row.amount || undefined }));
    return items.filter((item) => item.at).sort((left, right) => right.at.localeCompare(left.at));
  }, [contractRows, schedules, vehicleBankTx, vehicleHistories, vehiclePenalties, vehicleWork]);

  if (loading) return <div className={styles.recordsApp}><RebornHeader active="data" /><div className={styles.recordState}><Loader2 size={19} className={styles.spin} />차량 정보를 연결하는 중</div></div>;
  if (error) return <div className={styles.recordsApp}><RebornHeader active="data" /><div className={styles.detailNarrow}><Link href="/sheet/reborn/ledgers" className={styles.backLink}><ArrowLeft size={17} />데이터센터</Link><div className={styles.recordError}>{error}</div></div></div>;
  if (!vehicle && !vehicleContracts.length) return <div className={styles.recordsApp}><RebornHeader active="data" /><div className={styles.detailNarrow}><Link href="/sheet/reborn/ledgers" className={styles.backLink}><ArrowLeft size={17} />데이터센터</Link><div className={styles.recordEmpty}>차량 또는 계약을 찾을 수 없습니다.</div></div></div>;

  const status = vehicle ? text(vehicle.status, currentContract ? '운행' : '휴차') : '차량정보 없음';
  const receivable = contractRows.reduce((sum, row) => sum + Math.max(0, row.net), 0);
  const received = schedules.reduce((sum, row) => sum + row.paid, 0);
  const linkedExpense = vehicleBankTx.reduce((sum, row) => sum + (Number(row.withdraw) || 0), 0)
    + vehicleCardTx.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const openWork = vehicleWork.filter((row) => !['완료', '보류'].includes(String(row.status)));
  const issueCount = risks.length + compliance.length + openWork.length + documents.filter((item) => item.missing).length;

  return <div className={styles.recordsApp}>
    <RebornHeader active="data" />

    <main className={`${styles.recordsMain} ${styles.vehicleMain}`}>
      <div className={styles.vehicleTitle}>
        <div>
          <Link href="/sheet/reborn/ledgers" className={styles.backLink}><ArrowLeft size={17} />데이터센터</Link>
          <span className={styles.vehicleEyebrow}>VEHICLE 360 · {companyLabel(scope.companyId)} · {status}</span>
          <h1>{canonicalPlate}</h1>
          <p>{text(vehicle?.carName || vehicle?.model, '차종 미등록')} · {text(vehicle?.vin, '차대번호 미등록')}</p>
        </div>
        <Link href={`/ingest?plate=${encodeURIComponent(canonicalPlate)}`} className={styles.uploadAction}><FileUp size={16} />자료 연결</Link>
      </div>

      <section className={styles.vehicleSummary} aria-label="차량 요약">
        <SummaryCell label="현재 상태" value={status} sub={currentContract ? '계약 운행 중' : '활성 계약 없음'} />
        <SummaryCell label="현재 계약" value={currentContract?.contractorName || '없음'} sub={currentContract ? `${date(currentContract.startDate)} ~ ${date(currentContract.endDate)}` : '—'} />
        <SummaryCell label="현재 미수" value={receivable > 0 ? money(receivable) : '없음'} sub={receivable > 0 ? `${contractRows.filter((row) => row.net > 0).length}건 확인 필요` : '정상'} danger={receivable > 0} />
        <SummaryCell label="수납 누계" value={money(received)} sub={`${schedules.filter((row) => row.paid > 0).length}회차 반영`} />
        <SummaryCell label="연결 비용" value={money(linkedExpense)} sub="계좌·카드 연결 기준" />
        <SummaryCell label="확인할 것" value={`${issueCount}건`} sub={`업무 ${openWork.length} · 위험 ${risks.length + compliance.length}`} danger={issueCount > 0} />
      </section>

      <nav className={styles.detailNav} aria-label="차량 상세 구역">
        <a href="#vehicle-now">현재 확인</a><a href="#vehicle-contracts">계약·수납</a><a href="#vehicle-asset">자산·보험</a><a href="#vehicle-history">통합 이력</a><a href="#vehicle-documents">원본 자료</a>
      </nav>

      <section id="vehicle-now" className={styles.detailSection}>
        <SectionTitle title="현재 확인할 것" count={issueCount} />
        <div className={styles.issueList}>
          {compliance.map((item) => <div className={styles.issueRow} key={item.code}><AlertTriangle size={16} /><span><strong>{item.label}</strong><small>{item.detail}</small></span><b>계약 정합</b></div>)}
          {risks.map((item) => <div className={styles.issueRow} key={item.id}><AlertTriangle size={16} /><span><strong>{item.kind}</strong><small>{item.subject}{item.overdueDays ? ` · ${item.overdueDays}일 경과` : ''}</small></span><b>{item.amount ? money(item.amount) : item.status}</b></div>)}
          {openWork.map((item) => <Link className={styles.issueRow} href={`/work?open=${encodeURIComponent(item.id)}`} aria-label={`${item.title || item.kind} 처리하기`} key={item.id}><ChevronRight size={16} /><span><strong>{item.title || item.kind}</strong><small>{item.dueDate ? `기한 ${date(item.dueDate)}` : '기한 미지정'} · {item.assignee || '담당 미정'}</small></span><b>{item.status}</b></Link>)}
          {documents.filter((item) => item.missing).map((item) => <div className={styles.issueRow} key={item.id}><FileText size={16} /><span><strong>{item.label} 미첨부</strong><small>원본 파일을 올리면 AI가 차량 정보에 연결합니다.</small></span><b>자료 필요</b></div>)}
          {!issueCount ? <div className={styles.issueClear}><CheckCircle2 size={18} />현재 확인할 문제가 없습니다.</div> : null}
        </div>
      </section>

      <section id="vehicle-contracts" className={styles.detailSection}>
        <SectionTitle title="계약·수납" count={contractRows.length} />
        <div className={styles.contractCards}>
          {contractRows.map((row) => <article className={styles.contractCard} key={`${row.companyId}:${row.contractNo}`}>
            <div className={styles.contractCardHead}><div><strong>{row.contractorName || '계약자 미확인'}</strong><small>{row.contractNo || '계약번호 없음'} · {row.rentalType}</small></div><span>{row.status}</span></div>
            <dl>
              <dt>기간</dt><dd>{date(row.startDate)} ~ {date(row.endDate)}</dd>
              <dt>대여료</dt><dd>{money(row.monthlyRent)} · {row.paymentDay ? `매월 ${row.paymentDay}일` : '결제일 미등록'}</dd>
              <dt>보증금</dt><dd>{money(row.deposit)} · 수령 {row.depositReceived == null ? '미확인' : money(row.depositReceived)}</dd>
              <dt>운전자/보험</dt><dd>{row.driverAge ? `운전자 ${row.driverAge}세` : '운전자 연령 미확인'} · 보험 {row.insuranceAge ? `${row.insuranceAge}세` : '연령 미확인'}</dd>
              <dt>미수</dt><dd className={row.net > 0 ? styles.negative : ''}>{row.net > 0 ? `${row.unpaidCount}회 · ${money(row.net)}` : '없음'}</dd>
            </dl>
          </article>)}
          {!contractRows.length ? <div className={styles.recordEmpty}>연결된 계약이 없습니다.</div> : null}
        </div>
        <div className={styles.subTableWrap}>
          <div className={`${styles.subTableHead} ${styles.scheduleGrid}`}><span>기일</span><span>계약</span><span>회차</span><span>청구</span><span>납부</span><span>잔액</span><span>상태</span></div>
          {schedules.map((row) => <div className={`${styles.subTableRow} ${styles.scheduleGrid}`} key={row.id}>
            <span>{date(row.dueDate)}</span><span><strong>{row.contractorName}</strong><small>{row.contractNo}</small></span><span>{row.seq}/{row.seqTotal}</span><span>{money(row.charge)}</span><span>{money(row.paid)}</span><span className={row.balance > 0 ? styles.negative : ''}>{money(row.balance)}</span><span>{row.status}</span>
          </div>)}
          {!schedules.length ? <div className={styles.recordEmpty}>생성된 수납 회차가 없습니다.</div> : null}
        </div>
      </section>

      <section id="vehicle-asset" className={styles.detailSection}>
        <SectionTitle title="자산·보험" />
        <div className={styles.infoColumns}>
          <InfoPanel title="등록·제원" rows={[
            ['차대번호', text(vehicle?.vin)], ['연식', text(vehicle?.modelYear || vehicle?.yearMonth || vehicle?.firstReg).slice(0, 4)], ['최초등록', date(vehicle?.firstReg || vehicle?.firstRegisteredDate)], ['연료', text(vehicle?.fuel || vehicle?.fuelType)], ['주행거리', vehicle?.mileage ? `${number.format(Number(vehicle.mileage))}km` : '—'], ['사용본거지', text(vehicle?.useAddress || vehicle?.garage)],
          ]} />
          <InfoPanel title="취득·금융" rows={[
            ['취득일', date(vehicle?.acquisitionDate || vehicle?.purchasedDate)], ['취득가', money(vehicle?.acquisitionPrice || vehicle?.purchasePrice || vehicle?.actualPurchasePrice)], ['취득방식', /예|현금|Y/i.test(String(vehicle?.loanCashOnly || '')) ? '현금' : vehicle?.loanCompany ? '할부/리스' : text(vehicle?.acquisitionType)], ['금융사', text(vehicle?.loanCompany)], ['할부기간', vehicle?.loanMonths ? `${number.format(Number(vehicle.loanMonths))}개월` : '—'], ['잔여원금', money(vehicle?.loanRemainingPrincipal || vehicle?.remainingPrincipal)],
          ]} />
          <InfoPanel title="보험·검사" rows={[
            ['보험사', text(vehicleInsurances[0]?.insurer || vehicle?.insuranceCompany)], ['증권번호', text(vehicleInsurances[0]?.policyNo || vehicle?.insurancePolicyNo)], ['보험연령', text(vehicleInsurances[0]?.ageLimit || vehicle?.insuranceAge, '미확인')], ['보험만기', date(vehicleInsurances[0]?.endDate || vehicle?.insuranceExpiryDate)], ['검사만기', date(vehicle?.inspectionTo)], ['GPS', text(vehicle?.gpsProvider || vehicle?.gpsDeviceId)],
          ]} />
        </div>
      </section>

      <section id="vehicle-history" className={styles.detailSection}>
        <SectionTitle title="통합 이력" count={timeline.length} />
        <div className={styles.timelineTable}>
          <div className={styles.timelineHead}><span>일자</span><span>구분</span><span>내용</span><span>금액</span></div>
          {timeline.map((item) => <div className={styles.timelineRow} key={item.id}><time>{date(item.at)}</time><span>{item.kind}</span><span><strong>{item.title}</strong><small>{item.detail}</small></span><b className={Number(item.amount) < 0 ? styles.negative : ''}>{item.amount ? money(item.amount) : '—'}</b></div>)}
          {!timeline.length ? <div className={styles.recordEmpty}>연결된 이력이 없습니다.</div> : null}
        </div>
      </section>

      <section id="vehicle-documents" className={styles.detailSection}>
        <SectionTitle title="서류" count={documents.length} />
        <div className={styles.documentList}>
          {documents.map((item) => item.url
            ? <a href={item.url} target="_blank" rel="noreferrer" key={item.id}><FileText size={17} /><span><strong>{item.label}</strong><small>{item.kind} · {item.at}</small></span><ChevronRight size={16} /></a>
            : <div className={styles.documentMissing} key={item.id}><FileText size={17} /><span><strong>{item.label}</strong><small>{item.at}</small></span><b>미첨부</b></div>)}
        </div>
      </section>
    </main>
  </div>;
}

function SummaryCell({ label, value, sub, danger = false }: { label: string; value: string; sub: string; danger?: boolean }) {
  return <div><span>{label}</span><strong className={danger ? styles.negative : ''}>{value}</strong><small>{sub}</small></div>;
}

function SectionTitle({ title, count }: { title: string; count?: number }) {
  return <div className={styles.detailSectionTitle}><h2>{title}</h2>{count != null ? <span>{count}건</span> : null}</div>;
}

function InfoPanel({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return <div className={styles.infoPanel}><h3>{title}</h3><dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>;
}
