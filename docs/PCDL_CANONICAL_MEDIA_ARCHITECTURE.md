# PCDL Canonical Media Architecture

## Canonical Tables

- `daily_message_days`: one row per scheduled day; owns schedule and day-level labels.
- `daily_message_items`: one or more media items per day; owns all media URLs, expiry, status, and admin media metadata.
- `message_progress`: per-user progress per `message_item_id`.
- `message_watch_events`: granular playback and fallback click events per `message_item_id`.

## Responsibilities

- Day-level fields stay in `daily_message_days` (`scheduled_date`, `day_label`, `other_label`, `is_active`).
- Item-level media fields stay in `daily_message_items`:
  - `title`, `item_order`, `source_type`
  - `media_url`, `temporary_media_url`
  - `pcdl_url`, `source_page_url`
  - `media_url_expires_at`, `media_collected_at`
  - `media_status`, `media_error`
  - `fallback_status`, `fallback_url_verified_at`
  - `thumbnail_url`, `admin_notes`, `is_required`, `is_active`

## Media Lifecycle

1. Admin creates/edits item in Admin Media Manager.
2. Admin sets stable fallback (`pcdl_url` and/or `source_page_url`).
3. Refresh job resolves fresh signed media URL into `temporary_media_url`.
4. Today page prefers `temporary_media_url`; falls back to `media_url`.
5. If expired/unavailable, Today page renders fallback button to PCDL link.

## Expiring URL Strategy

- Signed direct links are temporary and expected to expire.
- Refresh process updates:
  - `temporary_media_url`
  - `media_url_expires_at`
  - `media_collected_at`
  - `media_status`
  - `media_error` (on failures)
- Fallback URLs are never removed during refresh failures.

## Fallback Strategy

- Fallback resolution order:
  1. `pcdl_url`
  2. `source_page_url`
- If both missing, show `Media unavailable`.
- Fallback open is tracked as `source_page_opened` in `message_watch_events`.

## Refresh Workflow

- Script: `scripts/refresh-pcdl-media-links.mjs`
- Fetches active `daily_message_items` with `pcdl_url` in date scope.
- Extracts media URL from DOM/network in authenticated Playwright session.
- Sends updates through Edge Function `update-message-media-link`.

## Tracking Flow

- Direct HTML5 playback sync uses `message_item_id`.
- Completion and progress records write to `message_progress.message_item_id`.
- Watch events write to `message_watch_events.message_item_id`.

## Admin Workflow

1. Select day.
2. Load `daily_message_days` + ordered `daily_message_items`.
3. Edit per-item media fields.
4. Save per item by `daily_message_items.id`.
5. Add Message inserts with next `item_order`.

## Backward Compatibility

- Legacy `daily_messages` is read-only fallback only when no day/item rows exist.
- New writes must target `daily_message_items` / `daily_message_days`.
- Legacy fallback path logs a warning in frontend console.

## Regression Checklist

1. Day loads correctly.
2. Multiple message items render in order.
3. Each item tracks independently by `message_item_id`.
4. Refresh script updates item URLs/expiry/status.
5. Expired media shows PCDL fallback.
6. PCDL links persist when extraction fails.
7. Watch tracking persists after refresh.
8. Admin item edits save correctly.
9. Member cannot edit schedule/media.
10. Oversight pages still load item-based progress.
11. No new media writes go to `daily_messages`.
