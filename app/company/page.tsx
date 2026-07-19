'use client';
// 법인관리 — 법인 목록. 본사=전체, 법인 소속 직원=자기 법인으로 바로.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ChevronRight } from 'lucide-react';
import { useSession } from '@/lib/session';
import { COMPANIES, ALL_COMPANIES, companyLabel, companyShort } from '@/lib/companies';
import { loadMaster, MODULE_CATALOG } from '@/lib/company-master';
import { Page, C, ActionTile, SPACE_M } from '@/components/ui';

export default function CompanyListPage() {
  const { companyId, isOperator } = useSession();
  const router = useRouter();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!isOperator && companyId && companyId !== ALL_COMPANIES) router.replace(`/company/${companyId}`);
  }, [isOperator, companyId, router]);
  useEffect(() => { const on = () => setTick((n) => n + 1); window.addEventListener('jpk:master-change', on); return () => window.removeEventListener('jpk:master-change', on); }, []);

  const list = isOperator ? COMPANIES : [companyId].filter((c) => c && c !== ALL_COMPANIES);

  return (
    <Page title="법인관리" meta="법인별 전용 워크스페이스 — 소재지·차고지·등록대수·증차신청·공문">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: SPACE_M, marginTop: 8 }} data-tick={tick}>
        {list.map((c) => {
          const m = loadMaster(c);
          const mods = (m.modules || []).map((k) => MODULE_CATALOG.find((x) => x.key === k)?.label).filter(Boolean);
          const reg = Number(m.registeredCount) || 0;
          const garages = (m.garages || []).length;
          return (
            <ActionTile
              key={c}
              icon={<Building2 size={16} color={C.mute} />}
              label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{companyLabel(c)}<span style={{ fontSize: 11, fontWeight: 500, color: C.faint }}>{companyShort(c)}</span><ChevronRight size={14} color={C.faint} /></span>}
              desc={`등록 ${reg}대 · 차고지 ${garages}곳 · ${mods.join(' · ') || '모듈 없음'}`}
              onClick={() => router.push(`/company/${c}`)}
            />
          );
        })}
      </div>
    </Page>
  );
}
