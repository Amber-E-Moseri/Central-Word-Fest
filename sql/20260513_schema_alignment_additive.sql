-- =====================================================
-- PCDL schema alignment (additive only)
-- Purpose: align frontend write payloads with DB schema
-- Safety: no drops, no destructive renames
-- =====================================================

-- ----------------------------
-- daily_messages
-- ----------------------------
alter table public.daily_messages
  add column if not exists media_url text,
  add column if not exists other_label text default '',
  add column if not exists thumbnail_url text,
  add column if not exists source_type text default 'Web link',
  add column if not exists admin_notes text default '';

-- Optional quality constraint; only applies to new/updated rows.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'daily_messages_source_type_check'
  ) then
    alter table public.daily_messages
      add constraint daily_messages_source_type_check
      check (source_type in ('Direct MP4', 'Direct MP3', 'Google Drive', 'Web link'));
  end if;
end $$;

-- ----------------------------
-- reflections
-- ----------------------------
alter table public.reflections
  add column if not exists visibility text default 'private';

-- ----------------------------
-- message_progress
-- ----------------------------
alter table public.message_progress
  add column if not exists completion_percent integer default 0,
  add column if not exists points_earned integer default 0;

-- ----------------------------
-- activity_log
-- ----------------------------
alter table public.activity_log
  add column if not exists metadata jsonb default '{}'::jsonb;

-- ----------------------------
-- profiles
-- ----------------------------
-- Note: role/fellowship/is_active/full_name are expected by current frontend.
-- Most environments should already have these; these are additive guards.
alter table public.profiles
  add column if not exists full_name text,
  add column if not exists is_active boolean default true;

-- If fellowship_id is missing in a non-standard environment, add it.
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'fellowship_id'
  ) then
    alter table public.profiles
      add column fellowship_id uuid references public.fellowships(id) on delete set null;
  end if;
end $$;

-- ----------------------------
-- sanity signal
-- ----------------------------
select
  'schema_alignment_applied' as event,
  now() as applied_at;
