# PCDL Multi-Message Days

Date: 2026-05-13

## Scope
Frontend catch-up for backend model:
- `daily_message_days` (day-level)
- `daily_message_items` (one-to-many item-level)

Changes are additive and focused. Existing auth, roles, reflections, and oversight features remain.

## Implemented frontend data functions

In `auth.js`:
- `PCDL.loadMessageDayByNumber(dayNumber)`
- `PCDL.loadMessageDayByDate(date)`
- `PCDL.saveMessageDay(dayId, payload)`
- `PCDL.saveMessageItem(itemId, payload)`
- `PCDL.addMessageItem(dayId)`
- `PCDL.deleteOrDeactivateMessageItem(itemId)`

Compatibility retained:
- fallback read path still supports old `daily_messages` in Today page when no new day exists.

## Admin Media Manager behavior

Admin media tab now:
- selects by day number
- loads day-level fields:
  - `scheduled_date`
  - `day_label`
  - `other_label`
  - `is_active`
- lists all message items ordered by `item_order`
- supports per-item edit/save:
  - `title`
  - `source_type`
  - `media_url`
  - `thumbnail_url`
  - `admin_notes`
  - `is_required`
  - `is_active`
- supports:
  - `+ Add Message`
  - `Save Day`
  - `Deactivate Message`

## Today page behavior

Today page now:
- loads day by today date from `daily_message_days`
- renders active `daily_message_items` in `item_order`
- shows each item in its own card/player
- provides item-level completion button
- shows `other_label` as day-level badge/note (not forced into message 2)

Fallback:
- if no `daily_message_days` row exists for today, uses old `daily_messages` record when present.

## Progress and reflections compatibility

`message_progress` writes now include `message_item_id` and `watch_seconds` when available.

`reflections` writes can include:
- `day_id`
- `message_item_id`

Today reflection form supports:
- whole day reflection target
- specific message-item target

## RLS notes

Migration includes additive RLS baselines:
- authenticated users can read active day/item rows
- admin/group pastor can write schedule rows

Do not rely on frontend-only controls for schedule protection.

## Files touched

- `app.js`
- `auth.js`
- `app/schema-validator.js`
- `sql/20260513_multi_message_days_frontend_alignment.sql`
