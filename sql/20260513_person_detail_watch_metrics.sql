-- =====================================================
-- Person detail watch metrics enrichment
-- =====================================================

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
      'current_streak', (
        select coalesce(count(*),0)
        from public.message_progress mp
        where mp.user_id = target_profile.id
          and mp.completed = true
          and mp.completed_at >= now() - interval '30 days'
      ),
      'total_watch_seconds', (
        select coalesce(sum(mp.watch_seconds),0)
        from public.message_progress mp
        where mp.user_id = target_profile.id
      ),
      'average_watch_percent', (
        select coalesce(round(avg(mp.watch_percent)::numeric,2),0)
        from public.message_progress mp
        where mp.user_id = target_profile.id
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
          'day_number', dmd.day_number,
          'title', dmi.title,
          'scheduled_date', dmd.scheduled_date,
          'item_order', dmi.item_order,
          'completed', coalesce(mp.completed,false),
          'completed_at', mp.completed_at,
          'points_earned', coalesce(mp.points_earned,0),
          'watch_percent', coalesce(mp.watch_percent,0),
          'watch_seconds', coalesce(mp.watch_seconds,0),
          'play_count', coalesce(mp.play_count,0),
          'last_watched_at', mp.last_watched_at
        )
        order by dmd.day_number, dmi.item_order
      ), '[]'::jsonb)
      from public.daily_message_items dmi
      join public.daily_message_days dmd on dmd.id = dmi.day_id
      left join public.message_progress mp
        on mp.message_item_id = dmi.id
       and mp.user_id = target_profile.id
      where dmd.is_active = true
        and dmi.is_active = true
        and dmd.scheduled_date <= current_date
    ),
    'shared_reflections', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'reflection_text', r.reflection_text,
          'visibility', r.visibility,
          'created_at', r.created_at,
          'day_id', r.day_id,
          'message_item_id', r.message_item_id
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
