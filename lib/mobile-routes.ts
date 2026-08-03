/** 모바일 차량 조회 경로 — 같은 번호판이 여러 관리회사에 있을 수 있어 회사 키를 함께 보낸다. */
export function mobileVehicleHref(plate: string, companyId = '', focus = ''): string {
  const params = new URLSearchParams();
  if (companyId) params.set('company', companyId);
  if (focus) params.set('do', focus);
  const query = params.toString();
  return `/m/vehicle/${encodeURIComponent(plate)}${query ? `?${query}` : ''}`;
}
