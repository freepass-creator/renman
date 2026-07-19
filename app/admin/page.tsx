'use client';
import { useSession, roleLabel, DEV_USERS } from '@/lib/session';
import { companyLabel, COMPANIES } from '@/lib/companies';
import { AccountAliases } from '@/components/AccountAliases';
import { CompanyRegistry } from '@/components/CompanyRegistry';
import { StaffConsole } from '@/components/StaffConsole';
import { Page, Panel, DetailGrid, DetailEmpty, Btn, C } from '@/components/ui';

export default function AdminPage() {
  const { companyId, user, isOperator } = useSession();
  const targets = isOperator ? COMPANIES : [companyId];
  return (
    <Page title="일반관리" meta="법인·직원·거래처 마스터">
      <Panel title="현재 보기">
        <DetailGrid rows={[
          ['보기 법인', companyLabel(companyId)],
          ['로그인 계정', `${user.name} · ${roleLabel(user.role)}`],
          ['권한', isOperator ? '본사 — 전 법인 합본·전환' : `법인 소속 — ${companyLabel(companyId)} 만 표시`],
        ]} />
      </Panel>

      <CompanyRegistry />

      <Panel title="법인 정보">
        <div style={{ padding: '12px 16px', fontSize: 12.5, color: C.mute, lineHeight: 1.7 }}>
          법인별 소재지·차고지·등록대수·증차신청·공문은 <b>법인관리</b>의 전용 페이지에서 관리합니다.
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>{targets.map((c) => (
            <Btn key={c} variant="ghost" href={`/company/${c}`}>{companyLabel(c)} →</Btn>
          ))}</div>
        </div>
      </Panel>

      <AccountAliases />

      <Panel title="계정 (dev)">
        <DetailGrid rows={DEV_USERS.map((u) => [u.name, `${roleLabel(u.role)} · ${u.email} · ${u.companyId ? companyLabel(u.companyId) : '전 법인'}`])} />
      </Panel>

      {isOperator && <StaffConsole />}

      <Panel title="거래처">
        <DetailEmpty>거래처(정비·보험·GPS·매입처) 마스터는 엔티티 추가 예정.</DetailEmpty>
      </Panel>
    </Page>
  );
}
