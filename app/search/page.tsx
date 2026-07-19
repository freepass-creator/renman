'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import { getStore } from '@/lib/store';
import { ENTITIES, type EntityRecord } from '@/lib/intake/entities';
import { companyLabel } from '@/lib/companies';
import { normPlate } from '@/lib/plate';
import { searchEntityKeys } from '@/lib/search-match';
import { Page, Cards, Metric, EmptyState, Sec, ListBox, ListRow, C, PageLoading } from '@/components/ui';
import { WorkbenchBar } from '@/components/WorkbenchBar';

type Hit = { entity: string; rec: EntityRecord; label: string; sub: string; href: string };

function hrefFor(entityKey: string, rec: EntityRecord): string {
  const key = encodeURIComponent(String(rec._key || ''));
  const plate = String(rec.plate || '');
  if (entityKey === 'vehicle') return `/vehicle/${encodeURIComponent(plate || String(rec._key || ''))}`;
  if (entityKey === 'customer') return `/customer/${key}`;
  // 세계관: 차·계약·보험·과태료는 360으로. 일반 CRUD /list 우회 최소화.
  if (plate && (entityKey === 'contract' || entityKey === 'insurance' || entityKey === 'penalty' || entityKey === 'history')) {
    return `/vehicle/${encodeURIComponent(plate)}`;
  }
  if (entityKey === 'bank_tx' || entityKey === 'card_tx') return '/payments';
  return `/list/${entityKey}/${key}`;
}

function SearchInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const { companyId, scopeAll } = useSession();
  const [term, setTerm] = useState(sp.get('q') || '');
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);

  // 통합 검색 — SEARCH_CORE 우선, 3자↑이면 자금·수신함 확장 (전 ENTITY_LIST fan-out 금지)
  useEffect(() => {
    const q = term.trim();
    if (!q) { setHits([]); setLoading(false); return; }
    setLoading(true);
    let alive = true;
    const timer = setTimeout(() => {
      const store = getStore();
      const ql = q.toLowerCase();
      const keys = searchEntityKeys(q);
      Promise.all(keys.map((k) => {
        const e = ENTITIES[k];
        return store.list(k, companyId).then((recs) => ({ e, recs }));
      }))
        .then((groups) => {
          if (!alive) return;
          const out: Hit[] = [];
          for (const { e, recs } of groups) {
            if (!e) continue;
            for (const rec of recs) {
              if (!e.fields.some((f) => {
                const raw = String(rec[f.key] ?? '');
                if (f.key === 'plate') return normPlate(raw).includes(normPlate(q)) || raw.toLowerCase().includes(ql);
                return raw.toLowerCase().includes(ql);
              })) continue;
              const f0 = e.fields[0], f1 = e.fields[1];
              const co = scopeAll ? ` · ${companyLabel(rec.companyId)}` : '';
              out.push({ entity: e.key, rec, label: String(rec[f0.key] ?? rec._key ?? ''), sub: `${e.label}${f1 ? ' · ' + String(rec[f1.key] ?? '') : ''}${co}`, href: hrefFor(e.key, rec) });
            }
          }
          setHits(out); setLoading(false);
        }).catch(() => { if (alive) setLoading(false); });
    }, 200);
    return () => { alive = false; clearTimeout(timer); };
  }, [term, companyId, scopeAll]);

  // URL 동기화(디바운스) — 툴바 FilterBox와 동일 소스
  useEffect(() => {
    const t = setTimeout(() => {
      const q = term.trim();
      const cur = sp.get('q') || '';
      if (q === cur) return;
      router.replace(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
    }, 300);
    return () => clearTimeout(t);
  }, [term, router, sp]);

  const byEntity = hits.reduce((m, h) => { m[h.entity] = (m[h.entity] || 0) + 1; return m; }, {} as Record<string, number>);

  return (
    <Page
      title="통합 검색"
      tools={<WorkbenchBar search={{ value: term, onChange: setTerm, placeholder: '차량·계약·손님·증권·고지서…' }} />}
    >
      {!term.trim() ? <EmptyState>차량·계약·손님·보험·과태료·이력 — 3자부터 자금·수신함도 검색합니다.</EmptyState>
        : loading ? <PageLoading label="검색 중…" />
        : hits.length === 0 ? <EmptyState>“{term.trim()}” 결과 없음</EmptyState>
        : (
          <>
            <Sec title="요약" desc={`${scopeAll ? '전체 회사' : companyLabel(companyId)} · ${hits.length}건`}>
              <Cards min={128} fit>
                <Metric label="전체 결과" value={`${hits.length}건`} tone="ok" />
                {Object.entries(byEntity).map(([ek, n]) => <Metric key={ek} label={ENTITIES[ek]?.label || ek} value={`${n}건`} />)}
              </Cards>
            </Sec>
            <Sec title="검색 결과" n={hits.length}>
              <ListBox>
                {hits.slice(0, 200).map((h, i) => (
                  <ListRow key={i} href={h.href} badge={ENTITIES[h.entity]?.label || h.entity} main={h.label} sub={h.sub}
                    right={<span style={{ fontSize: 12, color: C.faint }}>→</span>} />
                ))}
              </ListBox>
              {hits.length > 200 && <div style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>외 {hits.length - 200}건 — 검색어를 좁혀주세요</div>}
            </Sec>
          </>
        )}
    </Page>
  );
}

export default function SearchPage() {
  return <Suspense fallback={<Page title="통합 검색"><PageLoading /></Page>}><SearchInner /></Suspense>;
}
