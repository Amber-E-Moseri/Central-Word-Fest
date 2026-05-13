-- =====================================================
-- PCDL media watch tracking (additive)
-- =====================================================

create table if not exists public.message_watch_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_item_id uuid not null references public.daily_message_items(id) on delete cascade,
  event_type text not null,
  watch_seconds int not null default 0,
  watch_percent numeric(5,2) not null default 0,
  session_id text,
  device_type text,
  created_at timestamptz not null default now()
);

alter table public.message_progress
  add column if not exists message_item_id uuid references public.daily_message_items(id) on delete set null,
  add column if not exists play_count int not null default 0,
  add column if not exists watch_seconds int not null default 0,
  add column if not exists watch_percent numeric(5,2) not null default 0,
  add column if not exists completed boolean not null default false,
  add column if not exists completed_at timestamptz,
  add column if not exists last_watched_at timestamptz,
  add column if not exists first_played_at timestamptz;

alter table public.reflections
  add column if not exists day_id uuid references public.daily_message_days(id) on delete set null,
  add column if not exists message_item_id uuid references public.daily_message_items(id) on delete set null;

alter table public.message_watch_events enable row level security;

drop policy if exists message_watch_events_insert_self on public.message_watch_events;
create policy message_watch_events_insert_self
on public.message_watch_events
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists message_watch_events_read_scoped on public.message_watch_events;
create policy message_watch_events_read_scoped
on public.message_watch_events
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin()
  or public.is_group_pastor()
  or exists (
    select 1
    from public.profiles p
    where p.id = message_watch_events.user_id
      and public.can_view_fellowship(p.fellowship_id)
  )
);

drop policy if exists message_progress_upsert_self on public.message_progress;
create policy message_progress_upsert_self
on public.message_progress
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists message_progress_update_self on public.message_progress;
create policy message_progress_update_self
on public.message_progress
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create or replace view public.v_message_item_engagement as
select
  mp.user_id,
  mp.message_item_id,
  dmd.id as day_id,
  dmd.day_number,
  dmd.scheduled_date,
  dmi.item_order,
  dmi.title,
  mp.play_count,
  mp.watch_seconds,
  mp.watch_percent,
  mp.completed,
  mp.completed_at,
  mp.last_watched_at,
  mp.first_played_at,
  mp.points_earned
from public.message_progress mp
left join public.daily_message_items dmi on dmi.id = mp.message_item_id
left join public.daily_message_days dmd on dmd.id = dmi.day_id;

create or replace function public.get_scoped_media_analytics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  scoped_users uuid[];
  result jsonb;
begin
  select array_agg(p.id)
  into scoped_users
  from public.profiles p
  where
    p.is_active = true
    and (
      p.id = auth.uid()
      or public.is_admin()
      or public.is_group_pastor()
      or public.can_view_fellowship(p.fellowship_id)
    );

  select jsonb_build_object(
    'total_completions', (
      select count(*) from public.message_progress mp
      where mp.user_id = any(scoped_users)
        and mp.completed = true
    ),
    'average_watch_percent', (
      select coalesce(round(avg(mp.watch_percent)::numeric,2),0)
      from public.message_progress mp
      where mp.user_id = any(scoped_users)
    ),
    'total_watch_seconds', (
      select coalesce(sum(mp.watch_seconds),0)
      from public.message_progress mp
      where mp.user_id = any(scoped_users)
    ),
    'most_replayed', (
      select coalesce(jsonb_agg(x),'[]'::jsonb)
      from (
        select dmi.id, dmi.title, sum(mp.play_count) as total_plays
        from public.message_progress mp
        join public.daily_message_items dmi on dmi.id = mp.message_item_id
        where mp.user_id = any(scoped_users)
        group by dmi.id, dmi.title
        order by sum(mp.play_count) desc
        limit 10
      ) x
    ),
    'abandoned_before_50', (
      select count(*)
      from public.message_progress mp
      where mp.user_id = any(scoped_users)
        and mp.watch_percent < 50
        and coalesce(mp.completed,false) = false
    )
  )
  into result;

  return result;
end;
$$;

grant execute on function public.get_scoped_media_analytics() to authenticated;
