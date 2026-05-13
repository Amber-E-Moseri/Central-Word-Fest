import { describe, expect, it } from "vitest";
import { splitSurplus } from "../../lib/raf/surplus";

describe("splitSurplus", () => {
  it("routes rounding remainder to emergency_fund", () => {
    const result = splitSurplus("10.00", [
      { slug: "invest", percent: 0.3333 },
      { slug: "save", percent: 0.3333 },
      { slug: "emergency_fund", percent: 0.3334 }
    ]);

    expect(result.remainderRoutedToEmergencyFund).toBe("0.01");
    const emergency = result.lines.find((line) => line.slug === "emergency_fund");
    expect(emergency?.amount).toBe("3.34");
  });

  it("throws when emergency_fund is missing and remainder exists", () => {
    expect(() =>
      splitSurplus("10.00", [
        { slug: "invest", percent: 0.5 },
        { slug: "save", percent: 0.5 }
      ])
    ).toThrow("emergency_fund");
  });
});
