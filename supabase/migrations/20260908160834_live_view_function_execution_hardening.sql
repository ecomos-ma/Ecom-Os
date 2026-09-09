revoke execute on function public.project_live_view_order_v1() from public, anon, authenticated;
revoke execute on function public.resolve_live_view_city_v1(uuid,text,text) from public, anon, authenticated;
grant execute on function public.resolve_live_view_city_v1(uuid,text,text) to service_role;

revoke execute on function public.get_live_view_snapshot_v1(uuid,text,jsonb,boolean) from public, anon;
grant execute on function public.get_live_view_snapshot_v1(uuid,text,jsonb,boolean) to authenticated;

revoke execute on function public.upsert_live_view_city_alias_v1(uuid,text,bigint) from public, anon;
grant execute on function public.upsert_live_view_city_alias_v1(uuid,text,bigint) to authenticated;
