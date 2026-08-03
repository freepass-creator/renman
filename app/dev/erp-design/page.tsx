'use client';

import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  FileSearch,
  Filter,
  LayoutDashboard,
  ListTodo,
  Menu,
  MoreHorizontal,
  PanelRightClose,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  WalletCards,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import styles from './erp-design.module.css';

type View = 'home' | 'assets';
type AssetStatus = '가동' | '공차' | '휴차';
type Vehicle = {
  plate: string;
  model: string;
  vin: string;
  company: string;
  customer: string;
  period: string;
  status: AssetStatus;
  receivable: number;
  insurance: string;
  document: '정상' | '불일치' | '검토';
  reason?: string;
};

const vehicles: Vehicle[] = [
  { plate: '12가 3456', model: '현대 아반떼 CN7', vin: 'KMHLN41DBPA182764', company: '한빛렌터카', customer: '홍길동', period: '24.01.15 — 27.01.14', status: '가동', receivable: 0, insurance: '2027.01.14', document: '정상' },
  { plate: '34나 5678', model: '기아 K5 DL3', vin: 'KNAGM413BNA517908', company: '프라임렌트', customer: '김철수', period: '25.03.02 — 28.03.01', status: '휴차', receivable: 550000, insurance: '2026.08.31', document: '불일치', reason: '사고 수리 · 24일' },
  { plate: '56다 7890', model: '현대 쏘나타 DN8', vin: 'KMHL341DBMA064321', company: '한빛렌터카', customer: '—', period: '—', status: '공차', receivable: 0, insurance: '2026.12.18', document: '정상', reason: '반납 후 6일' },
  { plate: '78라 9012', model: '기아 카니발 KA4', vin: 'KNANC81ABPS319776', company: '웰릭스렌트', customer: '박지현', period: '23.11.20 — 26.11.19', status: '가동', receivable: 1100000, insurance: '2026.11.19', document: '검토' },
  { plate: '90마 1234', model: '제네시스 G80', vin: 'KMTGB41ABNU287015', company: '프라임렌트', customer: '이준호', period: '25.06.01 — 28.05.31', status: '가동', receivable: 0, insurance: '2027.05.31', document: '정상' },
  { plate: '21바 4321', model: '현대 투싼 NX4', vin: 'KMHJB81BPNU158499', company: '한빛렌터카', customer: '최서윤', period: '24.09.10 — 27.09.09', status: '휴차', receivable: 0, insurance: '2026.09.09', document: '정상', reason: '정기 검사 · 3일' },
];

function money(value: number) {
  return value ? `${(value / 10000).toLocaleString('ko-KR')}만원` : '—';
}

export default function ErpDesignSample() {
  const [view, setView] = useState<View>('home');
  const [status, setStatus] = useState<'전체' | AssetStatus>('전체');
  const [selected, setSelected] = useState<Vehicle | null>(vehicles[1]);
  const [query, setQuery] = useState('');
  const [railOpen, setRailOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);

  const filtered = useMemo(() => vehicles.filter((vehicle) => {
    const matchesStatus = status === '전체' || vehicle.status === status;
    const text = `${vehicle.plate} ${vehicle.model} ${vehicle.vin} ${vehicle.company} ${vehicle.customer}`.toLowerCase();
    return matchesStatus && text.includes(query.toLowerCase());
  }), [query, status]);

  const goAssets = (nextStatus: '전체' | AssetStatus = '전체') => {
    setStatus(nextStatus);
    setView('assets');
    setRailOpen(false);
  };

  const toggleNavigation = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 760) setRailOpen((open) => !open);
    else setRailCollapsed((collapsed) => !collapsed);
  };

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <button className={styles.menuToggle} aria-label="메뉴 전환" onClick={toggleNavigation}><Menu size={19} /></button>
        <div className={styles.breadcrumb}><span>{view === 'home' ? '홈' : '원장'}</span>{view === 'assets' && <><b>/</b><strong>자산 원장</strong></>}</div>
        <button className={styles.globalSearch}><Search size={16} /><span>차량번호, 계약자, 계약번호 검색</span><kbd>⌘ K</kbd></button>
        <div className={styles.topActions}>
          <button className={styles.iconButton} aria-label="알림"><Bell size={18} /><i /></button>
          <button className={styles.avatar}>PY</button>
        </div>
      </header>

      <aside className={`${styles.rail} ${railOpen ? styles.railOpen : ''} ${railCollapsed ? styles.railCollapsed : ''}`}>
        <button className={styles.sideBrand} onClick={() => setView('home')} aria-label="RENMAN ERP 홈"><span>R</span><strong>RENMAN</strong><b>ERP</b></button>
        <div className={styles.railLabel}>메뉴</div>
        <button className={view === 'home' ? styles.railActive : ''} onClick={() => { setView('home'); setRailOpen(false); }}><LayoutDashboard size={17} /><span className={styles.navText}>홈</span></button>
        <button className={view === 'assets' ? styles.railActive : ''} onClick={() => goAssets()}><WalletCards size={17} /><span className={styles.navText}>원장</span><ChevronDown className={styles.navChevron} size={14} /></button>
        {view === 'assets' && <div className={styles.railSub}>
          <button className={styles.subActive} onClick={() => goAssets()}><span>자산 원장</span></button>
          <button><span>계약 원장</span></button>
          <button><span>자금 원장</span></button>
        </div>}
        <button><ListTodo size={17} /><span className={styles.navText}>업무</span><span className={styles.count}>12</span></button>
        <button><Clock3 size={17} /><span className={styles.navText}>이력</span></button>
        <button><FileSearch size={17} /><span className={styles.navText}>문서</span><span className={styles.warningCount}>7</span></button>
        <div className={styles.railBottom}>
          <div className={styles.health}><ShieldCheck size={15} /><div><strong>데이터 상태</strong><span>98.4% 정상</span></div></div>
        </div>
      </aside>

      <section className={`${styles.workspace} ${railCollapsed ? styles.workspaceCollapsed : ''}`}>
        {view === 'home' ? <HomeView onAssets={goAssets} /> : (
          <AssetsView
            status={status}
            setStatus={setStatus}
            query={query}
            setQuery={setQuery}
            rows={filtered}
            selected={selected}
            setSelected={setSelected}
          />
        )}
      </section>

      {railOpen && <button className={styles.backdrop} aria-label="메뉴 닫기" onClick={() => setRailOpen(false)} />}
    </main>
  );
}

function HomeView({ onAssets }: { onAssets: (status?: '전체' | AssetStatus) => void }) {
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div><span className={styles.eyebrow}>2026년 7월 26일 · 일요일</span><h1>운영 현황</h1><p>가동과 회수에 집중해야 할 항목을 먼저 보여드립니다.</p></div>
        <div className={styles.headerActions}><button className={styles.secondary}><CalendarDays size={15} />기준일</button><button className={styles.primary}><Plus size={15} />업무 만들기</button></div>
      </div>

      <div className={styles.kpiGrid}>
        <button className={styles.kpi} onClick={() => onAssets('전체')}>
          <span className={styles.kpiLabel}>보유차량 가동률 <em className={styles.good}>+2.4%p</em></span>
          <strong>82.6<small>%</small></strong>
          <span className={styles.kpiMeta}>가동 109대 / 운영대상 132대</span>
          <div className={styles.progress}><i style={{ width: '82.6%' }} /></div>
        </button>
        <button className={styles.kpi} onClick={() => onAssets('휴차')}>
          <span className={styles.kpiLabel}>공차·휴차 <em className={styles.bad}>+3대</em></span>
          <strong>23<small>대</small></strong>
          <span className={styles.kpiMeta}>공차 13 · 휴차 10</span>
          <div className={styles.splitBar}><i style={{ width: '56%' }} /><b /></div>
        </button>
        <button className={styles.kpi}>
          <span className={styles.kpiLabel}>현재 미수율 <em className={styles.good}>−1.3%p</em></span>
          <strong>7.8<small>%</small></strong>
          <span className={styles.kpiMeta}>미수 936만원 / 청구 1.2억원</span>
          <div className={styles.progressRed}><i style={{ width: '7.8%' }} /></div>
        </button>
        <button className={styles.kpi}>
          <span className={styles.kpiLabel}>오늘의 업무 <em className={styles.bad}>4건 지연</em></span>
          <strong>19<small>건</small></strong>
          <span className={styles.kpiMeta}>내 업무 12 · 승인 3 · 지연 4</span>
          <div className={styles.taskDots}><i /><i /><i /><i className={styles.late} /></div>
        </button>
      </div>

      <div className={styles.homeGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><h2>오늘 집중할 업무</h2><p>위험도와 기한을 기준으로 정렬했습니다.</p></div><button>전체 업무 보기</button></div>
          <div className={styles.taskList}>
            <Task priority="긴급" icon={<AlertTriangle size={16} />} title="34나 5678 사고수리 완료일 확인" meta="휴차 24일 · 담당 김대리 · 오늘까지" tone="red" />
            <Task priority="확인" icon={<CircleDollarSign size={16} />} title="김철수 미수금 납부 약속 경과" meta="미수 55만원 · 연체 16일 · 계약 C-250302" tone="amber" />
            <Task priority="검증" icon={<Sparkles size={16} />} title="등록증 차대번호 OCR 불일치 검토" meta="차량 34나 5678 · 신뢰도 96%" tone="blue" />
            <Task priority="마감" icon={<WalletCards size={16} />} title="7월 26일 자금일보 마감" meta="미분류 거래 4건 · 증빙 누락 2건" tone="navy" />
          </div>
        </section>
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><h2>데이터 교차검증</h2><p>원장과 증명서가 다른 항목입니다.</p></div><button>검토함 열기</button></div>
          <div className={styles.validationSummary}>
            <div><span>OCR 검토</span><strong>7</strong></div>
            <div><span>값 불일치</span><strong>5</strong></div>
            <div><span>미매칭</span><strong>3</strong></div>
          </div>
          <div className={styles.validationList}>
            <button><FileCheck2 size={17} /><div><strong>자동차등록증</strong><span>34나 5678 · 차대번호 1자리 불일치</span></div><em>검토</em></button>
            <button><FileCheck2 size={17} /><div><strong>보험증권</strong><span>78라 9012 · 보험 종료일 불일치</span></div><em>검토</em></button>
            <button><FileCheck2 size={17} /><div><strong>계약서</strong><span>계약 C-260711 · 차량 매칭 후보 2건</span></div><em>매칭</em></button>
          </div>
        </section>
      </div>
    </div>
  );
}

function Task({ priority, icon, title, meta, tone }: { priority: string; icon: React.ReactNode; title: string; meta: string; tone: string }) {
  return <button className={styles.task}><span className={`${styles.taskIcon} ${styles[tone]}`}>{icon}</span><div><strong>{title}</strong><span>{meta}</span></div><em>{priority}</em><MoreHorizontal size={17} /></button>;
}

function AssetsView(props: {
  status: '전체' | AssetStatus;
  setStatus: (value: '전체' | AssetStatus) => void;
  query: string;
  setQuery: (value: string) => void;
  rows: Vehicle[];
  selected: Vehicle | null;
  setSelected: (value: Vehicle | null) => void;
}) {
  const { status, setStatus, query, setQuery, rows, selected, setSelected } = props;
  return (
    <div className={styles.ledgerPage}>
      <div className={styles.ledgerHeader}>
        <div><span className={styles.eyebrow}>원장 / 자산</span><h1>자산 원장</h1><p>132대 · 마지막 동기화 3분 전</p></div>
        <div className={styles.headerActions}><button className={styles.secondary}>엑셀 내보내기</button><button className={styles.primary}><Plus size={15} />차량 등록</button></div>
      </div>

      <div className={styles.savedViews}>
        {(['전체', '가동', '공차', '휴차'] as const).map((item) => (
          <button key={item} className={status === item ? styles.savedActive : ''} onClick={() => setStatus(item)}>
            {item === '전체' ? '전체 차량' : item}{item !== '전체' && <span>{item === '가동' ? 109 : item === '공차' ? 13 : 10}</span>}
          </button>
        ))}
        <button>보험·검사 임박 <span>6</span></button>
        <button>문서 검토 <span>7</span></button>
      </div>

      <div className={styles.tableToolbar}>
        <label className={styles.tableSearch}><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="차량번호, 차대번호, 계약자 검색" /></label>
        <button><Filter size={15} />상태 <ChevronDown size={13} /></button>
        <button>회사 <ChevronDown size={13} /></button>
        <button>계약 <ChevronDown size={13} /></button>
        <button>보험·검사 <ChevronDown size={13} /></button>
        <span className={styles.toolbarSpacer} />
        <button>열 설정</button>
        <button className={styles.iconOnly}><MoreHorizontal size={16} /></button>
      </div>

      <div className={`${styles.tableArea} ${selected ? styles.withDrawer : ''}`}>
        <div className={styles.tableScroll}>
          <table>
            <thead><tr><th><input type="checkbox" aria-label="전체 선택" /></th><th>차량번호</th><th>차량</th><th>회사</th><th>현재 계약자</th><th>계약기간</th><th>상태</th><th className={styles.alignRight}>미수금</th><th>보험 만기</th><th>문서</th><th /></tr></thead>
            <tbody>
              {rows.map((vehicle) => (
                <tr key={vehicle.plate} className={selected?.plate === vehicle.plate ? styles.selectedRow : ''} onClick={() => setSelected(vehicle)}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`${vehicle.plate} 선택`} /></td>
                  <td><strong className={styles.plate}>{vehicle.plate}</strong><span className={styles.mobileModel}>{vehicle.model}</span></td>
                  <td><strong>{vehicle.model}</strong><span>{vehicle.vin}</span></td>
                  <td>{vehicle.company}</td>
                  <td>{vehicle.customer}</td>
                  <td className={styles.mono}>{vehicle.period}</td>
                  <td><Status status={vehicle.status} /><span className={styles.rowReason}>{vehicle.reason}</span></td>
                  <td className={`${styles.alignRight} ${vehicle.receivable ? styles.negative : ''}`}>{money(vehicle.receivable)}</td>
                  <td className={styles.mono}>{vehicle.insurance}</td>
                  <td><DocumentState state={vehicle.document} /></td>
                  <td><MoreHorizontal size={16} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <div className={styles.empty}>조건에 맞는 차량이 없습니다.</div>}
        </div>

        {selected && <VehicleDrawer vehicle={selected} close={() => setSelected(null)} />}
      </div>
      <div className={styles.pagination}><span>선택 0 · 총 {rows.length}건</span><div><button disabled>이전</button><button className={styles.pageActive}>1</button><button>2</button><button>3</button><button>다음</button></div></div>
    </div>
  );
}

function Status({ status }: { status: AssetStatus }) {
  return <span className={`${styles.status} ${styles[`status${status}`]}`}><i />{status}</span>;
}

function DocumentState({ state }: { state: Vehicle['document'] }) {
  if (state === '정상') return <span className={styles.docOk}><CheckCircle2 size={14} />정상</span>;
  if (state === '불일치') return <span className={styles.docBad}><AlertTriangle size={14} />불일치</span>;
  return <span className={styles.docReview}><Sparkles size={14} />검토</span>;
}

function VehicleDrawer({ vehicle, close }: { vehicle: Vehicle; close: () => void }) {
  const [tab, setTab] = useState<'요약' | '운영' | '문서' | '이력'>('요약');
  return (
    <aside className={styles.drawer}>
      <div className={styles.drawerHead}>
        <div><span>{vehicle.model}</span><h2>{vehicle.plate}</h2><p>{vehicle.company} · {vehicle.vin}</p></div>
        <button onClick={close} aria-label="상세 닫기"><X size={18} /></button>
      </div>
      <div className={styles.drawerTabs}>
        {(['요약', '운영', '문서', '이력'] as const).map((item) => <button key={item} className={tab === item ? styles.drawerTabActive : ''} onClick={() => setTab(item)}>{item}</button>)}
      </div>
      <div className={styles.drawerBody}>
        {tab === '요약' && <>
          <div className={styles.drawerSummary}><Status status={vehicle.status} /><span>보험 D-36</span>{vehicle.receivable > 0 && <span className={styles.drawerDebt}>미수 {money(vehicle.receivable)}</span>}</div>
          <section className={styles.infoSection}><div className={styles.sectionTitle}><h3>현재 계약</h3><button>계약 열기</button></div><dl><dt>계약자</dt><dd>{vehicle.customer}</dd><dt>계약기간</dt><dd>{vehicle.period}</dd><dt>월 대여료</dt><dd>550,000원</dd><dt>수납 상태</dt><dd className={vehicle.receivable ? styles.negative : ''}>{vehicle.receivable ? `미수 ${money(vehicle.receivable)}` : '정상'}</dd></dl></section>
          {vehicle.document === '불일치' && <section className={styles.aiCheck}>
            <div className={styles.aiTitle}><Sparkles size={16} /><strong>OCR 교차검증</strong><span>AI</span></div>
            <p>자동차등록증과 원장 차대번호가 다릅니다.</p>
            <div className={styles.compare}><div><span>원장 입력</span><code>KNAGM413BNA517908</code></div><div><span>OCR 추출 · 96%</span><code>KNAGM413BNA51790<span>3</span></code></div></div>
            <div className={styles.aiActions}><button>원장 값 유지</button><button>검토 업무 생성</button></div>
          </section>}
          <section className={styles.infoSection}><div className={styles.sectionTitle}><h3>다음 일정</h3></div><div className={styles.scheduleItem}><CalendarDays size={16} /><div><strong>보험 갱신 검토</strong><span>2026.08.01 · 6일 후</span></div></div></section>
        </>}
        {tab !== '요약' && <div className={styles.tabPlaceholder}><PanelRightClose size={28} /><strong>{tab} 데이터</strong><p>선택 차량에 연결된 원자 데이터를 시간순으로 표시하는 영역입니다.</p></div>}
      </div>
      <div className={styles.drawerFooter}><button>전체 상세 열기</button><button className={styles.primary}><Plus size={15} />업무 만들기</button></div>
    </aside>
  );
}
