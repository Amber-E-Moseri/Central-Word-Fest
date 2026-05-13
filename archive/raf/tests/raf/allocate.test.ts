import { describe, expect, it } from "vitest";
import { computeIncomeAllocations } from "../../lib/raf/allocate";

describe("computeIncomeAllocations", () => {
  it("routes rounding remainder to buffer", () => {
    const result = computeIncomeAllocations("10.00", [
      { slug: "needs", allocationPercent: 0.3333 },
      { slug: "wants", allocationPercent: 0.3333 },
      { slug: "buffer", allocationPercent: 0.3334 }
    ]);

    expect(result.remainderRoutedToBuffer).toBe("0.01");
    const buffer = result.lines.find((line) => line.slug === "buffer");
    expect(buffer?.amount).toBe("3.34");
  });

  it("throws if active percents do not sum to one", () => {
    expect(() =>
      computeIncomeAllocations("100.00", [
        { slug: "needs", allocationPercent: 0.5 },
        { slug: "buffer", allocationPercent: 0.4 }
      ])
    ).toThrow("Active allocation percents");
  });
});
