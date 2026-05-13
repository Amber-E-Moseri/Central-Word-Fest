create or replace view public.media_refresh_health_view as
with active_items as (
  select
    id,
    pcdl_url,
    temporary_media_url,
    media_url_expires_at,
    media_status
  from public.daily_message_items
  where is_active = true
),
failure_rollup as (
  select
    message_item_id,
    max(retry_count) as max_retry_count
  from public.media_refresh_failures
  group by message_item_id
),
last_run as (
  select
    started_at,
    completed_at,
    processed_count,
    updated_count,
    failed_count,
    case
      when completed_at is null then 'running'
      when failed_count > 0 then 'completed_with_failures'
      else 'completed'
    end as refresh_status
  from public.media_refresh_runs
  order by coalesce(completed_at, started_at) desc
  limit 1
)
select
  (select count(*)::int from active_items) as total_active_items,
  (select count(*)::int from active_items where pcdl_url is null or btrim(pcdl_url) = '') as missing_pcdl_url_count,
  (select count(*)::int from active_items where media_url_expires_at is not null and media_url_expires_at <= now()) as expired_temporary_url_count,
  (select count(*)::int from active_items where media_url_expires_at is not null and media_url_expires_at > now() and media_url_expires_at <= now() + interval '6 hours') as expiring_within_6_hours_count,
  (select count(*)::int from active_items where media_status = 'fresh') as fresh_count,
  (select count(*)::int from active_items where media_status = 'error') as error_count,
  (select count(*)::int from active_items where media_status = 'not_found') as not_found_count,
  (select count(*)::int from failure_rollup where max_retry_count >= 3) as repeated_failure_count,
  (select started_at from last_run) as last_refresh_started_at,
  (select completed_at from last_run) as last_refresh_completed_at,
  (select refresh_status from last_run) as last_refresh_status,
  (select processed_count from last_run) as last_refresh_processed_count,
  (select updated_count from last_run) as last_refresh_updated_count,
  (select failed_count from last_run) as last_refresh_failed_count;

grant select on public.media_refresh_health_view to authenticated;
