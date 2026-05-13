# PCDL Schema Regression Checklist

Date: 2026-05-13

## Pre-check
1. Apply migrations in order, including:
   - `sql/20260513_schema_alignment_additive.sql`
2. Open browser console and confirm schema validator output:
   - no critical missing columns for core writes

## Auth + fellowship assignment
1. Create account with fellowship selected.
2. Verify profile row updated with:
   - `full_name`
   - `role = Member`
   - `fellowship_id`
   - `is_active = true`
3. Sign in and verify profile hydration succeeds.

## Media flow (admin)
1. Open Admin -> Media Manager.
2. Enter title + media URL + optional thumbnail/notes.
3. Click `Preview on Today page`:
   - preview iframe updates in admin panel.
4. Click `Save media`:
   - expect `Saved to Supabase.` or explicit local-only fallback warning.
5. Refresh and verify media reloads (DB first, local fallback second).
6. Open Today page and confirm saved preview renders.

## Reflection posting
1. Post reflection with each visibility option.
2. Confirm insert succeeds.
3. Confirm activity log row for `reflection_posted`.

## Message completion
1. Mark a message complete.
2. Confirm `message_progress` upsert succeeds.
3. Confirm `activity_log` row for `message_completed`.

## Person oversight RPC
1. As Coordinator/Pastor/Subgroup Pastor/Group Pastor/Admin, open person detail.
2. Confirm RPC returns data and UI renders.
3. As Member, verify access denied.

## Drift handling
1. Temporarily remove one non-critical column in a staging copy (or simulate).
2. Confirm:
   - startup validator logs warning
   - save path surfaces actionable error message
   - no silent data loss
