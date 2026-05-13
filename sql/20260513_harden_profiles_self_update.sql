-- =====================================================
-- PCDL hardening: restrict self-service profile updates
-- =====================================================

-- Users may update their own profile only for limited self-service fields.
-- Elevated roles and admin-only status columns must not be self-assigned.
drop policy if exists profiles_update_self on public.profiles;

create policy profiles_update_self
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  and role = 'Member'
  and exists (
    select 1
    from public.profiles current_row
    where current_row.id = auth.uid()
      and current_row.is_active is not distinct from public.profiles.is_active
      and current_row.disabled_reason is not distinct from public.profiles.disabled_reason
      and current_row.disabled_at is not distinct from public.profiles.disabled_at
      and current_row.disabled_by is not distinct from public.profiles.disabled_by
  )
);
