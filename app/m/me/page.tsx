'use client';
/** /m 설정 — 모바일에서 필요한 현재 계정·조회 범위만 제공. 고급 설정은 웹임을 명시한다. */
import { useRouter } from 'next/navigation';
import { Rows, ObjRow, C, CompanyFilter } from '@/components/ui';
import { MHead } from '@/components/m/MHead';
import { roleLabel, useSession } from '@/lib/session';
import { companyLabel } from '@/lib/companies';

export default function MMe() {
  const router = useRouter();
  const { user, companyId, scopeAll, isOperator } = useSession();
  return (
    <>
      <MHead title="설정" sub="계정 · 조회 범위" color={C.mute} right={<CompanyFilter size="sm" />} />
      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Rows title="현재 계정">
          <ObjRow
            name={user.name || '이름 없음'}
            badge={roleLabel(user.role)}
            badgeTone={isOperator ? 'blue' : 'gray'}
            meta={user.email || '이메일 없음'}
            fields={[
              ['조회범위', scopeAll ? '전체 회사' : companyLabel(companyId)],
              ['소속', isOperator ? '본사' : companyLabel(user.companyId)],
            ]}
          />
        </Rows>
        <Rows title="웹 전용">
          <ObjRow name="고급 설정 열기" sub="초기화면 · 보안 · 데이터 내보내기" onClick={() => router.push('/settings')} />
          <ObjRow name="데스크톱 업무화면 열기" sub="전체 원장 · 데이터센터" onClick={() => router.push('/')} />
        </Rows>
        <div style={{ textAlign: 'center', fontSize: 10.5, color: C.faint }}>renman · 모바일 조회</div>
      </div>
    </>
  );
}
