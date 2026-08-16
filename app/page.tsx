'use client';
/**
 * 메인(/) — **할 일 · 데이터 · 올리기, 셋뿐.**
 *
 * ## 구조 (사장님 확정 2026-08-09)
 *   「ERP 는 결국 원장 데이터가 쌓이고 «뭘 해야 하는지»를 알려주는 **업무 내비게이션**이었다.
 *    올리고 · 쌓고 · 조회하고 · 반영하고 — 그래서 **못 한 업무, 처리 안 된 게 없게** 하는 것.
 *    화면은 **할 일 확인 · 데이터 원장 조회 · 데이터 올리기 3개**.」
 *
 *   [할 일]  문제 목록 — 구분·분류·상태·문제·할 일. 누르면 **360**
 *   [데이터] 원장 입구. 원장 행을 누르면 **360**
 *   [올리기] 자료 투입 — 쌓아야 조회가 있고, 조회가 있어야 할 일이 나온다
 *   [검색]   위쪽 한 줄. 무엇이든 디테일하게
 *
 *   사이드바·메뉴버튼 없음. 셸(상단바)도 이 화면엔 없다(components/AppShell 에서 제외).
 *
 * 데이터는 buildRiskSheetRows → buildHomeProblems 만. 페이지에서 재집계·재판정 없음.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search as SearchIcon, Upload } from 'lucide-react';
import { C, SP, won } from '@/components/ui';
import { TODAY } from '@/lib/dashboard-consts';
import { useDashboardData } from '@/lib/use-dashboard-data';
import { buildRiskSheetRows } from '@/lib/risk-ledger';
import { buildHomeProblems, countByGroup } from '@/lib/home-problems';
import { useIsMobile } from '@/lib/use-mobile';

type Tab = '할 일' | '데이터' | '올리기';

const GROUP_COLOR: Record<string, string> = {
  미완료: C.danger, 미납: C.danger, 만기: C.warn, 휴차: C.faint,
};

/** 데이터 탭 = 원장 입구. 「쌓인 것을 조회하는 곳」. */
const LEDGERS: Array<{ href: string; label: string; desc: string }> = [
  { href: '/status', label: '운영현황', desc: '차량 1대 = 1행' },
  { href: '/asset', label: '자산', desc: '차량 원장 · 등록증·취득·금융' },
  { href: '/contract', label: '계약', desc: '계약 1건 = 1행' },
  { href: '/cash', label: '자금', desc: '계좌·카드 거래' },
  { href: '/payments', label: '자금일보', desc: '일별 분류·매칭' },
  { href: '/work', label: '업무', desc: '정비·상담·과태료' },
  { href: '/risk', label: '리스크', desc: '미완료·미납·만기·휴차' },
  { href: '/management', label: '경영', desc: '법인·계좌·임대차' },
];

/** 올리기 탭 — 무엇을 올릴지. 종류를 몰라도 위의 드롭존으로 먼저 올리면 된다. */
const UPLOADS: Array<{ href: string; label: string; desc: string }> = [
  { href: '/contract', label: '계약서', desc: 'OCR → 계약 생성' },
  { href: '/asset', label: '자동차등록증', desc: 'OCR → 차량 등록' },
  { href: '/work', label: '과태료 고지서', desc: 'OCR → 임차인 매칭' },
  { href: '/cash', label: '통장·카드 내역', desc: '엑셀 · 단건 입력' },
  { href: '/ingest', label: '그 밖의 문서', desc: '보험증권·면허증·사업자등록증' },
];

export default function HomePage() {
  const router = useRouter();
  const mobile = useIsMobile();
  const { contracts, vehicles, insurances, penalties, history, bankTx, loading } = useDashboardData();
  const [tab, setTab] = useState<Tab>('할 일');
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('전체');

  const problems = useMemo(() => buildHomeProblems(
    buildRiskSheetRows(vehicles, contracts, insurances, penalties, history, TODAY, bankTx),
  ), [vehicles, contracts, insurances, penalties, history, bankTx]);

  const groups = useMemo(() => countByGroup(problems), [problems]);
  const shown = useMemo(
    () => (group === '전체' ? problems : problems.filter((p) => p.group === group)),
    [problems, group],
  );

  const go = (href: string) => router.push(href);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = q.trim();
    if (t) go(`/search?q=${encodeURIComponent(t)}`);
  };

  return (
    <main style={{
      minHeight: '100dvh', background: C.bg,
      padding: mobile ? `${SP[4]}px ${SP[3]}px ${SP[6]}px` : `${SP[5]}px ${SP[5]}px ${SP[6]}px`,
    }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>

        {/* ── 검색 — 위쪽 한 줄 ── */}
        <form onSubmit={submit} style={{ position: 'relative', maxWidth: 560, margin: `0 auto ${SP[4]}px` }}>
          <SearchIcon
            size={17} color={C.faint}
            style={{ position: 'absolute', left: 17, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
          <input
            autoFocus={!mobile}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="차량번호 · 계약자 · 무엇이든"
            aria-label="찾기"
            style={{
              width: '100%', boxSizing: 'border-box',
              height: 48, paddingLeft: 45, paddingRight: 16,
              borderRadius: 999, border: `1px solid ${C.line}`,
              background: C.card, color: C.ink, fontSize: 14.5, outline: 'none',
              boxShadow: 'var(--shadow)',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = C.lineStrong; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = C.line; }}
          />
        </form>

        {/* ── 탭 3개 — 할 일 확인 · 데이터 원장 조회 · 데이터 올리기 ── */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: SP[1], marginBottom: SP[4] }}>
          {(['할 일', '데이터', '올리기'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                height: 34, padding: '0 18px', borderRadius: 999, border: 'none',
                background: tab === t ? C.ink : 'transparent',
                color: tab === t ? C.inverse : C.sub,
                fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {t}
              {t === '할 일' && problems.length > 0 && (
                <span style={{
                  fontSize: 11.5, fontWeight: 800,
                  color: tab === t ? C.inverse : C.danger, opacity: tab === t ? 0.85 : 1,
                }}>
                  {problems.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === '할 일' ? (
          <>
            {/* 구분 칩 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: SP[1] + 2, justifyContent: 'center', marginBottom: SP[3] }}>
              <Chip label="전체" n={problems.length} on={group === '전체'} onClick={() => setGroup('전체')} />
              {groups.map((g) => (
                <Chip key={g.group} label={g.group} n={g.n} color={GROUP_COLOR[g.group]}
                  on={group === g.group} onClick={() => setGroup(g.group)} />
              ))}
            </div>

            {loading ? (
              <Center>불러오는 중…</Center>
            ) : shown.length === 0 ? (
              <Center>처리 안 된 일이 없습니다</Center>
            ) : (
              <div style={{ background: C.line, borderRadius: 'var(--radius-card)', overflow: 'hidden', display: 'grid', gap: 1 }}>
                {shown.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => go(p.href)}
                    title={p.plate ? `${p.plate} 360 열기` : undefined}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: mobile ? '1fr' : '88px 1fr 100px',
                      alignItems: 'center', gap: mobile ? 4 : SP[3],
                      width: '100%', textAlign: 'left', border: 'none',
                      background: C.card, padding: `9px ${SP[3]}px`,
                      cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: C.ink,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {p.plate || p.company}
                    </span>

                    <span style={{ minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                      <Tag text={p.group} color={GROUP_COLOR[p.group] || C.faint} />
                      <span style={{ color: C.sub }}>{p.kind}</span>
                      <span style={{ color: C.faint }}>·</span>
                      <span style={{ color: C.sub }}>{p.status}</span>
                      <span style={{ color: C.faint }}>—</span>
                      <span style={{ color: C.ink, fontWeight: 600 }}>{p.problem}</span>
                      <span style={{
                        color: p.urgent ? C.danger : C.warn, fontWeight: 700,
                        background: p.urgent ? 'var(--red-bg)' : 'var(--orange-bg)',
                        borderRadius: 'var(--radius)', padding: '1px 7px',
                      }}>
                        {p.action}
                      </span>
                    </span>

                    <span style={{
                      textAlign: mobile ? 'left' : 'right', fontSize: 12.5, whiteSpace: 'nowrap',
                      color: p.amount > 0 ? C.danger : C.faint, fontWeight: p.amount > 0 ? 700 : 400,
                    }}>
                      {p.amount > 0 ? won(p.amount) : (p.dueDate || '—')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : tab === '데이터' ? (
          <>
            {/* ── 데이터 — 쌓인 것을 조회하는 곳. ── */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: mobile ? '1fr' : 'repeat(auto-fill, minmax(216px, 1fr))',
              gap: SP[2],
            }}>
              {LEDGERS.map((l) => (
                <button
                  key={l.href}
                  type="button"
                  onClick={() => go(l.href)}
                  style={{
                    textAlign: 'left', border: `1px solid ${C.line}`,
                    borderRadius: 'var(--radius-card)', background: C.card,
                    padding: `${SP[3]}px ${SP[3]}px`, cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{l.label}</div>
                  <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{l.desc}</div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* ── 올리기 — 쌓아야 조회가 있고, 조회가 있어야 할 일이 나온다. ── */}
            <button
              type="button"
              onClick={() => go('/ingest')}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                width: '100%', minHeight: 128, marginBottom: SP[3],
                borderRadius: 'var(--radius-card)', border: `1px dashed ${C.lineStrong}`,
                background: C.card, color: C.ink, cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <Upload size={22} color={C.sub} />
              <span style={{ fontSize: 14.5, fontWeight: 700 }}>자료 올리기</span>
              <span style={{ fontSize: 12, color: C.faint }}>문서·엑셀·통장 — 종류를 몰라도 먼저 올리면 된다</span>
            </button>

            <div style={{
              display: 'grid',
              gridTemplateColumns: mobile ? '1fr' : 'repeat(auto-fill, minmax(216px, 1fr))',
              gap: SP[2],
            }}>
              {UPLOADS.map((u) => (
                <button
                  key={u.href}
                  type="button"
                  onClick={() => go(u.href)}
                  style={{
                    textAlign: 'left', border: `1px solid ${C.line}`,
                    borderRadius: 'var(--radius-card)', background: C.card,
                    padding: `${SP[3]}px`, cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{u.label}</div>
                  <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{u.desc}</div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <p style={{ textAlign: 'center', color: C.faint, fontSize: 13, padding: `${SP[6]}px 0`, margin: 0 }}>{children}</p>;
}

function Chip({ label, n, color, on, onClick }: {
  label: string; n: number; color?: string; on: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 28, padding: '0 11px', borderRadius: 999,
        border: `1px solid ${on ? C.ink : C.line}`,
        background: on ? C.ink : C.card,
        color: on ? C.inverse : (color || C.sub),
        fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 5,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {label}
      <span style={{ opacity: 0.75, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
    </button>
  );
}

function Tag({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', height: 18, padding: '0 6px',
      borderRadius: 'var(--radius)', fontSize: 11, fontWeight: 700,
      color, background: 'var(--bg-sunken)', whiteSpace: 'nowrap',
    }}>
      {text}
    </span>
  );
}
