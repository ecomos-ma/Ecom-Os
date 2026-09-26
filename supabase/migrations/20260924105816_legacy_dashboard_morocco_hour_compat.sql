-- Existing deployed clients still call these two-argument functions. Keep
-- them accurate until the workspace-scoped v2 dashboard reaches every user.
create or replace function public.get_orders_by_hour(start_ts timestamptz, end_ts timestamptz)
returns table(hour text, orders bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with counts as (
    select extract(hour from coalesce(o.order_received_at, o.order_date, o.created_at)
             at time zone 'Africa/Casablanca')::integer as hour_number,
           count(*)::bigint as total
    from public.orders o
    where coalesce(o.order_received_at, o.order_date, o.created_at) >= start_ts
      and coalesce(o.order_received_at, o.order_date, o.created_at) <= end_ts
    group by 1
  )
  select to_char(make_time(h, 0, 0), 'HH24:MI'), coalesce(counts.total, 0)::bigint
  from generate_series(0, 23) as h
  left join counts on counts.hour_number = h
  order by h;
$$;

create or replace function public.get_peak_order_hours(start_ts timestamptz, end_ts timestamptz)
returns table(best_hour text, orders bigint, average_per_hour numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with buckets as (
    select * from public.get_orders_by_hour(start_ts, end_ts)
  ), peak as (
    select buckets.hour, buckets.orders from buckets
    order by buckets.orders desc, buckets.hour limit 1
  )
  select peak.hour, peak.orders,
         (select sum(buckets.orders)::numeric / 24 from buckets)
  from peak;
$$;
