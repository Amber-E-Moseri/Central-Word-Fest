import { BUFFER_SLUG } from "./constants";
import { centsToMoney, parseMoneyToCents } from "./money";
import { assertPercentInRange, validatePercentSumToOne } from "./percent";
import type { AllocationComputationResult, AllocationLine } from "./types";

export function computeIncomeAllocations(amount: string, lines: AllocationLine[]): AllocationComputationResult {
  const activeLines = lines.filter((line) => line.isActive !== false);
  if (activeLines.length === 0) {
    throw new Error("At least one active allocation line is required.");
  }

  for (const line of activeLines) {
    assertPercentInRange(line.allocationPercent, `Allocation percent for ${line.slug}`);
  }

  validatePercentSumToOne(
    activeLines.map((line) => line.allocationPercent),
    "Active allocation percents"
  );

  const totalCents = parseMoneyToCents(amount);
  let distributedCents = 0;

  const out = activeLines.map((line) => {
    const lineCents = Math.floor(totalCents * line.allocationPercent);
    distributedCents += lineCents;
    return { slug: line.slug, amount: centsToMoney(lineCents) };
  });

  const remainderCents = totalCents - distributedCents;
  if (remainderCents > 0) {
    const bufferIndex = out.findIndex((line) => line.slug === BUFFER_SLUG);
    if (bufferIndex < 0) {
      throw new Error("Rounding remainder requires a buffer allocation slug");
    }
    const bufferCents = parseMoneyToCents(out[bufferIndex].amount);
    out[bufferIndex].amount = centsToMoney(bufferCents + remainderCents);
  }

  return {
    lines: out,
    remainderRoutedToBuffer: centsToMoney(remainderCents)
  };
}
