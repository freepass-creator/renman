/**
 * Rental Manager vNext data kernel.
 *
 * One uploaded source can produce many atoms. Atoms are append-only facts with
 * evidence. A correction never mutates the original atom; it supersedes it.
 * Screens are projections of these atoms, not independent ledgers.
 */

export type RentalSubjectType =
  | 'vehicle'
  | 'contract'
  | 'customer'
  | 'insurance_policy'
  | 'cash_transaction'
  | 'receivable'
  | 'work_item'
  | 'communication'
  | 'source_document';

export type RentalAtomKind =
  | 'vehicle.identity'
  | 'vehicle.ownership'
  | 'vehicle.status'
  | 'contract.terms'
  | 'contract.lifecycle'
  | 'insurance.coverage'
  | 'cash.transaction'
  | 'collection.applied'
  | 'receivable.assessed'
  | 'maintenance.performed'
  | 'communication.recorded'
  | 'document.received'
  | 'work.requested'
  | 'work.completed';

export type RentalAtomSource =
  | 'document'
  | 'spreadsheet'
  | 'bank_file'
  | 'call_recording'
  | 'integration'
  | 'human_confirmation'
  | 'system';

export type RentalSubject = {
  /** Immutable internal ID. A plate number is an attribute, never the ID. */
  id: string;
  type: RentalSubjectType;
};

export type RentalEvidence = {
  sourceId: string;
  sourceType: RentalAtomSource;
  /** Page, cell/range, transaction row, or recording timestamp. */
  locator?: string;
  checksum?: string;
};

export type RentalAtom<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  atomId: string;
  tenantId: string;
  companyId: string;
  kind: RentalAtomKind;
  subject: RentalSubject;
  /** Same business fact across revisions, e.g. contract:123:monthlyRent. */
  logicalKey: string;
  occurredAt: string;
  recordedAt: string;
  source: RentalAtomSource;
  confidence: number;
  evidence: RentalEvidence[];
  payload: Readonly<TPayload>;
  supersedes?: string;
  correctionReason?: string;
};

export type RentalAtomInput<TPayload extends Record<string, unknown>> = Omit<
  RentalAtom<TPayload>,
  'atomId' | 'recordedAt' | 'payload'
> & {
  recordedAt?: string;
  payload: TPayload;
};

function clean(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function stableId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `atom_${(hash >>> 0).toString(36)}`;
}

function assertIsoDate(value: string, field: string): void {
  if (Number.isNaN(Date.parse(value))) throw new Error(`${field} must be an ISO date.`);
}

export function createRentalAtom<TPayload extends Record<string, unknown>>(
  input: RentalAtomInput<TPayload>,
): RentalAtom<TPayload> {
  const tenantId = clean(input.tenantId);
  const companyId = clean(input.companyId);
  const subjectId = clean(input.subject.id);
  const logicalKey = clean(input.logicalKey);
  if (!tenantId || !companyId || !subjectId || !logicalKey) {
    throw new Error('tenantId, companyId, subject.id and logicalKey are required.');
  }
  if (!input.evidence.length && input.source !== 'system') {
    throw new Error('A non-system atom requires evidence.');
  }
  if (input.confidence < 0 || input.confidence > 1) {
    throw new Error('confidence must be between 0 and 1.');
  }

  const recordedAt = input.recordedAt ?? new Date().toISOString();
  assertIsoDate(input.occurredAt, 'occurredAt');
  assertIsoDate(recordedAt, 'recordedAt');

  const evidenceKey = input.evidence
    .map((item) => `${item.sourceId}:${item.locator ?? ''}:${item.checksum ?? ''}`)
    .sort()
    .join('|');
  const atomId = stableId([
    tenantId,
    companyId,
    input.kind,
    input.subject.type,
    subjectId,
    logicalKey,
    input.occurredAt,
    evidenceKey,
    input.supersedes ?? '',
  ].join('::'));

  return {
    ...input,
    atomId,
    tenantId,
    companyId,
    subject: { ...input.subject, id: subjectId },
    logicalKey,
    recordedAt,
    evidence: input.evidence.map((item) => ({ ...item })),
    payload: Object.freeze({ ...input.payload }),
  };
}

export function correctRentalAtom<TPayload extends Record<string, unknown>>(
  original: RentalAtom<TPayload>,
  patch: Partial<TPayload>,
  options: {
    reason: string;
    evidence: RentalEvidence[];
    recordedAt?: string;
    source?: RentalAtomSource;
  },
): RentalAtom<TPayload> {
  const reason = clean(options.reason);
  if (!reason) throw new Error('A correction reason is required.');
  return createRentalAtom({
    tenantId: original.tenantId,
    companyId: original.companyId,
    kind: original.kind,
    subject: original.subject,
    logicalKey: original.logicalKey,
    occurredAt: original.occurredAt,
    recordedAt: options.recordedAt,
    source: options.source ?? 'human_confirmation',
    confidence: 1,
    evidence: options.evidence,
    payload: { ...original.payload, ...patch },
    supersedes: original.atomId,
    correctionReason: reason,
  });
}

/** Returns one current fact per logical key while preserving every source atom. */
export function projectLatestFacts(atoms: readonly RentalAtom[]): Map<string, RentalAtom> {
  const superseded = new Set(atoms.map((atom) => atom.supersedes).filter((id): id is string => Boolean(id)));
  const current = new Map<string, RentalAtom>();
  for (const atom of atoms) {
    if (superseded.has(atom.atomId)) continue;
    const key = `${atom.companyId}:${atom.subject.type}:${atom.subject.id}:${atom.logicalKey}`;
    const previous = current.get(key);
    if (!previous || previous.recordedAt <= atom.recordedAt) current.set(key, atom);
  }
  return current;
}

export function subjectTimeline(
  atoms: readonly RentalAtom[],
  subject: RentalSubject,
): RentalAtom[] {
  return atoms
    .filter((atom) => atom.subject.type === subject.type && atom.subject.id === subject.id)
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.recordedAt.localeCompare(right.recordedAt));
}

