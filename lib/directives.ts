/**
 * 지시(자동 업무) SSOT — «조건이 업무를 낳는다».
 *
 * 설계 = `docs/PLAN-work-autogen.md`. 요지 세 줄:
 *   1) 감지된 조건을 **가상 업무행**으로 업무원장에 합성한다.
 *   2) 사람이 손대는 순간(담당 지정·상태 변경·스누즈)에만 `work_item` 으로 굳는다 = **지연 실체화**.
 *   3) `work_item.workId = sourceKey` 이므로 문서ID가 같아 **두 번 생기지 않는다**(dedup 코드 불필요).
 *
 * 왜 즉시 저장하지 않는가: 저장해 버리면 조건이 해소돼도(검사 완료·미수 입금) 업무가 남아 좀비가 되고,
 * 화면 열 때마다 수백 건을 upsert 하게 된다. 손 안 댄 제안은 계산값이라 조건과 함께 사라진다.
 *
 * **씨앗(DirectiveSeed) 구조** — 감지기(어젠다·미수)마다 «같은 일»과 «다음 회차»의 뜻이 다르다:
 *   · 어젠다: 같은 일 = 대상(차·계약), 회차 = 기한.      기한이 바뀌면 「기한변경」(같은 문서를 옮긴다)
 *   · 미수:   같은 일 = 계약+회수단계, 회차 = 없음.       단계가 오르면 **다른 일**이다
 *             (경고는 D+1의 조치, 시동제어는 D+3의 조치 — 옛 단계는 「근거소멸」로 남아 사람이 닫는다)
 * 그래서 씨앗이 `pairKey`(정체성)와 `version`(회차)을 **직접** 들고 온다. 엔진은 해석하지 않는다.
 *
 * ⚠ 이 파일은 **순수함수만** 둔다. 저장은 호출부(화면)가 `getStore().save` 로 한다.
 */
import type { AgendaItem, AgendaKind, AgendaStatus } from './agenda';
import type { EntityRecord } from './intake/entities';
import type { ContractView } from './contract-ops';
import { collectionInfoForReceivable } from './receivables-ledger';
import { companyShort } from './companies';
import { normPlate } from './plate';
import { workDivisionOf, type WorkCategory, type WorkDivision } from './work-taxonomy';

/** 자동 생성물 표식. 손으로 만든 업무와 섞이지 않게 `sourceKey` 앞에 붙인다. */
export const AUTO_PREFIX = 'auto:';

/** 감지 원천. 어젠다 5종 + 미수 회수. */
export type DirectiveKind = AgendaKind | '미수회수';

/** 지시 종류 → 업무 세부분류. 대분류는 `workDivisionOf` 가 파생한다(여기서 중복 선언하지 않는다). */
export const DIRECTIVE_CATEGORY: Record<DirectiveKind, WorkCategory> = {
  '반납·만기': '반납·정산',
  '검사만기': '검사',
  '보험만기': '보험',
  '세금 만기': '자금',
  '과태료 기한': '과태료',
  '미수회수': '수납이슈',
};

/**
 * **지시로 승격하는 어젠다 종류.** 과태료는 뺀다 — `penalty` 엔티티가 이미 업무원장의 원천(`source:'penalty'`)이라
 * 자동 제안까지 만들면 같은 고지서가 두 줄이 된다. (매핑표에는 남겨 둔다: 과태료를 원장에서 빼는 날
 * 여기 한 줄만 되돌리면 된다.)
 */
export const DIRECTIVE_KINDS: readonly AgendaKind[] = ['반납·만기', '검사만기', '보험만기', '세금 만기'];

/**
 * **이 엔진이 관리하는 종류 전부**(어젠다 4종 + 미수회수). 「근거소멸」 판정 대상을 가른다.
 *
 * ⚠ 이번 배치의 씨앗에 들어 있는 종류로 판단하면 안 된다 — 미수가 전부 입금돼 씨앗이 0건이 되는 순간
 * 미완료 회수업무가 「근거소멸」로 안 잡히고 영원히 열린 채 남는다(정확히 그 버그를 테스트가 잡았다).
 * 관리 대상인가는 **정적**으로 정하고, 근거가 있나 없나만 씨앗으로 판단한다.
 */
const MANAGED_KINDS: ReadonlySet<string> = new Set<string>([...DIRECTIVE_KINDS, '미수회수']);

/** 지시 종류 → 업무 대상구분(`work_item.targetType`). 과태료는 차량에 붙는 일이라 자산. */
const DIRECTIVE_TARGET_TYPE: Record<DirectiveKind, string> = {
  '반납·만기': '계약',
  '검사만기': '자산',
  '보험만기': '자산',
  '세금 만기': '자금',
  '과태료 기한': '자산',
  '미수회수': '계약',
};

export type DirectivePriority = '긴급' | '높음' | '보통';

/** 어젠다 status → 업무 우선순위. 어김이면 이미 늦은 일이다. */
export function directivePriority(status: AgendaStatus): DirectivePriority {
  return status === '어김' ? '긴급' : status === '임박' ? '높음' : '보통';
}

/**
 * 감지기가 엔진에 넘기는 정규화된 씨앗.
 * `pairKey` = «같은 일»의 정체성 · `version` = «회차». 이 둘의 조합이 근거키가 된다.
 */
export type DirectiveSeed = {
  kind: DirectiveKind;
  pairKey: string;
  version: string;
  companyId: string;
  company: string;
  plate: string;
  contractKey: string;
  title: string;
  dueDate: string;
  /** 표시용 — 어젠다는 D-day, 미수는 연체일수. 정렬에는 쓰지 않는다(기한이 한다). */
  dday: number;
  priority: DirectivePriority;
  amount: number;
};

export type DirectiveProposal = DirectiveSeed & {
  sourceKey: string;
  category: WorkCategory;
  division: WorkDivision;
  targetType: string;
};

/**
 * 지시의 대상 식별자.
 * 차량번호가 아니라 **근거 레코드 키**를 쓴다 — 한 차에 과태료가 여러 건이면 차량번호로는 한 키로 뭉친다.
 * `refKey` 가 없는 옛 어젠다 항목만 차량번호로 물러선다.
 */
export function directiveTargetKey(item: Pick<AgendaItem, 'refKey' | 'plate'>): string {
  return String(item.refKey || '') || normPlate(item.plate) || '';
}

/** 근거키 = `auto:{종류}:{정체성}:{회차}`. 이게 곧 `work_item.workId` = 문서ID 뒷부분이다. */
export function sourceKeyOf(seed: Pick<DirectiveSeed, 'kind' | 'pairKey' | 'version'>): string {
  return `${AUTO_PREFIX}${seed.kind}:${seed.pairKey}:${seed.version}`;
}

/** 「같은 일인가」 판정 키. 회차를 뺀 앞부분. */
export function pairIdOf(seed: Pick<DirectiveSeed, 'kind' | 'pairKey'>): string {
  return `${seed.kind}:${seed.pairKey}`;
}

export type ParsedSourceKey = { kind: string; pair: string; version: string };

/** 근거키 역파싱. 자동 생성물이 아니면 null — 손으로 만든 업무를 절대 건드리지 않기 위한 관문. */
export function parseSourceKey(raw: unknown): ParsedSourceKey | null {
  const s = String(raw || '');
  if (!s.startsWith(AUTO_PREFIX)) return null;
  const parts = s.slice(AUTO_PREFIX.length).split(':');
  if (parts.length < 3) return null;
  // 정체성에 ':' 가 들어갈 수 있으므로 앞(종류)·뒤(회차)를 먼저 떼고 남은 것을 정체성으로 본다.
  const kind = parts[0];
  const version = parts[parts.length - 1];
  const pair = parts.slice(1, -1).join(':');
  if (!kind) return null;
  return { kind, pair, version };
}

/** 업무 레코드에서 근거키를 꺼낸다. `sourceKey` 우선, 옛 저장분은 `workId` 로 물러선다. */
export function sourceKeyOfRecord(rec: EntityRecord): string | null {
  const sk = String(rec.sourceKey || '') || String(rec.workId || '');
  return sk.startsWith(AUTO_PREFIX) ? sk : null;
}

/** 레코드의 「같은 일」 키. 저장된 `sourcePair` 우선, 없으면 근거키에서 회차를 떼어 복원. */
export function pairIdOfRecord(rec: EntityRecord): string | null {
  const saved = String(rec.sourcePair || '');
  if (saved) return saved;
  const parsed = parseSourceKey(sourceKeyOfRecord(rec));
  return parsed ? `${parsed.kind}:${parsed.pair}` : null;
}

/** 종결된 업무인가 — 「보류」는 **종결이 아니다**(스누즈일 뿐이라 회차 변경을 계속 따라가야 한다). */
function isClosed(rec: EntityRecord): boolean {
  const s = String(rec.status || '');
  return /완료|종결|취소/.test(s) || rec.done === true || s === 'completed';
}

/** 스누즈 중인가 — `snoozeUntil` 이 오늘보다 뒤면 기본 목록에서 접어 둔다. */
export function isSnoozed(rec: EntityRecord, today: string): boolean {
  const until = String(rec.snoozeUntil || '').slice(0, 10);
  return !!until && until > today;
}

/** 표시용 제목. 어젠다 title 은 종류마다 담는 것이 달라(계약자·차명·보험사) 앞에 «할 일»을 붙인다. */
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

/** 어젠다 → 씨앗. 같은 일 = 대상, 회차 = 기한. */
export function agendaSeeds(agenda: AgendaItem[]): DirectiveSeed[] {
  const out: DirectiveSeed[] = [];
  for (const item of agenda) {
    if (!DIRECTIVE_KINDS.includes(item.kind)) continue;
    out.push({
      kind: item.kind,
      pairKey: directiveTargetKey(item),
      version: String(item.date).slice(0, 10),
      companyId: item.companyId,
      company: item.company,
      plate: String(item.plate || ''),
      contractKey: item.kind === '반납·만기' ? String(item.refKey || '') : '',
      title: directiveTitle(item),
      dueDate: String(item.date).slice(0, 10),
      dday: item.dday,
      priority: directivePriority(item.status),
      amount: Number(item.amount) || 0,
    });
  }
  return out;
}

/**
 * **회수 조치로 볼 단계.** 「회수대기」는 아직 할 일이 아니고,
 * 「계약조건 확인」은 회수 조치가 아니라 계약 데이터 정비다 — 지시로 만들면 연체조항 미등록 계약 수만큼
 * 업무가 쏟아져 진짜 조치가 묻힌다(그 결손은 리스크 화면이 이미 보여준다).
 */
const ACTIONABLE_STAGES: ReadonlySet<string> = new Set(['경고', '시동제어', '차량회수', '내용증명', '채권화']);

const STAGE_PRIORITY: Record<string, DirectivePriority> = {
  '경고': '보통',
  '시동제어': '높음',
  '차량회수': '높음',
  '내용증명': '긴급',
  '채권화': '긴급',
};

/**
 * 미수 계약 → 씨앗. **같은 일 = 계약+단계 · 회차 없음.**
 *
 * 왜 단계를 정체성에 넣는가: 경고(D+1)를 안 한 채 시동제어(D+3)가 도래하면 그건 «기한이 밀린 같은 일»이
 * 아니라 **다른 조치**다. 단계를 회차로 쓰면 「경고 이행」이라는 제목의 업무가 시동제어 기한으로
 * 슬쩍 바뀌어 남는다. 정체성에 넣으면 옛 단계는 「근거소멸」로 남아 사람이 닫고, 새 단계는 새 지시가 된다.
 *
 * 단계 판정은 `collectionInfoForReceivable`(계약 조항 SSOT)이 한다 — 여기서 D+숫자를 다시 해석하지 않는다.
 */
export function receivableSeeds(views: ContractView[], today: string): DirectiveSeed[] {
  const out: DirectiveSeed[] = [];
  for (const v of views) {
    if (!(v.net > 0)) continue;
    const rec = v.rec;
    const info = collectionInfoForReceivable(v, rec);
    if (!ACTIONABLE_STAGES.has(info.stage)) continue;
    const contractKey = String(rec._key || rec.contractNo || '');
    if (!contractKey) continue;
    const who = String(rec.contractorName || '').trim();
    const companyId = String(rec.companyId || '');
    out.push({
      kind: '미수회수',
      pairKey: `${contractKey}|${info.stage}`,
      version: '',
      companyId,
      company: companyShort(companyId),
      plate: String(rec.plate || ''),
      contractKey,
      title: `미수 회수 ${info.stage} — ${info.nextAction}${who ? ` · ${who}` : ''} · ${v.count}회 미납 ${info.overdueDays}일 연체`,
      // 회수 조치는 «오늘 할 일»이다. 계약 만기일을 기한으로 쓰면 이미 지난 날짜라 기한경과로만 보인다.
      dueDate: today,
      dday: -info.overdueDays,
      priority: STAGE_PRIORITY[info.stage] || '높음',
      amount: Math.max(0, v.net),
    });
  }
  return out;
}

/** 이미 실체화된 자동업무에 붙는 표식. */
export type DirectiveFlag =
  | { flag: 'ok' }
  /** 같은 일인데 회차가 바뀌었다(계약 연장·검사일 변경). `nextDue` 로 갱신 — 새 업무를 만들지 않는다. */
  | { flag: '기한변경'; nextDue: string; nextSourceKey: string }
  /** 근거가 사라졌다(검사 완료·미수 입금·단계 상승). 자동 종결하지 않는다 — 사람이 닫는다. */
  | { flag: '근거소멸' };

export type DirectiveReconcile = {
  proposals: DirectiveProposal[];
  /** key = `work_item._key`(= workId = 최초 근거키). 표식이 없는 업무는 여기 없다. */
  flags: Record<string, DirectiveFlag>;
};

function proposalOf(seed: DirectiveSeed): DirectiveProposal {
  const category = DIRECTIVE_CATEGORY[seed.kind];
  return {
    ...seed,
    sourceKey: sourceKeyOf(seed),
    category,
    division: workDivisionOf(category),
    targetType: DIRECTIVE_TARGET_TYPE[seed.kind],
  };
}

/**
 * 씨앗 ↔ 이미 저장된 자동업무를 맞춰 본다.
 *
 * 판정 순서(이 순서가 곧 규칙이다):
 *   ① 같은 근거키의 업무가 이미 있다 → 제안하지 않는다(실체가 이긴다). 완료된 것도 다시 띄우지 않는다.
 *   ② 같은 일(pairId)의 **미종결** 업무가 있는데 회차만 다르다 → 「기한변경」. 새로 만들지 않는다.
 *   ③ 그 외 → 제안(가상행).
 *   ④ 대응 씨앗이 아예 없는 미종결 자동업무 → 「근거소멸」.
 */
export function reconcileDirectives(
  seeds: DirectiveSeed[],
  workItems: EntityRecord[],
): DirectiveReconcile {
  const bySourceKey = new Map<string, EntityRecord>();
  /** pairId → 미종결 자동업무 */
  const openByPair = new Map<string, EntityRecord>();

  for (const rec of workItems) {
    const sk = sourceKeyOfRecord(rec);
    if (!sk) continue;                       // 손으로 만든 업무 — 이 엔진은 손대지 않는다
    bySourceKey.set(sk, rec);
    const pair = pairIdOfRecord(rec);
    if (!pair || isClosed(rec)) continue;
    // 관리 대상이 아닌 종류(과태료)는 판정에서 뺀다 — 씨앗을 만들지 않으므로 전부 「근거소멸」로 몰린다.
    if (!MANAGED_KINDS.has(pair.split(':')[0])) continue;
    openByPair.set(pair, rec);
  }

  const proposals: DirectiveProposal[] = [];
  const flags: Record<string, DirectiveFlag> = {};
  const livePairs = new Set<string>();
  const seen = new Set<string>();

  for (const seed of seeds) {
    const sk = sourceKeyOf(seed);
    if (seen.has(sk)) continue;              // 같은 근거가 두 번 들어와도 한 줄
    seen.add(sk);
    const pair = pairIdOf(seed);
    livePairs.add(pair);

    if (bySourceKey.has(sk)) continue;       // ① 실체가 있다

    const open = openByPair.get(pair);
    if (open) {                              // ② 같은 일인데 회차가 바뀌었다
      const key = String(open._key || open.workId || '');
      if (key) flags[key] = { flag: '기한변경', nextDue: seed.dueDate, nextSourceKey: sk };
      continue;
    }

    proposals.push(proposalOf(seed));        // ③
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
    sourcePair: pairIdOf(p),
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
