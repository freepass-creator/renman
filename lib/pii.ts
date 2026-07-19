/**
 * PII 마스킹 — 개인정보 최소노출(개인정보위 조사 대응). 목록·검색·대시보드 등 "대량 스캔" 지점에서 사용.
 * 상세/편집 화면(운영자가 신원을 실제로 확인·대조해야 하는 자리)은 원문 그대로 — 업무 필요.
 * 저장은 원본 보존(마스킹은 표시 계층에서만).
 */

/** 면허번호 — 지역·연도 앞부분만 남기고 일련·검증번호 마스킹. (예: 서울12-345678-90 → 서울12-●●●●●●-●●) */
export function maskLicense(s: unknown): string {
  const v = String(s ?? '').trim();
  if (!v) return '';
  const parts = v.split(/[-\s]/).filter(Boolean);
  if (parts.length >= 3) return [parts[0], parts[1], ...parts.slice(2).map((p) => '●'.repeat(p.length))].join('-');
  return v.length > 4 ? v.slice(0, 4) + '●'.repeat(Math.max(0, v.length - 4)) : v;
}

/** 주민번호 앞6(생년월일 YYMMDD) — 뒤 2자리 마스킹(성별·일자 일부 가림). */
export function maskResident(s: unknown): string {
  const raw = String(s ?? '');
  const d = raw.replace(/\D/g, '');
  if (d.length < 6) return raw ? maskAll(raw) : '';
  return d.slice(0, 4) + '●●';
}

/** 이름 — 가운데 가림(홍길동→홍●동, 김철→김●). */
export function maskName(s: unknown): string {
  const v = String(s ?? '').trim();
  if (v.length <= 1) return v;
  if (v.length === 2) return v[0] + '●';
  return v[0] + '●'.repeat(v.length - 2) + v[v.length - 1];
}

/** 연락처 — 가운데 4자리 가림(010-1234-5678→010-●●●●-5678). 운영상 대개 원문 유지, 외부공유시 사용. */
export function maskPhone(s: unknown): string {
  const v = String(s ?? '').trim();
  const d = v.replace(/\D/g, '');
  if (d.length < 7) return v;
  return `${d.slice(0, 3)}-●●●●-${d.slice(-4)}`;
}

/** 주소 — 앞 2토막(시/구)만, 상세주소 가림. */
export function maskAddress(s: unknown): string {
  const v = String(s ?? '').trim();
  if (!v) return '';
  const parts = v.split(/\s+/);
  return parts.length <= 2 ? v : parts.slice(0, 2).join(' ') + ' ●●●';
}

function maskAll(s: string): string {
  return s.length > 2 ? s.slice(0, 1) + '●'.repeat(s.length - 1) : '●'.repeat(s.length);
}
