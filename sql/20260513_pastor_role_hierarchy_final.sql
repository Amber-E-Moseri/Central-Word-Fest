-- =====================================================
-- PCDL canonical pastor/coordinator oversight hierarchy
-- =====================================================

alter type public.user_role add value if not exists 'Member';
alter type public.user_role add value if not exists 'Bible Study Class Teacher';
alter type public.user_role add value if not exists 'Cell Leader';
alter type public.user_role add value if not exists 'Coordinator';
alter type public.user_role add value if not exists 'Pastor';
alter type public.user_role add value if not exists 'Subgroup Pastor';
alter type public.user_role add value if not exists 'Group Pastor';
alter type public.user_role add value if not exists 'Admin';

create table if not exists public.pastor_fellowship_assignments (
  id uuid primary key default gen_random_uuid(),
  pastor_id uuid not null references public.profiles(id) on delete cascade,
  fellowship_id uuid not null references public.fellowships(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (pastor_id, fellowship_id)
);

alter table public.pastor_fellowship_assignments enable row level security;

create or replace function public.is_group_pastor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'Group Pastor'
      and is_active = true
  );
$$;

create or replace function public.is_pastor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_group_pastor();
$$;

create or replace function public.is_subgroup_pastor_for_fellowship(p_fellowship_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pastor_fellowship_assignments pfa
    join public.profiles p on p.id = pfa.pastor_id
    where pfa.pastor_id = auth.uid()
      and pfa.fellowship_id = p_fellowship_id
      and p.role = 'Subgroup Pastor'
      and p.is_active = true
  );
$$;

create or replace function public.is_pastor_for_fellowship(p_fellowship_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pastor_fellowship_assignments pfa
    join public.profiles p on p.id = pfa.pastor_id
    where pfa.pastor_id = auth.uid()
      and pfa.fellowship_id = p_fellowship_id
      and p.role = 'Pastor'
      and p.is_active = true
  );
$$;

create or replace function public.can_view_fellowship(p_fellowship_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or public.is_group_pastor()
    or public.is_coordinator_for_fellowship(p_fellowship_id)
    or public.is_pastor_for_fellowship(p_fellowship_id)
    or public.is_subgroup_pastor_for_fellowship(p_fellowship_id);
$$;

drop policy if exists pastor_fellowship_assignments_read_visible on public.pastor_fellowship_assignments;
create policy pastor_fellowship_assignments_read_visible
on public.pastor_fellowship_assignments
for select
to authenticated
using (
  pastor_id = auth.uid()
  or public.is_admin()
  or public.is_group_pastor()
);

drop policy if exists pastor_fellowship_assignments_admin_all on public.pastor_fellowship_assignments;
create policy pastor_fellowship_assignments_admin_all
on public.pastor_fellowship_assignments
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists profiles_read_visible on public.profiles;
create policy profiles_read_visible
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin()
  or public.is_group_pastor()
  or public.can_view_fellowship(fellowship_id)
  or public.are_accountability_partners(auth.uid(), id)
);

drop policy if exists progress_read_visible on public.message_progress;
create policy progress_read_visible
on public.message_progress
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin()
  or public.is_group_pastor()
  or public.are_accountability_partners(auth.uid(), user_id)
  or exists (
    select 1
    from public.profiles p
    where p.id = message_progress.user_id
      and public.can_view_fellowship(p.fellowship_id)
  )
);

drop policy if exists activity_read_visible on public.activity_log;
create policy activity_read_visible
on public.activity_log
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin()
  or public.is_group_pastor()
  or exists (
    select 1
    from public.profiles p
    where p.id = activity_log.user_id
      and public.can_view_fellowship(p.fellowship_id)
  )
);

drop policy if exists relationships_read_visible on public.accountability_relationships;
create policy relationships_read_visible
on public.accountability_relationships
for select
to authenticated
using (
  user_id = auth.uid()
  or partner_id = auth.uid()
  or public.is_admin()
  or public.is_group_pastor()
);

create or replace function public.get_person_oversight_detail(p_person_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_profile record;
  result jsonb;
begin
  select
    p.id,
    p.full_name,
    p.email,
    p.role,
    p.fellowship_id,
    f.name as fellowship
  into target_profile
  from public.profiles p
  left join public.fellowships f on f.id = p.fellowship_id
  where p.id = p_person_id
    and p.is_active = true;

  if target_profile.id is null then
    raise exception 'Person not found.';
  end if;

  if not public.can_view_fellowship(target_profile.fellowship_id)
     and target_profile.id <> auth.uid() then
    raise exception 'Not allowed to view this person.';
  end if;

  select jsonb_build_object(
    'profile', jsonb_build_object(
      'id', target_profile.id,
      'full_name', target_profile.full_name,
      'email', target_profile.email,
      'role', target_profile.role,
      'fellowship', target_profile.fellowship
    ),
    'stats', jsonb_build_object(
      'completed_count', (
        select count(*)
        from public.message_progress mp
        where mp.user_id = target_profile.id
          and mp.completed = true
      ),
      'missed_count', (
        select count(*)
        from public.daily_message_days d
        join public.daily_message_items i
          on i.day_id = d.id
         and i.is_active = true
        left join public.message_progress mp
          on mp.user_id = target_profile.id
         and (
           mp.message_item_id = i.id
           or (mp.message_item_id is null and mp.message_id = i.id)
         )
        where d.scheduled_date <= current_date
          and d.is_active = true
          and coalesce(mp.completed, false) = false
      ),
      'current_streak', (
        select coalesce(count(*),0)
        from public.message_progress mp
        where mp.user_id = target_profile.id
          and mp.completed = true
          and mp.completed_at >= now() - interval '30 days'
      ),
      'last_activity_at', (
        select max(created_at)
        from public.activity_log a
        where a.user_id = target_profile.id
      )
    ),
    'progress', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'day_number', d.day_number,
          'title', i.title,
          'scheduled_date', d.scheduled_date,
          'completed', coalesce(mp.completed,false),
          'completed_at', mp.completed_at,
          'points_earned', coalesce(mp.points_earned,0),
          'watch_percent', coalesce(mp.watch_percent,0),
          'play_count', coalesce(mp.play_count,0)
        )
        order by d.day_number, i.item_order
      ), '[]'::jsonb)
      from public.daily_message_days d
      join public.daily_message_items i
        on i.day_id = d.id
       and i.is_active = true
      left join public.message_progress mp
        on mp.user_id = target_profile.id
       and (
         mp.message_item_id = i.id
         or (mp.message_item_id is null and mp.message_id = i.id)
       )
      where d.scheduled_date <= current_date
        and d.is_active = true
    ),
    'shared_reflections', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'reflection_text', r.reflection_text,
          'visibility', r.visibility,
          'created_at', r.created_at
        )
        order by r.created_at desc
      ), '[]'::jsonb)
      from public.reflections r
      where r.user_id = target_profile.id
        and (
          r.visibility in ('fellowship','everyone')
          or public.is_admin()
          or public.is_group_pastor()
          or public.can_view_fellowship(target_profile.fellowship_id)
        )
    )
  )
  into result;

  return result;
end;
$$;

grant execute on function public.get_person_oversight_detail(uuid) to authenticated;

create or replace view public.inactivity_alerts as
select
  p.id as user_id,
  p.full_name,
  p.email,
  p.role,
  f.name as fellowship,
  max(a.created_at) as last_activity_at,
  coalesce(
    floor(extract(epoch from (now() - max(a.created_at))) / 86400)::int,
    999
  ) as days_inactive
from public.profiles p
left join public.fellowships f on f.id = p.fellowship_id
left join public.activity_log a on a.user_id = p.id
where p.role in ('Cell Leader', 'Bible Study Class Teacher', 'Coordinator')
  and p.is_active = true
group by p.id, p.full_name, p.email, p.role, f.name
having max(a.created_at) is null
   or max(a.created_at) < now() - interval '3 days';
