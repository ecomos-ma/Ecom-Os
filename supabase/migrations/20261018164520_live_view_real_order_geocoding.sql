-- Verified shipping-location coordinates for Live View.
-- Full addresses remain on orders; the public realtime projection contains
-- only the resolved city/country and coordinates required by the map.
begin;

alter table public.orders
  add column if not exists shipping_latitude double precision,
  add column if not exists shipping_longitude double precision,
  add column if not exists shipping_geo_accuracy text,
  add column if not exists shipping_geocoded_at timestamptz,
  add column if not exists shipping_geocode_query_hash text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_shipping_coordinates_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders add constraint orders_shipping_coordinates_check check (
      (shipping_latitude is null and shipping_longitude is null)
      or (
        shipping_latitude between -90 and 90
        and shipping_longitude between -180 and 180
      )
    );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_shipping_geo_accuracy_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders add constraint orders_shipping_geo_accuracy_check check (
      shipping_geo_accuracy is null
      or shipping_geo_accuracy in ('coordinates', 'address', 'city')
    );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_shipping_geocode_query_hash_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders add constraint orders_shipping_geocode_query_hash_check check (
      shipping_geocode_query_hash is null
      or shipping_geocode_query_hash ~ '^[a-f0-9]{64}$'
    );
  end if;
end
$$;

create index if not exists orders_shipping_geocode_pending_idx
  on public.orders (workspace_id, created_at desc)
  where shipping_latitude is null or shipping_longitude is null;

create table if not exists public.live_view_geocode_cache (
  query_hash text primary key check (query_hash ~ '^[a-f0-9]{64}$'),
  city text,
  region text,
  country text,
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy text not null check (accuracy in ('address', 'city')),
  provider text not null check (length(provider) between 1 and 80),
  resolved_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists live_view_geocode_cache_expiry_idx
  on public.live_view_geocode_cache (expires_at);

alter table public.live_view_geocode_cache enable row level security;
revoke all on table public.live_view_geocode_cache from public, anon, authenticated;
grant select, insert, update on table public.live_view_geocode_cache to service_role;

drop policy if exists live_view_geocode_cache_no_client_access on public.live_view_geocode_cache;
create policy live_view_geocode_cache_no_client_access
on public.live_view_geocode_cache
for all
to anon, authenticated
using (false)
with check (false);

alter table public.live_view_events
  drop constraint if exists live_view_events_geo_source_check;
alter table public.live_view_events
  add constraint live_view_events_geo_source_check check (
    geo_source in ('coordinates', 'address', 'city', 'provider_city', 'ip', 'region', 'country', 'unknown')
  );

-- A changed delivery address invalidates derived coordinates. Coordinates set
-- explicitly in the same update are retained as a trusted stored location.
create or replace function public.clear_stale_order_shipping_coordinates_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if row(old.address, old.city, old.city_name, old.raw_city, old.region, old.country, old.postal_code)
       is distinct from
     row(new.address, new.city, new.city_name, new.raw_city, new.region, new.country, new.postal_code)
     and new.shipping_latitude is not distinct from old.shipping_latitude
     and new.shipping_longitude is not distinct from old.shipping_longitude then
    new.shipping_latitude := null;
    new.shipping_longitude := null;
    new.shipping_geo_accuracy := null;
    new.shipping_geocoded_at := null;
    new.shipping_geocode_query_hash := null;
  end if;
  return new;
end
$function$;

revoke all on function public.clear_stale_order_shipping_coordinates_v1() from public, anon, authenticated;

drop trigger if exists orders_clear_stale_shipping_coordinates on public.orders;
create trigger orders_clear_stale_shipping_coordinates
before update of address, city, city_name, raw_city, region, country, postal_code
on public.orders
for each row execute function public.clear_stale_order_shipping_coordinates_v1();

-- Only a verified city centroid is a valid fallback. Region/country centres are
-- deliberately excluded so unresolved orders never appear at a false position.
create or replace function public.resolve_live_view_verified_city_v2(
  p_workspace_id uuid,
  p_city text,
  p_country text
)
returns table (
  city text, region text, country text, country_code text,
  latitude double precision, longitude double precision,
  geo_source text, geo_confidence text
)
language sql
stable
security definer
set search_path = ''
as $function$
  with input as (
    select lower(regexp_replace(btrim(coalesce(p_city, '')), '[^[:alnum:]]+', '', 'g')) city_key,
           lower(regexp_replace(btrim(coalesce(p_country, '')), '[^[:alnum:]]+', '', 'g')) country_key
  )
  select catalog.canonical_name, catalog.region, catalog.country_name, catalog.country_code,
         catalog.latitude, catalog.longitude,
         case when alias.workspace_id is null then 'city' else 'provider_city' end,
         'medium'::text
  from public.live_view_city_aliases alias
  join public.live_view_city_catalog catalog on catalog.id = alias.city_id
  cross join input
  where input.city_key <> ''
    and alias.normalized_alias = input.city_key
    and (alias.workspace_id = p_workspace_id or alias.workspace_id is null)
    and (
      input.country_key = ''
      or input.country_key in (
        lower(catalog.country_code),
        lower(regexp_replace(catalog.country_name, '[^[:alnum:]]+', '', 'g'))
      )
    )
  order by (alias.workspace_id is not null) desc
  limit 1
$function$;

revoke all on function public.resolve_live_view_verified_city_v2(uuid, text, text) from public, anon, authenticated;
grant execute on function public.resolve_live_view_verified_city_v2(uuid, text, text) to service_role;

create or replace function public.project_live_view_order_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  resolved record;
  projected_city text;
  projected_region text;
  projected_country text;
  projected_country_code text;
  projected_latitude double precision;
  projected_longitude double precision;
  projected_source text;
  projected_confidence text;
begin
  if new.shipping_latitude is not null and new.shipping_longitude is not null then
    projected_city := coalesce(new.city_name, new.city, new.raw_city);
    projected_region := new.region;
    projected_country := new.country;
    projected_latitude := new.shipping_latitude;
    projected_longitude := new.shipping_longitude;
    projected_source := case
      when new.shipping_geo_accuracy = 'address' then 'address'
      when new.shipping_geo_accuracy = 'city' then 'city'
      else 'coordinates'
    end;
    projected_confidence := case when new.shipping_geo_accuracy = 'city' then 'medium' else 'high' end;
  else
    select * into resolved
    from public.resolve_live_view_verified_city_v2(
      new.workspace_id,
      coalesce(new.city_name, new.city, new.raw_city),
      new.country
    )
    limit 1;
    projected_city := coalesce(resolved.city, new.city_name, new.city, new.raw_city);
    projected_region := coalesce(resolved.region, new.region);
    projected_country := coalesce(resolved.country, new.country);
    projected_country_code := resolved.country_code;
    projected_latitude := resolved.latitude;
    projected_longitude := resolved.longitude;
    projected_source := coalesce(resolved.geo_source, 'unknown');
    projected_confidence := coalesce(resolved.geo_confidence, 'low');
  end if;

  insert into public.live_view_events (
    order_id, workspace_id, occurred_at, status, total, currency, source,
    product_name, campaign, city, region, country, country_code,
    latitude, longitude, geo_source, geo_confidence, updated_at
  ) values (
    new."Order ID", new.workspace_id, coalesce(new.order_date, new.created_at),
    coalesce(new.status, 'unknown'), coalesce(new.total, 0), new.currency,
    coalesce(new.source_platform, new.source, new.utm_source), new.product_name,
    new.utm_campaign, projected_city, projected_region, projected_country,
    projected_country_code, projected_latitude, projected_longitude,
    projected_source, projected_confidence, now()
  )
  on conflict (order_id) do update set
    workspace_id = excluded.workspace_id,
    occurred_at = excluded.occurred_at,
    status = excluded.status,
    total = excluded.total,
    currency = excluded.currency,
    source = excluded.source,
    product_name = excluded.product_name,
    campaign = excluded.campaign,
    city = excluded.city,
    region = excluded.region,
    country = excluded.country,
    country_code = excluded.country_code,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    geo_source = excluded.geo_source,
    geo_confidence = excluded.geo_confidence,
    updated_at = now();
  return new;
end
$function$;

revoke all on function public.project_live_view_order_v1() from public, anon, authenticated;

drop trigger if exists orders_live_view_projection on public.orders;
create trigger orders_live_view_projection
after insert or update of
  status, total, currency, source, source_platform, product_name, utm_campaign,
  city, city_name, raw_city, region, country, postal_code, address, order_date,
  shipping_latitude, shipping_longitude, shipping_geo_accuracy
on public.orders
for each row execute function public.project_live_view_order_v1();

-- Reconcile existing projections. Verified stored coordinates win, followed by
-- a verified city. Everything else remains visible in the feed as unknown but
-- receives no marker coordinates.
with locations as (
  select
    order_row."Order ID" order_id,
    coalesce(order_row.city_name, order_row.city, order_row.raw_city) raw_city,
    order_row.region raw_region,
    order_row.country raw_country,
    order_row.shipping_latitude,
    order_row.shipping_longitude,
    order_row.shipping_geo_accuracy,
    resolved.*
  from public.orders order_row
  left join lateral public.resolve_live_view_verified_city_v2(
    order_row.workspace_id,
    coalesce(order_row.city_name, order_row.city, order_row.raw_city),
    order_row.country
  ) resolved on order_row.shipping_latitude is null or order_row.shipping_longitude is null
)
update public.live_view_events event set
  city = coalesce(locations.city, locations.raw_city),
  region = coalesce(locations.region, locations.raw_region),
  country = coalesce(locations.country, locations.raw_country),
  country_code = locations.country_code,
  latitude = coalesce(locations.shipping_latitude, locations.latitude),
  longitude = coalesce(locations.shipping_longitude, locations.longitude),
  geo_source = case
    when locations.shipping_latitude is not null and locations.shipping_longitude is not null
      then case when locations.shipping_geo_accuracy = 'address' then 'address'
                when locations.shipping_geo_accuracy = 'city' then 'city'
                else 'coordinates' end
    else coalesce(locations.geo_source, 'unknown')
  end,
  geo_confidence = case
    when locations.shipping_latitude is not null and locations.shipping_longitude is not null
      then case when locations.shipping_geo_accuracy = 'city' then 'medium' else 'high' end
    else coalesce(locations.geo_confidence, 'low')
  end,
  updated_at = now()
from locations
where event.order_id = locations.order_id;

comment on table public.live_view_geocode_cache is
  'Server-only cache keyed by a one-way hash of normalized shipping location input; raw addresses are never copied here.';
comment on column public.orders.shipping_latitude is
  'Verified delivery latitude from stored integration coordinates or server-side geocoding.';
comment on column public.orders.shipping_geocode_query_hash is
  'SHA-256 of normalized geocoding input, used to detect and cache location resolution without duplicating the address.';

commit;
