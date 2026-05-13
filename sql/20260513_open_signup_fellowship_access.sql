-- =====================================================
-- PCDL open signup update
-- Everyone can access content after signup.
-- Signup should ask for fellowship.
-- Admins can allow/disallow later using is_active.
-- =====================================================

-- 1) Ensure all fellowships exist.
insert into public.fellowships (name, code)
values
  ('Brock University', 'BROCK_UNIVERSITY'),
  ('Toronto Metropolitan University', 'TORONTO_METROPOLITAN_UNIVERSITY'),
  ('University of Guelph', 'UNIVERSITY_OF_GUELPH'),
  ('University of Toronto Mississauga', 'UNIVERSITY_OF_TORONTO_MISSISSAUGA'),
  ('University of Toronto Scarborough', 'UNIVERSITY_OF_TORONTO_SCARBOROUGH'),
  ('University of Waterloo', 'UNIVERSITY_OF_WATERLOO'),
  ('Wilfred Laurier University', 'WILFRED_LAURIER_UNIVERSITY'),
  ('Western University', 'WESTERN_UNIVERSITY'),
  ('York University', 'YORK_UNIVERSITY'),
  ('Seneca College', 'SENECA_COLLEGE'),
  ('Sheridan College', 'SHERIDAN_COLLEGE')
on conflict (name) do nothing;

-- 2) Keep users active by default.
alter table public.profiles
alter column is_active set default true;

-- 3) Optional admin moderation fields.
alter table public.profiles
add column if not exists disabled_reason text,
add column if not exists disabled_at timestamptz,
add column if not exists disabled_by uuid references public.profiles(id) on delete set null;

-- 4) Function for admin to disable user access if needed.
create or replace function public.admin_set_user_active(
  p_user_id uuid,
  p_is_active boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() and auth.uid() is not null then
    raise exception 'Only admins can change user access.';
  end if;

  update public.profiles
  set
    is_active = p_is_active,
    disabled_reason = case when p_is_active then null else p_reason end,
    disabled_at = case when p_is_active then null else now() end,
    disabled_by = case when p_is_active then null else auth.uid() end
  where id = p_user_id;
end;
$$;

grant execute on function public.admin_set_user_active(uuid, boolean, text) to authenticated;

-- 5) Update handle_new_user so unlisted users can still access as Member.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    is_active
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'Member',
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();

-- 6) Sync imported people when they exist, but do not block unlisted people.
create or replace function public.sync_imported_person()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles p
  set
    full_name = coalesce(ip.full_name, p.full_name),
    role = coalesce(ip.role, p.role),
    fellowship_id = coalesce(f.id, p.fellowship_id),
    imported_from_sheet = true,
    is_active = true
  from public.imported_people ip
  left join public.fellowships f
    on trim(f.name) = trim(ip.fellowship_name)
  where p.id = new.id
    and lower(p.email) = lower(ip.email);

  return new;
end;
$$;

drop trigger if exists trg_sync_imported_person on public.profiles;

create trigger trg_sync_imported_person
after insert on public.profiles
for each row
execute function public.sync_imported_person();

-- 7) Quick check.
select
  name,
  code
from public.fellowships
order by name;
