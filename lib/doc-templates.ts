/**
 * 회사 표준 문서 발급 시스템 — 양식 등록·본문 치환·문서번호 채번. (v5 lib/doc-templates 이식)
 *
 * 구조:
 *   1. DocTemplate — 양식 정의 (id, 분류, 필드, body HTML)
 *   2. registerTemplate() / getTemplate() / listTemplates()
 *   3. renderBody() — 입력값 + 양식 → 최종 HTML ({{key}} 치환, XSS 이스케이프)
 *   4. buildCompanyDocNo() / computeNextCompanySeq() — {companyId}-{prefix}-{YYMM}-{seq} 회사별 채번
 *   5. DOC_PRINT_CSS — A4 미리보기·인쇄 공통 스타일
 *
 * 양식 추가 = 이 파일에 registerTemplate() 1개. 별도 페이지 불필요.
 * 렌터카 문서(계약서·정산서·영수증·과태료공문)는 PrintHost가 담당 → 여기는 직원·거래처 대상 증명서.
 */

export type DocTargetType = 'staff' | 'partner' | 'free';   // free = 자유 입력(대상 미지정)
export type DocCategory = '인사' | '거래' | '대외' | '행정' | '법무';

/** 발급자 회사 정보 (renderBody scope의 company.*) */
export type DocCompany = {
  name?: string; bizRegNo?: string; corpRegNo?: string; ceo?: string; address?: string; mainPhone?: string;
};

export type DocFieldDef = {
  key: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'textarea' | 'select';
  required?: boolean;
  default?: string;
  options?: string[];       // type='select'
  colSpan?: 1 | 2;
  placeholder?: string;
};

export type DocTemplate = {
  id: string;               // 영문 kebab-case
  title: string;            // 한글 제목
  category: DocCategory;
  target: DocTargetType;
  prefix: string;           // 양식 prefix — {companyId}-{prefix}-{YYMM}-{seq}
  description?: string;
  fields: DocFieldDef[];
  body: string;             // {{key}} / {{company.name}} / {{target.name}} 치환
};

/* ────────────────── 양식 레지스트리 ────────────────── */
const REGISTRY = new Map<string, DocTemplate>();

export function registerTemplate(t: DocTemplate): void {
  if (REGISTRY.has(t.id)) return; // 중복 무시 (HMR 재실행 대비)
  REGISTRY.set(t.id, t);
}
export function getTemplate(id: string): DocTemplate | undefined { return REGISTRY.get(id); }
export function listTemplates(filter?: { category?: DocCategory; target?: DocTargetType }): DocTemplate[] {
  let arr = Array.from(REGISTRY.values());
  if (filter?.category) arr = arr.filter((t) => t.category === filter.category);
  if (filter?.target) arr = arr.filter((t) => t.target === filter.target);
  return arr;
}

/* ────────────────── 본문 치환 (XSS 이스케이프) ────────────────── */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

type RenderContext = {
  data: Record<string, string>;
  company?: DocCompany;
  target?: Record<string, string>;
  docNo: string;
  issuedAt: string;
};

export function renderBody(template: DocTemplate, ctx: RenderContext): string {
  return template.body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const scope: Record<string, unknown> = { ...ctx.data, docNo: ctx.docNo, issuedAt: ctx.issuedAt };
    if (ctx.company) scope.company = ctx.company as unknown as Record<string, unknown>;
    if (ctx.target) scope.target = ctx.target;
    let cur: unknown = scope;
    for (const p of path.split('.')) {
      if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[p];
      else return '';
    }
    return cur == null ? '' : escapeHtml(String(cur));
  });
}

/* ────────────────── 문서번호 채번 ────────────────── */
export function buildDocNo(prefix: string, seq: number, when: Date = new Date()): string {
  const yy = String(when.getFullYear()).slice(-2);
  const mm = String(when.getMonth() + 1).padStart(2, '0');
  return `JPK-${prefix}-${yy}${mm}-${String(seq).padStart(3, '0')}`;
}

/** 동적 관리회사용 문서번호. 회사 ID는 레지스트리에서 고정되므로 상호 변경 후에도 번호가 안정적이다. */
export function companyDocCode(companyId: unknown): string {
  const id = String(companyId || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (id || 'COMPANY').slice(0, 12);
}

export function buildCompanyDocNo(companyId: unknown, prefix: string, seq: number, when: Date = new Date()): string {
  const yy = String(when.getFullYear()).slice(-2);
  const mm = String(when.getMonth() + 1).padStart(2, '0');
  return `${companyDocCode(companyId)}-${prefix}-${yy}${mm}-${String(seq).padStart(3, '0')}`;
}

/** 회사별·양식별·월별 다음 번호. */
export function computeNextCompanySeq(
  items: { docNo?: string; companyId?: unknown }[],
  companyId: unknown,
  prefix: string,
  when: Date = new Date(),
): number {
  const yy = String(when.getFullYear()).slice(-2);
  const mm = String(when.getMonth() + 1).padStart(2, '0');
  const owner = String(companyId || '');
  const monthPrefix = `${companyDocCode(companyId)}-${prefix}-${yy}${mm}-`;
  const seqs = items
    .filter((d) => String(d.companyId || '') === owner && String(d.docNo || '').startsWith(monthPrefix))
    .map((d) => Number(String(d.docNo || '').slice(monthPrefix.length)))
    .filter((n) => Number.isFinite(n));
  return seqs.length ? Math.max(...seqs) + 1 : 1;
}
/** 같은 prefix의 이번 달 발급 건수 + 1 = 다음 일련번호. */
export function computeNextSeq(items: { docNo?: string }[], prefix: string, when: Date = new Date()): number {
  const yy = String(when.getFullYear()).slice(-2);
  const mm = String(when.getMonth() + 1).padStart(2, '0');
  const monthPrefix = `JPK-${prefix}-${yy}${mm}`;
  return items.filter((d) => String(d.docNo || '').startsWith(monthPrefix)).length + 1;
}

/* ────────────────── 한국식 포맷 헬퍼 ────────────────── */
export function fmtKDate(v: string): string {
  if (!v) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return v;
  return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일`;
}
export function fmtKMoney(v: string): string {
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n.toLocaleString('ko-KR') : v;
}

/* ────────────────── A4 미리보기·인쇄 공통 CSS (v5 document-preview 이식) ────────────────── */
export const DOC_PRINT_CSS = `
.doc-paper {
  width: 210mm; min-height: 297mm; background: #fff; padding: 25mm 22mm;
  font-size: 11pt; line-height: 1.7; color: #000;
  font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; box-sizing: border-box;
}
.doc-paper .doc-title { text-align: center; font-size: 26pt; font-weight: 800; letter-spacing: 1.5em; text-indent: 1.5em; margin: 10mm 0 14mm; }
.doc-paper .section-title { font-weight: 700; font-size: 12pt; margin: 12mm 0 4mm; padding-bottom: 2mm; border-bottom: 1.2pt solid #000; }
.doc-paper table.info { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
.doc-paper table.info th, .doc-paper table.info td { border: 0.8pt solid #000; padding: 3mm 4mm; font-size: 11pt; text-align: left; vertical-align: middle; }
.doc-paper table.info th { background: #f1f3f5; width: 25%; font-weight: 600; }
.doc-paper .purpose-box { border: 0.8pt solid #000; padding: 5mm; min-height: 18mm; margin-bottom: 6mm; background: #fafbfc; white-space: pre-wrap; }
.doc-paper .body-text { margin: 8mm 0 6mm; font-size: 12pt; }
.doc-paper .doc-footer { margin-top: 18mm; text-align: center; }
.doc-paper .issue-date { font-size: 13pt; font-weight: 600; margin-bottom: 12mm; }
.doc-paper .company-line { font-size: 13pt; display: inline-flex; align-items: center; gap: 8px; }
.doc-paper .seal { display: inline-block; width: 18mm; height: 18mm; border: 1.4pt solid #c92a2a; color: #c92a2a; border-radius: 50%; text-align: center; line-height: 18mm; font-size: 14pt; font-weight: 700; margin-left: 4mm; }
.doc-paper .doc-no { position: absolute; top: 12mm; right: 22mm; font-size: 10pt; color: #555; font-family: monospace; }
.doc-paper section { position: relative; }
`;

/* ════════════════════════════════════════════════════════════════════
 *  초기 4종 양식 (v5 verbatim)
 * ════════════════════════════════════════════════════════════════════ */

// ─── 1. 재직증명서 (인사 / 직원) ───
registerTemplate({
  id: 'employment-certificate', title: '재직증명서', category: '인사', target: 'staff', prefix: 'ERT',
  description: '직원의 재직 사실 증명. 금융·관공서·이주 등 제출용.',
  fields: [
    { key: 'purpose', label: '발급 용도', type: 'text', required: true, default: '금융기관 제출용', colSpan: 2 },
    { key: 'department', label: '부서', type: 'text' },
    { key: 'position', label: '직급', type: 'text' },
    { key: 'hiredDate', label: '입사일', type: 'date', required: true },
    { key: 'status', label: '재직상태', type: 'select', options: ['재직중', '휴직중'], default: '재직중' },
  ],
  body: `
<div class="doc-title">재 직 증 명 서</div>

<section>
  <div class="section-title">■ 인적사항</div>
  <table class="info">
    <tr><th>성 명</th><td>{{target.name}}</td><th>생년월일</th><td>{{target.birth}}</td></tr>
    <tr><th>주 소</th><td colspan="3">{{target.address}}</td></tr>
  </table>
</section>

<section>
  <div class="section-title">■ 재직사항</div>
  <table class="info">
    <tr><th>회 사 명</th><td>{{company.name}}</td><th>사업자등록번호</th><td>{{company.bizRegNo}}</td></tr>
    <tr><th>회사주소</th><td colspan="3">{{company.address}}</td></tr>
    <tr><th>부 서</th><td>{{department}}</td><th>직 급</th><td>{{position}}</td></tr>
    <tr><th>입사일자</th><td>{{hiredDate}}</td><th>재직상태</th><td>{{status}}</td></tr>
  </table>
</section>

<section>
  <div class="section-title">■ 용 도</div>
  <div class="purpose-box">{{purpose}}</div>
  <div class="body-text">위와 같이 본 회사에 재직하고 있음을 증명합니다.</div>
</section>

<footer class="doc-footer">
  <div class="issue-date">{{issuedAt}}</div>
  <div class="company-line"><strong>{{company.name}}</strong>  대표이사  <strong>{{company.ceo}}</strong> <span class="seal">印</span></div>
</footer>
`,
});

// ─── 2. 거래사실확인서 (거래 / 거래처) ───
registerTemplate({
  id: 'transaction-confirmation', title: '거래사실확인서', category: '거래', target: 'partner', prefix: 'TXC',
  description: '특정 거래처와의 거래 사실을 증명. 입찰·금융·세무 제출용.',
  fields: [
    { key: 'purpose', label: '발급 용도', type: 'text', required: true, default: '거래은행 제출용', colSpan: 2 },
    { key: 'periodFrom', label: '거래기간 시작', type: 'date', required: true },
    { key: 'periodTo', label: '거래기간 종료', type: 'date', required: true },
    { key: 'tradeItem', label: '거래품목', type: 'text', default: '차량 임대 서비스', colSpan: 2 },
    { key: 'amount', label: '거래금액 (원)', type: 'number', placeholder: '20000000' },
    { key: 'note', label: '비고', type: 'textarea', colSpan: 2 },
  ],
  body: `
<div class="doc-title">거 래 사 실 확 인 서</div>

<section>
  <div class="section-title">■ 거래상대방</div>
  <table class="info">
    <tr><th>상호 (법인명)</th><td>{{target.name}}</td><th>사업자등록번호</th><td>{{target.bizRegNo}}</td></tr>
    <tr><th>대표자</th><td>{{target.ceo}}</td><th>연락처</th><td>{{target.mainPhone}}</td></tr>
    <tr><th>주 소</th><td colspan="3">{{target.address}}</td></tr>
  </table>
</section>

<section>
  <div class="section-title">■ 거래내용</div>
  <table class="info">
    <tr><th>거래기간</th><td colspan="3">{{periodFrom}} ~ {{periodTo}}</td></tr>
    <tr><th>거래품목</th><td colspan="3">{{tradeItem}}</td></tr>
    <tr><th>거래금액</th><td colspan="3"><strong>{{amount}}</strong> 원</td></tr>
    <tr><th>비고</th><td colspan="3">{{note}}</td></tr>
  </table>
</section>

<section>
  <div class="section-title">■ 용 도</div>
  <div class="purpose-box">{{purpose}}</div>
  <div class="body-text">위와 같이 본 회사와 거래사실이 있음을 확인합니다.</div>
</section>

<footer class="doc-footer">
  <div class="issue-date">{{issuedAt}}</div>
  <div class="company-line"><strong>{{company.name}}</strong>  대표이사  <strong>{{company.ceo}}</strong> <span class="seal">印</span></div>
</footer>
`,
});

// ─── 3. 입금확인서 (거래 / 거래처) ───
registerTemplate({
  id: 'payment-confirmation', title: '입금확인서', category: '거래', target: 'partner', prefix: 'PYC',
  description: '특정 금액의 입금 확인. 손님·거래처 요청 발급.',
  fields: [
    { key: 'amount', label: '입금금액 (원)', type: 'number', required: true, colSpan: 2, placeholder: '1000000' },
    { key: 'amountKr', label: '금액 (한글)', type: 'text', placeholder: '일백만원', colSpan: 2 },
    { key: 'depositDate', label: '입금일자', type: 'date', required: true },
    { key: 'depositMethod', label: '입금방법', type: 'select', options: ['계좌이체', '현금', '카드', 'CMS 자동이체', '기타'], default: '계좌이체' },
    { key: 'depositBank', label: '입금계좌 (수령)', type: 'text', placeholder: '신한은행 140-013-750928' },
    { key: 'purpose', label: '입금 사유', type: 'textarea', default: '차량 임대료', colSpan: 2 },
  ],
  body: `
<div class="doc-title">입 금 확 인 서</div>

<section>
  <div class="section-title">■ 수령자</div>
  <table class="info">
    <tr><th>상 호</th><td>{{company.name}}</td><th>사업자등록번호</th><td>{{company.bizRegNo}}</td></tr>
    <tr><th>주 소</th><td colspan="3">{{company.address}}</td></tr>
  </table>
</section>

<section>
  <div class="section-title">■ 입금자</div>
  <table class="info">
    <tr><th>상호 (성명)</th><td>{{target.name}}</td><th>연락처</th><td>{{target.mainPhone}}</td></tr>
  </table>
</section>

<section>
  <div class="section-title">■ 입금사항</div>
  <table class="info">
    <tr><th>입금금액</th><td colspan="3"><strong>{{amount}}</strong> 원 ({{amountKr}})</td></tr>
    <tr><th>입금일자</th><td>{{depositDate}}</td><th>입금방법</th><td>{{depositMethod}}</td></tr>
    <tr><th>입금계좌</th><td colspan="3">{{depositBank}}</td></tr>
    <tr><th>입금사유</th><td colspan="3">{{purpose}}</td></tr>
  </table>
  <div class="body-text">위와 같이 입금받았음을 확인합니다.</div>
</section>

<footer class="doc-footer">
  <div class="issue-date">{{issuedAt}}</div>
  <div class="company-line"><strong>{{company.name}}</strong>  대표이사  <strong>{{company.ceo}}</strong> <span class="seal">印</span></div>
</footer>
`,
});

// ─── 4. 위임장 (법인 명의) (대외 / 자유) ───
registerTemplate({
  id: 'letter-of-attorney', title: '위임장', category: '대외', target: 'free', prefix: 'POA',
  description: '법인 명의로 제3자에게 권한 위임. 등기·차량·세무 등.',
  fields: [
    { key: 'agentName', label: '수임인 성명', type: 'text', required: true },
    { key: 'agentIdent', label: '수임인 주민번호', type: 'text', placeholder: '900101-1******' },
    { key: 'agentAddress', label: '수임인 주소', type: 'text', colSpan: 2 },
    { key: 'agentRelation', label: '관계', type: 'text', default: '본사 직원', placeholder: '본사 직원, 대리인 등' },
    { key: 'matter', label: '위임사항', type: 'textarea', required: true, colSpan: 2, placeholder: '예) 차량 12가1234 의 명의이전 등기 일체' },
    { key: 'validUntil', label: '위임유효기간', type: 'date' },
  ],
  body: `
<div class="doc-title">위 임 장</div>

<section>
  <div class="section-title">■ 위임인</div>
  <table class="info">
    <tr><th>상 호</th><td>{{company.name}}</td><th>사업자등록번호</th><td>{{company.bizRegNo}}</td></tr>
    <tr><th>대표자</th><td>{{company.ceo}}</td><th>연락처</th><td>{{company.mainPhone}}</td></tr>
    <tr><th>주 소</th><td colspan="3">{{company.address}}</td></tr>
  </table>
</section>

<section>
  <div class="section-title">■ 수임인</div>
  <table class="info">
    <tr><th>성 명</th><td>{{agentName}}</td><th>주민등록번호</th><td>{{agentIdent}}</td></tr>
    <tr><th>주 소</th><td colspan="3">{{agentAddress}}</td></tr>
    <tr><th>관 계</th><td colspan="3">{{agentRelation}}</td></tr>
  </table>
</section>

<section>
  <div class="section-title">■ 위임사항</div>
  <div class="purpose-box">{{matter}}</div>
  <table class="info" style="margin-top: 6mm;"><tr><th>유효기간</th><td>{{validUntil}}</td></tr></table>
  <div class="body-text">위 사람을 본 회사의 대리인으로 정하고 위 사항에 대한 일체의 권한을 위임합니다.</div>
</section>

<footer class="doc-footer">
  <div class="issue-date">{{issuedAt}}</div>
  <div class="company-line">위임인  <strong>{{company.name}}</strong>  대표이사  <strong>{{company.ceo}}</strong> <span class="seal">印</span></div>
</footer>
`,
});

/* ─── 5. 계약사실확인서 (법무 / 거래처) ───
   거래사실확인서와 다르다: 저쪽은 «돈이 오갔다», 이쪽은 «이 차를 이 조건으로 빌려줬다»다.
   차량·기간·월대여료가 특정돼야 하므로 필드가 다르다. */
registerTemplate({
  id: 'contract-confirmation', title: '계약사실확인서', category: '법무', target: 'partner', prefix: 'CTC',
  description: '특정 차량의 임대차 계약 사실을 증명. 사고·분쟁·수사기관 제출용.',
  fields: [
    { key: 'purpose', label: '발급 용도', type: 'text', required: true, default: '사고 처리용', colSpan: 2 },
    { key: 'plate', label: '차량번호', type: 'text', required: true },
    { key: 'carName', label: '차명', type: 'text' },
    { key: 'periodFrom', label: '계약 시작', type: 'date', required: true },
    { key: 'periodTo', label: '계약 종료', type: 'date' },
    { key: 'monthlyFee', label: '월 대여료 (원)', type: 'number' },
    { key: 'driverName', label: '실사용자(운전자)', type: 'text' },
    { key: 'note', label: '비고', type: 'textarea', colSpan: 2 },
  ],
  body: `
<div class="doc-title">계 약 사 실 확 인 서</div>

<section>
  <div class="section-title">■ 계약자</div>
  <table class="info">
    <tr><th>성명 (상호)</th><td>{{target.name}}</td><th>사업자·생년</th><td>{{target.bizRegNo}}</td></tr>
    <tr><th>연락처</th><td>{{target.mainPhone}}</td><th>실사용자</th><td>{{driverName}}</td></tr>
    <tr><th>주 소</th><td colspan="3">{{target.address}}</td></tr>
  </table>
</section>

<section>
  <div class="section-title">■ 계약 차량</div>
  <table class="info">
    <tr><th>차량번호</th><td>{{plate}}</td><th>차 명</th><td>{{carName}}</td></tr>
    <tr><th>계약기간</th><td colspan="3">{{periodFrom}} ~ {{periodTo}}</td></tr>
    <tr><th>월 대여료</th><td colspan="3"><strong>{{monthlyFee}}</strong> 원</td></tr>
    <tr><th>비고</th><td colspan="3">{{note}}</td></tr>
  </table>
</section>

<section>
  <div class="section-title">■ 용 도</div>
  <div class="purpose-box">{{purpose}}</div>
  <div class="body-text">위 차량에 대하여 본 회사와 상기 계약자 간 자동차대여 계약이 체결되었음을 확인합니다.</div>
</section>

<footer class="doc-footer">
  <div class="issue-date">{{issuedAt}}</div>
  <div class="company-line"><strong>{{company.name}}</strong>  대표이사  <strong>{{company.ceo}}</strong> <span class="seal">印</span></div>
</footer>
`,
});

/* ─── 6. 과태료 변경부과 요청 공문 (행정 / 자유) ───
   렌터카는 «차주 = 회사, 운전자 = 임차인»이라 과태료가 회사로 온다.
   이 공문으로 부과 대상을 실운전자로 바꿔 달라고 관청에 요청한다 — 계약서 사본이 근거다. */
registerTemplate({
  id: 'penalty-reassign', title: '과태료 변경부과 요청', category: '행정', target: 'free', prefix: 'PNR',
  description: '과태료 부과 대상을 회사→실운전자(임차인)로 변경 요청. 관할 관청 제출용.',
  fields: [
    { key: 'agency', label: '수신 (관청)', type: 'text', required: true, placeholder: '○○경찰서장 / ○○시장', colSpan: 2 },
    { key: 'penaltyNo', label: '과태료 고지번호', type: 'text', required: true },
    { key: 'plate', label: '차량번호', type: 'text', required: true },
    { key: 'violationAt', label: '위반일시', type: 'text', required: true, placeholder: '2026-07-15 14:20' },
    { key: 'violationPlace', label: '위반장소', type: 'text', colSpan: 2 },
    { key: 'violationKind', label: '위반내용', type: 'text', colSpan: 2 },
    { key: 'driverName', label: '실운전자 성명', type: 'text', required: true },
    { key: 'driverBirth', label: '실운전자 생년월일', type: 'text' },
    { key: 'driverPhone', label: '실운전자 연락처', type: 'text' },
    { key: 'driverAddress', label: '실운전자 주소', type: 'text', colSpan: 2 },
    { key: 'periodFrom', label: '임대 시작', type: 'date', required: true },
    { key: 'periodTo', label: '임대 종료', type: 'date' },
  ],
  body: `
<div class="doc-title">과태료 부과대상 변경 요청</div>

<section>
  <table class="info">
    <tr><th>수 신</th><td colspan="3">{{agency}}</td></tr>
    <tr><th>발 신</th><td colspan="3">{{company.name}} (대표 {{company.ceo}})</td></tr>
    <tr><th>제 목</th><td colspan="3">자동차대여사업자 과태료 부과대상 변경 요청</td></tr>
  </table>
</section>

<section>
  <div class="section-title">■ 대상 과태료</div>
  <table class="info">
    <tr><th>고지번호</th><td>{{penaltyNo}}</td><th>차량번호</th><td>{{plate}}</td></tr>
    <tr><th>위반일시</th><td colspan="3">{{violationAt}}</td></tr>
    <tr><th>위반장소</th><td colspan="3">{{violationPlace}}</td></tr>
    <tr><th>위반내용</th><td colspan="3">{{violationKind}}</td></tr>
  </table>
</section>

<section>
  <div class="section-title">■ 위반 당시 실운전자 (임차인)</div>
  <table class="info">
    <tr><th>성 명</th><td>{{driverName}}</td><th>생년월일</th><td>{{driverBirth}}</td></tr>
    <tr><th>연락처</th><td colspan="3">{{driverPhone}}</td></tr>
    <tr><th>주 소</th><td colspan="3">{{driverAddress}}</td></tr>
    <tr><th>임대기간</th><td colspan="3">{{periodFrom}} ~ {{periodTo}}</td></tr>
  </table>
</section>

<section>
  <div class="body-text">
    위 차량은 본 회사가 자동차대여사업용으로 등록·보유한 차량으로, 위반일시 당시
    상기 임차인에게 대여 중이었습니다. 이에 해당 과태료의 부과대상을 실운전자로
    변경하여 주시기 바랍니다.
  </div>
  <div class="body-text">붙임 : 자동차대여계약서 사본 1부.  끝.</div>
</section>

<footer class="doc-footer">
  <div class="issue-date">{{issuedAt}}</div>
  <div class="company-line"><strong>{{company.name}}</strong>  대표이사  <strong>{{company.ceo}}</strong> <span class="seal">印</span></div>
</footer>
`,
});

/* ─── 7. 내용증명 (법무 / 거래처) ───
   ⚠ 미수 독촉 내용증명은 `lib/docs/notice-claim.ts` 가 이미 «계산까지» 한다.
   여기 것은 계산이 필요 없는 **일반 통고**용이다 — 반납요구·계약해지통보·원상회복 등.
   미수 독촉은 그쪽을 쓴다. 두 벌로 만들지 말 것. */
registerTemplate({
  id: 'certified-mail', title: '내용증명', category: '법무', target: 'partner', prefix: 'CTM',
  description: '반납요구·계약해지 통보·원상회복 청구 등 일반 통고. 미수 독촉은 미수관리의 [내용증명 발송]을 쓸 것.',
  fields: [
    { key: 'subject', label: '제 목', type: 'text', required: true, placeholder: '임대차량 반납 요구의 건', colSpan: 2 },
    { key: 'plate', label: '차량번호', type: 'text' },
    { key: 'facts', label: '사실관계', type: 'textarea', required: true, colSpan: 2, placeholder: '계약 체결일·경위를 시간순으로' },
    { key: 'demand', label: '요구사항', type: 'textarea', required: true, colSpan: 2, placeholder: '무엇을 언제까지 이행할 것인지' },
    { key: 'deadline', label: '이행기한', type: 'date', required: true },
    { key: 'consequence', label: '불이행 시 조치', type: 'textarea', colSpan: 2, default: '민·형사상 법적 조치를 취할 예정입니다.' },
  ],
  body: `
<div class="doc-title">내 용 증 명</div>

<section>
  <table class="info">
    <tr><th>수 신</th><td colspan="3">{{target.name}} 귀하</td></tr>
    <tr><th>주 소</th><td colspan="3">{{target.address}}</td></tr>
    <tr><th>발 신</th><td colspan="3">{{company.name}} (대표 {{company.ceo}})</td></tr>
    <tr><th>제 목</th><td colspan="3"><strong>{{subject}}</strong></td></tr>
    <tr><th>대상 차량</th><td colspan="3">{{plate}}</td></tr>
  </table>
</section>

<section>
  <div class="section-title">1. 사실관계</div>
  <div class="body-text">{{facts}}</div>
</section>

<section>
  <div class="section-title">2. 요구사항</div>
  <div class="body-text">{{demand}}</div>
  <div class="body-text">이행기한 : <strong>{{deadline}}</strong> 까지</div>
</section>

<section>
  <div class="section-title">3. 불이행 시</div>
  <div class="body-text">{{consequence}}</div>
</section>

<footer class="doc-footer">
  <div class="issue-date">{{issuedAt}}</div>
  <div class="company-line"><strong>{{company.name}}</strong>  대표이사  <strong>{{company.ceo}}</strong> <span class="seal">印</span></div>
</footer>
`,
});

export const DOC_CATEGORIES: DocCategory[] = ['인사', '거래', '대외', '행정', '법무'];
