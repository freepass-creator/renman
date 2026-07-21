'use client';
/**
 * 업무 허브 — 이벤트 처리 + 한곳 입력 고르기. 각 카드 → 페이지(Sec 배열).
 */
import { useRouter } from 'next/navigation';
import { Page, Sec, ObjCard, C, SPACE_M } from '@/components/ui';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { WORK_PAGES } from '@/lib/work-hub';
import { useSession } from '@/lib/session';
import { companyLabel } from '@/lib/companies';
import { tierIncludes } from '@/lib/tier';

export default function WorkHubPage() {
  const router = useRouter();
  const { companyId, scopeAll } = useSession();
  const open = WORK_PAGES.filter((p) => tierIncludes(p.tier));
  const work = open.filter((p) => p.kind === 'work');
  const input = open.filter((p) => p.kind === 'input');

  return (
    <Page
      title="업무현황"
      meta={`${scopeAll ? '전체 회사' : companyLabel(companyId)} · 업무·입력 한눈`}
      tools={<WorkbenchBar search />}
    >
      {work.length > 0 && (
        <Sec title="업무" desc="현장 처리 · 하나를 고르면 그 페이지만">
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_M }}>
            {work.map((p) => (
              <ObjCard
                key={p.href}
                name={p.label}
                sub={p.desc}
                fields={[['섹션', p.secs]]}
                onClick={() => router.push(p.href)}
                right={<span style={{ fontSize: 12, color: C.accent, fontWeight: 700 }}>열기 →</span>}
              />
            ))}
          </div>
        </Sec>
      )}
      {input.length > 0 && (
        <Sec title="입력" desc="한곳 잡기 · 서류·대량·현장 업로드">
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_M }}>
            {input.map((p) => (
              <ObjCard
                key={p.href}
                name={p.label}
                sub={p.desc}
                fields={[['섹션', p.secs]]}
                onClick={() => router.push(p.href)}
                right={<span style={{ fontSize: 12, color: C.accent, fontWeight: 700 }}>열기 →</span>}
              />
            ))}
          </div>
        </Sec>
      )}
    </Page>
  );
}
