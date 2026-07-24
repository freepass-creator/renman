'use client';
// 설정 = 통상 앱 설정 스타일(그룹 헤더 + ListBox 행 · 탭하면 펼침).
import { useEffect, useState, type ReactNode } from 'react';
import {
  KeyRound, Download, Trash2, Building2, FileText,
  ShieldAlert, History, BarChart3, Wrench, Settings2, ChevronRight, ChevronDown,
} from 'lucide-react';
import { useSession, roleLabel } from '@/lib/session';
import { companyLabel } from '@/lib/companies';
import { resetPassword } from '@/lib/firebase/auth';
import { getStore } from '@/lib/store';
import { ENTITIES } from '@/lib/intake/entities';
import { downloadCsv } from '@/lib/export-csv';
import { todayKST } from '@/lib/contracts/dates'; // KST 기준 오늘(내보내기 파일명)
import { Page, Panel, ListBox, ListRow, Btn, C, SPACE_M, usePrompt } from '@/components/ui';
import { NAV_GROUPS } from '@/lib/nav';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { closePeriod, reopenPeriod, useClosedPeriods } from '@/lib/finance/period-lock';
import { MobileTabsSettings, useMobileTabs } from '@/lib/mobile-tabs';
import { MyDeskSettings, useMyDeskPicked } from '@/lib/my-desk';
import { toast } from '@/lib/toast';

type OpenKey = 'landing' | 'mydesk' | 'tabs' | 'export' | 'closing' | null;

const EXPORTS: { key: string; label: string }[] = [
  { key: 'vehicle', label: '차량' }, { key: 'contract', label: '계약' }, { key: 'penalty', label: '과태료' },
  { key: 'insurance', label: '보험' }, { key: 'bank_tx', label: '계좌 거래' }, { key: 'customer', label: '손님' }, { key: 'history', label: '이력' },
];

type HubLink = { href: string; label: string; desc: string; icon: typeof Building2; hqOnly?: boolean };

const HUB: HubLink[] = [
  { href: '/company', label: '법인관리', desc: '소재지·차고지·등록대수·공문', icon: Building2 },
  { href: '/admin', label: '일반관리', desc: '계좌 약칭·법인 레지스트리', icon: Settings2 },
  { href: '/docs', label: '문서 발급', desc: '내용증명·공문 등', icon: FileText },
  { href: '/integrity', label: '리스크·정합성', desc: '데이터 이상·만기 점검', icon: ShieldAlert },
  { href: '/audit', label: '감사 로그', desc: '변경 이력', icon: History },
  { href: '/manage', label: '경영·손익', desc: '가동률·미수 aging·재무 요약', icon: BarChart3, hqOnly: true },
  { href: '/dev/data', label: '개발도구', desc: '시드·백엔드·회사별 데이터', icon: Wrench, hqOnly: true },
];

function Chevron({ open }: { open?: boolean }) {
  const Icon = open ? ChevronDown : ChevronRight;
  return <Icon size={16} color={C.faint} strokeWidth={2} />;
}

// 접었다 폈다 하는 행 — 펼침 마크(>/⌄)를 라벨 «좌측»에 둔다(> 초기화면).
function CollMain({ open, children }: { open: boolean; children: ReactNode }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Chevron open={open} />{children}</span>;
}

function ExpandPad({ children }: { children: ReactNode }) {
  return <div style={{ padding: '10px 12px 14px', borderTop: `1px solid ${C.line2}`, background: C.taupeBg }}>{children}</div>;
}

function ClosingBody({ companyId, actor }: { companyId: string; actor: string }) {
  const { closed, reload } = useClosedPeriods(companyId);
  const prompt = usePrompt();
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const toggle = async (ym: string) => {
    try {
      if (closed.includes(ym)) {
        const reason = await prompt({ message: `${ym} 마감 해제 사유 (필수)`, initial: '', required: true });
        if (!reason?.trim()) { toast('해제 사유를 입력해야 합니다', 'error'); return; }
        reopenPeriod(companyId, ym, actor, reason);
        toast(`${ym} 마감 해제`, 'info');
      } else {
        closePeriod(companyId, ym, actor);
        toast(`${ym} 마감`, 'success');
      }
      reload();
    } catch (e) {
      toast((e as Error).message || '마감 변경 실패', 'error');
    }
  };

  return (
    <>
      <p style={{ fontSize: 12.5, color: C.mute, margin: '0 0 10px', lineHeight: 1.6 }}>
        마감월은 계좌·카드 수정/삭제·계정과목 분류·수납 매칭이 차단됩니다. 해제는 사유 필수.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE_M }}>
        {months.map((ym) => {
          const on = closed.includes(ym);
          return (
            <Btn key={ym} size="sm" variant={on ? 'solid' : 'ghost'} onClick={() => toggle(ym)}>
              {on ? `마감 ${ym}` : ym}
            </Btn>
          );
        })}
      </div>
    </>
  );
}

export default function SettingsPage() {
  const { user, companyId, scopeAll, isOperator } = useSession();
  const { picked } = useMyDeskPicked();
  const { ids: tabIds } = useMobileTabs();
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [exporting, setExporting] = useState('');
  const [open, setOpen] = useState<OpenKey>(null);
  const [landing, setLanding] = useState<string>('/');  // 초기화면 = 메뉴 어느 href든(홈='/')
  useEffect(() => {
    try {
      const v = localStorage.getItem('jpk:landing') || '';
      if (v === 'mydesk') setLanding('/ops');            // 레거시 키 → href
      else if (v === 'field') setLanding('/dispatch');
      else if (!v || v === 'home') setLanding('/');
      else setLanding(v);
    } catch { /* 무시 */ }
  }, []);
  const pickLanding = (href: string) => { setLanding(href); try { localStorage.setItem('jpk:landing', href === '/' ? 'home' : href); sessionStorage.removeItem('jpk:landed'); } catch { /* 무시 */ } };
  const toggle = (k: OpenKey) => setOpen((cur) => (cur === k ? null : k));

  async function sendReset() {
    if (!user.email) return;
    setSending(true); setMsg('');
    try {
      await resetPassword(user.email);
      setMsg(`비밀번호 재설정 메일을 ${user.email} 로 보냈습니다. 메일함을 확인하세요.`);
    } catch (e) {
      setMsg('메일 발송 실패: ' + ((e as Error).message || String(e)));
    } finally { setSending(false); }
  }

  async function exportEntity(entityKey: string) {
    const ent = ENTITIES[entityKey]; if (!ent) return;
    setExporting(entityKey); setMsg('');
    try {
      const records = await getStore().list(entityKey, companyId);
      const headers = ['회사', ...ent.fields.map((f) => f.label)];
      const rows = records.map((r) => [companyLabel(r.companyId), ...ent.fields.map((f) => { const v = r[f.key]; return v == null || typeof v === 'object' ? '' : String(v); })]);
      downloadCsv(`${ent.label}_${todayKST()}`, headers, rows);
      setMsg(`${ent.label} ${records.length}건 엑셀 내보냄.`);
    } catch (e) {
      setMsg(`${ent.label} 내보내기 실패: ${(e as Error).message || String(e)}`);
    } finally { setExporting(''); }
  }

  const hub = HUB.filter((h) => !h.hqOnly || isOperator);
  // 초기화면 후보 = 햄버거 메뉴 전 항목(권한 필터). 홈 포함.
  const landingItems = NAV_GROUPS.flatMap((g) => g.items).filter((it) => !it.hqOnly || isOperator);
  const landingLabel = landingItems.find((it) => it.href === landing)?.label || '홈';

  return (
    <Page title="설정" meta={`${user.name} · ${roleLabel(user.role)}`} tools={<WorkbenchBar />}>
      <Panel title="계정">
        <ListBox>
          <ListRow main="이름" right={<span style={{ fontSize: 12.5, color: C.mute }}>{user.name}</span>} />
          <ListRow main="이메일" right={<span style={{ fontSize: 12.5, color: C.mute }}>{user.email || '—'}</span>} />
          <ListRow main="역할" right={<span style={{ fontSize: 12.5, color: C.mute }}>{roleLabel(user.role)}</span>} />
          <ListRow main="보기 범위" right={<span style={{ fontSize: 12.5, color: C.mute }}>{scopeAll ? '전체 법인' : companyLabel(companyId)}</span>} />
          <ListRow main="소속" sub={isOperator ? '본사 — 전 법인 관리·전환' : `법인 고정 · ${companyLabel(user.companyId)}`} />
        </ListBox>
      </Panel>

      <Panel title="화면">
        <ListBox>
          <ListRow
            main={<CollMain open={open === 'landing'}>초기 화면</CollMain>}
            sub="앱을 열 때 처음 보이는 화면 — 메뉴 어디든 지정"
            right={<span style={{ fontSize: 12.5, color: C.mute }}>{landingLabel}</span>}
            onClick={() => toggle('landing')}
          />
          {open === 'landing' && (
            <ExpandPad>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {landingItems.map((it) => {
                  const Icon = it.icon;
                  const on = landing === it.href;
                  return (
                    <Btn key={it.href} size="sm" variant={on ? 'solid' : 'ghost'} onClick={() => pickLanding(it.href)}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon size={14} /> {it.label}</span>
                    </Btn>
                  );
                })}
              </div>
            </ExpandPad>
          )}
          <ListRow
            main={<CollMain open={open === 'mydesk'}>마이페이지 섹션</CollMain>}
            sub="내 업무에 담을 섹션"
            right={<span style={{ fontSize: 12.5, color: C.mute }}>{picked.length}개</span>}
            onClick={() => toggle('mydesk')}
          />
          {open === 'mydesk' && <ExpandPad><MyDeskSettings /></ExpandPad>}
          <ListRow
            main={<CollMain open={open === 'tabs'}>모바일 하단 메뉴</CollMain>}
            sub="하단 탭 구성"
            right={<span style={{ fontSize: 12.5, color: C.mute }}>{tabIds.length}개</span>}
            onClick={() => toggle('tabs')}
          />
          {open === 'tabs' && <ExpandPad><MobileTabsSettings /></ExpandPad>}
        </ListBox>
      </Panel>

      <Panel title="관리 · 도구">
        <ListBox>
          {hub.map((h) => (
            <ListRow
              key={h.href}
              href={h.href}
              main={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><h.icon size={15} color={C.mute} />{h.label}</span>}
              sub={h.desc}
              right={<Chevron />}
            />
          ))}
        </ListBox>
      </Panel>

      {!scopeAll && (
        <Panel title="회계">
          <ListBox>
            <ListRow
              main={<CollMain open={open === 'closing'}>회계 마감</CollMain>}
              sub="마감월 쓰기 차단"
              onClick={() => toggle('closing')}
            />
            {open === 'closing' && (
              <ExpandPad>
                <ClosingBody companyId={companyId} actor={user.email || user.name || 'operator'} />
              </ExpandPad>
            )}
          </ListBox>
        </Panel>
      )}

      <Panel title="데이터 · 보안">
        <ListBox>
          <ListRow
            main="비밀번호 재설정"
            sub={user.email ? '등록 이메일로 링크 발송' : '이메일 없음'}
            right={sending ? <span style={{ fontSize: 12, color: C.faint }}>보내는 중…</span> : <KeyRound size={15} color={C.faint} />}
            onClick={() => { if (!sending && user.email) void sendReset(); }}
          />
          <ListRow
            main={<CollMain open={open === 'export'}>엑셀 내보내기</CollMain>}
            sub={`${scopeAll ? '전체 법인' : companyLabel(companyId)} CSV`}
            right={<Download size={15} color={C.faint} />}
            onClick={() => toggle('export')}
          />
          {open === 'export' && (
            <ExpandPad>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {EXPORTS.map((e) => (
                  <Btn key={e.key} size="sm" variant="ghost" onClick={() => exportEntity(e.key)} disabled={!!exporting}>
                    {exporting === e.key ? '내보내는 중…' : e.label}
                  </Btn>
                ))}
              </div>
            </ExpandPad>
          )}
          <ListRow
            href="/trash"
            main={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><Trash2 size={15} color={C.mute} />휴지통</span>}
            sub="삭제한 항목 복구"
            right={<Chevron />}
          />
        </ListBox>
      </Panel>

      {msg && <div style={{ marginTop: 14, fontSize: 13, color: msg.includes('실패') ? C.danger : C.ok, fontWeight: 600 }}>{msg}</div>}
    </Page>
  );
}
