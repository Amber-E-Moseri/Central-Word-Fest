-- Media operations automation tables and policies (additive).

create table if not exists public.media_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  processed_count int not null default 0,
  updated_count int not null default 0,
  failed_count int not null default 0,
  triggered_by text,
  run_type text not null default 'scheduled_recent_days'
);

create table if not exists public.media_refresh_failures (
  id uuid primary key default gen_random_uuid(),
  message_item_id uuid not null references public.daily_message_items(id) on delete cascade,
  failure_type text not null,
  error text,
  occurred_at timestamptz not null default now(),
  retry_count int not null default 0
);

create index if not exists idx_media_refresh_runs_started_at
on public.media_refresh_runs(started_at desc);

create index if not exists idx_media_refresh_failures_item_time
on public.media_refresh_failures(message_item_id, occurred_at desc);

create index if not exists idx_media_refresh_failures_type
on public.media_refresh_failures(failure_type);

alter table public.media_refresh_runs enable row level security;
alter table public.media_refresh_failures enable row level security;

-- Read access for authenticated users (frontend will further scope by role).
drop policy if exists media_refresh_runs_select_auth on public.media_refresh_runs;
create policy media_refresh_runs_select_auth
on public.media_refresh_runs
for select
to authenticated
using (true);

drop policy if exists media_refresh_failures_select_auth on public.media_refresh_failures;
create policy media_refresh_failures_select_auth
on public.media_refresh_failures
for select
to authenticated
using (true);

-- Writes are expected from service-role script / privileged backend.
drop policy if exists media_refresh_runs_write_none on public.media_refresh_runs;
create policy media_refresh_runs_write_none
on public.media_refresh_runs
for all
to authenticated
using (false)
with check (false);

drop policy if exists media_refresh_failures_write_none on public.media_refresh_failures;
create policy media_refresh_failures_write_none
on public.media_refresh_failures
for all
to authenticated
using (false)
with check (false);
