import type { EntityRecord } from "@/lib/intake/entities";
import {
  buildAtomicEvent,
  type AtomicEventSource,
} from "@/lib/domain/atomic-event";

export type WorkStatus =
  "todo" | "in_progress" | "waiting" | "approval" | "completed" | "cancelled";
export type WorkSource =
  "schedule" | "assignment" | "manual" | "event" | "document" | "system";
export type WorkItem = EntityRecord & {
  id: string;
  title: string;
  status: WorkStatus;
  source: WorkSource;
  dueDate?: string;
  assigneeId?: string;
  related?: Array<{ entityType: string; entityId: string }>;
};

const NEXT: Record<WorkStatus, WorkStatus[]> = {
  todo: ["in_progress", "waiting", "completed", "cancelled"],
  in_progress: ["waiting", "approval", "completed", "cancelled"],
  waiting: ["in_progress", "completed", "cancelled"],
  approval: ["in_progress", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function transitionWork(
  item: WorkItem,
  next: WorkStatus,
  at = new Date().toISOString(),
): WorkItem {
  if (!NEXT[item.status].includes(next))
    throw new Error(`${item.status} → ${next} 업무 전이는 허용되지 않습니다.`);
  return {
    ...item,
    status: next,
    updatedAt: at,
    ...(next === "completed" ? { completedAt: at } : {}),
    ...(next === "cancelled" ? { cancelledAt: at } : {}),
  };
}

export function completeWork(args: {
  item: WorkItem;
  companyId: string;
  result?: EntityRecord;
  followUp?: Pick<WorkItem, "title" | "dueDate" | "assigneeId">;
  at?: string;
}) {
  const at = args.at || new Date().toISOString();
  const completed = transitionWork(
    { ...args.item, result: args.result || {} },
    "completed",
    at,
  );
  const event = buildAtomicEvent({
    entityType: "work_item",
    companyId: args.companyId,
    record: completed,
    source: (args.item.source === "manual"
      ? "manual"
      : args.item.source === "schedule"
        ? "schedule"
        : "system") as AtomicEventSource,
    occurredAt: at,
    status: "verified",
  });
  const followUp: WorkItem | null = args.followUp
    ? {
        id: `${args.item.id}_followup_${at.slice(0, 10)}`,
        _key: `${args.item.id}_followup_${at.slice(0, 10)}`,
        title: args.followUp.title,
        dueDate: args.followUp.dueDate,
        assigneeId: args.followUp.assigneeId,
        status: "todo",
        source: "event",
        parentWorkId: args.item.id,
        createdAt: at,
      }
    : null;
  return { completed, event, followUp };
}
