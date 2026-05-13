const MONEY_REGEX = /^(0|[1-9]\d*)\.\d{2}$/;

export function parseMoneyToCents(value: string): number {
  if (!MONEY_REGEX.test(value)) {
    throw new Error("Invalid money format. Expected Decimal(12,2) string.");
  }
  const [whole, fractional] = value.split(".");
  return Number(whole) * 100 + Number(fractional);
}

export function centsToMoney(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error("Cents must be an integer.");
  }
  if (cents < 0) {
    throw new Error("Negative money value is not allowed.");
  }
  const whole = Math.floor(cents / 100);
  const fractional = String(cents % 100).padStart(2, "0");
  return `${whole}.${fractional}`;
}
