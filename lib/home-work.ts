/**
 * 홈(업무) — «목록 + 수행창» 의 순수 계산층. 화면은 여기 결과만 그린다.
 *
 * 설계 정본: design/home-inbox/SPEC.md (v3.1)
 *   · 목록 행 = HomeProblem 그대로(action=조치). 여기서는 «언제 하나»(시간축)로 묶고,
 *     이미 실체화된 work_item(완료·연기·담당)을 근거키로 이어 붙인다.
 *   · 근거키 = `auto:{종류}:{대상}:{기한}` = work_item.workId(자연키) → 두 번 눌러도 문서는 하나.
 *   · 완료·접수·연기·이관은 «지연 실체화»(docs/PLAN-work-autogen.md): 누를 때만 저장한다.
 *
 * 화면 용어(SPEC §9): 지연·오늘·이번 주·예정·완료 / 접수·연기·이관·담당 지정 / 수행·차량360.
 */
import type { HomeProblem, HomeGroup } from './home-problems';
import type { EntityRecord } from './intake/entities';
import { snoozeDate } from './directives';
import { LEDGER_EMPTY } from './ledger-empty';
import { normalizeWorkStatus } from './work-ledger';

export type HomeBucket = 'late' | 'today' | 'week' | 'later' | 'done';
export const HOME_BUCKETS: ReadonlyArray<{ key: HomeBucket; label: string; fold: boolean }> = [
  { key: 'late', label: '지연', fold: false },
  { key: 'today', label: '오늘', fold: false },
  { key: 'week', label: '이번 주', fold: false },
  { key: 'later', label: '예정', fold: true },
  { key: 'done', label: '완료 · 오늘', fold: true },
];

export type HomeOwnerFilter = 'me' | 'none' | 'all';

/** 홈 목록 한 줄. HomeProblem + 실체화된 업무(있으면) + 시간축. */
export type HomeTask = HomeProblem & {
  /** 근거키 = work_item.workId */
  workId: string;
  /** work_item.category (WORK_CATEGORIES_ACTIVE 중 하나) */
  category: string;
  bucket: HomeBucket;
  /** 실체화된 업무 문서(없으면 null) */
  rec: EntityRecord | null;
  /** 연기·기한변경을 반영한 «지금 기한» */
  effectiveDue: string;
  effectiveDday: number | null;
  /** 오늘 완료됐나 (bucket=done) */
  done: boolean;
  /** 원천 — 리스크 계산값(problem) / 사람이 만든 업무(manual) */
  origin: 'problem' | 'manual';
};

/** 날짜 문자열 + n일 (UTC 기준 문자열 연산 — TZ 영향 없음). */
export function shiftDate(date: string, days: number): string {
  const t = Date.parse(`${String(date || '').slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t)) return '';
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

/** KST 날짜 문자열 두 개의 일수 차(b - a). 파싱 실패 시 null. */
export function daysBetween(a: string, b: string): number | null {
  const pa = Date.parse(`${String(a || '').slice(0, 10)}T00:00:00Z`);
  const pb = Date.parse(`${String(b || '').slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(pa) || Number.isNaN(pb)) return null;
  return Math.round((pb - pa) / 86_400_000);
}

/** 종류 키 — 근거키의 두 번째 조각. 미수는 회수 단계와 무관하게 «미납» 하나(같은 채권이 단계마다 새 업무가 되면 안 된다). */
export function homeKindKey(p: Pick<HomeProblem, 'group' | 'rawKind' | 'kind'>): string {
  if (p.group === '미수') return '미납';
  return String(p.rawKind || p.kind || '기타').replace(/\s+/g, '');
}

/** 근거키 = 자연키. 차량이 없는 건(자금 미분류 등)은 risk row id 를 대상으로 쓴다. */
export function homeWorkId(p: Pick<HomeProblem, 'group' | 'rawKind' | 'kind' | 'plate' | 'id' | 'dueDate'>): string {
  const target = String(p.plate || '').trim() || String(p.id || '').trim() || 'unknown';
  const due = String(p.dueDate || '').slice(0, 10) || 'nodue';
  return `auto:${homeKindKey(p)}:${target}:${due}`;
}

/** 리스크 종류 → work_item.category (lib/work-taxonomy WORK_CATEGORIES_ACTIVE). */
export function homeCategory(p: Pick<HomeProblem, 'group' | 'rawKind' | 'kind'>): string {
  if (p.group === '미수') return '수납이슈';
  const k = String(p.rawKind || p.kind || '');
  if (/반납|만기경과|만기임박/.test(k)) return '반납·정산';
  if (/인도|배차/.test(k)) return '입출고';
  if (/검사/.test(k)) return '검사';
  if (/보험/.test(k)) return '보험';
  if (/세금|자금/.test(k)) return '자금';
  if (/과태료/.test(k)) return '과태료';
  if (/서류|등록증/.test(k)) return '문서';
  if (/사고/.test(k)) return '사고';
  return '기타';
}

/** work_item.category → 홈 도메인 칩. */
export function domainOfCategory(category: unknown): HomeGroup {
  const c = String(category || '');
  if (c === '수납이슈') return '미수';
  if (c === '자금' || c === '과태료') return '재무';
  return '차량';
}

/** 시간축 판정 — dday 하나. 미납은 언제나 지연. dday 없는 건은 «이번 주»(눈에 띄되 지연은 아님). */
export function bucketOf(dday: number | null, group: string): Exclude<HomeBucket, 'done'> {
  if (group === '미수') return 'late';
  if (dday == null) return 'week';
  if (dday < 0) return 'late';
  if (dday === 0) return 'today';
  if (dday <= 7) return 'week';
  return 'later';
}

function recDate(rec: EntityRecord, keys: string[]): string {
  for (const k of keys) {
    const v = String(rec[k] || '').slice(0, 10);
    if (v) return v;
  }
  return '';
}

/**
 * HomeProblem × work_item → HomeTask.
 *  · 근거키로 실체화 문서를 찾는다. 완료(오늘)=완료 섹션, 완료(과거)=목록에서 뺀다.
 *  · 보류(연기)=snoozeUntil 을 기한으로 삼아 다시 시간축에 넣는다.
 *  · 담당은 문서의 assigneeName 이 있으면 그것.
 *  · 리스크에 안 잡히는 «사람이 만든 열린 업무»(기한 있음)도 한 줄로 합류한다.
 */
export function buildHomeTasks(problems: HomeProblem[], workItems: EntityRecord[], today: string): HomeTask[] {
  const byId = new Map<string, EntityRecord>();
  for (const w of workItems) {
    const id = String(w.workId || '').trim();
    if (id) byId.set(id, w);
  }
  const out: HomeTask[] = [];
  const used = new Set<string>();

  for (const p of problems) {
    const workId = homeWorkId(p);
    const rec = byId.get(workId) || null;
    if (rec) used.add(workId);
    const status = rec ? normalizeWorkStatus(rec.status) : null;
    let effectiveDue = p.dueDate;
    let effectiveDday = p.dday;
    if (p.group === '미수') {
      // 미납의 «기한 칸»은 연체일이다(계약 만기가 아니라). D+연체일 · 기한 = 첫 미납 회차일.
      const od = Number(p.overdueDays) || 0;
      effectiveDday = od > 0 ? -od : 0;
      effectiveDue = od > 0 ? shiftDate(today, -od) : today;
    }
    let bucket: HomeBucket;
    let done = false;
    if (rec && status === '완료') {
      const when = recDate(rec, ['completedAt', 'date']);
      if (when !== today) continue;            // 과거 완료 — 목록에서 뺀다(감사 흔적은 문서에 남음)
      bucket = 'done';
      done = true;
    } else {
      const snooze = rec ? String(rec.snoozeUntil || '').slice(0, 10) : '';
      const recDue = rec ? String(rec.dueDate || '').slice(0, 10) : '';
      if (rec && status === '보류' && snooze && snooze > today) {
        effectiveDue = snooze;
        effectiveDday = daysBetween(today, snooze);
        bucket = 'later';
      } else {
        if (recDue && recDue !== String(p.dueDate || '').slice(0, 10)) {
          effectiveDue = recDue;
          effectiveDday = daysBetween(today, recDue);
        }
        bucket = bucketOf(effectiveDday, p.group);
      }
    }
    const assignee = rec && String(rec.assigneeName || '').trim() ? String(rec.assigneeName).trim() : p.assignee;
    out.push({
      ...p, assignee, workId, category: homeCategory(p), bucket, rec, effectiveDue, effectiveDday, done, origin: 'problem',
    });
  }

  // 사람이 만든 열린 업무(리스크 밖) — 기한이 있는 것만 시간축에 합류
  for (const w of workItems) {
    const id = String(w.workId || '').trim();
    if (!id || used.has(id)) continue;
    if (id.startsWith('auto:')) continue;       // 자동 제안의 실체화본은 problem 쪽에서 이미 처리
    const status = normalizeWorkStatus(w.status);
    const due = String(w.dueDate || '').slice(0, 10);
    let bucket: HomeBucket;
    let done = false;
    if (status === '완료') {
      if (recDate(w, ['completedAt', 'date']) !== today) continue;
      bucket = 'done'; done = true;
    } else {
      if (!due) continue;
      const snooze = String(w.snoozeUntil || '').slice(0, 10);
      if (status === '보류' && snooze && snooze > today) {
        bucket = 'later';
      } else if (status === '보류') {
        continue;
      } else {
        bucket = bucketOf(daysBetween(today, due), domainOfCategory(w.category));
      }
    }
    const effDue = (bucket === 'later' && String(w.snoozeUntil || '')) ? String(w.snoozeUntil).slice(0, 10) : due;
    const plate = String(w.plate || '').trim();
    const dom = domainOfCategory(w.category);
    out.push({
      id: id, group: dom, kind: String(w.category || '기타'), status: status || '',
      problem: String(w.description || ''), action: String(w.title || w.category || '업무'),
      assignee: String(w.assigneeName || '').trim() || LEDGER_EMPTY.unassigned,
      company: '', companyId: String(w.companyId || ''), plate, carName: '',
      rawKind: String(w.category || ''), who: String(w.customerName || ''),
      dueDate: due, dday: daysBetween(today, due), overdueDays: 0, amount: Number(w.amount || 0) || 0,
      href: plate ? `/vehicle/${encodeURIComponent(plate)}` : '/work',
      urgent: dom === '미수' || (daysBetween(today, due) ?? 1) < 0,
      workId: id, category: String(w.category || '기타'), bucket, rec: w,
      effectiveDue: effDue, effectiveDday: daysBetween(today, effDue), done, origin: 'manual',
    });
  }

  const order: Record<HomeBucket, number> = { late: 0, today: 1, week: 2, later: 3, done: 4 };
  out.sort((a, b) => order[a.bucket] - order[b.bucket]
    || (a.group === '미수' ? 0 : 1) - (b.group === '미수' ? 0 : 1)
    || (a.effectiveDday ?? 9999) - (b.effectiveDday ?? 9999)
    || b.amount - a.amount);
  return out;
}

export function isUnassigned(t: Pick<HomeTask, 'assignee'>): boolean {
  const a = String(t.assignee || '').trim();
  return !a || a === LEDGER_EMPTY.unassigned;
}

export function filterHomeTasks(
  tasks: HomeTask[],
  f: { owner: HomeOwnerFilter; me: string; dom: HomeGroup | null },
): HomeTask[] {
  return tasks.filter((t) => {
    if (f.owner === 'me' && t.assignee !== f.me) return false;
    if (f.owner === 'none' && !isUnassigned(t)) return false;
    if (f.dom && t.group !== f.dom) return false;
    return true;
  });
}

export function homeSummary(tasks: HomeTask[]): Record<HomeBucket, number> {
  const s: Record<HomeBucket, number> = { late: 0, today: 0, week: 0, later: 0, done: 0 };
  for (const t of tasks) s[t.bucket] += 1;
  return s;
}

/** 기한 칸 원자 — 한 칸 한 값. */
export function dueCell(t: Pick<HomeTask, 'bucket' | 'effectiveDday'>): { text: string; tone: 'late' | 'today' | 'week' | 'later' | 'done' | 'none' } {
  if (t.bucket === 'done') return { text: '완료', tone: 'done' };
  const d = t.effectiveDday;
  if (d == null) return { text: '', tone: 'none' };
  if (d < 0) return { text: `D+${-d}`, tone: 'late' };
  if (d === 0) return { text: '오늘', tone: 'today' };
  return { text: `D-${d}`, tone: t.bucket === 'later' ? 'later' : 'week' };
}

/** 저장할 문서의 바탕 — 이미 있으면 그 문서, 없으면 근거키로 새 문서(materializePatch 와 같은 모양). */
export function homeTaskRecord(t: HomeTask, today: string): EntityRecord {
  if (t.rec) return { ...t.rec };
  return {
    workId: t.workId,
    sourceKey: t.workId,
    autoSource: 'home',
    companyId: t.companyId,
    date: today,
    category: t.category,
    targetType: t.plate ? '자산' : (t.group === '재무' ? '자금' : '기타'),
    title: t.action,
    status: '대기',
    dueDate: t.dueDate,
    ...(t.plate ? { plate: t.plate } : {}),
    ...(t.who ? { customerName: t.who } : {}),
    ...(t.amount ? { amount: t.amount } : {}),
    ...(t.problem ? { description: t.problem } : {}),
  };
}

export type HomeAction = 'done' | 'take' | 'defer' | 'assign';

/** 행동 → patch. 화면 용어: 완료 · 접수 · 연기 · 이관/담당 지정. */
export function homeActionPatch(
  action: HomeAction,
  ctx: { today: string; me?: string; days?: number; assignee?: string },
): EntityRecord {
  switch (action) {
    case 'done': return { status: '완료', completedAt: ctx.today };
    case 'take': return { status: '대기', assigneeName: ctx.me || '' };
    case 'defer': {
      const until = snoozeDate(ctx.today, ctx.days ?? 14);
      return { status: '보류', snoozeUntil: until, dueDate: until };
    }
    case 'assign': return { status: '대기', assigneeName: ctx.assignee || '' };
  }
}

export const HOME_ACTION_LABEL: Record<HomeAction, string> = {
  done: '완료', take: '접수', defer: '연기', assign: '담당 지정',
};
