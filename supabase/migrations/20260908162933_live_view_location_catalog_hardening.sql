create policy live_view_region_catalog_no_client_access
on public.live_view_region_catalog for all to anon,authenticated using(false) with check(false);
create policy live_view_country_catalog_no_client_access
on public.live_view_country_catalog for all to anon,authenticated using(false) with check(false);
