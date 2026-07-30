/**
 * 지시문 합성 SSOT — 감지 엔진(D) → «무엇을 하라» 한 줄.
 *   새 감지 로직 금지. computeDashboard / depositView / docAudit 결과만 소비.
 *   UI = InstructionStrip · 홈 요약은 selectTodayFocus(home-rows).
 *
 * TODO(2단계): ack/snoozeUntil 저장 레이어 — 조건이 남아도 사용자가 미루면 재노출 억제.
 *   지금은 조건이 사라질 때까지 같은 경보가 무한 재노출된다.
 */
import type { Dashboard } from './operating-snapshot';
import type { EntityRecord } from './intake/entities';
import { depositView } from './deposit';
import { TODAY } from './dashboard-consts';
import type { PipeId } from './work-hub';

export type InstructionOrder = {
  id: string;
  n: number;
  text: string;
  to: PipeId;
  /** openPipe query (예: ?group=미납). */
  query?: string;
  danger?: boolean;
  /** 정렬 — 낮을수록 급함. */
  priority: number;
};

export type InstructionBuildOpts = {
  contracts?: EntityRecord[];
  /** 정합성 건수 — 페이지가 docAuditForPlates로 채워 전달(번들 격리). */
  integrityCount?: number;
};

/**
 * 리스크·지시 성격 지시문.
 * scope=`risk` = 리스크 원장 상단(표와 역할 분리).
 * scope=`all` = 자금·만기 등 포함(업무지시 전체).
 */
export function buildInstructionOrders(
  D: Dashboard,
  opts: InstructionBuildOpts = {},
  scope: 'risk' | 'all' = 'risk',
): InstructionOrder[] {
  const orders: InstructionOrder[] = [];
  const over = D.returnFlow.filter((v) => (v.dday ?? 0) < 0);
  if (over.length) {
    orders.push({
      id: 'return-over',
      n: over.length,
      text: '반납일이 지난 차 — 눌러서 배차·차량360에서 반납 또는 연장을 처리하세요',
      to: 'dispatch',
      danger: true,
      priority: 2,
    });
  }
  if (D.doubleBooking.length) {
    orders.push({
      id: 'overlap',
      n: D.doubleBooking.length,
      text: '중복 대여(배차 충돌) — 같은 차·기간이 겹칩니다. 배차관리에서 확인하세요',
      to: 'dispatch',
      danger: true,
      priority: 1,
    });
  }
  if (D.overduePay.length) {
    orders.push({
      id: 'unpaid',
      n: D.overduePay.length,
      text: '미납(미수) — 미수관리·리스크에서 회수 조치(시동제어·내용증명 등)하세요',
      to: 'risk',
      query: '?group=미납',
      danger: true,
      priority: 0,
    });
  }
  if (D.compliance.length) {
    orders.push({
      id: 'compliance',
      n: D.compliance.length,
      text: '법령·컴플라이언스 경고 — 무면허·무보험·면허만기 등. 정합성에서 확인하세요',
      to: 'integrity',
      danger: true,
      priority: 0,
    });
  }
  if (D.penaltyPending.length) {
    orders.push({
      id: 'penalty',
      n: D.penaltyPending.length,
      text: '과태료 — 과태료관리에서 임차인 매칭 후 변경부과를 신청하세요',
      to: 'penalty',
      priority: 3,
    });
  }
  if (D.ghostPlates.length) {
    orders.push({
      id: 'docwait',
      n: D.ghostPlates.length,
      text: '서류 미첨부(등록증 없음) — 데이터관리에서 자동차등록증을 업로드하세요',
      to: 'ingest',
      danger: true,
      priority: 3,
    });
  }

  const contracts = opts.contracts || [];
  if (contracts.length) {
    const pend = contracts.filter((c) => depositView(c, TODAY).pendingRefund);
    if (pend.length) {
      const firstKey = String(pend[0]._key || pend[0].contractNo || '');
      orders.push({
        id: 'deposit',
        n: pend.length,
        text: '보증금 미반환 — 종료 계약 정산(반환/충당)을 처리하세요',
        to: 'contract',
        query: firstKey
          ? `?deposit=1&open=${encodeURIComponent(firstKey)}`
          : '?deposit=1',
        danger: false,
        priority: 4,
      });
    }
  }

  const integrityN = opts.integrityCount ?? 0;
  if (integrityN > 0) {
    orders.push({
      id: 'integrity',
      n: integrityN,
      text: '정합성 확인 — 계약서·입금 대조가 안 맞습니다. 정합성 화면에서 확인하세요',
      to: 'integrity',
      priority: 4,
    });
  }

  if (scope === 'all') {
    if (D.expiring.length) {
      orders.push({
        id: 'expire',
        n: D.expiring.length,
        text: '보험·검사 만기 — 갱신/검사 후 증빙을 데이터관리에서 업로드하세요',
        to: 'ingest',
        priority: 5,
      });
    }
    if (D.unmatchedTx.length) {
      orders.push({
        id: 'money',
        n: D.unmatchedTx.length,
        text: '미분류 입출금 — 자금일보에서 거래를 계약에 매칭하세요',
        to: 'payments',
        priority: 5,
      });
    }
  }

  return orders.sort((a, b) => a.priority - b.priority || b.n - a.n);
}
