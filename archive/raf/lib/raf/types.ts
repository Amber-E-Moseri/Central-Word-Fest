export type MoneyString = `${number}.${number}${number}`;

export interface AllocationLine {
  slug: string;
  allocationPercent: number;
  isActive?: boolean;
}

export interface SurplusSplitLine {
  slug: string;
  percent: number;
  isActive?: boolean;
}

export interface MoneyAllocation {
  slug: string;
  amount: string;
}

export interface AllocationComputationResult {
  lines: MoneyAllocation[];
  remainderRoutedToBuffer: string;
}

export interface SurplusSplitResult {
  lines: MoneyAllocation[];
  remainderRoutedToEmergencyFund: string;
}

export type DebtPaymentDirection = "debit" | "credit";

export interface DebtPayment {
  amount: string;
  direction: DebtPaymentDirection;
  occurredAt: string;
}

export interface DebtBalanceInput {
  principal: string;
  payments: DebtPayment[];
}
