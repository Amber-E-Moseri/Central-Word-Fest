import { describe, expect, it } from "vitest";
import { centsToMoney, parseMoneyToCents } from "../../lib/raf/money";

describe("money", () => {
  it("parses Decimal(12,2) money strings", () => {
    expect(parseMoneyToCents("1250.00")).toBe(125000);
  });

  it("rejects invalid money formats", () => {
    expect(() => parseMoneyToCents("12.3")).toThrow();
    expect(() => parseMoneyToCents("-10.00")).toThrow();
  });

  it("formats cents as two-decimal strings", () => {
    expect(centsToMoney(99)).toBe("0.99");
    expect(centsToMoney(5000)).toBe("50.00");
  });
});
