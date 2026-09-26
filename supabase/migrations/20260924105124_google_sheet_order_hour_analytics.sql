-- Return only the active workspace's orders, grouped by Morocco business hour.
-- Old Sheets rows have order_date parsed as UTC even though the sheet supplied
-- Morocco wall time. A full re-sync fills order_received_at correctly; the
-- fallback below makes already-imported rows visible in the right hour now.
create or replace function public.get_orders_by_hour_v2(
  p_workspace_id uuid,
  start_ts timestamptz,
  end_ts timestamptz
)
returns table(hour text, orders bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with event_times as (
    select coalesce(
      o.order_received_at,
      case when o.source = 'sheets' and o.order_date is not null
        then (o.order_date at time zone 'UTC') at time zone 'Africa/Casablanca'
        else o.order_date end,
      o.created_at
    ) as event_at
    from public.orders o
    where o.workspace_id = p_workspace_id
  ), counts as (
    select extract(hour from event_at at time zone 'Africa/Casablanca')::integer as hour_number,
           count(*)::bigint as total
    from event_times
    where event_at >= start_ts and event_at <= end_ts
    group by 1
  )
  select to_char(make_time(h, 0, 0), 'HH24:MI'), coalesce(counts.total, 0)::bigint
  from generate_series(0, 23) as h
  left join counts on counts.hour_number = h
  order by h;
$$;

revoke all on function public.get_orders_by_hour_v2(uuid, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.get_orders_by_hour_v2(uuid, timestamptz, timestamptz)
  to authenticated;
