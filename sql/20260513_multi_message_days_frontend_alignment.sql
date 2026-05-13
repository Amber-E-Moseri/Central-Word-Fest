-- =====================================================
-- PCDL multi-message days frontend alignment (additive)
-- =====================================================

-- Day-level table
create table if not exists public.daily_message_days (
  id uuid primary key default gen_random_uuid(),
  day_number integer not null unique,
  scheduled_date date not null unique,
  day_label text default '',
  other_label text default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Item-level table
create table if not exists public.daily_message_items (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.daily_message_days(id) on delete cascade,
  item_order integer not null,
  title text default '',
  source_type text default 'Web link',
  media_url text default '',
  thumbnail_url text default '',
  admin_notes text default '',
  is_required boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(day_id, item_order)
);

-- Progress compatibility
alter table public.message_progress
  add column if not exists message_item_id uuid references public.daily_message_items(id) on delete set null,
  add column if not exists watch_seconds integer not null default 0;

-- Reflection compatibility
alter table public.reflections
  add column if not exists day_id uuid references public.daily_message_days(id) on delete set null,
  add column if not exists message_item_id uuid references public.daily_message_items(id) on delete set null;

-- Optional constraints
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'daily_message_items_source_type_check'
  ) then
    alter table public.daily_message_items
      add constraint daily_message_items_source_type_check
      check (source_type in ('Direct MP4', 'Direct MP3', 'Google Drive', 'Web link'));
  end if;
end $$;

-- RLS baseline (safe additive)
alter table public.daily_message_days enable row level security;
alter table public.daily_message_items enable row level security;

drop policy if exists daily_message_days_read_active on public.daily_message_days;
create policy daily_message_days_read_active
on public.daily_message_days
for select
to authenticated
using (is_active = true or public.is_admin() or public.is_group_pastor());

drop policy if exists daily_message_items_read_active on public.daily_message_items;
create policy daily_message_items_read_active
on public.daily_message_items
for select
to authenticated
using (
  is_active = true
  or public.is_admin()
  or public.is_group_pastor()
);

drop policy if exists daily_message_days_admin_write on public.daily_message_days;
create policy daily_message_days_admin_write
on public.daily_message_days
for all
to authenticated
using (public.is_admin() or public.is_group_pastor())
with check (public.is_admin() or public.is_group_pastor());

drop policy if exists daily_message_items_admin_write on public.daily_message_items;
create policy daily_message_items_admin_write
on public.daily_message_items
for all
to authenticated
using (public.is_admin() or public.is_group_pastor())
with check (public.is_admin() or public.is_group_pastor());
