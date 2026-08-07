'use client';
/**
 * 문서 발급 — 표준 증명서(재직·거래사실·입금확인·위임장) 발급·이력.
 *   · 발급 = DocIssueDialog → commitSave('issued_doc') (감사로그 자동 기록)
 *   · 목록 = 발급 이력(동결 본문 bodyHtml 보관) → 재인쇄는 격리 새창
 */
import { useMemo } from 'react';
import { useSession } from '@/lib/session';
import { companyLabel } from '@/lib/companies';
import { Page, Sec, EmptyState, DataTable, Badge, Btn, C, type Col, type BadgeTone, PageLoading } from '@/components/ui';
import { DOC_PRINT_CSS } from '@/lib/doc-templates';
import { sanitizeDocHtml, escapeDocText } from '@/lib/docs/sanitize-html';
import { useEntityList } from '@/lib/use-entity-lists';

type Doc = {
  _key?: string; docNo?: string; templateTitle?: string; category?: string;
  targetName?: string; issuedAt?: string; issuedBy?: string; issuerCompanyName?: string;
  companyId?: string; bodyHtml?: string;
};
const CAT_TONE: Record<string, BadgeTone> = { 인사: 'blue', 거래: 'green', 대외: 'amber', 행정: 'purple', 법무: 'red' };
const fmtAt = (iso?: string) => (iso || '').slice(0, 10);

/**
 * 재인쇄 — 저장된 bodyHtml은 신뢰하지 않는다.
 *   ★sanitizeDocHtml(화이트리스트)로 스크립트·이벤트 속성·외부 리소스 태그를 제거한 뒤 렌더.
 *   (법인 직원이 본문에 스크립트를 심고 본사가 재인쇄하면 앱 출처에서 실행되던 문제 — QA 긴급)
 *   docNo도 이스케이프. 인쇄 트리거 스크립트는 우리 코드만.
 */
function reprint(d: Doc) {
  const w = window.open('', '_blank', 'width=900,height=1200');
  if (!w) return;
  const safeBody = sanitizeDocHtml(d.bodyHtml || '');
  const safeNo = escapeDocText(d.docNo || '');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${safeNo}</title><style>@page{size:A4;margin:0}body{margin:0;background:#fff /* 인쇄 전용 — 테마 무관 */}${DOC_PRINT_CSS}</style></head><body><div class="doc-paper" style="position:relative">${safeNo ? `<div class="doc-no">${safeNo}</div>` : ''}${safeBody}</div><script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`);
  w.document.close();
}

export default function DocsPage() {
  const { scopeAll } = useSession();
  const { rows: raw, loading } = useEntityList('issued_doc');
  const rows = useMemo(
    () => (raw as Doc[]).slice().sort((a, b) => (b.issuedAt || '').localeCompare(a.issuedAt || '')),
    [raw],
  );

  const cols: Col<Doc>[] = [
    { key: 'docNo', label: '문서번호', render: (d) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: C.mute }}>{d.docNo}</span> },
    { key: 'templateTitle', label: '양식', render: (d) => <span style={{ fontWeight: 600 }}>{d.templateTitle}</span> },
    { key: 'category', label: '분류', render: (d) => <Badge tone={CAT_TONE[d.category || ''] || 'gray'}>{d.category}</Badge> },
    { key: 'targetName', label: '대상', render: (d) => d.targetName || <span style={{ color: C.faint }}>—</span> },
    { key: 'issuer', label: '발급회사', render: (d) => <span style={{ fontSize: 12, color: C.mute }}>{d.issuerCompanyName || companyLabel(d.companyId || '')}</span> },
    { key: 'issuedAt', label: '발급일', render: (d) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtAt(d.issuedAt)}</span> },
    { key: 'issuedBy', label: '발급자', render: (d) => <span style={{ fontSize: 12, color: C.mute }}>{d.issuedBy}</span> },
    { key: 'act', label: '', align: 'r', render: (d) => <Btn variant="ghost" size="sm" onClick={() => reprint(d)}>재인쇄</Btn> },
  ];

  return (
    <Page title="문서 발급" meta={`발급 ${rows.length}건`}
      right={<Btn size="sm" href="/docs/issue">+ 신규 발급</Btn>}>
      <Sec title="발급 이력" n={rows.length} desc="재직·거래사실·입금확인·위임장 — 발급 시 문서번호·발급자 기록(감사)" hideable={false}>
        {loading ? <PageLoading />
          : rows.length === 0 ? <EmptyState>발급된 문서가 없습니다 — “신규 발급” 버튼으로 시작하세요</EmptyState>
            : <DataTable cols={scopeAll ? cols : cols.filter((c) => c.key !== 'issuer')} rows={rows} />}
      </Sec>
    </Page>
  );
}
