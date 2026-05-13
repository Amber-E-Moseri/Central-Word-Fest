-- =====================================================
-- PCDL expiring direct media + source link support
-- =====================================================

alter table public.daily_message_items
  add column if not exists source_page_url text default '',
  add column if not exists media_expires_at timestamptz,
  add column if not exists media_status text default 'active';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'daily_message_items_media_status_check'
  ) then
    alter table public.daily_message_items
      add constraint daily_message_items_media_status_check
      check (media_status in ('active','expired','needs_refresh','unavailable'));
  end if;
end $$;
