# PCDL Schema (Canonical)

Last updated: 2026-05-13

This document describes the schema contract the current frontend expects.

## Core tables

### `public.profiles`
- `id` uuid PK (matches `auth.users.id`)
- `email` text
- `full_name` text
- `role` (`user_role` enum or text role label)
- `fellowship_id` uuid FK -> `public.fellowships.id`
- `is_active` boolean
- Optional moderation fields:
  - `disabled_reason` text
  - `disabled_at` timestamptz
  - `disabled_by` uuid FK -> `public.profiles.id`

Frontend writes:
- Signup update: `role`, `full_name`, `fellowship_id`, `is_active`

### `public.fellowships`
- `id` uuid PK
- `name` text unique
- `code` text

### `public.daily_messages`
- `id` uuid PK
- `day_number` integer
- `scheduled_date` date
- `title` text
- `other_label` text
- `media_url` text
- `thumbnail_url` text
- `source_type` text (`Direct MP4|Direct MP3|Google Drive|Web link`)
- `admin_notes` text
- `is_active` boolean (used by reporting/RPC logic)

Frontend reads/writes:
- Read today message by `scheduled_date`
- Admin media save updates today row fields listed above

### `public.message_progress`
- `user_id` uuid FK -> `profiles.id`
- `message_id` uuid FK -> `daily_messages.id`
- `completed` boolean
- `completed_at` timestamptz
- `completion_percent` integer
- `points_earned` integer

Frontend writes:
- Upsert completion row keyed by `(user_id, message_id)`

### `public.reflections`
- `id` uuid PK
- `user_id` uuid FK -> `profiles.id`
- `message_id` uuid FK -> `daily_messages.id` nullable
- `reflection_text` text
- `visibility` text (`private|circle|fellowship|everyone`)
- `created_at` timestamptz

Frontend writes:
- Insert reflection with `visibility`

### `public.activity_log`
- `id` uuid PK
- `user_id` uuid FK -> `profiles.id`
- `activity_type` text
- `metadata` jsonb
- `created_at` timestamptz

Frontend writes:
- Log `message_completed`
- Log `reflection_posted` with `metadata.visibility`

### `public.pastor_fellowship_assignments`
- `id` uuid PK
- `pastor_id` uuid FK -> `profiles.id`
- `fellowship_id` uuid FK -> `fellowships.id`
- `created_at` timestamptz
- Unique `(pastor_id, fellowship_id)`

## RPCs

### `public.get_person_oversight_detail(p_person_id uuid)`
Returns JSON containing:
- `profile`
- `stats`
- `progress`
- `shared_reflections`

Used by person detail view. Scope is enforced server-side via `can_view_fellowship(...)` and role helpers.

## RLS assumptions

- All user-scoped reads/writes rely on Supabase Auth identity (`auth.uid()`).
- `profiles_update_self` allows self update for signup-safe fields.
- Read policies for `profiles`, `message_progress`, and `activity_log` include:
  - self access
  - admin/group pastor
  - permitted fellowship scope
  - accountability partner logic (where defined)
- Admin-only actions are exposed via definer function(s) such as `admin_set_user_active`.

## Role dependencies (frontend + DB)

- `Member`, `Bible Study Class Teacher`, `Cell Leader`:
  - content access, completion, reflections, community, partners
  - no stats dashboard
- `Coordinator`:
  - member capabilities + fellowship stats + scoped person detail
- `Pastor`:
  - coordinator-like, assigned fellowship scope
- `Subgroup Pastor`:
  - assigned subgroup fellowships only
- `Group Pastor`:
  - all fellowships (assigned by admin)
- `Admin`:
  - full system access (assigned by admin)

## Compatibility layer

The frontend now uses schema-aware write guards in `auth.js`:
- `PCDL.saveTodayMediaConfig`
- `PCDL.saveReflection`
- `PCDL.markComplete`
- `PCDL.updateMyProfileForSignup`

Behavior:
- Required missing columns -> explicit errors (no silent loss)
- Optional missing columns -> warnings where safe (example: activity metadata)
- Startup validator logs actionable warnings for drift.
