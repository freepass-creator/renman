/**
 * 상세·생성 패널 본문 스크롤 헬퍼.
 *   scrollIntoView(window) 금지 — 패널 열 때 창·본문이 아래로 끌려감.
 *   펼친 섹션만 패널 body 안에서 보이도록 body.scrollTop 조정.
 */

export function revealSectionInPanel(section: HTMLElement): void {
  const body = section.closest('.ledger-create-panel__body, .ledger-record-panel__body');
  if (!(body instanceof HTMLElement)) return;

  // open 직후 레이아웃 반영 뒤 측정
  requestAnimationFrame(() => {
    const pad = 8;
    const s = section.getBoundingClientRect();
    const b = body.getBoundingClientRect();
    if (b.height <= 0) return;

    if (s.height <= b.height - pad * 2) {
      // 섹션이 본문보다 짧으면 통째로 보이게
      if (s.top < b.top + pad) {
        body.scrollTop -= (b.top + pad) - s.top;
      } else if (s.bottom > b.bottom - pad) {
        body.scrollTop += s.bottom - (b.bottom - pad);
      }
      return;
    }

    // 본문보다 긴 섹션 — 제목부터 읽도록 상단 정렬(나머지는 본문 스크롤)
    body.scrollTop += s.top - (b.top + pad);
  });
}
