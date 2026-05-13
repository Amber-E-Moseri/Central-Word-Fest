# RAF Multi-Income Debt Spec

## Scope
This specification defines deterministic financial behavior for RAF income allocation, surplus splitting, and debt balance derivation.

## Canonical Data Rules
1. Money is represented as `Decimal(12,2)` and returned by APIs as string decimals (`"1250.00"`).
2. `allocation_percent` is stored as a fraction (`0.1000 = 10%`).
3. Active allocation percents must sum to `1.0000 ± 0.0001`.
4. Surplus split percents must sum to `1.0000 ± 0.0001`.
5. Allocation rounding remainder is routed to the `buffer` slug.
6. Surplus split rounding remainder is routed to the `emergency_fund` slug.
7. Debt balances are derived from payment history and are never directly edited.
8. `income_allocations` are immutable. Editing an income entry deletes and recreates allocation rows in a single DB transaction.

## Write Pipeline Contract
`Client -> Zod Validation -> RLS Authorization -> DB Transaction -> RAF Engine -> Write -> Response`

All financial mutations must happen inside a DB transaction.

## Deterministic Engine Contract
All deterministic money math must live in `lib/raf/*`.
Route handlers and React components may validate and orchestrate only; they must not perform financial calculations.

## Income Allocation Algorithm
Inputs:
1. Income amount as money string.
2. Active allocation lines (`slug`, `allocationPercent` fraction).

Algorithm:
1. Validate money format and non-negative amount.
2. Validate sum of active `allocationPercent` values equals `1.0000 ± 0.0001`.
3. Convert income amount to integer cents.
4. For each line, allocate `floor(totalCents * percent)`.
5. Compute remainder cents.
6. Add remainder to line with slug `buffer`.
7. Return line amounts as 2-decimal strings.

## Surplus Split Algorithm
Inputs:
1. Surplus amount as money string.
2. Split lines (`slug`, `percent` fraction).

Algorithm:
1. Validate money format and non-negative amount.
2. Validate split sum equals `1.0000 ± 0.0001`.
3. Allocate by integer-cent floor.
4. Route remainder to `emergency_fund`.

## Debt Balance Derivation
For each debt:
1. Start at principal.
2. Apply each payment chronologically.
3. `debit` increases balance, `credit` decreases balance.
4. Balance may not be manually overridden.

## Error Conditions
1. Invalid money format.
2. Negative amount where not allowed.
3. Percent sum invariant violation.
4. Missing required remainder sink slug (`buffer` or `emergency_fund`).
5. Invalid debt payment direction.
