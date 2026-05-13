import { centsToMoney, parseMoneyToCents } from "./money";
import type { DebtBalanceInput } from "./types";

export function deriveDebtBalance(input: DebtBalanceInput): string {
  const principalCents = parseMoneyToCents(input.principal);
  let balanceCents = principalCents;

  const sortedPayments = [...input.payments].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  for (const payment of sortedPayments) {
    const cents = parseMoneyToCents(payment.amount);

    if (payment.direction === "credit") {
      balanceCents -= cents;
    } else if (payment.direction === "debit") {
      balanceCents += cents;
    } else {
      throw new Error("Invalid payment direction.");
    }
  }

  if (balanceCents < 0) {
    balanceCents = 0;
  }

  return centsToMoney(balanceCents);
}
