# Migration Notes

## What was done
- Added Next.js 14 + strict TypeScript scaffold.
- Added initial `lib/raf` deterministic allocation boundary.
- Added `app/api/allocations` route with Zod validation.
- Added Supabase Edge Function scaffold.
- Preserved legacy static prototype files at repo root.

## Next required implementation
- Replace placeholder spec with canonical content.
- Move live write mutations into transaction-safe server/edge paths.
- Implement immutable `income_allocations` recreation semantics.
- Add tests for percent sum invariants and rounding behavior.