'use client';
/**
 * 경영관리 — **법인 원장 하나**. 자산(차량360)과 같은 규격(RENMAN-CURSOR §4-11).
 *
 * 계좌·임대차·직원은 법인에 «딸린» 것이지 형제가 아니다 — 차량 원장 옆에 「계약」·「정비」
 * 탭을 두지 않는 것과 같다. 법인 행을 누르면 상세패널 안에 다 있다.
 *   섹션: 사업자 · 소재지 · 법인계좌(bank_account SSOT) · 임대차(lease)
 *   쓰기: [+ 법인 등록] → createManagedCompany → 그 법인 패널이 바로 열림
 *   직원(Auth)은 전 법인 대상이라 별도 화면(StaffTab)으로 빠진다.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Badge, Btn, C, DetailEmpty, ExcelSheet, KV, LedgerActions, LedgerFrame, LedgerRecordPanel, Search, won,
  type SheetCol,
} from '@/components/ui';
import { usePrompt } from '@/components/ui/confirm';
import { toast, toastError } from '@/lib/toast';
import { getStore } from '@/lib/store';
import type { EntityRecord } from '@/lib/intake/entities';
import { COMPANY_DEFS, companyLabel, createManagedCompany, updateManagedCompany } from '@/lib/companies';
import { loadMaster, type CompanyMaster } from '@/lib/company-master';
import { useEntityList } from '@/lib/use-entity-lists';
import { buildBankAccountLedger, type BankAccountRow } from '@/lib/finance/cash-ledger';
import { ACCOUNT_BASIC_COLS } from '@/lib/finance/account-cols';
import { dday, TODAY } from '@/lib/dashboard-consts';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';
import { textMatch } from '@/lib/search-match';
import { useIsMobile } from '@/lib/use-mobile';
import { useSession } from '@/lib/session';
import { StaffTab } from '@/components/management/StaffTab';
import { openIngest } from '@/lib/ui-bus';

type CompanyRow = {
  id: string;
  name: string;
  ceo: string;
  bizNo: string;
  address: string;
  phone: string;
  garages: number;
  master: CompanyMaster;
};

type LeaseRow = {
  id: string;
  landlord: string;
  address: string;
  deposit: number;
  monthlyRent: number;
  startDate: string;
  endDate: string;
  due: string;
  status: string;
  raw: Record<string, unknown>;
};

const COMPANY_COLS: SheetCol<CompanyRow>[] = [
  { key: 'name', label: '회사명', priority: 1, pin: true, render: (r) => <b>{r.name}</b>, text: (r) => r.name },
  { key: 'ceo', label: '대표', priority: 2, render: (r) => r.ceo || LEDGER_EMPTY.dash, text: (r) => r.ceo },
  { key: 'bizNo', label: '사업자번호', priority: 2, render: (r) => r.bizNo || LEDGER_EMPTY.dash, text: (r) => r.bizNo },
  { key: 'phone', label: '전화', priority: 3, render: (r) => r.phone || LEDGER_EMPTY.dash, text: (r) => r.phone },
  { key: 'address', label: '본점', priority: 3, render: (r) => r.address || LEDGER_EMPTY.dash, text: (r) => r.address },
  { key: 'garages', label: '차고지', align: 'r', priority: 3, render: (r) => `${r.garages}곳`, text: (r) => r.garages },
];

const LEASE_COLS: SheetCol<LeaseRow>[] = [
  { key: 'landlord', label: '임대인', priority: 1, render: (r) => r.landlord || LEDGER_EMPTY.none, text: (r) => r.landlord },
  { key: 'address', label: '소재지', priority: 1, render: (r) => r.address || LEDGER_EMPTY.dash, text: (r) => r.address },
  { key: 'deposit', label: '보증금', align: 'r', priority: 2, render: (r) => r.deposit ? won(r.deposit) : LEDGER_EMPTY.dash, text: (r) => r.deposit },
  { key: 'monthlyRent', label: '월세', align: 'r', priority: 2, render: (r) => r.monthlyRent ? won(r.monthlyRent) : LEDGER_EMPTY.dash, text: (r) => r.monthlyRent },
  { key: 'startDate', label: '시작일', priority: 2, render: (r) => r.startDate || LEDGER_EMPTY.dash, text: (r) => r.startDate },
  { key: 'endDate', label: '만기일', priority: 1, render: (r) => r.endDate || LEDGER_EMPTY.dash, text: (r) => r.endDate },
  {
    key: 'status', label: '임대차상태', priority: 1,
    render: (r) => <Badge tone={r.status.includes('경과') || r.status.includes('임박') ? 'amber' : 'gray'}>{r.status}</Badge>,
    text: (r) => r.status,
  },
];

function leaseStatus(end: string): string {
  const d = dday(end);
  if (d == null) return '—';
  if (d < 0) return `${-d}일 경과`;
  if (d === 0) return 'D-Day';
  if (d <= 30) return `D-${d} 임박`;
  return `D-${d}`;
}

export default function ManagementPage() {
  const mobile = useIsMobile();
  const { isOperator } = useSession();
  const prompt = usePrompt();
  const [q, setQ] = useState('');
  const [selectedCo, setSelectedCo] = useState<CompanyRow | null>(null);
  const [staffOpen, setStaffOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [masterTick, setMasterTick] = useState(0);

  const { rows: accountRecords, loading: acctLoading, error: acctError } = useEntityList('bank_account');
  const { rows: leaseRecords, loading: leaseLoading, error: leaseError } = useEntityList('lease');
  const { rows: bankTxRecords } = useEntityList('bank_tx');

  useEffect(() => {
    const on = () => setMasterTick((n) => n + 1);
    window.addEventListener('jpk:master-change', on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener('jpk:master-change', on);
      window.removeEventListener('storage', on);
    };
  }, []);

  // 본사가 아니면 직원 화면 진입 불가
  useEffect(() => {
    if (staffOpen && !isOperator) setStaffOpen(false);
  }, [staffOpen, isOperator]);

  const companyRows = useMemo(() => {
    void masterTick;
    return COMPANY_DEFS.map((c) => {
      const m = loadMaster(c.id);
      return {
        id: c.id,
        name: companyLabel(c.id),
        ceo: String(m.ceo || ''),
        bizNo: String(m.bizNo || ''),
        address: String(m.address || ''),
        phone: String(m.phone || ''),
        garages: m.garages?.length || 0,
        master: m,
      } satisfies CompanyRow;
    });
  }, [masterTick]);

  const leaseRows = useMemo(() => leaseRecords.map((r) => {
    const end = String(r.endDate || '').slice(0, 10);
    return {
      id: String(r._key || r.leaseNo || ''),
      landlord: String(r.landlord || ''),
      address: String(r.address || ''),
      deposit: Number(r.deposit) || 0,
      monthlyRent: Number(r.monthlyRent) || 0,
      startDate: String(r.startDate || '').slice(0, 10),
      endDate: end,
      due: end,
      status: leaseStatus(end),
      raw: r,
    } satisfies LeaseRow;
  }).sort((a, b) => a.endDate.localeCompare(b.endDate)), [leaseRecords]);

  const shownCompanies = useMemo(
    () => companyRows.filter((r) => textMatch(q, r.name, r.ceo, r.bizNo, r.address, r.phone)),
    [companyRows, q],
  );

  /* ★법인에 «딸린» 것들 — 선택한 법인 것만 걸러 섹션 표로 넣는다.
     탭으로 나란히 두면 «어느 법인 계좌인지»를 사람이 머리로 이어붙여야 한다(§4-11). */
  const coAccounts = useMemo(() => {
    if (!selectedCo) return [];
    /* bank_tx 를 함께 넘겨 `transactionCount` 를 채운다 — «신원 잠금» 판정 근거다.
       거래-계좌 매칭은 `matchTxToAccount`(cash-ledger)가 SSOT라 여기서 다시 세지 않는다. */
    return buildBankAccountLedger(
      accountRecords.filter((r) => String(r.companyId || '') === selectedCo.id),
      bankTxRecords, [], [],
    );
  }, [accountRecords, bankTxRecords, selectedCo]);

  const coLeases = useMemo(() => {
    if (!selectedCo) return [];
    return leaseRows.filter((r) => String(r.raw.companyId || '') === selectedCo.id);
  }, [leaseRows, selectedCo]);

  /* ★섹션 그자리 수정 — 차량360과 같은 규격(공용 `KV` + editing/form/onChange).
     법인은 엔티티가 아니라 `updateManagedCompany`(레지스트리+마스터)로 저장한다.
     `LedgerEditPanel`은 `getStore().update` 전용이라 여기 못 쓴다. */
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function startEdit() {
    if (!selectedCo) return;
    const m = selectedCo.master;
    setForm({
      label: selectedCo.name,
      ceo: String(m.ceo || ''), bizNo: String(m.bizNo || ''), corpNo: String(m.corpNo || ''),
      phone: String(m.phone || ''), email: String(m.email || ''),
      openDate: String(m.openDate || ''), taxOffice: String(m.taxOffice || ''),
      address: String(m.address || ''), businessAddress: String(m.businessAddress || ''),
      ...Object.fromEntries(coAccounts.flatMap((a) => [
        [`acct:${a.id}:accountAlias`, a.accountAlias], [`acct:${a.id}:bankName`, a.bankName],
        [`acct:${a.id}:accountNumber`, a.accountNumber], [`acct:${a.id}:accountHolder`, a.accountHolder],
        [`acct:${a.id}:accountType`, a.accountType],
      ])),
    });
    setEditing(true);
  }

  async function saveEdit() {
    if (!selectedCo) return;
    const label = String(form.label || '').trim();
    if (!label) { toastError('회사명은 비울 수 없습니다.'); return; }
    setSaving(true);
    try {
      // 계좌 패치는 `acct:<id>:<field>` 로 같은 폼에 모인다 — 분리해서 각각 저장한다.
      const master: Record<string, string> = {};
      const acctPatch = new Map<string, EntityRecord>();
      for (const [k, v] of Object.entries(form)) {
        if (k === 'label') continue;
        const m = /^acct:(.+):([A-Za-z]+)$/.exec(k);
        if (!m) { master[k] = v; continue; }
        const cur = acctPatch.get(m[1]) || {};
        cur[m[2]] = v;
        acctPatch.set(m[1], cur);
      }
      await updateManagedCompany(selectedCo.id, { label }, master);
      for (const [id, patch] of acctPatch) {
        const before = coAccounts.find((a) => a.id === id);
        // 안 바뀐 계좌까지 쓰지 않는다 — 감사 트레일에 빈 변경이 쌓인다.
        if (before && Object.entries(patch).every(([f, v]) => String((before as unknown as EntityRecord)[f] ?? '') === v)) continue;
        await getStore().update('bank_account', selectedCo.id, id, patch);
      }
      setMasterTick((n) => n + 1);
      const m = loadMaster(selectedCo.id);
      setSelectedCo({
        ...selectedCo, name: label, ceo: String(m.ceo || ''), bizNo: String(m.bizNo || ''),
        address: String(m.address || ''), phone: String(m.phone || ''),
        garages: m.garages?.length || 0, master: m,
      });
      setEditing(false);
      toast('법인 정보를 저장했습니다.');
    } catch (error) {
      toastError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  /** 「+ 법인 등록」 — 빈 껍데기를 바로 만들고 그 패널을 연다. 등록 화면·모달 없음(§4-11). */
  async function createCompany() {
    const name = (await prompt({
      title: '법인 등록',
      message: '상호 — 사업자등록증에 적힌 그대로. 나머지는 등록증을 올리면 채워집니다.',
      placeholder: '주식회사 ○○', confirmLabel: '등록', required: true,
    }))?.trim();
    if (!name) return;
    setCreating(true);
    try {
      const id = await createManagedCompany(name);
      if (!id) { toastError('법인을 만들지 못했습니다 — 상호를 확인하세요.'); return; }
      setMasterTick((n) => n + 1);
      toast(`법인 「${name}」 등록 — 사업자등록증을 올리면 나머지가 채워집니다.`);
      const m = loadMaster(id);
      setSelectedCo({
        id, name, ceo: String(m.ceo || ''), bizNo: String(m.bizNo || ''),
        address: String(m.address || ''), phone: String(m.phone || ''),
        garages: m.garages?.length || 0, master: m,
      });
    } catch (error) {
      toastError((error as Error).message);
    } finally {
      setCreating(false);
    }
  }

  if (staffOpen && isOperator) {
    return <StaffTab view={<Btn size="sm" variant="ghost" onClick={() => setStaffOpen(false)}>← 법인 원장</Btn>} />;
  }

  return (
    <LedgerFrame
      title="경영관리"
      meta="법인 원장"
      panelWide
      right={(
        <LedgerActions aria-label="관리 작업">
          <Btn size="sm" variant="solid" disabled={creating} onClick={() => { void createCompany(); }}>
            {creating ? '등록 중…' : '+ 법인 등록'}
          </Btn>
          {isOperator ? <Btn size="sm" variant="ghost" onClick={() => setStaffOpen(true)}>직원·권한</Btn> : null}
        </LedgerActions>
      )}
      filters={(
        <Search
          size="sm"
          placeholder="법인·대표·사업자"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: mobile ? 160 : 280, flexShrink: 0 }}
        />
      )}
      stats={(
        <span style={{ fontSize: 12.5, color: C.mute }}>
          법인 <b>{shownCompanies.length}</b> · 기준 {TODAY}
        </span>
      )}
      loading={acctLoading || leaseLoading}
      error={acctError || leaseError}
      empty="등록된 법인이 없습니다 — [+ 법인 등록]으로 시작하세요"
      cols={COMPANY_COLS}
      rows={shownCompanies}
      rowKey={(r) => r.id}
      selectedRowKey={selectedCo?.id ?? null}
      onRowDoubleClick={(r) => { setEditing(false); setSelectedCo(r); }}
      onCloseDetail={() => { setEditing(false); setSelectedCo(null); }}
      sidePanel={selectedCo ? (
        <LedgerRecordPanel
          title={selectedCo.name}
          identity={selectedCo.bizNo || '사업자번호 미등록'}
          statusBadge={<Badge tone="blue">법인</Badge>}
          row={selectedCo}
          onClose={() => { setEditing(false); setSelectedCo(null); }}
          sections={[
            {
              title: '사업자', open: true, cols: [],
              body: <KV editing={editing} form={form} onChange={set} rows={[
                ['회사명', 'label', selectedCo.name],
                ['대표', 'ceo', selectedCo.ceo],
                ['사업자번호', 'bizNo', selectedCo.bizNo],
                ['법인번호', 'corpNo', String(selectedCo.master.corpNo || '')],
                ['전화', 'phone', selectedCo.phone],
                ['이메일', 'email', String(selectedCo.master.email || '')],
                ['개업일', 'openDate', String(selectedCo.master.openDate || '')],
                ['관할세무서', 'taxOffice', String(selectedCo.master.taxOffice || '')],
              ]} />,
            },
            {
              title: '소재지', cols: [],
              body: <KV editing={editing} form={form} onChange={set} rows={[
                ['본점', 'address', selectedCo.address],
                ['사업장', 'businessAddress', String(selectedCo.master.businessAddress || '')],
                ['차고지', null, `${selectedCo.garages}곳`],
              ]} />,
            },
            {
              /* ★계좌가 먼저 있어야 ERP가 돈다(자금일보·거래매칭이 계좌 기준).
                 수정 잠금은 «기 등록이냐»가 아니라 «거래가 붙었냐»로 가른다 —
                 은행·계좌번호·예금주는 신원이라 거래가 붙은 뒤 바꾸면 과거 귀속이 흔들린다.
                 약칭·용도·메모는 라벨이라 언제나 열어둔다(자금거래 불변 규칙과 같은 논리). */
              title: '법인계좌', cols: [], count: coAccounts.length,
              body: !coAccounts.length
                ? <DetailEmpty>계좌 없음 — [계좌 등록]으로 먼저 만드세요. 계좌가 있어야 자금이 들어옵니다.</DetailEmpty>
                : editing
                  ? <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {coAccounts.map((a) => {
                        const locked = a.transactionCount > 0;
                        return (
                          <div key={a.id}>
                            <div style={{ fontSize: 11.5, color: C.mute, padding: '0 0 4px 2px' }}>
                              {a.accountAlias || a.bankName || '계좌'}
                              {locked ? <> · <b style={{ color: C.warn }}>거래 {a.transactionCount}건 — 신원 잠금</b></> : null}
                            </div>
                            <KV editing form={form} onChange={set} rows={[
                              ['약칭', `acct:${a.id}:accountAlias`, a.accountAlias],
                              ['은행', locked ? null : `acct:${a.id}:bankName`, a.bankName],
                              ['계좌번호', locked ? null : `acct:${a.id}:accountNumber`, a.accountNumber],
                              ['예금주', locked ? null : `acct:${a.id}:accountHolder`, a.accountHolder],
                              ['용도', `acct:${a.id}:accountType`, a.accountType],
                            ]} />
                          </div>
                        );
                      })}
                    </div>
                  : <ExcelSheet rows={coAccounts} cols={ACCOUNT_BASIC_COLS} rowKey={(r) => r.id} />,
            },
            {
              title: '임대차', cols: [], count: coLeases.length,
              body: coLeases.length
                ? <ExcelSheet rows={coLeases} cols={LEASE_COLS} rowKey={(r) => r.id} />
                : <DetailEmpty>임대차 계약 없음 — 데이터센터에서 계약서를 담으세요</DetailEmpty>,
            },
          ]}
          actions={editing ? (
            <>
              <Btn size="sm" variant="solid" disabled={saving} onClick={() => { void saveEdit(); }}>
                {saving ? '저장 중…' : '저장'}
              </Btn>
              <Btn size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>취소</Btn>
            </>
          ) : (
            <>
              <Btn size="sm" variant="solid" onClick={startEdit}>수정</Btn>
              <Btn size="sm" variant="ghost" href="/cash">계좌 등록</Btn>
              <Btn size="sm" variant="ghost" onClick={() => openIngest('lease')}>임대차 담기</Btn>
            </>
          )}
        />
      ) : null}
    />
  );
}
