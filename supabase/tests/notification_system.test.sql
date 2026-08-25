begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

create or replace function pg_temp.notification_event_role_allowed(p_event_key text, p_role text)
returns boolean
language plpgsql
as $$
declare
  result boolean;
begin
  if to_regclass('public.notification_event_catalog') is null then
    return null;
  end if;

  execute 'select $2 = any(allowed_roles) from public.notification_event_catalog where event_key = $1'
  into result
  using p_event_key, p_role;
  return result;
end;
$$;

create or replace function pg_temp.notification_active_cron_jobs(p_job_name text)
returns integer
language plpgsql
as $$
declare
  result integer;
begin
  if to_regclass('cron.job') is null then
    return null;
  end if;

  execute 'select count(*)::integer from cron.job where jobname = $1 and active'
  into result
  using p_job_name;
  return result;
end;
$$;

select plan(29);

select has_table('public', 'notifications', 'Persistent notifications table exists');
select has_table('public', 'notification_preferences', 'Per-event preferences table exists');
select has_table('public', 'notification_user_settings', 'Per-workspace user settings table exists');
select has_table('public', 'push_subscriptions', 'Push subscriptions table exists');
select has_table('public', 'notification_outbox', 'Delivery outbox exists');
select has_table('public', 'notification_deliveries', 'Delivery receipts table exists');
select has_function('public', 'notification_unread_count', array['uuid'], 'Unread count RPC exists');
select has_function('public', 'notification_mark_read', array['uuid','uuid[]','boolean'], 'Constrained read-state RPC exists');
select has_function('public', 'notification_mark_all_read', array['uuid'], 'Mark-all RPC exists');
select has_function('public', 'emit_notification_event_service', array['uuid','text','text','uuid','jsonb','text','uuid','text'], 'Trusted event RPC exists');
select col_is_unique('public', 'notification_preferences', array['workspace_id','user_id','event_key'], 'Preferences are unique per workspace/user/event');
select col_is_unique('public', 'notifications', array['workspace_id','recipient_user_id','dedupe_key'], 'Notification delivery is idempotent per recipient');
select policies_are('public', 'notifications', array['notifications_own_read'], 'Only the recipient-scoped notification read policy exists');
select policies_are('public', 'push_subscriptions', array[]::text[], 'Raw subscription credentials have no browser RLS policy');
select is((select relrowsecurity from pg_class where oid = to_regclass('public.notifications')), true, 'Notifications have RLS enabled');
select is((select relrowsecurity from pg_class where oid = to_regclass('public.push_subscriptions')), true, 'Subscriptions have RLS enabled');
select is((select relrowsecurity from pg_class where oid = to_regclass('public.notification_outbox')), true, 'Outbox has RLS enabled');
select is((select relrowsecurity from pg_class where oid = to_regclass('public.notification_deliveries')), true, 'Delivery receipts have RLS enabled');
select is(has_table_privilege('authenticated',to_regclass('public.notifications')::oid,'INSERT'), false, 'Browser users cannot create arbitrary notifications');
select is(has_table_privilege('authenticated',to_regclass('public.notifications')::oid,'UPDATE'), false, 'Browser users cannot bypass constrained mutation RPCs');
select is(has_table_privilege('authenticated',to_regclass('public.push_subscriptions')::oid,'SELECT'), false, 'Browser users cannot read raw subscription credentials');
select is(
  has_function_privilege(
    'authenticated',
    to_regprocedure('public.emit_notification_event_service(uuid,text,text,uuid,jsonb,text,uuid,text)')::oid,
    'EXECUTE'
  ),
  false,
  'Browser users cannot emit trusted events'
);
select is(public.is_active_workspace_member(gen_random_uuid()), false, 'An unrelated workspace fails membership authorization');
select is(pg_temp.notification_event_role_allowed('order.created', 'agent'), false, 'Agents do not receive every new workspace order');
select is(pg_temp.notification_event_role_allowed('order.assigned', 'agent'), true, 'Assigned-order events include confirmation agents');
select has_trigger('public', 'orders', 'notification_order_update', 'Order assignment and status changes are connected');
select has_trigger('public', 'founder_announcements', 'notification_founder_announcement', 'Audited founder announcements are connected');
select is(pg_temp.notification_active_cron_jobs('notification-push-dispatch'), 1, 'One background push dispatcher is active');
select has_trigger('auth', 'users', 'notification_auth_security_change', 'Auth changes emit trusted recipient-scoped security events');

select * from finish();
rollback;
