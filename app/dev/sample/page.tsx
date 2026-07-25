'use client';
/**
 * /dev/sample — ERP 3축 시안 구체화 (샌드박스 · 실페이지 무영향).
 *   ① 원장 = 마스터 그리드(상단필터 · 기본/전체) → 행클릭=360
 *   ③ 미수 = 고유 업무 큐 예시(원장 복제 X · 「미수 신규」없음 · 조치→360)
 *   신규 = 담기(최소 생성)만 · 풀 등록 위저드 페이지 금지 → 살은 360
 *   안내 = 규격 메모
 */
import { useMemo, useState } from 'react';
import { Download, Upload, FileText, Wallet } from 'lucide-react';
import { TODAY } from '@/lib/dashboard-consts';
import { linkFleet } from '@/lib/domain/model';
import { collectionStage } from '@/lib/domain/status';
import { buildFleetRows, statusRank, type FleetRow } from '@/lib/sheet-rows';
import { FLEET_BASIC_COLS, FLEET_EXPANDED_COLS } from '@/lib/sheet-cols';
import { useEntityLists } from '@/lib/use-entity-lists';
import { openCar, openIngest } from '@/lib/ui-bus';
import {
  Page, Sec, ExcelSheet, ObjCard, Btn, EmptyState, PageLoading, Message, Search,
  PillTabs, Metric, Cards, won, C, SPACE_M, SPACE_GROUP_M, toggleStyle,
} from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';
import { Sample360Design } from './Sample360';

type Demo = '원장' | '360' | '미수' | '신규' | '안내';
type ColView = '기본' | '전체';
type RecvLens = '전체' | '경고+' | '90일+';

const STATUS_OPTS = [
  { key: '인도예정', rank: 0 },
  { key: '만기경과', rank: 1 },
  { key: '휴차', rank: 2 },
  { key: '마감임박', rank: 3 },
  { key: '운행중', rank: 4 },
] as const;

function statusKey(r: FleetRow) {
  const k = statusRank(r);
  return k === 0 ? '인도예정' : k === 1 ? '만기경과' : k === 2 ? '휴차' : k === 3 ? '마감임박' : k === 4 ? '운행중' : '기타';
}

export default function SamplePage() {
  const mobile = useIsMobile();
  const { data: [vs = [], cs = [], ins = [], hs = []], loading } = useEntityLists(['vehicle', 'contract', 'insurance', 'history']);
  const allRows = useMemo(() => {
    const f = linkFleet(vs, cs, TODAY);
    return buildFleetRows(f.vehicles, ins, f.contracts, hs, TODAY);
  }, [vs, cs, ins, hs]);

  const [demo, setDemo] = useState<Demo>('360');
  const [colView, setColView] = useState<ColView>('기본');
  const [q, setQ] = useState('');
  const [statusSel, setStatusSel] = useState<Set<string>>(new Set());
  const [recvLens, setRecvLens] = useState<RecvLens>('전체');
  const [recvQ, setRecvQ] = useState('');
  const [expandPlate, setExpandPlate] = useState<string | null>(null);
  const [zoomPlate, setZoomPlate] = useState<string | null>(null);
  const [zoomNew, setZoomNew] = useState(false);

  const held = useMemo(() => allRows.filter((r) => r.ownership !== '처분완료'), [allRows]);

  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return held.filter((r) => {
      if (statusSel.size && !statusSel.has(statusKey(r))) return false;
      if (qq) {
        const hay = `${r.plate} ${r.company} ${r.customer} ${r.carName} ${r.maker}`.toLowerCase();
        if (!hay.includes(qq)) return false;
      }
      return true;
    }).sort((a, b) => statusRank(a) - statusRank(b) || a.plate.localeCompare(b.plate, 'ko'));
  }, [held, statusSel, q]);

  const zoomRow = useMemo(
    () => (zoomPlate ? held.find((r) => r.plate === zoomPlate) || null : null),
    [held, zoomPlate],
  );

  /** 미수 큐 — 원장과 같은 FleetRow, net>0만. 「미수 등록」대상이 아님. */
  const unpaid = useMemo(() => held
    .filter((r) => r.net > 0)
    .map((r) => ({ r, st: collectionStage(r.overdueDays) }))
    .sort((a, b) => b.r.net - a.r.net || b.r.overdueDays - a.r.overdueDays), [held]);

  const unpaidFiltered = useMemo(() => {
    const qq = recvQ.trim().toLowerCase();
    return unpaid.filter(({ r, st }) => {
      if (recvLens === '경고+' && st.stage === '정상') return false;
      if (recvLens === '90일+' && r.overdueDays < 90) return false;
      if (!qq) return true;
      const hay = `${r.plate} ${r.customer} ${r.phone} ${r.company}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [unpaid, recvLens, recvQ]);

  const unpaidTotal = unpaid.reduce((s, x) => s + x.r.net, 0);
  const unpaid90 = unpaid.filter((x) => x.r.overdueDays >= 90).length;
  const unpaidWarn = unpaid.filter((x) => x.st.stage !== '정상').length;

  const heldCnt = rows.length;
  const idleCnt = rows.filter((r) => r.util === '휴차').length;
  const net = rows.reduce((s, r) => s + Math.max(0, r.net), 0);
  const cols = colView === '기본' ? FLEET_BASIC_COLS : FLEET_EXPANDED_COLS;

  const toggleStatus = (k: string) => setStatusSel((s) => {
    const n = new Set(s);
    n.has(k) ? n.delete(k) : n.add(k);
    return n;
  });

  if (demo === '360' && (zoomNew || zoomPlate)) {
    return (
      <Sample360Design
        row={zoomNew ? null : zoomRow}
        isNew={zoomNew}
        onBack={() => { setZoomPlate(null); setZoomNew(false); }}
      />
    );
  }

  return (
    <Page
      frame={demo === '원장'}
      noCompany
      title="샘플 · ERP 3축"
      meta="원장 · 360 · 미수 — 실데이터 시안"
      mid={
        <PillTabs
          value={demo}
          onChange={setDemo}
          tabs={[
            { key: '원장', label: '① 원장' },
            { key: '360', label: '② 360' },
            { key: '미수', label: '③ 미수', badge: unpaid.length || undefined },
            { key: '신규', label: '신규=담기' },
            { key: '안내', label: '안내' },
          ]}
        />
      }
      right={
        demo === '원장' ? (
          <Btn size="sm" variant="ghost" onClick={() => openIngest('vehicle')}><Upload size={14} /> 차량 담기</Btn>
        ) : demo === '360' ? (
          <Btn size="sm" onClick={() => { setZoomNew(true); setZoomPlate(null); }}>+ 신규 360</Btn>
        ) : demo === '미수' ? (
          <Btn size="sm" variant="ghost" onClick={() => openIngest('contract')}><Upload size={14} /> 계약 담기</Btn>
        ) : undefined
      }
    >
      {/* ── ② 360 시안 — 차량 고르면 DetailShell ── */}
      {demo === '360' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_GROUP_M }}>
          <Message variant="info">
            운영원장 행 클릭 = 이 면. 그룹: <b>현황 → 자산 → 계약 → 이력</b>. 우측「+ 신규 360」= 빈 껍데기(같은 규격).
          </Message>
          {loading ? <PageLoading /> : !held.length ? (
            <EmptyState>차량이 없습니다</EmptyState>
          ) : (
            <Sec title="차량 고르기" n={Math.min(held.length, 40)} desc="클릭 → 360 시안">
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_M }}>
                {held.slice(0, 40).map((r) => (
                  <ObjCard
                    key={r.plate}
                    onClick={() => { setZoomNew(false); setZoomPlate(r.plate); }}
                    badge={r.status}
                    badgeTone={r.net > 0 ? 'red' : 'gray'}
                    plate={r.plate}
                    carType={r.company || undefined}
                    fields={[
                      ['사용처', r.customer || '—'],
                      ['차명', r.carName || '—'],
                    ]}
                    right={r.net > 0 ? <span style={{ color: C.danger, fontWeight: 700 }}>{r.net.toLocaleString('ko-KR')}</span> : undefined}
                  />
                ))}
              </div>
            </Sec>
          )}
        </div>
      )}

      {/* ── 안내 ── */}
      {demo === '안내' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_GROUP_M, maxWidth: 760 }}>
          <Message variant="info">
            원자·OCR·엑셀 수집은 그대로. 이 샘플은 <b>페이지 자리와 보여주기</b>만 구체화합니다.
          </Message>
          <Sec title="① 원장" desc="마스터 그리드">
            전 차량 스캔. 기본/전체=열만. 행→360. 좌측 레일 없음.
          </Sec>
          <Sec title="② 360" desc="현황 · 자산 · 계약 · 이력">
            DetailShell. 신규=빈 360 같은 Sec. 이력은 전부 여기(별도 이력원장 메뉴 없음).
          </Sec>
          <Sec title="③ 고유 (예: 미수관리)" desc="워크리스트">
            원장에서 net&gt;0인 줄만 큐로. 「미수 신규」없음.
          </Sec>
          <Sec title="신규" desc="얇은 담기 → 360">
            데이터센터/담기 = 키만. 살은 360.
          </Sec>
        </div>
      )}

      {/* ── ③ 미수관리 시안 ── */}
      {demo === '미수' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_GROUP_M }}>
          <Message variant="info">
            <b>미수관리</b> = 원장 위 업무 렌즈. 미수 원장을 새로 등록하지 않음.
            조치(연락·360·독촉)만. 계약이 없을 때만 「계약 담기」.
          </Message>

          {loading ? <PageLoading /> : (
            <>
              <Cards min={128} fit>
                <Metric label="미수 건" value={unpaid.length} />
                <Metric label="미수 합" value={won(unpaidTotal)} tone="danger" />
                <Metric label="경고+" value={unpaidWarn} tone={unpaidWarn ? 'warn' : undefined} onClick={() => setRecvLens('경고+')} />
                <Metric label="90일+" value={unpaid90} tone={unpaid90 ? 'danger' : undefined} onClick={() => setRecvLens('90일+')} />
              </Cards>

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                <Search
                  size="sm"
                  placeholder="차번·계약자·연락처"
                  value={recvQ}
                  onChange={(e) => setRecvQ(e.target.value)}
                  style={{ width: mobile ? '100%' : 200 }}
                />
                <PillTabs
                  size="sm"
                  value={recvLens}
                  onChange={setRecvLens}
                  tabs={[
                    { key: '전체', label: '전체' },
                    { key: '경고+', label: '경고+' },
                    { key: '90일+', label: '90일+' },
                  ]}
                />
                {/* 의도적 부재: 「+ 미수 등록」버튼 — 시안에서 만들지 않음 */}
              </div>

              {!unpaidFiltered.length ? (
                <EmptyState variant="ok">이 필터에 미수 건이 없습니다</EmptyState>
              ) : (
                <Sec title="회수 큐" n={unpaidFiltered.length} desc="급한 순 · 카드 클릭=360(미수) · 펼치면 그자리 조치">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_M }}>
                    {unpaidFiltered.map(({ r, st }) => {
                      const open = expandPlate === r.plate;
                      return (
                        <div key={r.plate} style={{ display: 'flex', flexDirection: 'column', gap: SPACE_M }}>
                          <ObjCard
                            onClick={() => setExpandPlate(open ? null : r.plate)}
                            rail={st.tone === 'red' || st.tone === 'purple' ? 'danger' : st.tone === 'orange' || st.tone === 'amber' ? 'warn' : 'none'}
                            badge={st.stage}
                            badgeTone={st.tone === 'purple' ? 'purple' : st.tone === 'red' ? 'red' : st.tone === 'orange' ? 'orange' : st.tone === 'amber' ? 'amber' : 'gray'}
                            plate={r.plate}
                            carType={r.customer || r.carName || undefined}
                            fields={[
                              ['연체', `${r.overdueDays}일`],
                              ['다음', st.nextAction || '—'],
                            ]}
                            right={<span style={{ color: C.danger, fontWeight: 700 }}>{won(r.net)}</span>}
                          />
                          {open && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE_M, paddingLeft: 4 }}>
                              <Btn size="sm" onClick={() => openCar(r.plate, 'unpaid')}>360 · 미수</Btn>
                              <Btn size="sm" variant="ghost" onClick={() => openCar(r.plate)}>차량 상세</Btn>
                              <Btn size="sm" variant="ghost" disabled>+ 연락 기록</Btn>
                              <Btn size="sm" variant="ghost" disabled>내용증명</Btn>
                              <span style={{ fontSize: 11.5, color: C.mute, alignSelf: 'center' }}>
                                저장·발송은 실 `/receivables` · 여기는 자리만
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Sec>
              )}
            </>
          )}
        </div>
      )}

      {/* ── 신규 = 담기 (풀 등록 페이지 대체) ── */}
      {demo === '신규' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_GROUP_M, maxWidth: 720 }}>
          <Message variant="warning">
            <b>하지 않음:</b> 「차량 신규등록」「계약 신규등록」「미수 신규」풀페이지 위저드.
            입력 UI가 360과 두 벌이 됩니다.
          </Message>
          <Message variant="info">
            <b>함:</b> 담기(키만) → 같은 360에서 Sec별 살. 대량은 데이터센터(OCR·엑셀).
          </Message>

          <Sec title="한곳 · 담기" desc="존재가 생김 = 최소 키">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE_M }}>
              <Btn onClick={() => openIngest('vehicle')}><Upload size={14} /> 차량 담기</Btn>
              <Btn variant="ghost" onClick={() => openIngest('contract')}><FileText size={14} /> 계약 담기</Btn>
              <Btn variant="ghost" onClick={() => openIngest('bank_tx')}><Wallet size={14} /> 계좌·입금 담기</Btn>
              <Btn variant="ghost" onClick={() => openIngest()}>데이터센터 열기</Btn>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 12.5, color: C.mute, lineHeight: 1.45 }}>
              담기 완료 후 → 해당 차번 360에서 스펙·보험·서류·할부 입력 (이미 Vehicle360 Sec).
            </p>
          </Sec>

          <Sec title="그자리 · 고유 페이지의 +" desc="미수/배차 화면 우측">
            미수 탭 우측 「계약 담기」처럼 — 업무 화면에도 <b>같은 openIngest</b>만.
            「+ 미수 건 만들기」는 없음 (미수=계약·입금 파생).
          </Sec>

          <Sec title="원장과의 관계" desc="스캔 ↔ 생성">
            원장에서 없는 차 → 담기 → 원장 행 생김 → 클릭해 360.
            고유(미수)는 그 행이 net&gt;0일 때만 큐에 뜸.
          </Sec>
        </div>
      )}

      {/* ── ① 원장 ── */}
      {demo === '원장' && (
        <>
          <div style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, flexShrink: 0,
            paddingBottom: 10, marginBottom: 4,
          }}>
            <Search
              size="sm"
              placeholder="차번·법인·사용처·차명"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: mobile ? '100%' : 220 }}
            />
            <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
              {STATUS_OPTS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  data-ui="toggle"
                  aria-pressed={statusSel.has(s.key)}
                  onClick={() => toggleStatus(s.key)}
                  style={toggleStyle(statusSel.has(s.key), 'sm', mobile)}
                >
                  {s.key}
                </button>
              ))}
              {statusSel.size > 0 && (
                <Btn variant="ghost" size="sm" onClick={() => setStatusSel(new Set())}>상태 해제</Btn>
              )}
            </span>
            <span style={{ flex: 1, minWidth: 8 }} />
            <span style={{ fontSize: 12.5, whiteSpace: 'nowrap', display: 'inline-flex', gap: 12 }}>
              <span>보유 <b>{heldCnt}</b></span>
              <span>휴차 <b>{idleCnt}</b></span>
              {net > 0 && <span>미수 <b style={{ color: C.danger }}>{won(net)}</b></span>}
            </span>
            <PillTabs
              size="sm"
              value={colView}
              onChange={setColView}
              tabs={[
                { key: '기본', label: '기본' },
                { key: '전체', label: '전체' },
              ]}
            />
            <Btn variant="ghost" size="sm" disabled={!rows.length} onClick={() => {
              const head = cols.map((c) => c.label);
              const body = rows.map((r) => cols.map((c) => (c.text ? String(c.text(r) ?? '') : '')).join('\t')).join('\n');
              void navigator.clipboard?.writeText([head.join('\t'), body].join('\n'));
            }}><Download size={14} /></Btn>
          </div>

          {loading ? <PageLoading /> : !rows.length ? (
            <EmptyState>표시할 차량이 없습니다</EmptyState>
          ) : (
            <ExcelSheet
              cols={cols}
              rows={rows}
              rowKey={(r: FleetRow) => r.plate}
              onRow={(r: FleetRow) => openCar(r.plate)}
            />
          )}
        </>
      )}
    </Page>
  );
}
