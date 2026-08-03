import { describe, expect, it } from "vitest";
import {
  buildAtomicEvent,
  correctAtomicEvent,
} from "@/lib/domain/atomic-event";

describe("원자 사건", () => {
  it("같은 원천 레코드는 같은 멱등 ID와 연결키를 만든다", () => {
    const record = {
      _key: "TX-1",
      txDate: "2026-07-26",
      account: "123-456",
      matchedContractId: "CTR-1",
      amount: 10_000,
    };
    const a = buildAtomicEvent({
      entityType: "bank_tx",
      companyId: "prime",
      record,
      source: "upload",
      occurredAt: "2026-07-26T01:00:00Z",
    });
    const b = buildAtomicEvent({
      entityType: "bank_tx",
      companyId: "prime",
      record,
      source: "upload",
      occurredAt: "2026-07-26T01:00:00Z",
    });
    expect(a.id).toBe(b.id);
    expect(a.effectiveDate).toBe("2026-07-26");
    expect(
      a.links.some((l) => l.role === "contract" && l.entityId === "CTR-1"),
    ).toBe(true);
    expect(
      a.links.some((l) => l.role === "money" && l.entityId === "123-456"),
    ).toBe(true);
  });

  it("원본을 덮어쓰지 않고 정정 사건을 연결한다", () => {
    const original = buildAtomicEvent({
      entityType: "vehicle",
      companyId: "prime",
      record: { _key: "12가3456", plate: "12가3456" },
    });
    const corrected = correctAtomicEvent(
      original,
      { plate: "34나5678" },
      "번호판 변경",
    );
    expect(corrected.id).not.toBe(original.id);
    expect(corrected.correctionOf).toBe(original.id);
    expect(corrected.status).toBe("corrected");
    expect(original.payload.plate).toBe("12가3456");
  });
});
