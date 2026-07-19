'use client';
// 계좌 별명(별칭) SSOT — 자금일보에서 "어느 법인·어느 계좌"를 사람 말로 식별.
// 법인(companyId)은 거래 데이터에서 파생, 별명은 사용자가 붙임(로컬 저장, 후에 마스터로 승격).
const LS_KEY = 'jpk:account-aliases';
export type AliasMap = Record<string, string>; // 원계좌(문자열) → 별명

export function loadAliases(): AliasMap {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}

export function setAccountAlias(raw: string, alias: string): void {
  if (typeof window === 'undefined' || !raw) return;
  const m = loadAliases();
  if (alias.trim()) m[raw] = alias.trim(); else delete m[raw];
  localStorage.setItem(LS_KEY, JSON.stringify(m));
  window.dispatchEvent(new Event('jpk:alias-change'));
}
