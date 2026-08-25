begin;
select plan(12);

select has_table('public', 'tiktok_connections', 'TikTok connections table exists');
select has_table('public', 'tiktok_ad_accounts', 'TikTok advertiser accounts table exists');
select has_table('public', 'tiktok_ad_insights', 'TikTok daily insights table exists');
select has_table('public', 'tiktok_event_logs', 'TikTok event delivery log exists');
select has_column('public', 'orders', 'ttclid', 'Orders preserve ttclid');
select has_column('public', 'orders', 'tiktok_attribution_status', 'Orders expose attribution confidence');
select has_column('public', 'orders', 'cod_payment_collected', 'Orders track COD collection');
select policies_are('public', 'tiktok_connections', array[]::text[], 'Credentials have no direct frontend policy');
select policies_are('public', 'tiktok_ad_insights', array['tiktok_ad_insights_select'], 'Insights have one workspace-scoped read policy');
select function_privs_are('public', 'refresh_tiktok_order_attribution', array['uuid'], 'service_role', array['EXECUTE'], 'Attribution refresh is service-only');
select function_privs_are('private', 'install_tiktok_cron_jobs', array[]::text[], 'service_role', array['EXECUTE'], 'Cron installer is service-only');
select col_is_unique('public', 'tiktok_event_logs', array['workspace_id', 'order_id', 'event_name'], 'Event mapping is idempotent');

select * from finish();
rollback;
