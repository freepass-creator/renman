/** href → PageDef 레지스트리. 페이지가 def로 전환될 때마다 여기 등록. (설계서 §4.1) */
import type { PageDef } from './types';
import { FLEET_DEF } from './defs/fleet';

export const PAGE_DEFS: Record<string, PageDef<any>> = {
  '/sheet': FLEET_DEF,
};

export function pageDef(href: string): PageDef<any> | undefined {
  return PAGE_DEFS[href];
}
