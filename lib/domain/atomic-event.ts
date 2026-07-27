import type { EntityRecord } from "@/lib/intake/entities";

export type AtomicEventStatus =
  "recorded" | "verified" | "posted" | "corrected";
export type AtomicEventSource =
  "manual" | "upload" | "ocr" | "schedule" | "system" | "integration";

export type AtomicEventLink = {
  entityType: string;
  entityId: string;
  role:
    | "subject"
    | "asset"
    | "contract"
    | "money"
    | "work"
    | "document"
    | "related";
};

export type AtomicEvent = EntityRecord & {
  id: string;
  eventType: string;
  source: AtomicEventSource;
  status: AtomicEventStatus;
  occurredAt: string;
  recordedAt: string;
  effectiveDate: string;
  links: AtomicEventLink[];
  payload: EntityRecord;
  idempotencyKey: string;
  correctionOf?: string;
};

const LINK_FIELDS: Array<[string, AtomicEventLink["role"]]> = [
  ["plate", "asset"],
  ["vin", "asset"],
  ["contractNo", "contract"],
  ["matchedContractId", "contract"],
  ["workId", "work"],
  ["documentId", "document"],
  ["account", "money"],
  ["txKey", "money"],
];

function clean(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Runtime-independent deterministic hash; used only as an idempotency identifier. */
export function stableEventId(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `evt_${(hash >>> 0).toString(36)}`;
}

export function inferEventDate(
  record: EntityRecord,
  fallback = new Date().toISOString(),
): string {
  const value =
    record.occurredAt ||
    record.txDate ||
    record.work_date ||
    record.contractDate ||
    record.startDate ||
    record.issueDate ||
    record.date ||
    fallback;
  return clean(value).slice(0, 10);
}

export function buildAtomicEvent(args: {
  entityType: string;
  companyId: string;
  record: EntityRecord;
  source?: AtomicEventSource;
  occurredAt?: string;
  status?: AtomicEventStatus;
}): AtomicEvent {
  const { entityType, companyId, record } = args;
  const recordId = clean(
    record._key || record.id || record.contractNo || record.plate,
  );
  const occurredAt =
    args.occurredAt ||
    clean(record.occurredAt || record.createdAt) ||
    new Date().toISOString();
  const effectiveDate = inferEventDate(record, occurredAt);
  const idempotencyKey = [
    companyId,
    entityType,
    recordId || JSON.stringify(record),
    effectiveDate,
  ].join("|");
  const links: AtomicEventLink[] = recordId
    ? [{ entityType, entityId: recordId, role: "subject" }]
    : [];
  for (const [field, role] of LINK_FIELDS) {
    const entityId = clean(record[field]);
    if (
      entityId &&
      !links.some((l) => l.entityId === entityId && l.role === role)
    ) {
      links.push({ entityType: field, entityId, role });
    }
  }
  const id = stableEventId(idempotencyKey);
  return {
    id,
    _key: id,
    companyId,
    eventType: `${entityType}.recorded`,
    source: args.source || "system",
    status: args.status || "recorded",
    occurredAt,
    recordedAt: new Date().toISOString(),
    effectiveDate,
    links,
    payload: { ...record },
    idempotencyKey,
  };
}

export function correctAtomicEvent(
  original: AtomicEvent,
  patch: EntityRecord,
  reason: string,
): AtomicEvent {
  if (!reason.trim()) throw new Error("정정 사유가 필요합니다.");
  const recordedAt = new Date().toISOString();
  const id = stableEventId(`${original.id}|${recordedAt}|${reason.trim()}`);
  return {
    ...original,
    ...patch,
    id,
    _key: id,
    status: "corrected",
    recordedAt,
    correctionOf: original.id,
    payload: { ...original.payload, ...patch, correctionReason: reason.trim() },
    idempotencyKey: `${original.id}|correction|${id}`,
  };
}
