import { describe, expect, it } from "vitest";
import {
  matchDocumentBatch,
  matchDocumentToVehicle,
} from "@/lib/document-consistency";

const vehicles = [
  {
    _key: "v1",
    plate: "12가3456",
    vin: "KMHXX00XXXX000001",
    ownerName: "렌만 주식회사",
  },
  {
    _key: "v2",
    plate: "34나5678",
    vin: "KMHXX00XXXX000002",
    ownerName: "렌만 주식회사",
  },
];

describe("문서-원장 정합성", () => {
  it("차대번호가 일치하면 번호판 OCR 표기차가 있어도 자동 배치한다", () => {
    const result = matchDocumentToVehicle(
      { car_number: "12가 3456", vin: "KMHXX00XXXX000001" },
      vehicles,
    );
    expect(result.target?._key).toBe("v1");
    expect(result.decision).toBe("auto");
  });

  it("차대번호 충돌은 동일 번호판이어도 자동 배치를 막는다", () => {
    const result = matchDocumentToVehicle(
      { car_number: "12가3456", vin: "KMHXX00XXXX999999" },
      vehicles,
    );
    expect(result.decision).toBe("unmatched");
  });

  it("대량 문서도 문서별 독립 판정한다", () => {
    const result = matchDocumentBatch(
      [{ plate: "34나5678" }, { plate: "없는차량" }],
      vehicles,
    );
    expect(result.map((x) => x.match.decision)).toEqual([
      "review",
      "unmatched",
    ]);
  });
});
