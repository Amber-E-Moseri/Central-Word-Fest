-- =====================================================
-- PCDL fix: chosen fellowship not showing after signup
-- and clean live profile defaults.
-- =====================================================

-- Ensure required fellowships exist.
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

-- Allow users to update their own fellowship and role at signup.
drop policy if exists profiles_update_self on public.profiles;

create policy profiles_update_self
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Make sure new users get active profiles even if not imported.
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

-- Check current profiles and fellowships.
select
  p.full_name,
  p.email,
  p.role,
  f.name as fellowship,
  p.is_active
from public.profiles p
left join public.fellowships f on f.id = p.fellowship_id
order by p.created_at desc;
