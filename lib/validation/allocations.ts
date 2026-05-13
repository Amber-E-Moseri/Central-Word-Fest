import { z } from "zod";

export const moneyStringSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)\.\d{2}$/, "Money must be decimal string with 2 places, e.g. 1250.00");

export const allocationLineSchema = z.object({
  slug: z.string().min(1),
  allocationPercent: z.number().min(0).max(1),
  isActive: z.boolean().optional()
});

export const allocationInputSchema = z.object({
  householdId: z.string().uuid(),
  incomeId: z.string().uuid(),
  amount: moneyStringSchema,
  allocations: z.array(allocationLineSchema).min(1)
});

export type AllocationInput = z.infer<typeof allocationInputSchema>;
