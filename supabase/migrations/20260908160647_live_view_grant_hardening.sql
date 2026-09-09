revoke all on table public.live_view_events from authenticated;
revoke all on table public.live_view_city_catalog from authenticated;
revoke all on table public.live_view_city_aliases from authenticated;
grant select on table public.live_view_events to authenticated;
grant select on table public.live_view_city_catalog to authenticated;
grant select on table public.live_view_city_aliases to authenticated;
