# PCDL Expiring Media Links

Date: 2026-05-13

## Purpose
Support temporary direct media URLs (CloudFront MP4/MP3) with stable PCDL source-link fallback.

## Item fields used
`daily_message_items`:
- `media_url`
- `source_page_url`
- `media_expires_at`
- `media_status`
- `source_type`
- `thumbnail_url`
- `admin_notes`

## Admin behavior
Per message item, admin can edit:
- title
- source type
- direct media URL
- PCDL source link
- expires at
- media status
- thumbnail
- notes
- required/active toggles

Warnings:
- expires within 24h: "Direct link expires soon. Consider refreshing it."
- already expired: "Direct link expired. Users will be sent to the PCDL source link."

## User Today behavior
- If direct media is playable (`active`, not expired, URL present):
  - show native HTML5 player and tracking.
- Else:
  - show unavailable/expired message
  - show `Open PCDL Link` (if source link exists)
  - if neither link exists, show "Media has not been added yet."

## Helper functions
In `app.js`:
- `isMediaExpired(item)`
- `canPlayDirectMedia(item)`
- `renderMediaFallback(item)`
- `trackSourcePageOpen(itemId)`

Source-open tracking:
- inserts into `message_watch_events` with:
  - `event_type = source_page_opened`
  - `watch_seconds = 0`
  - `watch_percent = 0`

## Regression checklist
1. Admin can save Direct Media URL.
2. Admin can save PCDL Source Link.
3. Admin can save Media Expires At.
4. Active unexpired MP4 plays in app.
5. Expired MP4 shows Open PCDL Link fallback.
6. Failed/blocked media load shows fallback.
7. Clicking Open PCDL Link records `source_page_opened`.
8. Manual complete works for fallback users.
9. Members cannot edit media fields.
10. Admin can update expired link and restore playback.
