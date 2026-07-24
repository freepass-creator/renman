/**
 * PageDef — «1 정의, 2 렌더러» 아키텍처의 정의 타입 (통일 규격 설계서 §4).
 *   페이지는 이 def 1개만 선언, WebPage/MobilePage 렌더러가 소비. 렌더 코드 없음.
 *   도메인 데이터는 useData 훅으로 위임(도메인 로직 불변). 이 초안은 E-grid 우선 —
 *   B/A/C/D 필드(queues·sections 등)는 해당 렌더러 착수(P2) 시 확장.
 */
import type { ReactNode } from 'react';
import type { SheetCol, ObjRowProps, BadgeTone } from '@/components/ui';

/** 모바일 리스트 그룹(상태별 섹션) — 각 그룹이 Rows 하나. */
export interface RowGroup<R> {
  key: string;
  label: string;
  tone?: BadgeTone;
  match: (r: R) => boolean;
}

export type Archetype = 'A-dash' | 'B-worklist' | 'C-metrics' | 'D-input' | 'E-grid' | 'F-system';
export type MTab = 'home' | 'ops' | 'risk' | 'entry' | 'me';

/** 페이지 요약 지표 — 웹 헤더 mid / 모바일 2×2 공용. value는 «현재 보이는 행»(shown) 기반. */
export interface SummaryItem<R> {
  key: string;
  label: string;
  value: (rows: R[]) => ReactNode;
  tone?: 'ink' | 'danger' | 'ok' | 'warn';
  show?: (rows: R[]) => boolean;   // false면 미표시(예: 미수 0이면 숨김)
}

/** 보기(컬럼셋) 탭 — lib/sheet-cols.tsx SSOT 열을 그대로 주입. */
export interface ColSet<R> {
  key: string;
  label: string;
  cols: SheetCol<R>[];
}

export interface PageDef<R = unknown> {
  href: string;
  archetype: Archetype;
  title: string;
  /** 데이터 취득 훅 — 기존 useEntityLists/linkFleet/build* 위임(도메인 불변). 렌더러가 1회 호출. */
  useData: () => { rows: R[]; loading: boolean };
  rowKey: (r: R) => string;
  drill?: (r: R) => void;    // 웹 행 클릭 → 자산360 (openCar 등)
  mDrill?: (r: R) => string; // 모바일 행 클릭 → /m 상세 href (없으면 drill 사용)

  // ── 모바일 리스트(ObjRow 투영) ──
  row?: (r: R) => ObjRowProps;   // 행 → ObjRow 매핑 (모바일)
  groups?: RowGroup<R>[];        // 상태별 그룹(생략 시 평면 리스트)

  // ── E-grid (현황 그리드) ──
  colSets?: ColSet<R>[];                         // 보기 탭 (첫 항목이 기본)
  revealCols?: Record<string, SheetCol<R>[]>;    // 기본뷰에서 켜진 facet에 대응해 우측 자동 노출
  lensKey?: string;                              // FacetRail lensKey
  radioKeys?: string[];                          // 단일선택(라디오)군
  facetDefault?: string[];                       // 초기 선택 facet
  filter?: (r: R, facets: Set<string>, range: { from: string; to: string }) => boolean;
  counts?: (rows: R[]) => Record<string, number>;
  sort?: (a: R, b: R) => number;
  summary?: SummaryItem<R>[];
  period?: 'month' | false;                      // 월구간 input×2
  csvName?: (view: string) => string;
}
