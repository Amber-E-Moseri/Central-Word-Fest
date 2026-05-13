# PCDL Media Tracking

Date: 2026-05-13

## Overview
Additive watch analytics for direct media URLs (MP4/MP3/M4A) using native HTML5 media events.

## What is tracked
- watch time (`watch_seconds`)
- watch percent (`watch_percent`)
- play count (`play_count`)
- completion state (`completed`, `completed_at`)
- replay usage (play count after completion)
- partial engagement and abandonment

Tracked per:
- `user_id`
- `message_item_id`

## Database additions

Migration:
- `sql/20260513_media_watch_tracking.sql`

Adds:
- `public.message_watch_events`
- watch analytics columns to `public.message_progress`
- optional reflection linkage columns:
  - `reflections.day_id`
  - `reflections.message_item_id`

RLS:
- users insert their own watch events
- users upsert their own progress
- oversight/admin read scoped analytics

## Frontend implementation

Module:
- `app/media-tracking.js`

Behavior:
- binds to native `<video>` / `<audio>` elements
- listens to `play`, `pause`, `timeupdate`, `seeking`, `ended`
- debounced/batched sync every 20s
- immediate sync on pause/ended
- best-effort flush on unload

Completion rule:
- auto-complete at `watch_percent >= 90` OR `ended`
- points:
  - scheduled day completion: 5
  - backdated completion: 4 (hook available in tracker)

## Today page

Updated in `app.js`:
- each message item renders its own native player card
- stacked cards for multi-message days
- per-item progress text + completion badge
- replay button shown after completion
- per-item completion actions

Fallback:
- if no `daily_message_days` row exists for today, old `daily_messages` read path is used.

## Analytics primitives

Added in SQL:
- `public.v_message_item_engagement` view
- `public.get_scoped_media_analytics()` RPC

Provides:
- total completions
- average watch %
- total watch seconds
- most replayed items
- abandoned-before-50 count

## Person oversight

Migration:
- `sql/20260513_person_detail_watch_metrics.sql`

Updates `get_person_oversight_detail` to include:
- watch %, watch seconds, play count, points by message item
- aggregated watch metrics in stats
- reflections with optional day/item linkage

## Regression checklist

1. play increments once per new play session
2. pause flushes progress
3. refresh retains watch %
4. completion auto-triggers at >=90% or ended
5. replay works after completion
6. multiple message items track separately
7. pastors/coordinators see scoped analytics
8. members cannot read others’ watch analytics
9. mobile playback works on iPhone/Android/iPad
