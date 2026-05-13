import { NextResponse } from "next/server";
import { computeIncomeAllocations } from "@/lib/raf/allocate";
import { allocationInputSchema } from "@/lib/validation/allocations";

export async function POST(request: Request) {
  const json = await request.json();
  const parsed = allocationInputSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = computeIncomeAllocations(parsed.data.amount, parsed.data.allocations);

    // DB transaction + immutable income_allocations writes belong here.
    // Keep deterministic logic in lib/raf, never in route handlers/components.
    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown allocation error";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}