import { computeIncomeAllocations } from "./allocate";
import { deriveDebtBalance } from "./debt";
import { splitSurplus } from "./surplus";

export const rafEngine = {
  computeIncomeAllocations,
  splitSurplus,
  deriveDebtBalance
};
