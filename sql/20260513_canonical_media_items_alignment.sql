-- Canonical media alignment: daily_message_items is the source of truth for media links.
-- Additive-only migration. No drops/renames.

alter table public.daily_message_items
add column if not exists temporary_media_url text,
add column if not exists pcdl_url text,
add column if not exists media_url_expires_at timestamptz,
add column if not exists media_collected_at timestamptz,
add column if not exists media_status text default 'unknown',
add column if not exists media_error text,
add column if not exists fallback_status text default 'unknown',
add column if not exists fallback_url_verified_at timestamptz;

create index if not exists idx_daily_message_items_media_status
on public.daily_message_items(media_status);

create index if not exists idx_daily_message_items_media_expiry
on public.daily_message_items(media_url_expires_at);
