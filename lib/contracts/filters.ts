/** 계약 운영 필터 술어 — 목록/렌즈에서 손롤 금지, 이 술어로 통일. */
import { ymd } from './dates';
import { type ContractView } from '../contract-ops';

export type ContractFilter = '전체' | '대기' | '운행' | '만기임박' | '만기경과' | '반납예정' | '종료' | '미수';

export function passesFilter(v: ContractView, f: ContractFilter, today: string): boolean {
  switch (f) {
    case '전체': return true;
    case '대기': return v.status === '대기';
    case '운행': return v.status === '운행';
    case '만기임박': return v.status === '운행' && v.dday != null && v.dday >= 0 && v.dday <= 30;
    case '만기경과': return v.status === '운행' && v.dday != null && v.dday < 0;
    case '반납예정': return v.status === '운행' && !!ymd(v.rec.returnScheduledDate);
    case '종료': return v.ended;
    case '미수': return v.net > 0;
  }
}
