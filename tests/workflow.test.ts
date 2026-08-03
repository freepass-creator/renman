import { describe, expect, it } from "vitest";
import { completeWork, transitionWork, type WorkItem } from "@/lib/workflow";

const item: WorkItem = {
  id: "w1",
  _key: "w1",
  title: "보험 갱신",
  status: "todo",
  source: "schedule",
};

describe("업무 수명주기", () => {
  it("완료 시 결과 사건과 선택적 후속업무를 함께 만든다", () => {
    const result = completeWork({
      item,
      companyId: "prime",
      result: { policyNo: "P-1" },
      followUp: { title: "증권 수령 확인", dueDate: "2026-07-30" },
      at: "2026-07-26T09:00:00+09:00",
    });
    expect(result.completed.status).toBe("completed");
    expect(result.event.eventType).toBe("work_item.recorded");
    expect(result.followUp?.parentWorkId).toBe("w1");
  });

  it("완료된 업무를 되돌리는 임의 전이를 막는다", () => {
    expect(() =>
      transitionWork({ ...item, status: "completed" }, "in_progress"),
    ).toThrow();
  });
});
