'use client';
/**
 * /dev/car-desk — 한 차량 상세 조회 시안 (신규등록 없음 · 입구는 목록).
 *
 * 탭 = 자산 | 계약 | 수납
 *
 * 자산 그리드 = 가로5 × 세로3 (1fr…)
 *   #1 등록 1×3(좌열) · #2 제원·#3 취득·#5 보험 1×2 · 우측열(col5) 운영|GPS|과태료
 *   #8 수선 col2–4
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Download, Eye, Plus } from 'lucide-react';
import {
  Page, Badge, Btn, Input, Modal, th, td, tdR, won, C, R, NUM, PillTabs,
} from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';
import { useAppBar } from '@/lib/appbar';
import { DESK, DESK_SLOT, deskGrid } from '@/components/vehicle-detail/desk';

type Tab = '자산' | '계약' | '수납';
type Act = null | 'return' | 'extend' | 'term' | 'pay' | 'disc' | 'settle' | 'ignition' | 'call' | 'memo' | 'sms';
/** 패널 하단 증빙 — InfoDoc/_docs와 같이 «그 정보와 한 몸». */
type Proof = {
  id: string;
  label: string;
  file: string;
  at: string;
  /** 시안 미리보기 종류 */
  preview?: 'reg' | 'gps' | 'loan' | 'quote' | 'order' | 'fact' | 'policy' | 'penalty' | 'contract' | 'repair' | 'generic';
};

const DEMO_SCH = [
  { seq: 1, due: '26-01-25', amt: 450000, paid: 450000, bal: 0, st: '완료' },
  { seq: 2, due: '26-02-25', amt: 450000, paid: 200000, bal: 250000, st: '부분납' },
  { seq: 3, due: '26-03-25', amt: 450000, paid: 0, bal: 450000, st: '연체' },
  { seq: 4, due: '26-04-25', amt: 450000, paid: 0, bal: 450000, st: '예정' },
  { seq: 5, due: '26-05-25', amt: 450000, paid: 0, bal: 450000, st: '예정' },
  { seq: 6, due: '26-06-25', amt: 450000, paid: 0, bal: 450000, st: '예정' },
  { seq: 7, due: '26-07-25', amt: 450000, paid: 0, bal: 450000, st: '예정' },
  { seq: 8, due: '26-08-25', amt: 450000, paid: 0, bal: 450000, st: '예정' },
  { seq: 9, due: '26-09-25', amt: 450000, paid: 0, bal: 450000, st: '예정' },
  { seq: 10, due: '26-10-25', amt: 450000, paid: 0, bal: 450000, st: '예정' },
  { seq: 11, due: '26-11-25', amt: 450000, paid: 0, bal: 450000, st: '예정' },
  { seq: 12, due: '26-12-25', amt: 450000, paid: 0, bal: 450000, st: '예정' },
];

/** 할부 상환표 시안 — vehicleLoanView / loanSchedule 형태 */
const INSTALL_SCH = Array.from({ length: 36 }, (_, i) => {
  const n = i + 1;
  const y = 23 + Math.floor((3 + i) / 12);
  const m = ((3 + i - 1) % 12) + 1;
  const principal = 480000;
  const interest = 40000;
  return {
    n,
    due: `${String(y).slice(-2)}-${String(m).padStart(2, '0')}-15`,
    principal,
    interest,
    payment: principal + interest,
    bal: Math.max(0, 20000000 - n * principal),
  };
});

const CONTRACT_HIST = [
  { at: '26-03-20', kind: '통화', body: '입금 독촉 · 3회차 연체', who: '김○○' },
  { at: '26-02-10', kind: '문자', body: '납입 안내 발송', who: '김○○' },
  { at: '26-01-15', kind: '메모', body: '연장 문의 · 미확정', who: '담당' },
  { at: '25-11-01', kind: '연장', body: '협의만 · 미확정', who: '김○○' },
  { at: '25-08-01', kind: '인도', body: '본사 인도 · 42,100km', who: '현장' },
  { at: '25-07-28', kind: '담기', body: '계약 성립 CT-2025-0142', who: '담당' },
];

const PAY_HIST = [
  { at: '26-02-25', kind: '입금', body: '2회차 부분납 ₩200,000 · 계좌', who: '김○○' },
  { at: '26-01-25', kind: '입금', body: '1회차 완납 ₩450,000 · CMS', who: '김○○' },
  { at: '25-08-01', kind: '보증', body: '보증금 입금 ₩1,000,000', who: '김○○' },
];

const VEHICLE_HIST = [
  { at: '26-03-02', kind: '과태료', body: '신호위반 접수 · ₩70,000', who: '관할구청' },
  { at: '25-12-18', kind: '과태료', body: '주정차 · ₩40,000 · 납부완료', who: '관할구청' },
];

const REPAIR_HIST = [
  { at: '25-10-12', kind: '정비', body: '엔진오일', amt: 85000 },
  { at: '25-06-03', kind: '사고', body: '좌측 도어 판금', amt: 420000 },
  { at: '24-11-20', kind: '정비', body: '타이어 2본 교체', amt: 180000 },
];

/** 패널별 증빙 시안 — 실연동 시 rec._docs */
const PROOF = {
  /** 차량등록정보 — 자동차등록증 */
  reg: [{ id: 'reg', label: '자동차등록증', file: '자동차등록증.pdf', at: '23-03-15', preview: 'reg' as const }],
  /** 제조사제원 — 견적·발주·없으면 계약사실확인서 */
  spec: [
    { id: 'quote', label: '제조사견적', file: '견적서.pdf', at: '23-03-10', preview: 'quote' as const },
    { id: 'order', label: '발주서', file: '발주서.pdf', at: '23-03-12', preview: 'order' as const },
    { id: 'fact', label: '계약사실확인', file: '계약사실확인서.pdf', at: '23-03-15', preview: 'fact' as const },
  ],
  gps: [{ id: 'gps', label: 'GPS설치확인', file: 'GPS_설치확인서.pdf', at: '23-03-20', preview: 'gps' as const }],
  purchase: [
    { id: 'loan', label: '할부스케줄', file: '할부_상환스케줄.pdf', at: '23-03-18', preview: 'loan' as const },
    { id: 'sale', label: '매매계약서', file: '매매계약서.pdf', at: '23-03-15', preview: 'generic' as const },
  ],
  insurance: [{ id: 'pol', label: '보험증권', file: '자동차보험증권.pdf', at: '25-08-12', preview: 'policy' as const }],
  penalty: [{ id: 'pen', label: '과태료고지', file: '과태료_고지서.pdf', at: '26-03-02', preview: 'penalty' as const }],
  repair: [{ id: 'rep', label: '정비명세서', file: '정비명세서.pdf', at: '25-10-12', preview: 'repair' as const }],
  contract: [{ id: 'ct', label: '렌트계약서', file: '렌트계약서_CT-2025-0142.pdf', at: '25-07-28', preview: 'contract' as const }],
  receipt: [{ id: 'rc', label: '입금영수증', file: '입금영수증_2회.pdf', at: '26-02-25', preview: 'generic' as const }],
  deposit: [{ id: 'dp', label: '보증입금증', file: '보증금입금증.pdf', at: '25-08-01', preview: 'generic' as const }],
};

function downloadProof(p: Proof) {
  const blob = new Blob(
    [`[renman 시안]\n${p.label}\n파일: ${p.file}\n등록: ${p.at}\n`],
    { type: 'application/pdf' },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = p.file;
  a.click();
  URL.revokeObjectURL(url);
}

function AttFoot({
  docs, onOpen, onAttach,
}: {
  docs: Proof[];
  onOpen: (p: Proof) => void;
  onAttach?: () => void;
}) {
  return (
    <div style={{
      flexShrink: 0, borderTop: `1px solid ${C.line}`, background: 'var(--bg-stripe)',
      padding: DESK.footPad, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
      minHeight: DESK.footH, boxSizing: 'border-box',
    }}>
      <FileText size={12} color={C.sub} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: DESK.labelFs, fontWeight: 700, color: C.mute, marginRight: 2 }}>첨부</span>
      {docs.length === 0 && (
        <span style={{ fontSize: DESK.footFs, color: C.faint }}>없음</span>
      )}
      {docs.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onOpen(p)}
          title={`${p.file} · ${p.at}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            border: `1px solid ${C.line}`, borderRadius: R, background: C.card,
            padding: '1px 6px', fontSize: DESK.footFs, color: C.ink, cursor: 'pointer', fontWeight: 600,
            maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {p.label}
        </button>
      ))}
      <span style={{ flex: 1 }} />
      {onAttach && (
        <button
          type="button"
          onClick={onAttach}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            border: 'none', background: 'none', cursor: 'pointer',
            fontSize: DESK.footFs, color: C.mute, fontWeight: 700, padding: '2px 4px',
          }}
        >
          <Plus size={12} /> 첨부
        </button>
      )}
    </div>
  );
}

function Box({
  title, right, children, fill, docs, onOpenDoc, onAttach, style, hero, n,
}: {
  title: string; right?: ReactNode; children: ReactNode; fill?: boolean;
  docs?: Proof[];
  onOpenDoc?: (p: Proof) => void;
  onAttach?: () => void;
  style?: CSSProperties;
  /** 핵심 식별 패널 — 제목 더 굵고 크게 */
  hero?: boolean;
  /** 시안 패널 번호 */
  n?: number;
}) {
  return (
    <div style={{
      border: `1px solid ${C.line}`, borderRadius: R, overflow: 'hidden', background: C.card,
      display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0,
      flex: fill ? 1 : undefined,
      height: fill ? '100%' : undefined,
      alignSelf: fill ? 'stretch' : undefined,
      ...style,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
        minHeight: DESK.headH, boxSizing: 'border-box',
        padding: DESK.headPad, borderBottom: `1px solid ${C.line}`, background: 'var(--bg-stripe)',
      }}>
        {n != null && (
          <span style={{
            fontSize: DESK.headNFs, fontWeight: 800, fontFamily: NUM, color: C.accent,
            minWidth: 14, textAlign: 'center',
          }}>{n}</span>
        )}
        <span style={{
          fontSize: DESK.headTitleFs, fontWeight: 800, color: C.ink,
          letterSpacing: hero ? '-0.01em' : undefined,
        }}>{title}</span>
        <span style={{ flex: 1 }} />
        {right}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
      {docs != null && onOpenDoc && (
        <AttFoot docs={docs} onOpen={onOpenDoc} onAttach={onAttach} />
      )}
    </div>
  );
}

function Pane({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div style={{
      padding: '8px 10px', borderBottom: `1px solid ${C.line}`, background: 'var(--bg-stripe)',
      display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0, maxHeight: '42%',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: C.ink }}>{title}</span>
        <span style={{ flex: 1 }} />
        <Btn size="sm" variant="ghost" onClick={onClose}>닫기</Btn>
      </div>
      <div style={{ minHeight: 0, overflow: 'auto', flex: 1 }}>{children}</div>
    </div>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>{children}</div>;
}
function Lab({ children }: { children: ReactNode }) {
  return <span style={{ fontSize: 12, color: C.mute, whiteSpace: 'nowrap' }}>{children}</span>;
}
function ScrollBody({ children, scroll }: { children: ReactNode; scroll?: boolean }) {
  return <div style={{ flex: 1, minHeight: 0, overflow: scroll ? 'auto' : 'hidden' }}>{children}</div>;
}

function HoverTr({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <tr
      style={{ transition: 'background .12s ease', ...style }}
      onMouseEnter={(e) => { e.currentTarget.style.background = C.hover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </tr>
  );
}

function Glance({ rows, labelW = DESK.labelW, maxW, wrap }: {
  rows: [string, ReactNode][];
  labelW?: number;
  maxW?: number;
  /** 긴 값(주소·옵션목록) 줄바꿈 허용 */
  wrap?: boolean;
}) {
  return (
    <table style={{ width: '100%', maxWidth: maxW, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <tbody>
        {rows.map(([k, v], i) => (
          <HoverTr key={k} style={{ borderTop: i ? `1px solid ${C.line2}` : undefined }}>
            <td style={{
              width: labelW, padding: DESK.rowPad, fontSize: DESK.labelFs, color: C.mute,
              whiteSpace: 'nowrap', verticalAlign: 'middle',
            }}>{k}</td>
            <td style={{
              padding: DESK.rowPad, fontSize: DESK.valueFs, color: C.ink, fontWeight: 600,
              maxWidth: wrap ? undefined : 160,
              overflow: wrap ? undefined : 'hidden',
              textOverflow: wrap ? undefined : 'ellipsis',
              whiteSpace: wrap ? 'normal' : 'nowrap',
              wordBreak: wrap ? 'keep-all' : undefined,
              verticalAlign: 'middle',
            }}>
              {v == null || v === '' ? <span style={{ color: C.lineStrong, fontWeight: 400 }}>—</span> : v}
            </td>
          </HoverTr>
        ))}
      </tbody>
    </table>
  );
}

const thS: CSSProperties = { ...th, fontSize: DESK.labelFs, padding: DESK.rowPad };
const tdS: CSSProperties = { ...td, fontSize: DESK.valueFs, padding: DESK.rowPad };
const tdRS: CSSProperties = { ...tdR, fontSize: DESK.valueFs, padding: DESK.rowPad, fontFamily: NUM };

function SchTable({ rows }: { rows: typeof DEMO_SCH }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
      <thead>
        <tr>
          {(['회차', '기일', '청구', '납부', '미납', '상태'] as const).map((h) => (
            <th
              key={h}
              style={{
                ...thS, position: 'sticky', top: 0, zIndex: 1,
                textAlign: h === '상태' ? 'center' : (h === '회차' || h === '기일' ? 'left' : 'right'),
              }}
            >{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <HoverTr key={row.seq}>
            <td style={tdS}>{row.seq}</td>
            <td style={tdS}>{row.due}</td>
            <td style={tdRS}>{won(row.amt)}</td>
            <td style={tdRS}>{row.paid ? won(row.paid) : '—'}</td>
            <td style={tdRS}>{row.bal ? <b style={{ color: C.danger }}>{won(row.bal)}</b> : '—'}</td>
            <td style={{ ...tdS, textAlign: 'center' }}>
              <Badge tone={row.st === '연체' ? 'red' : row.st === '부분납' ? 'amber' : row.st === '완료' ? 'green' : 'gray'}>{row.st}</Badge>
            </td>
          </HoverTr>
        ))}
      </tbody>
    </table>
  );
}

function HistTable({
  rows, withWho,
}: {
  rows: { at: string; kind: string; body: string; who: string }[];
  withWho?: boolean;
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ ...thS, position: 'sticky', top: 0, zIndex: 1 }}>일자</th>
          <th style={{ ...thS, position: 'sticky', top: 0, zIndex: 1 }}>구분</th>
          <th style={{ ...thS, position: 'sticky', top: 0, zIndex: 1 }}>내용</th>
          {withWho && <th style={{ ...thS, position: 'sticky', top: 0, zIndex: 1 }}>상대</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((h, i) => (
          <HoverTr key={i}>
            <td style={tdS}>{h.at}</td>
            <td style={tdS}>
              <Badge tone={h.kind === '과태료' || h.kind === '연체' ? 'amber' : h.kind === '입금' || h.kind === '보증' ? 'green' : 'gray'}>{h.kind}</Badge>
            </td>
            <td style={tdS}>{h.body}</td>
            {withWho && <td style={tdS}>{h.who}</td>}
          </HoverTr>
        ))}
      </tbody>
    </table>
  );
}

/** 수선·사고 — 일자|구분|내용|금액 각 칸 분리 */
function RepairTable({ rows }: { rows: typeof REPAIR_HIST }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
      <thead>
        <tr>
          <th style={{ ...thS, position: 'sticky', top: 0, zIndex: 1 }}>일자</th>
          <th style={{ ...thS, position: 'sticky', top: 0, zIndex: 1 }}>구분</th>
          <th style={{ ...thS, position: 'sticky', top: 0, zIndex: 1 }}>내용</th>
          <th style={{ ...thS, position: 'sticky', top: 0, zIndex: 1, textAlign: 'right' }}>금액</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((h, i) => (
          <HoverTr key={i}>
            <td style={tdS}>{h.at}</td>
            <td style={tdS}>
              <Badge tone={h.kind === '사고' ? 'amber' : 'gray'}>{h.kind}</Badge>
            </td>
            <td style={tdS}>{h.body}</td>
            <td style={tdRS}>{won(h.amt)}</td>
          </HoverTr>
        ))}
      </tbody>
    </table>
  );
}

const G = deskGrid(false);
const S = DESK_SLOT;

export default function CarDeskDesignPage() {
  const mobile = useIsMobile();
  const router = useRouter();
  const goBack = () => router.back();
  const [tab, setTab] = useState<Tab>('자산');
  const [act, setAct] = useState<Act>(null);
  const [doc, setDoc] = useState<Proof | null>(null);
  const [attachHint, setAttachHint] = useState(false);

  useAppBar({ back: goBack, depth: true, contentMax: 10000, contentPad: 24 }, []);

  const toggle = (a: Exclude<Act, null>) => { setDoc(null); setAct((c) => (c === a ? null : a)); };
  const switchTab = (t: Tab) => { setTab(t); setAct(null); setDoc(null); };
  const openDoc = (p: Proof) => { setAct(null); setDoc(p); };
  const mockAttach = () => setAttachHint(true);

  if (mobile) {
    return (
      <Page title="자산상세 시안" noCompany>
        <p style={{ fontSize: 13, color: C.mute }}>와이드 모니터용 시안입니다. 데스크톱에서 열어 주세요.</p>
      </Page>
    );
  }

  return (
    <Page frame noCompany>
      <div style={{
        flex: 1, minHeight: 0,
        display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden',
      }}>
        {/* 차량번호 + 탭만 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, minHeight: 28 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.ink, whiteSpace: 'nowrap' }}>
            12가3456
          </span>
          <span style={{ flex: 1 }} />
          <PillTabs
            size="md"
            value={tab}
            onChange={switchTab}
            tabs={[
              { key: '자산', label: '자산' },
              { key: '계약', label: '계약' },
              { key: '수납', label: '수납', badge: 1 },
            ]}
          />
        </div>

        {/* ════ 자산 · 5×3 ════
            #1 등록=좌열 1×3 · #2·#3·#5 1×2 · 우측열 운영|GPS|과태료 · 수선 col2–4 */}
        {tab === '자산' && (
          <div style={G}>
            <Box n={1} title="등록정보" hero fill
              style={S.left}
              right={<Btn size="sm" variant="ghost">수정</Btn>}
              docs={PROOF.reg} onOpenDoc={openDoc} onAttach={mockAttach}
            >
              {/* 자동차등록증 ①~⑩ + 제원⑪~㉔ + 검사 + 푸터 — 등록증에 있는 것만 */}
              <ScrollBody scroll>
                <Glance wrap rows={[
                  ['문서확인', 'AB12-CD34-EF56'],
                  ['등록증발급', '23-03-15'],
                  ['최초등록', '23-03-15'],
                  ['차량번호', '12가3456'],
                  ['차종', '중형 승용'],
                  ['용도', '영업용'],
                  ['차명', '쏘나타 DN8'],
                  ['형식', 'DN8-G20-A'],
                  ['제작연월', '2023-01'],
                  ['차대번호', 'KMHxxxxxxxxxxxx'],
                  ['원동기형식', 'G4NA'],
                  ['사용본거지', '서울 강서구 ○○로 12'],
                  ['소유자', '○○렌트카'],
                  ['법인번호', '110111-1234567'],
                  ['제원관리번호', 'A123-4567-8901'],
                  ['길이', '4,900mm'],
                  ['너비', '1,860mm'],
                  ['높이', '1,445mm'],
                  ['총중량', '1,580kg'],
                  ['승차정원', '5'],
                  ['최대적재', '—'],
                  ['배기량', '1,999cc'],
                  ['정격출력', '160/6,500'],
                  ['기통수', '4'],
                  ['연료', '휘발유(무연)'],
                  ['연비', '12.3km/L'],
                  ['검사기간', '24-11-01 ~ 26-11-01'],
                  ['검사구분', '종합검사'],
                  ['검사시km', '38,200'],
                  ['출고가격', won(29800000)],
                ]} />
              </ScrollBody>
            </Box>

            <Box n={2} title="제조사제원" hero fill
              style={S.mid2}
              right={<Btn size="sm" variant="ghost">수정</Btn>}
              docs={PROOF.spec} onOpenDoc={openDoc} onAttach={mockAttach}
            >
              {/* 등록증에 없음 → 견적·발주·차종마스터. 5단: 제조사→모델→세부모델→파워트레인→세부트림 */}
              <ScrollBody scroll>
                <Glance wrap rows={[
                  ['제조사', '현대'],
                  ['모델', '쏘나타'],
                  ['세부모델', 'DN8'],
                  ['파워트레인', '가솔린 2.0'],
                  ['세부트림', '프리미엄'],
                  ['연식', '2023년형'],
                  ['구동방식', '전륜(FF)'],
                  ['변속기', '자동 8단'],
                  ['외부색상', '화이트크림'],
                  ['내부색상', '블랙'],
                  ['선택옵션', '파노라마선루프, 빌트인캠, 네비게이션, 통풍시트, 스마트크루즈'],
                  ['취급대리점', '○○현대모터스 강서'],
                  ['담당자', '박○○ · 010-2345-6789'],
                ]} />
              </ScrollBody>
            </Box>

            <Box n={3} title="취득정보" hero fill
              style={S.mid3}
              right={<Btn size="sm" variant="ghost">수정</Btn>}
              docs={PROOF.purchase} onOpenDoc={openDoc} onAttach={mockAttach}
            >
              <ScrollBody scroll>
                <Glance rows={[
                  ['취득방법', <Badge tone="blue">할부</Badge>],
                  ['매입처', '○○모터스'],
                  ['취득일', '23-03-15'],
                  ['매입완료', '23-03-15'],
                  ['매입가', won(28500000)],
                  ['소비자가', won(32000000)],
                  ['옵션가', won(1200000)],
                  ['옵션할인', won(200000)],
                  ['취득원가', won(29800000)],
                  ['과세/면세', '과세'],
                  ['할부사', '현대캐피탈'],
                  ['원금', won(20000000)],
                  ['이율', '4.9%'],
                  ['개월', '36'],
                  ['시작', '23-04-15'],
                  ['월상환', won(520000)],
                  ['잔액', <b style={{ color: C.danger }}>{won(8200000)}</b>],
                  ['잔여회차', '18회'],
                ]} />
              </ScrollBody>
            </Box>

            <Box n={5} title="보험" fill
              style={S.mid4}
              right={<Btn size="sm" variant="ghost">수정</Btn>}
              docs={PROOF.insurance} onOpenDoc={openDoc} onAttach={mockAttach}>
              <ScrollBody scroll>
                <Glance wrap rows={[
                  ['보험사', 'DB손해'],
                  ['상품명', '업무용 다이렉트'],
                  ['증권', 'POL-2025-001'],
                  ['계약자', '○○렌트카'],
                  ['피보험자', '○○렌트카'],
                  ['기간', '25-08-12 ~ 26-08-12'],
                  ['만기', <span style={{ color: C.warn }}>D-21</span>],
                  ['대인Ⅰ·Ⅱ', '자배법 한도 / 1인당 무한'],
                  ['대물', '1사고 1억'],
                  ['자기신체', '1인 1억'],
                  ['무보험', '2억'],
                  ['자차', '가입'],
                  ['긴급출동', 'SOS 6회 · 견인40km'],
                  ['물적할증', '200만원'],
                  ['운전범위', '임직원한정'],
                  ['운전연령', '만26세↑'],
                  ['분납', '6회'],
                  ['보험료', `총 ${won(1280000)} / 납부 2회차 ${won(213000)}`],
                  ['대리점', '○○보험대리점'],
                  ['담당자', '최○○ · 010-9876-5432'],
                ]} />
              </ScrollBody>
            </Box>

            <Box n={4} title="운영상태" fill
              style={S.right1}
              right={<Btn size="sm" variant="ghost">수정</Btn>}>
              <ScrollBody scroll>
                <Glance rows={[
                  ['자산코드', 'CP02VH0142'],
                  ['자산상태', <Badge tone="amber">운행</Badge>],
                  ['소유×가동', '보유·운행'],
                  ['주행거리', '42,150km'],
                  ['검사만기', <span style={{ color: C.warn }}>26-11-01</span>],
                  ['위치', '임차인'],
                  ['대기일', '—'],
                  ['매각일', '—'],
                  ['매각가', '—'],
                ]} />
              </ScrollBody>
            </Box>

            <Box n={6} title="GPS" fill
              style={S.right2}
              right={<Btn size="sm" variant="ghost">수정</Btn>}
              docs={PROOF.gps} onOpenDoc={openDoc} onAttach={mockAttach}>
              <ScrollBody scroll>
                <Glance rows={[
                  ['공급사', 'AMTEL'],
                  ['단말', 'AMT-8821'],
                  ['설치', '23-03-20'],
                  ['시동제어', '가능'],
                ]} />
              </ScrollBody>
            </Box>

            <Box n={7} title="과태료" fill
              style={S.right3}
              right={<Btn size="sm" variant="ghost">+ 접수</Btn>}
              docs={PROOF.penalty} onOpenDoc={openDoc} onAttach={mockAttach}>
              <ScrollBody scroll>
                <HistTable rows={VEHICLE_HIST} />
              </ScrollBody>
            </Box>

            <Box n={8} title="수선 · 사고" fill
              style={S.bottom}
              right={<Btn size="sm" variant="ghost">+ 정비</Btn>}
              docs={PROOF.repair} onOpenDoc={openDoc} onAttach={mockAttach}>
              <ScrollBody scroll>
                <RepairTable rows={REPAIR_HIST} />
              </ScrollBody>
            </Box>
          </div>
        )}

        {/* ════ 계약 · 자산과 동일 DESK_SLOT ════ */}
        {tab === '계약' && (
          <div style={G}>
            <Box n={1} title="계약 조건" hero fill
              style={S.left}
              right={<Btn size="sm" variant="ghost">출력</Btn>}
              docs={PROOF.contract} onOpenDoc={openDoc} onAttach={mockAttach}
            >
              <ScrollBody scroll>
                <Glance rows={[
                  ['계약번호', 'CT-2025-0142'],
                  ['성립일', '25-07-28'],
                  ['계약자', '김○○'],
                  ['연락 · 생년', '010-1234-5678 · 90-01-01'],
                  ['차량', '12가3456'],
                  ['기간', '25-08-01 ~ 26-07-31'],
                  ['개월', '12'],
                  ['월대여료', won(450000)],
                  ['이체', '매월 25 · 선불'],
                  ['보증금', won(1000000)],
                  ['CDW · 면책', '자차 · 30만'],
                  ['위약금율', '30%'],
                ]} />
              </ScrollBody>
            </Box>

            <Box n={2} title="진행 · 조치" fill style={S.mid2}
              right={(
                <>
                  <Btn size="sm" variant={act === 'return' ? 'solid' : undefined} onClick={() => toggle('return')}>반납</Btn>
                  <Btn size="sm" variant={act === 'extend' ? 'solid' : 'ghost'} onClick={() => toggle('extend')}>연장</Btn>
                  <Btn size="sm" variant={act === 'term' ? 'solid' : 'ghost'} onClick={() => toggle('term')}>중도해지</Btn>
                </>
              )}
            >
              {act === 'return' && (
                <Pane title="반납" onClose={() => setAct(null)}>
                  <Row>
                    <Input size="sm" type="date" defaultValue="2026-07-31" style={{ width: 140 }} />
                    <Lab>주행</Lab>
                    <Input size="sm" placeholder="km" style={{ width: 88 }} />
                    <Btn size="sm">확정</Btn>
                  </Row>
                </Pane>
              )}
              {act === 'extend' && (
                <Pane title="연장" onClose={() => setAct(null)}>
                  <Row>
                    <Input size="sm" defaultValue="3" style={{ width: 48 }} />
                    <Lab>개월</Lab>
                    <Btn size="sm">확정</Btn>
                  </Row>
                </Pane>
              )}
              {act === 'term' && (
                <Pane title="중도해지" onClose={() => setAct(null)}>
                  <Row>
                    <Input size="sm" type="date" style={{ width: 140 }} />
                    <Btn size="sm" variant="danger">확정</Btn>
                  </Row>
                </Pane>
              )}
              <ScrollBody scroll>
                <Glance rows={[
                  ['분류', <Badge tone="amber">운행중·연체</Badge>],
                  ['인도', '25-08-01 · 42,100km'],
                  ['반납예정', '26-07-31 · D-5'],
                  ['종료실적', '—'],
                  ['연락처', '010-1234-5678'],
                ]} />
              </ScrollBody>
            </Box>

            <Box n={3} title="계약 이력" fill style={S.mid3}
              right={(
                <>
                  <Btn size="sm" variant={act === 'call' ? 'solid' : 'ghost'} onClick={() => toggle('call')}>+ 통화</Btn>
                  <Btn size="sm" variant={act === 'sms' ? 'solid' : 'ghost'} onClick={() => toggle('sms')}>+ 문자</Btn>
                  <Btn size="sm" variant={act === 'memo' ? 'solid' : 'ghost'} onClick={() => toggle('memo')}>+ 메모</Btn>
                </>
              )}
            >
              {(act === 'call' || act === 'sms' || act === 'memo') && (
                <Pane title={act === 'call' ? '통화' : act === 'sms' ? '문자' : '메모'} onClose={() => setAct(null)}>
                  <Row>
                    <Input size="sm" placeholder="내용" style={{ flex: 1 }} />
                    <Btn size="sm">저장</Btn>
                  </Row>
                </Pane>
              )}
              <ScrollBody scroll>
                <HistTable rows={CONTRACT_HIST} withWho />
              </ScrollBody>
            </Box>

            <Box n={5} title="한눈(지표)" fill style={S.mid4}>
              <ScrollBody scroll>
                <Glance rows={[
                  ['미수', <b style={{ color: C.danger }}>{won(700000)}</b>],
                  ['다음', '3회 · 연체'],
                  ['진도', '2/12'],
                  ['연체', <span style={{ color: C.danger }}>1회</span>],
                  ['시동', '해제'],
                  ['보증', '운행중'],
                ]} />
              </ScrollBody>
            </Box>

            <Box n={4} title="다음회차" fill style={S.right1}>
              <ScrollBody scroll>
                <Glance rows={[
                  ['회차', '3'],
                  ['기일', '26-07-25'],
                  ['청구', won(450000)],
                  ['잔액', <b style={{ color: C.danger }}>{won(450000)}</b>],
                  ['상태', <Badge tone="red">연체</Badge>],
                ]} />
              </ScrollBody>
            </Box>

            <Box n={6} title="시동" fill style={S.right2}>
              <ScrollBody scroll>
                <Glance rows={[['상태', '해제'], ['사유', '—']]} />
              </ScrollBody>
            </Box>

            <Box n={7} title="보증" fill style={S.right3}>
              <ScrollBody scroll>
                <Glance rows={[['보증금', won(1000000)], ['정산', '운행중']]} />
              </ScrollBody>
            </Box>

            <Box n={8} title="수납 스케줄" fill style={S.bottom}
              right={<Btn size="sm" variant="ghost" onClick={() => switchTab('수납')}>수납 탭</Btn>}>
              <ScrollBody scroll>
                <SchTable rows={DEMO_SCH} />
              </ScrollBody>
            </Box>
          </div>
        )}

        {/* ════ 수납 · 자산과 동일 DESK_SLOT ════ */}
        {tab === '수납' && (
          <div style={G}>
            <Box n={1} title="회차 · 이행" hero fill style={S.left}
              right={(
                <>
                  <Btn size="sm" variant={act === 'pay' ? 'solid' : undefined} onClick={() => toggle('pay')}>입금</Btn>
                  <Btn size="sm" variant={act === 'disc' ? 'solid' : 'ghost'} onClick={() => toggle('disc')}>할인</Btn>
                </>
              )}
              docs={PROOF.receipt} onOpenDoc={openDoc} onAttach={mockAttach}
            >
              {act === 'pay' && (
                <Pane title="입금" onClose={() => setAct(null)}>
                  <Row>
                    <Input size="sm" defaultValue="250000" style={{ width: 100 }} />
                    <Lab>회차</Lab>
                    <Input size="sm" defaultValue="2" style={{ width: 40 }} />
                    <Lab>수단</Lab>
                    <Input size="sm" defaultValue="계좌" style={{ width: 64 }} />
                    <Btn size="sm">저장</Btn>
                  </Row>
                </Pane>
              )}
              {act === 'disc' && (
                <Pane title="할인" onClose={() => setAct(null)}>
                  <Row>
                    <Lab>회차</Lab>
                    <Input size="sm" defaultValue="3" style={{ width: 40 }} />
                    <Input size="sm" placeholder="금액" style={{ width: 88 }} />
                    <Input size="sm" placeholder="사유" style={{ width: 100 }} />
                    <Btn size="sm">저장</Btn>
                  </Row>
                </Pane>
              )}
              <ScrollBody scroll>
                <SchTable rows={DEMO_SCH} />
              </ScrollBody>
              <div style={{
                display: 'flex', gap: 14, padding: DESK.footPad, fontSize: DESK.footFs, color: C.mute,
                borderTop: `1px solid ${C.line}`, background: 'var(--bg-stripe)', flexShrink: 0,
                minHeight: DESK.footH, boxSizing: 'border-box', alignItems: 'center',
              }}>
                <span>청구 {won(450000 * 12)}</span>
                <span>수금 {won(650000)}</span>
                <span style={{ color: C.danger, fontWeight: 800 }}>미수 {won(700000)}</span>
                <span>3/12 · 연체</span>
              </div>
            </Box>

            <Box n={2} title="수납 이력" fill style={S.mid2}
              docs={PROOF.receipt} onOpenDoc={openDoc} onAttach={mockAttach}>
              <ScrollBody scroll>
                <HistTable rows={PAY_HIST} withWho />
              </ScrollBody>
            </Box>

            <Box n={3} title="손익(지표)" fill style={S.mid3}>
              <ScrollBody scroll>
                <Glance rows={[
                  ['수금합', won(5400000)],
                  ['비용', won(3080000)],
                  ['손익', <b style={{ color: C.ok }}>{won(2320000)}</b>],
                  ['회수율', '68%'],
                  ['재렌트', won(430000)],
                ]} />
              </ScrollBody>
            </Box>

            <Box n={5} title="청구 · 수금" fill style={S.mid4}>
              <ScrollBody scroll>
                <Glance rows={[
                  ['청구', won(450000 * 12)],
                  ['수금', won(650000)],
                  ['미수', <b style={{ color: C.danger }}>{won(700000)}</b>],
                  ['진도', '3/12'],
                  ['연체', <span style={{ color: C.danger }}>1회</span>],
                ]} />
              </ScrollBody>
            </Box>

            <Box n={4} title="보증 · 시동" fill style={S.right1}
              right={(
                <>
                  <Btn size="sm" variant={act === 'settle' ? 'solid' : 'ghost'} onClick={() => toggle('settle')}>정산</Btn>
                  <Btn size="sm" variant="danger" onClick={() => toggle('ignition')}>시동</Btn>
                </>
              )}
              docs={PROOF.deposit} onOpenDoc={openDoc} onAttach={mockAttach}
            >
              {act === 'settle' && (
                <Pane title="보증금 정산" onClose={() => setAct(null)}>
                  <Row><Btn size="sm">확정</Btn></Row>
                </Pane>
              )}
              {act === 'ignition' && (
                <Pane title="시동제어" onClose={() => setAct(null)}>
                  <Row>
                    <Btn size="sm" variant="danger">잠금</Btn>
                    <Btn size="sm" variant="ghost">해제</Btn>
                  </Row>
                </Pane>
              )}
              <ScrollBody scroll>
                <Glance rows={[
                  ['보증금', won(1000000)],
                  ['정산', '운행중'],
                  ['시동', '해제'],
                  ['잠금사유', '—'],
                ]} />
              </ScrollBody>
            </Box>

            <Box n={6} title="다음회차" fill style={S.right2}>
              <ScrollBody scroll>
                <Glance rows={[
                  ['회차', '3'],
                  ['기일', '26-07-25'],
                  ['잔액', <b style={{ color: C.danger }}>{won(450000)}</b>],
                  ['상태', '연체'],
                ]} />
              </ScrollBody>
            </Box>

            <Box n={7} title="미수(스케줄)" fill style={S.right3}>
              <ScrollBody scroll>
                <Glance rows={[
                  ['미수합', <b style={{ color: C.danger }}>{won(700000)}</b>],
                  ['미납회차', '2'],
                  ['연체', <span style={{ color: C.danger }}>1회</span>],
                  ['진도', '3/12'],
                ]} />
              </ScrollBody>
            </Box>

            <Box n={8} title="미납 회차" fill style={S.bottom}>
              <ScrollBody scroll>
                <SchTable rows={DEMO_SCH.filter((r) => Number(r.bal) > 0)} />
              </ScrollBody>
            </Box>
          </div>
        )}
      </div>

      {doc && (
        <Modal
          title={doc.label}
          meta={`${doc.file} · ${doc.at}`}
          onClose={() => setDoc(null)}
          width={doc.preview === 'loan' ? 860 : 560}
          footer={(
            <>
              <Btn size="sm" variant="ghost" onClick={() => setDoc(null)}>닫기</Btn>
              <Btn size="sm" variant="ghost" onClick={() => downloadProof(doc)}>
                <Download size={14} /> 다운로드
              </Btn>
              <Btn size="sm" onClick={() => downloadProof(doc)}>
                <Eye size={14} /> 열기(시안)
              </Btn>
            </>
          )}
        >
          <div style={{ padding: '4px 0', maxHeight: '58vh', overflow: 'auto' }}>
            {doc.preview === 'loan' ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr>
                    <th style={thS}>회차</th>
                    <th style={thS}>상환일</th>
                    <th style={{ ...thS, textAlign: 'right' }}>원금</th>
                    <th style={{ ...thS, textAlign: 'right' }}>이자</th>
                    <th style={{ ...thS, textAlign: 'right' }}>상환</th>
                    <th style={{ ...thS, textAlign: 'right' }}>잔액</th>
                  </tr>
                </thead>
                <tbody>
                  {INSTALL_SCH.map((r) => (
                    <tr key={r.n}>
                      <td style={tdS}>{r.n}</td>
                      <td style={tdS}>{r.due}</td>
                      <td style={tdRS}>{won(r.principal)}</td>
                      <td style={tdRS}>{won(r.interest)}</td>
                      <td style={tdRS}>{won(r.payment)}</td>
                      <td style={tdRS}>{won(r.bal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Glance rows={
                doc.preview === 'reg' ? [
                  ['서류', doc.label], ['파일', doc.file], ['등록', doc.at],
                  ['번호판', '12가3456'], ['VIN', 'KMHxxxxxxxxxxxx'], ['소유자', '○○렌트카'],
                ]
                : doc.preview === 'gps' ? [
                  ['서류', doc.label], ['파일', doc.file],
                  ['공급사', 'AMTEL'], ['단말', 'AMT-8821'], ['설치일', '23-03-20'],
                ]
                : doc.preview === 'quote' ? [
                  ['서류', doc.label], ['소비자가', won(32000000)],
                  ['옵션', won(1200000)], ['취득원가', won(29800000)],
                ]
                : doc.preview === 'order' ? [
                  ['서류', doc.label], ['발주처', '○○모터스'],
                  ['차명', '쏘나타 DN8'], ['발주일', '23-03-12'],
                ]
                : doc.preview === 'fact' ? [
                  ['서류', '계약사실확인서'], ['대상', '쏘나타 DN8 · 12가3456'],
                  ['확인내용', '제조사제원·매매 성립 사실'], ['일자', '23-03-15'],
                ]
                : doc.preview === 'policy' ? [
                  ['서류', doc.label], ['보험사', 'DB손해보험'],
                  ['증권', 'POL-2025-001'], ['기간', '25-08-12 ~ 26-08-12'],
                ]
                : doc.preview === 'penalty' ? [
                  ['서류', doc.label], ['위반', '신호위반'],
                  ['일자', '26-03-02'], ['금액', won(70000)],
                ]
                : doc.preview === 'contract' ? [
                  ['서류', doc.label], ['계약번호', 'CT-2025-0142'],
                  ['기간', '25-08-01 ~ 26-07-31'], ['월대여료', won(450000)],
                ]
                : doc.preview === 'repair' ? [
                  ['서류', doc.label], ['업체', '○○정비'],
                  ['일자', '25-10-12'], ['금액', won(85000)],
                ]
                : [
                  ['서류', doc.label], ['파일', doc.file], ['등록', doc.at],
                  ['비고', '시안 — 실연동 시 Storage URL로 원본 표시'],
                ]
              } />
            )}
            <p style={{ margin: '12px 0 0', fontSize: 11.5, color: C.faint }}>
              시안: 실서비스에서는 Firebase Storage 원본을 미리보기·다운로드합니다 (`_docs` · InfoDoc).
            </p>
          </div>
        </Modal>
      )}

      {attachHint && (
        <Modal
          title="서류 첨부"
          meta="시안"
          onClose={() => setAttachHint(false)}
          width={440}
          footer={<Btn size="sm" onClick={() => setAttachHint(false)}>확인</Btn>}
        >
          <p style={{ margin: 0, fontSize: 13, color: C.ink, lineHeight: 1.55 }}>
            실연동 시 이 자리 = <code style={{ fontSize: 12 }}>DocUpload</code> → Storage 업로드 → 레코드 <code style={{ fontSize: 12 }}>_docs</code> append.
            패널 정보가 증명하는 서류만 붙입니다(페이지 문서함 UI 없음).
          </p>
        </Modal>
      )}
    </Page>
  );
}
