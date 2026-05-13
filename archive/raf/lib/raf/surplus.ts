import { EMERGENCY_FUND_SLUG } from "./constants";
import { centsToMoney, parseMoneyToCents } from "./money";
import { assertPercentInRange, validatePercentSumToOne } from "./percent";
import type { SurplusSplitLine, SurplusSplitResult } from "./types";

export function splitSurplus(amount: string, lines: SurplusSplitLine[]): SurplusSplitResult {
  const activeLines = lines.filter((line) => line.isActive !== false);
  if (activeLines.length === 0) {
    throw new Error("At least one active surplus split line is required.");
  }

  for (const line of activeLines) {
    assertPercentInRange(line.percent, `Surplus split percent for ${line.slug}`);
  }

  validatePercentSumToOne(
    activeLines.map((line) => line.percent),
    "Surplus split percents"
  );

  const totalCents = parseMoneyToCents(amount);
  let distributedCents = 0;

  const out = activeLines.map((line) => {
    const lineCents = Math.floor(totalCents * line.percent);
    distributedCents += lineCents;
    return { slug: line.slug, amount: centsToMoney(lineCents) };
  });

  const remainderCents = totalCents - distributedCents;
  if (remainderCents > 0) {
    const emergencyFundIndex = out.findIndex((line) => line.slug === EMERGENCY_FUND_SLUG);
    if (emergencyFundIndex < 0) {
      throw new Error("Rounding remainder requires an emergency_fund surplus slug");
    }
    const emergencyFundCents = parseMoneyToCents(out[emergencyFundIndex].amount);
    out[emergencyFundIndex].amount = centsToMoney(emergencyFundCents + remainderCents);
  }

  return {
    lines: out,
    remainderRoutedToEmergencyFund: centsToMoney(remainderCents)
  };
}
