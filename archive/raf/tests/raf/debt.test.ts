import { describe, expect, it } from "vitest";
import { deriveDebtBalance } from "../../lib/raf/debt";

describe("deriveDebtBalance", () => {
  it("derives debt balance from payment history", () => {
    const result = deriveDebtBalance({
      principal: "1000.00",
      payments: [
        { amount: "100.00", direction: "credit", occurredAt: "2026-01-10T00:00:00Z" },
        { amount: "25.00", direction: "debit", occurredAt: "2026-01-15T00:00:00Z" },
        { amount: "50.00", direction: "credit", occurredAt: "2026-01-20T00:00:00Z" }
      ]
    });

    expect(result).toBe("875.00");
  });

  it("never returns negative balances", () => {
    const result = deriveDebtBalance({
      principal: "10.00",
      payments: [{ amount: "15.00", direction: "credit", occurredAt: "2026-02-01T00:00:00Z" }]
    });

    expect(result).toBe("0.00");
  });
});
