-- Make the intentional service-only boundary explicit to security tooling.
drop policy if exists live_view_geo_cache_no_client_access on public.live_view_geo_cache;
create policy live_view_geo_cache_no_client_access
on public.live_view_geo_cache
for all
to anon, authenticated
using (false)
with check (false);

create or replace function public.upsert_live_view_city_alias_v1(
  p_workspace_id uuid,
  p_alias text,
  p_city_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  allowed boolean;
  target public.live_view_city_catalog%rowtype;
  normalized text;
begin
  normalized := lower(regexp_replace(btrim(coalesce(p_alias,'')), '[^[:alnum:]]+', '', 'g'));
  if normalized = '' then raise exception 'Alias is required'; end if;

  select public.has_platform_permission('orders.read_all') or exists (
    select 1 from public.profile_workspaces membership
    where membership.profile_id=(select auth.uid())
      and membership.workspace_id=p_workspace_id
      and membership.status='active'
      and (membership.is_owner or lower(coalesce(membership.role,'')) in ('owner','admin','manager','supervisor'))
  ) into allowed;
  if not coalesce(allowed,false) then raise exception 'Access denied'; end if;

  select * into target from public.live_view_city_catalog where id=p_city_id;
  if target.id is null then raise exception 'City not found'; end if;

  insert into public.live_view_city_aliases(city_id,workspace_id,alias)
  values (p_city_id,p_workspace_id,btrim(p_alias))
  on conflict (workspace_id,normalized_alias) where workspace_id is not null
  do update set city_id=excluded.city_id,alias=excluded.alias;

  update public.live_view_events event set
    city=target.canonical_name,region=target.region,country=target.country_name,
    country_code=target.country_code,latitude=target.latitude,longitude=target.longitude,
    geo_source='provider_city',geo_confidence='medium',updated_at=now()
  where event.workspace_id=p_workspace_id and event.geo_source <> 'ip'
    and lower(regexp_replace(btrim(coalesce(event.city,'')), '[^[:alnum:]]+', '', 'g'))=normalized;
end
$function$;

revoke all on function public.upsert_live_view_city_alias_v1(uuid,text,bigint) from public;
grant execute on function public.upsert_live_view_city_alias_v1(uuid,text,bigint) to authenticated;
