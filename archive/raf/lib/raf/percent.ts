import { RAF_PERCENT_TOLERANCE } from "./constants";

export function validatePercentSumToOne(values: number[], label: string): void {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (Math.abs(total - 1) > RAF_PERCENT_TOLERANCE) {
    throw new Error(`${label} must sum to 1.0000 ± 0.0001`);
  }
}

export function assertPercentInRange(value: number, label: string): void {
  if (value < 0 || value > 1) {
    throw new Error(`${label} must be between 0 and 1.`);
  }
}
