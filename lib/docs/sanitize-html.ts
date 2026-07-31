/**
 * 저장된 문서 본문(bodyHtml) 새니타이즈 — 화이트리스트 방식.
 *
 * 왜 필요한가: issued_doc.bodyHtml 은 Firestore에 «동결 본문»으로 저장되고 재인쇄 시 그대로 렌더된다.
 *   규칙상 법인 직원이 자기 companyId 문서를 자유 생성할 수 있으므로, 본문에 스크립트를 심고
 *   본사가 재인쇄를 누르면 앱과 동일 출처에서 실행될 수 있다(QA 긴급: 본사 세션 탈취).
 *   생성 경로(lib/doc-templates renderBody)는 치환값을 escapeHtml 하지만, 저장물 자체를 믿을 수는 없다.
 *
 * 방식: DOMParser로 파싱 후 «허용 태그·허용 속성»만 남기고 나머지는 노드째 제거.
 *   허용 목록은 실제 양식이 쓰는 태그(table/tr/td/th/div/section/strong/span/footer 등)에 맞춤.
 *   브라우저 전용(DOMParser) — 서버에서 부르면 원문을 버리고 빈 문자열을 돌려준다(안전 우선).
 */

const ALLOWED_TAGS = new Set([
  'div', 'span', 'p', 'br', 'hr', 'section', 'article', 'header', 'footer',
  'strong', 'b', 'em', 'i', 'u', 'small', 'sup', 'sub',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'pre',
]);

/** class·표 병합·정렬만 허용. style은 위험 함수(url()·expression) 때문에 제외. */
const ALLOWED_ATTRS = new Set(['class', 'colspan', 'rowspan', 'align', 'valign', 'width', 'height']);

/** 통째로 버릴 태그(내용까지 제거) — 남기면 텍스트가 코드처럼 새어나온다. */
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math', 'link', 'meta', 'base', 'form', 'input', 'button', 'select', 'textarea', 'audio', 'video', 'img', 'a']);

function cleanElement(el: Element): void {
  for (const attr of [...el.attributes]) {
    const name = attr.name.toLowerCase();
    // on*(이벤트)·srcdoc·href·src·style 등은 화이트리스트에 없으므로 자동 제거
    if (!ALLOWED_ATTRS.has(name)) el.removeAttribute(attr.name);
  }
}

function walk(node: Element): void {
  for (const child of [...node.children]) {
    const tag = child.tagName.toLowerCase();
    if (DROP_WITH_CONTENT.has(tag)) { child.remove(); continue; }
    if (!ALLOWED_TAGS.has(tag)) {
      // 허용 밖 태그는 껍데기만 벗기고 내부 텍스트·자식은 보존(레이아웃 손실 최소화)
      walk(child);
      child.replaceWith(...[...child.childNodes]);
      continue;
    }
    cleanElement(child);
    walk(child);
  }
}

/** 저장된 문서 본문을 인쇄 가능한 안전 HTML로. 브라우저 밖에서는 ''(빈 문자열). */
export function sanitizeDocHtml(html: string): string {
  if (!html) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  walk(doc.body);
  return doc.body.innerHTML;
}

/** 텍스트를 HTML 컨텍스트에 넣기 위한 이스케이프(문서번호·제목 등). */
export function escapeDocText(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
