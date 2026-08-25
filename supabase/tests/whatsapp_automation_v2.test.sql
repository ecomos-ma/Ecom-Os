begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(19);

select has_table('public', 'whatsapp_automation_rules', 'Automation rules table exists');
select has_table('public', 'whatsapp_audio_recordings', 'Audio metadata table exists');
select has_table('public', 'whatsapp_reply_actions', 'Reply actions table exists');
select has_table('public', 'whatsapp_opt_outs', 'Workspace opt-outs table exists');
select has_table('public', 'whatsapp_manual_reviews', 'Ambiguous replies have a review queue');
select has_table('public', 'whatsapp_worker_heartbeats', 'Worker heartbeat table exists');
select has_table('public', 'whatsapp_events', 'Operational events table exists');

select has_column('public', 'whatsapp_queue', 'idempotency_key', 'Queue has a stable idempotency key');
select has_column('public', 'whatsapp_queue', 'send_started_at', 'Queue records the provider uncertainty boundary');
select has_column('public', 'whatsapp_messages', 'provider_event_id', 'Provider events can be deduplicated');
select col_is_unique('public', 'whatsapp_queue', array['idempotency_key'], 'Queue idempotency key is unique');

select is(public.normalize_moroccan_whatsapp_phone('+212 6 12 34 56 78'), '212612345678', 'International Moroccan phone is normalized');
select is(public.normalize_moroccan_whatsapp_phone('0712345678'), '212712345678', 'Local Moroccan phone is normalized');
select is(public.normalize_moroccan_whatsapp_phone('+33612345678'), null, 'Foreign phone is rejected');

select function_privs_are('public', 'claim_whatsapp_jobs', array['uuid','integer'], 'service_role', array['EXECUTE'], 'Queue claiming is service-only');
select function_privs_are('public', 'process_whatsapp_inbound', array['uuid','text','text','text','text','text','timestamp with time zone','jsonb'], 'service_role', array['EXECUTE'], 'Inbound processing is service-only');
select function_privs_are('public', 'retry_whatsapp_job', array['uuid'], 'authenticated', array['EXECUTE'], 'Manual retry is available only through its authorized RPC');

select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'public'
     and tablename in ('whatsapp_queue','whatsapp_messages')
     and roles @> array['public']::name[]
     and (coalesce(qual, '') = 'true' or coalesce(with_check, '') = 'true')),
  0,
  'No permissive public queue or message policy remains'
);

select ok(
  exists (select 1 from storage.buckets where id = 'whatsapp-audio' and public = false),
  'WhatsApp audio bucket is private'
);

select * from finish();
rollback;
