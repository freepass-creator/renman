'use client';
// 지난 계약 전용 페이지 — 종료된 계약을 표로. ?plate=지정 시 그 차량만, 없으면 회사 전체.
import { useEffect, useMemo, useState } from 'react';
import { useSession } from '@/lib/session';
import { normPlate } from '@/lib/plate';
import { type EntityRecord } from '@/lib/intake/entities';
import { Page, DataTable, EmptyState, Badge, TextLink, won, C, type Col, PageLoading } from '@/components/ui';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { companyLabel } from '@/lib/companies';
import { openCar } from '@/lib/ui-bus';
import { useEntityList } from '@/lib/use-entity-lists';

const yy = (s: unknown) => { const t = String(s || ''); return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(2, 10) : (t || '—'); };

export default function ContractHistoryPage() {
  const { companyId, scopeAll } = useSession();

  const [plate, setPlate] = useState('');
  const { rows, loading } = useEntityList('contract');
  useEffect(() => { try { setPlate(new URLSearchParams(window.location.search).get('plate') || ''); } catch { /* 무시 */ } }, []);

  const past = useMemo(() => rows
    .filter((c) => c.returnedDate && (!plate || normPlate(c.plate) === normPlate(plate)))
    .sort((a, b) => String(b.returnedDate || '').localeCompare(String(a.returnedDate || ''))), [rows, plate]);

  const cols: Col<EntityRecord>[] = [
    ...(scopeAll ? [{ key: '_co', label: '회사', render: (c: EntityRecord) => <span style={{ color: C.mute }}>{companyLabel(c.companyId)}</span> }] : []),
    ...(plate ? [] : [{ key: 'plate', label: '차량', render: (c: EntityRecord) => <TextLink mono onClick={() => openCar(String(c.plate || ''))}>{String(c.plate || '—')}</TextLink> }]),
    { key: 'name', label: '계약자', render: (c) => String(c.contractorName || c.contractNo || '—') },
    { key: 'period', label: '기간', render: (c) => `${yy(c.startDate)} ~ ${yy(c.returnedDate || c.endDate)}` },
    { key: 'rent', label: '월대여료', align: 'r', render: (c) => (c.monthlyRent ? won(c.monthlyRent) : '—') },
    { key: 'months', label: '개월', align: 'r', render: (c) => (c.rentalMonths ? `${c.rentalMonths}` : '—') },
    { key: 'end', label: '반납일', align: 'r', render: (c) => yy(c.returnedDate) },
    { key: 'reason', label: '종료사유', render: (c) => <Badge tone={String(c.endReason) === '중도해지' ? 'amber' : 'gray'}>{String(c.endReason || c.status || '종료')}</Badge> },
  ];

  return (
    <Page title="지난 계약" meta={`${plate ? plate : companyLabel(companyId)} · 종료 ${past.length}건`} tools={<WorkbenchBar />}>
      {loading ? <PageLoading />
        : past.length === 0 ? <EmptyState>지난 계약 없음</EmptyState>
          : <DataTable cols={cols} rows={past} />}
    </Page>
  );
}
