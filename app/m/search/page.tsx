'use client';
/** 모바일 조회 — 차량·계약·업무 결과를 모바일 카드와 모바일 상세 경로로만 연다. */
import { Suspense, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { MHead } from '@/components/m/MHead';
import { C, EmptyState, ErrorState, ObjRow, PageLoading, Rows, Search } from '@/components/ui';
import { useEntityLists } from '@/lib/use-entity-lists';
import { matchContracts, matchVehicles, matchWorkItems } from '@/lib/search-match';

function MSearchInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState(params.get('q') || '');
  const { data: [vehicles = [], contracts = [], workItems = []], loading, error, reload } =
    useEntityLists(['vehicle', 'contract', 'work_item']);
  const q = query.trim();
  const vehicleHits = useMemo(() => matchVehicles(q, vehicles, contracts, 50), [q, vehicles, contracts]);
  const contractHits = useMemo(() => matchContracts(q, contracts, 50), [q, contracts]);
  const workHits = useMemo(() => matchWorkItems(q, workItems, 50), [q, workItems]);
  const total = vehicleHits.length + contractHits.length + workHits.length;

  return (
    <>
      <MHead title="조회" sub={q ? `${total}건` : '차량 · 계약 · 업무'} color={C.ok} />
      <div style={{ padding: '12px 14px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Search
          autoFocus
          size="sm"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="차번 · 계약자 · 업무 검색"
          style={{ width: '100%' }}
        />
        {!q ? <EmptyState variant="sec">검색어를 입력하세요</EmptyState>
          : loading ? <PageLoading label="검색 중…" />
          : error ? <ErrorState message={error} onRetry={reload} />
          : total === 0 ? <EmptyState variant="sec">“{q}” 결과가 없습니다</EmptyState>
          : (
            <>
              {vehicleHits.length > 0 && (
                <Rows title="차량" tone="blue" n={vehicleHits.length} id="m-search-vehicle">
                  {vehicleHits.map((hit) => (
                    <ObjRow
                      key={`${hit.companyId}:${hit.plate}`}
                      co={hit.companyId}
                      plate={hit.plate}
                      meta={String(hit.veh.carName || hit.veh.model || '')}
                      sub={hit.sub}
                      onClick={() => router.push(`/m/vehicle/${encodeURIComponent(hit.plate)}`)}
                    />
                  ))}
                </Rows>
              )}
              {contractHits.length > 0 && (
                <Rows title="계약" tone="teal" n={contractHits.length} id="m-search-contract">
                  {contractHits.map((hit) => (
                    <ObjRow
                      key={`${hit.companyId}:${hit.key}`}
                      co={hit.companyId}
                      plate={hit.plate || undefined}
                      name={hit.plate ? undefined : (hit.contractNo || hit.customer || '계약')}
                      meta={hit.customer}
                      fields={[["계약번호", hit.contractNo || '미지정'], ["상태", String(hit.rec.status || '미지정')]]}
                      onClick={hit.plate ? () => router.push(`/m/vehicle/${encodeURIComponent(hit.plate)}`) : undefined}
                    />
                  ))}
                </Rows>
              )}
              {workHits.length > 0 && (
                <Rows title="업무" tone="amber" n={workHits.length} id="m-search-work">
                  {workHits.map((hit) => (
                    <ObjRow
                      key={`${hit.companyId}:${hit.key}`}
                      co={hit.companyId}
                      name={hit.label}
                      sub={hit.sub}
                      onClick={() => router.push(`/m/work/${encodeURIComponent(hit.key)}`)}
                    />
                  ))}
                </Rows>
              )}
            </>
          )}
      </div>
    </>
  );
}

export default function MSearch() {
  return <Suspense fallback={<PageLoading label="검색 준비 중…" />}><MSearchInner /></Suspense>;
}
