/**
 * 지시(자동 업무) SSOT — «조건이 업무를 낳는다».
 *
 * 설계 = `docs/PLAN-work-autogen.md`. 요지 세 줄:
 *   1) 어젠다(`lib/agenda.ts`)가 감지한 기한을 **가상 업무행**으로 업무원장에 합성한다.
 *   2) 사람이 손대는 순간(담당 지정·상태 변경·스누즈)에만 `work_item` 으로 굳는다 = **지연 실체화**.
 *   3) `work_item.workId = sourceKey` 이므로 문서ID가 같아 **두 번 생기지 않는다**(dedup 코드 불필요).
 *
 * 왜 즉시 저장하지 않는가: 저장해 버리면 조건이 해소돼도(검사 완료) 업무가 남아 좀비가 되고,
 * 화면 열 때마다 수백 건을 upsert 하게 된다. 손 안 댄 제안은 계산값이라 조건과 함께 사라진다.
 *
 * ⚠ 이 파일은 **순수함수만** 둔다. 저장은 호출부(화면)가 `getStore().save` 로 한다.
 */
import type { AgendaItem, AgendaKind, AgendaStatus } from './agenda';
import type { EntityRecord } from './intake/entities';
import { normPlate } from './plate';
import { workDivisionOf, type WorkCategory, type WorkDivision } from './work-taxonomy';

/** 자동 생성물 표식. 손으로 만든 업무와 섞이지 않게 `sourceKey` 앞에 붙인다. */
export const AUTO_PREFIX = 'auto:';

/** 어젠다 종류 → 업무 세부분류. 대분류는 `workDivisionOf` 가 파생한다(여기서 중복 선언하지 않는다). */
export const DIRECTIVE_CATEGORY: Record<AgendaKind, WorkCategory> = {
  '반납·만기': '반납·정산',
  '검사만기': '검사',
  '보험만기': '보험',
  '세금 만기': '자금',
  '과태료 기한': '과태료',
};

/**
 * **지시로 승격하는 종류.** 과태료는 뺀다 — `penalty` 엔티티가 이미 업무원장의 원천(`source:'penalty'`)이라
 * 자동 제안까지 만들면 같은 고지서가 두 줄이 된다. (매핑표에는 남겨 둔다: 과태료를 원장에서 빼는 날
 * 여기 한 줄만 되돌리면 된다.)
 */
export const DIRECTIVE_KINDS: readonly AgendaKind[] = ['반납·만기', '검사만기', '보험만기', '세금 만기'];

/** 어젠다 종류 → 업무 대상구분(`work_item.targetType`). 과태료는 차량에 붙는 일이라 자산. */
const DIRECTIVE_TARGET_TYPE: Record<AgendaKind, string> = {
  '반납·만기': '계약',
  '검사만기': '자산',
  '보험만기': '자산',
  '세금 만기': '자금',
  '과태료 기한': '자산',
};

/** 어젠다 status → 업무 우선순위. 어김이면 이미 늦은 일이다. */
export function directivePriority(status: AgendaStatus): '긴급' | '높음' | '보통' {
  return status === '어김' ? '긴급' : status === '임박' ? '높음' : '보통';
}

/**
 * 지시의 대상 식별자.
 * 차량번호가 아니라 **근거 레코드 키**를 쓴다 — 한 차에 과태료가 여러 건이면 차량번호로는 한 키로 뭉친다.
 * `refKey` 가 없는 옛 어젠다 항목만 차량번호로 물러선다.
 */
export function directiveTargetKey(item: Pick<AgendaItem, 'refKey' | 'plate'>): string {
  return String(item.refKey || '') || normPlate(item.plate) || '';
}

/** 근거키 = `auto:{종류}:{대상}:{기한}`. 이게 곧 `work_item.workId` = 문서ID 뒷부분이다. */
export function sourceKeyOf(item: Pick<AgendaItem, 'kind' | 'refKey' | 'plate' | 'date'>): string {
  return `${AUTO_PREFIX}${item.kind}:${directiveTargetKey(item)}:${String(item.date).slice(0, 10)}`;
}

export type ParsedSourceKey = { kind: string; target: string; date: string };

/** 근거키 역파싱. 자동 생성물이 아니면 null — 손으로 만든 업무를 절대 건드리지 않기 위한 관문. */
export function parseSourceKey(raw: unknown): ParsedSourceKey | null {
  const s = String(raw || '');
  if (!s.startsWith(AUTO_PREFIX)) return null;
  const rest = s.slice(AUTO_PREFIX.length);
  const parts = rest.split(':');
  if (parts.length < 3) return null;
  // 대상 키에 ':' 가 들어갈 수 있으므로 앞(종류)·뒤(기한)를 먼저 떼고 남은 것을 대상으로 본다.
  const kind = parts[0];
  const date = parts[parts.length - 1];
  const target = parts.slice(1, -1).join(':');
  if (!kind || !date) return null;
  return { kind, target, date };
}

/** 업무 레코드에서 근거키를 꺼낸다. `sourceKey` 우선, 옛 저장분은 `workId` 로 물러선다. */
export function sourceKeyOfRecord(rec: EntityRecord): string | null {
  const sk = String(rec.sourceKey || '') || String(rec.workId || '');
  return sk.startsWith(AUTO_PREFIX) ? sk : null;
}

/** 종결된 업무인가 — 「보류」는 **종결이 아니다**(스누즈일 뿐이라 기한 변경을 계속 따라가야 한다). */
function isClosed(rec: EntityRecord): boolean {
  const s = String(rec.status || '');
  return /완료|종결|취소/.test(s) || rec.done === true || s === 'completed';
}

/** 스누즈 중인가 — `snoozeUntil` 이 오늘보다 뒤면 기본 목록에서 접어 둔다. */
export function isSnoozed(rec: EntityRecord, today: string): boolean {
  const until = String(rec.snoozeUntil || '').slice(0, 10);
  return !!until && until > today;
}

/** 표시용 제목. 어젠다 title 은 종류마다 담는 것이 달라(계약자·차명·보험사·위반내용) 앞에 «할 일»을 붙인다. */
export function directiveTitle(item: AgendaItem): string {
  const what: Record<AgendaKind, string> = {
    '반납·만기': '반납 예정 — 회수·정산 준비',
    '검사만기': '정기검사 예약·수검',
    '보험만기': '보험 갱신',
    '세금 만기': '자동차세 납부',
    '과태료 기한': '과태료 납부·변경부과',
  };
  const tail = String(item.title || '').trim();
  return tail ? `${what[item.kind]} · ${tail}` : what[item.kind];
}

/** 원장에 합성할 «아직 실체 없는» 제안 1건. */
export type DirectiveProposal = {
  sourceKey: string;
  kind: AgendaKind;
  category: WorkCategory;
  division: WorkDivision;
  targetType: string;
  companyId: string;
  company: string;
  plate: string;
  contractKey: string;
  title: string;
  dueDate: string;
  dday: number;
  agendaStatus: AgendaStatus;
  priority: '긴급' | '높음' | '보통';
  amount: number;
};

/** 이미 실체화된 자동업무에 붙는 표식. */
export type DirectiveFlag =
  | { flag: 'ok' }
  /** 근거의 기한이 바뀌었다(계약 연장·검사일 변경). `nextDue` 로 갱신하면 된다 — 새 업무를 만들지 않는다. */
  | { flag: '기한변경'; nextDue: string; nextSourceKey: string }
  /** 근거가 사라졌다(검사 완료 등). 자동 종결하지 않는다 — 사람이 닫는다. */
  | { flag: '근거소멸' };

export type DirectiveReconcile = {
  proposals: DirectiveProposal[];
  /** key = `work_item._key`(= workId = sourceKey). 표식이 없는 업무는 여기 없다. */
  flags: Record<string, DirectiveFlag>;
};

function proposalOf(item: AgendaItem): DirectiveProposal {
  const category = DIRECTIVE_CATEGORY[item.kind];
  const isContract = item.kind === '반납·만기';
  return {
    sourceKey: sourceKeyOf(item),
    kind: item.kind,
    category,
    division: workDivisionOf(category),
    targetType: DIRECTIVE_TARGET_TYPE[item.kind],
    companyId: item.companyId,
    company: item.company,
    plate: String(item.plate || ''),
    contractKey: isContract ? String(item.refKey || '') : '',
    title: directiveTitle(item),
    dueDate: String(item.date).slice(0, 10),
    dday: item.dday,
    agendaStatus: item.status,
    priority: directivePriority(item.status),
    amount: Number(item.amount) || 0,
  };
}

/**
 * 어젠다 ↔ 이미 저장된 자동업무를 맞춰 본다.
 *
 * 판정 순서(이 순서가 곧 규칙이다):
 *   ① 같은 근거키의 업무가 이미 있다 → 제안하지 않는다(실체가 이긴다). 완료된 것도 다시 띄우지 않는다.
 *   ② 같은 (종류·대상)의 **미종결** 업무가 있는데 기한만 다르다 → 「기한변경」. 새로 만들지 않는다.
 *   ③ 그 외 → 제안(가상행).
 *   ④ 어젠다에 대응 근거가 아예 없는 미종결 자동업무 → 「근거소멸」.
 */
export function reconcileDirectives(
  agenda: AgendaItem[],
  workItems: EntityRecord[],
): DirectiveReconcile {
  const bySourceKey = new Map<string, EntityRecord>();
  /** `{종류}:{대상}` → 미종결 자동업무 */
  const openByPair = new Map<string, EntityRecord>();

  for (const rec of workItems) {
    const sk = sourceKeyOfRecord(rec);
    if (!sk) continue;                       // 손으로 만든 업무 — 이 엔진은 손대지 않는다
    bySourceKey.set(sk, rec);
    const parsed = parseSourceKey(sk);
    if (!parsed || isClosed(rec)) continue;
    // 승격 대상이 아닌 종류(과태료)는 판정에서 뺀다 — 어젠다가 제안을 안 하므로 전부 「근거소멸」로 몰린다.
    if (!(DIRECTIVE_KINDS as readonly string[]).includes(parsed.kind)) continue;
    openByPair.set(`${parsed.kind}:${parsed.target}`, rec);
  }

  const proposals: DirectiveProposal[] = [];
  const flags: Record<string, DirectiveFlag> = {};
  const livePairs = new Set<string>();
  const seen = new Set<string>();

  for (const item of agenda) {
    if (!DIRECTIVE_KINDS.includes(item.kind)) continue;
    const sk = sourceKeyOf(item);
    if (seen.has(sk)) continue;              // 같은 근거가 두 번 들어와도 한 줄
    seen.add(sk);
    const pair = `${item.kind}:${directiveTargetKey(item)}`;
    livePairs.add(pair);

    if (bySourceKey.has(sk)) continue;       // ① 실체가 있다

    const open = openByPair.get(pair);
    if (open) {                              // ② 같은 일인데 기한이 바뀌었다
      const key = String(open._key || open.workId || '');
      if (key) flags[key] = { flag: '기한변경', nextDue: String(item.date).slice(0, 10), nextSourceKey: sk };
      continue;
    }

    proposals.push(proposalOf(item));        // ③
  }

  for (const [pair, rec] of openByPair) {    // ④
    if (livePairs.has(pair)) continue;
    const key = String(rec._key || rec.workId || '');
    if (key && !flags[key]) flags[key] = { flag: '근거소멸' };
  }

  proposals.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.kind < b.kind ? -1 : 1));
  return { proposals, flags };
}

/**
 * 제안 → 저장 레코드. **여기서 저장하지 않는다** — 호출부가 `resolveWriteCompany` 게이트를 거쳐 저장한다.
 * `workId` 가 자연키(`ENTITIES.work_item.idFrom`)이므로 같은 근거로 다시 저장해도 같은 문서다.
 */
export function materializePatch(
  p: DirectiveProposal,
  today: string,
  patch: Partial<EntityRecord> = {},
): EntityRecord {
  return {
    workId: p.sourceKey,
    sourceKey: p.sourceKey,
    autoSource: 'agenda',
    companyId: p.companyId,
    date: today,
    category: p.category,
    targetType: p.targetType,
    title: p.title,
    status: '대기',
    priority: p.priority,
    dueDate: p.dueDate,
    ...(p.plate ? { plate: p.plate } : {}),
    ...(p.contractKey ? { contractKey: p.contractKey } : {}),
    ...(p.amount ? { amount: p.amount } : {}),
    ...patch,
  };
}

/**
 * 「기한변경」을 반영할 때 쓰는 patch.
 * 문서ID(= `workId` = 최초 근거키)는 **바꾸지 않는다** — 바꾸면 문서가 새로 생겨 이력이 끊긴다.
 * 갱신되는 것은 `dueDate` 와 «지금 근거» 를 가리키는 `sourceKey` 뿐이다.
 */
export function reschedulePatch(flag: Extract<DirectiveFlag, { flag: '기한변경' }>): EntityRecord {
  return { dueDate: flag.nextDue, sourceKey: flag.nextSourceKey };
}

/** 스누즈 종료일 — `days` 일 뒤(KST 날짜 문자열 연산, TZ 영향 없음). */
export function snoozeDate(today: string, days: number): string {
  const base = new Date(`${String(today).slice(0, 10)}T00:00:00+09:00`).getTime();
  return new Date(base + days * 86_400_000 + 9 * 3_600_000).toISOString().slice(0, 10);
}
