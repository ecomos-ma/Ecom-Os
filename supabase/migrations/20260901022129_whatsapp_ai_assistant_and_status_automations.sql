begin;

-- Canonical connection state shared by the worker, database and UI.
alter table public.whatsapp_settings
  drop constraint if exists whatsapp_settings_connection_status_check;
update public.whatsapp_settings
set connection_status = case connection_status
  when 'initializing' then 'starting'
  when 'qr_required' then 'qr_ready'
  else connection_status
end,
provider = 'baileys';
alter table public.whatsapp_settings
  add constraint whatsapp_settings_connection_status_check check (
    connection_status in ('disconnected','starting','qr_ready','connecting','authenticated','ready','reconnecting','error')
  );

alter table public.whatsapp_worker_heartbeats
  drop constraint if exists whatsapp_worker_heartbeats_status_check;
update public.whatsapp_worker_heartbeats
set status = case status
  when 'initializing' then 'starting'
  when 'qr_required' then 'qr_ready'
  else status
end,
provider = 'baileys';
alter table public.whatsapp_worker_heartbeats
  add constraint whatsapp_worker_heartbeats_status_check check (
    status in ('disconnected','starting','qr_ready','connecting','authenticated','ready','reconnecting','error')
  );

-- Per-workspace AI knowledge and explicit permissions. Dynamic business data is
-- never stored in teach_text; the worker loads it from the owning workspace.
create table if not exists public.whatsapp_ai_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  enabled boolean not null default false,
  teach_text text not null default '' check (char_length(teach_text) <= 50000),
  fallback_reply text not null default 'سمح ليا، وقع مشكل مؤقت ففهم الرسالة 🙏\nعاود صيفطها ليا أو استعمل واحد من الاختيارات:\n\n{{available_options}}' check (char_length(fallback_reply) between 1 and 2000),
  fallback_enabled boolean not null default true,
  fallback_show_options boolean not null default true,
  permissions jsonb not null default jsonb_build_object(
    'answer_questions', false,
    'confirm_order', false,
    'change_address', false,
    'set_callback', false,
    'change_status', false,
    'change_variant', false,
    'change_size', false,
    'change_quantity', false,
    'add_item', false,
    'remove_item', false,
    'add_note', false,
    'cancel_order', false
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(permissions) = 'object')
);

alter table public.whatsapp_ai_settings enable row level security;
drop policy if exists whatsapp_ai_settings_read on public.whatsapp_ai_settings;
create policy whatsapp_ai_settings_read
  on public.whatsapp_ai_settings for select to authenticated
  using (public.whatsapp_is_workspace_member(workspace_id));
drop policy if exists whatsapp_ai_settings_manage on public.whatsapp_ai_settings;
create policy whatsapp_ai_settings_manage
  on public.whatsapp_ai_settings for all to authenticated
  using (public.whatsapp_can_manage(workspace_id))
  with check (public.whatsapp_can_manage(workspace_id));
grant select, insert, update on public.whatsapp_ai_settings to authenticated;

drop trigger if exists whatsapp_ai_settings_updated_at on public.whatsapp_ai_settings;
create trigger whatsapp_ai_settings_updated_at
before update on public.whatsapp_ai_settings
for each row execute function public.update_updated_at_column();

-- Extend the existing rule table for any seller status. Confirmation and
-- delivery remain the same rows and use the same queue/worker.
alter table public.whatsapp_automation_rules
  add column if not exists rule_key text,
  add column if not exists display_name text;
update public.whatsapp_automation_rules
set rule_key = coalesce(nullif(rule_key, ''), event_type),
    display_name = coalesce(nullif(display_name, ''), initcap(replace(event_type, '_', ' ')));
alter table public.whatsapp_automation_rules
  alter column rule_key set not null,
  alter column display_name set not null;
alter table public.whatsapp_automation_rules
  drop constraint if exists whatsapp_automation_rules_event_type_check,
  drop constraint if exists whatsapp_automation_rules_workspace_id_event_type_key;
alter table public.whatsapp_automation_rules
  add constraint whatsapp_automation_rules_event_type_check
    check (event_type in ('confirmation','delivery','status')),
  add constraint whatsapp_automation_rules_rule_key_check
    check (rule_key ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  add constraint whatsapp_automation_rules_workspace_rule_key_key
    unique (workspace_id, rule_key);

-- Provider health stays on the existing encrypted global provider pool.
alter table public.tool_api_providers
  add column if not exists health_status text not null default 'unknown',
  add column if not exists last_error text,
  add column if not exists cooldown_until timestamptz,
  add column if not exists credential_last4 text;
alter table public.tool_api_providers
  drop constraint if exists tool_api_providers_health_status_check;
alter table public.tool_api_providers
  add constraint tool_api_providers_health_status_check
    check (health_status in ('unknown','healthy','cooldown','unhealthy'));
create index if not exists tool_api_providers_whatsapp_ai_rotation_idx
  on public.tool_api_providers (provider, enabled, priority, cooldown_until, last_used_at)
  where provider = 'gemini';
alter table public.tool_api_providers
  drop constraint if exists tool_api_providers_credential_last4_check;
alter table public.tool_api_providers
  add constraint tool_api_providers_credential_last4_check
    check (credential_last4 is null or credential_last4 ~ '^[A-Za-z0-9_-]{1,4}$');

-- Durable AI decisions and order change audit. Browser roles can only read the
-- change audit for their own workspace; writes are service-role only.
create table if not exists public.whatsapp_ai_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid not null references public.orders("Order ID") on delete cascade,
  provider_event_id text not null,
  inbound_message_id uuid references public.whatsapp_messages(id) on delete set null,
  intent text not null,
  decision jsonb not null default '{}',
  status text not null default 'processing' check (status in ('processing','applied','clarification','rejected','failed')),
  result jsonb not null default '{}',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (workspace_id, provider_event_id)
);

create table if not exists public.whatsapp_order_changes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid not null references public.orders("Order ID") on delete cascade,
  ai_action_id uuid references public.whatsapp_ai_actions(id) on delete set null,
  field_name text not null,
  old_value jsonb,
  new_value jsonb,
  source text not null check (source in ('whatsapp','whatsapp_ai')),
  summary text not null,
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_ai_actions_workspace_created_idx
  on public.whatsapp_ai_actions(workspace_id, created_at desc);
create index if not exists whatsapp_order_changes_order_created_idx
  on public.whatsapp_order_changes(workspace_id, order_id, created_at desc);

alter table public.whatsapp_ai_actions enable row level security;
alter table public.whatsapp_order_changes enable row level security;
drop policy if exists whatsapp_ai_actions_read on public.whatsapp_ai_actions;
create policy whatsapp_ai_actions_read
  on public.whatsapp_ai_actions for select to authenticated
  using (public.whatsapp_is_workspace_member(workspace_id));
drop policy if exists whatsapp_order_changes_read on public.whatsapp_order_changes;
create policy whatsapp_order_changes_read
  on public.whatsapp_order_changes for select to authenticated
  using (public.whatsapp_is_workspace_member(workspace_id));
grant select on public.whatsapp_ai_actions, public.whatsapp_order_changes to authenticated;

alter table public.orders
  add column if not exists whatsapp_last_change_at timestamptz,
  add column if not exists whatsapp_last_change_source text,
  add column if not exists whatsapp_last_change_summary text;
alter table public.orders
  drop constraint if exists orders_whatsapp_last_change_source_check;
alter table public.orders
  add constraint orders_whatsapp_last_change_source_check
    check (whatsapp_last_change_source is null or whatsapp_last_change_source in ('whatsapp','whatsapp_ai'));

-- Existing exact Reply Actions already stamp whatsapp_last_inbound_id. Preserve
-- that source of truth and make those non-AI changes visible in the same audit.
create or replace function public.trace_whatsapp_order_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_field text;
  v_old jsonb;
  v_new jsonb;
  v_summary text;
begin
  if new.whatsapp_last_inbound_id is not distinct from old.whatsapp_last_inbound_id
     or new.whatsapp_last_inbound_id is null then
    return new;
  end if;
  if new.address is distinct from old.address then
    v_field := 'address'; v_old := to_jsonb(old.address); v_new := to_jsonb(new.address);
    v_summary := 'Address changed via WhatsApp';
  elsif new.status is distinct from old.status then
    v_field := 'status'; v_old := to_jsonb(old.status); v_new := to_jsonb(new.status);
    v_summary := 'Status ' || coalesce(old.status, 'empty') || ' → ' || coalesce(new.status, 'empty') || ' via WhatsApp';
  else
    v_field := 'reply_action'; v_old := to_jsonb(old.whatsapp_last_action); v_new := to_jsonb(new.whatsapp_last_action);
    v_summary := 'Reply action processed via WhatsApp';
  end if;
  insert into public.whatsapp_order_changes(workspace_id,order_id,field_name,old_value,new_value,source,summary)
  values(new.workspace_id,new."Order ID",v_field,v_old,v_new,'whatsapp',v_summary);
  new.whatsapp_last_change_at := now();
  new.whatsapp_last_change_source := 'whatsapp';
  new.whatsapp_last_change_summary := v_summary;
  return new;
end;
$function$;

drop trigger if exists trace_whatsapp_order_update on public.orders;
create trigger trace_whatsapp_order_update
before update of whatsapp_last_inbound_id, status, address on public.orders
for each row execute function public.trace_whatsapp_order_update();
revoke execute on function public.trace_whatsapp_order_update() from public, anon, authenticated;

alter table public.order_items
  add column if not exists product_variant_id uuid references public.product_variants(id) on delete set null;

create or replace function public.queue_whatsapp_automations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_settings public.whatsapp_settings%rowtype;
  v_rule public.whatsapp_automation_rules%rowtype;
  v_new_status text;
  v_old_status text;
  v_phone text;
  v_order_json jsonb := to_jsonb(new);
  v_message_type text;
begin
  if new.workspace_id is null then return new; end if;

  select * into v_settings
  from public.whatsapp_settings
  where workspace_id = new.workspace_id and enabled = true and connection_status = 'ready';
  if not found then return new; end if;
  if lower(coalesce(v_order_json ->> 'whatsapp_opt_out', 'false')) = 'true' then return new; end if;

  v_phone := public.normalize_moroccan_whatsapp_phone(new.phone);
  if v_phone is null then
    insert into public.whatsapp_events (workspace_id, order_id, event_type, severity, message, metadata)
    values (new.workspace_id, new."Order ID", 'queue_skipped', 'warning', 'Invalid Moroccan mobile number', jsonb_build_object('phone', new.phone));
    return new;
  end if;
  if exists (select 1 from public.whatsapp_opt_outs o where o.workspace_id = new.workspace_id and o.normalized_phone = v_phone) then return new; end if;

  for v_rule in
    select * from public.whatsapp_automation_rules
    where workspace_id = new.workspace_id and enabled = true
  loop
    v_new_status := public.normalize_whatsapp_status(v_order_json ->> v_rule.status_source);
    v_old_status := case when tg_op = 'UPDATE' then public.normalize_whatsapp_status(to_jsonb(old) ->> v_rule.status_source) else null end;
    if v_new_status = any (select public.normalize_whatsapp_status(x) from unnest(v_rule.trigger_statuses) x)
       and (tg_op = 'INSERT' or v_old_status is distinct from v_new_status) then
      v_message_type := case when v_rule.event_type in ('confirmation','delivery') then v_rule.event_type else 'status_update' end;
      insert into public.whatsapp_queue (
        workspace_id, order_id, phone, normalized_phone, message_type,
        automation_event, rule_id, idempotency_key, channel_sequence,
        audio_recording_id, payload, status, scheduled_for, expires_at, attempts, max_attempts
      ) values (
        new.workspace_id, new."Order ID", new.phone, v_phone, v_message_type,
        v_rule.event_type, v_rule.id,
        new.workspace_id::text || ':' || new."Order ID"::text || ':' || v_rule.id::text || ':' || v_new_status,
        v_rule.channel_sequence, v_rule.audio_recording_id,
        jsonb_build_object('status_source', v_rule.status_source, 'status', v_new_status, 'rule_key', v_rule.rule_key),
        'pending',
        public.next_whatsapp_send_at(new.workspace_id, now() + make_interval(mins => v_rule.delay_minutes)),
        now() + make_interval(mins => v_rule.expires_after_minutes), 0, 3
      ) on conflict (idempotency_key) do nothing;
    end if;
  end loop;
  return new;
exception when others then
  insert into public.whatsapp_events (workspace_id, order_id, event_type, severity, message, metadata)
  values (new.workspace_id, new."Order ID", 'trigger_error', 'error', sqlerrm, jsonb_build_object('sqlstate', sqlstate));
  return new;
end;
$function$;

revoke execute on function public.queue_whatsapp_automations() from public, anon, authenticated;

-- Extend, rather than replace, the proven Phase-1 inbound RPC. The legacy RPC
-- remains responsible for confirm/callback/opt-out/address state. This handler
-- intercepts only the newer exact seller actions that the legacy `action`
-- compatibility column previously collapsed into callback.
create or replace function public.process_whatsapp_extended_reply_action(
  p_workspace_id uuid,
  p_provider_event_id text,
  p_remote_jid text,
  p_phone text,
  p_body text,
  p_quoted_message_id text default null,
  p_received_at timestamptz default now(),
  p_raw_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_phone text;
  v_body text := public.normalize_whatsapp_keyword(coalesce(p_body,''));
  v_action public.whatsapp_reply_actions%rowtype;
  v_job public.whatsapp_queue%rowtype;
  v_message_id uuid;
  v_target_status text;
  v_summary text;
begin
  v_phone := public.normalize_moroccan_whatsapp_phone(p_phone);
  if v_phone is null or nullif(p_provider_event_id,'') is null then return jsonb_build_object('handled',false); end if;

  -- Active conversation state remains owned by the existing Phase-1 function.
  if exists(select 1 from public.whatsapp_address_collection c where c.workspace_id=p_workspace_id and c.normalized_phone=v_phone and c.conversation_state='awaiting_address' and c.expires_at>now()) then
    return jsonb_build_object('handled',false);
  end if;

  select a.* into v_action from public.whatsapp_reply_actions a
  where a.workspace_id=p_workspace_id and a.enabled=true
    and a.action_type in ('set_order_status','cancel_order','add_note','reply_only')
    and exists(select 1 from unnest(a.keywords) keyword where public.normalize_whatsapp_keyword(keyword)=v_body)
  order by a.priority,a.created_at limit 1;
  if not found then return jsonb_build_object('handled',false); end if;

  insert into public.whatsapp_messages(workspace_id,phone,normalized_phone,remote_jid,direction,message_type,body,wa_message_id,provider_event_id,status,raw_payload,created_at)
  values(p_workspace_id,p_phone,v_phone,p_remote_jid,'inbound','reply',coalesce(p_body,''),p_provider_event_id,p_provider_event_id,'received',coalesce(p_raw_payload,'{}'::jsonb),p_received_at)
  on conflict (workspace_id,provider_event_id) where provider_event_id is not null do nothing returning id into v_message_id;
  if v_message_id is null then return jsonb_build_object('handled',true,'duplicate',true); end if;

  if p_quoted_message_id is not null then
    select q.* into v_job from public.whatsapp_queue q
    where q.workspace_id=p_workspace_id and q.wa_message_id=p_quoted_message_id and q.normalized_phone=v_phone
    order by q.sent_at desc nulls last limit 1;
  end if;
  if v_job.id is null then
    select q.* into v_job from public.whatsapp_queue q
    join public.whatsapp_settings s on s.workspace_id=q.workspace_id
    where q.workspace_id=p_workspace_id and q.normalized_phone=v_phone and q.status in ('sent','delivered','read')
      and q.sent_at>=now()-make_interval(hours=>s.reply_context_hours)
    order by q.sent_at desc nulls last limit 1;
  end if;
  if v_job.id is null then
    update public.whatsapp_messages set message_type='unmatched',reply_action=v_action.action_type,processed_at=now() where id=v_message_id;
    insert into public.whatsapp_manual_reviews(workspace_id,normalized_phone,provider_event_id,reason,inbound_body)
    values(p_workspace_id,v_phone,p_provider_event_id,'Exact Reply Action matched but no recent order context exists',p_body)
    on conflict (workspace_id,provider_event_id) do nothing;
    return jsonb_build_object('handled',true,'action','unmatched','manual_review',true,'reply_text',v_action.response_template);
  end if;

  if v_action.action_type='set_order_status' then
    select s.slug into v_target_status from public.order_statuses s
    where s.workspace_id=p_workspace_id and (lower(s.slug)=lower(v_action.target_status) or lower(s.name)=lower(v_action.target_status)) limit 1;
    if v_target_status is null then
      update public.whatsapp_messages set order_id=v_job.order_id,reply_action='invalid_status',processed_at=now() where id=v_message_id;
      return jsonb_build_object('handled',true,'action','invalid_status','order_id',v_job.order_id,'manual_review',true,'reply_text','This status is no longer available.');
    end if;
    update public.orders set status=v_target_status,whatsapp_replied_at=now(),whatsapp_last_action='status:'||v_target_status,
      whatsapp_last_inbound_id=v_message_id,updated_at=now()
    where workspace_id=p_workspace_id and "Order ID"=v_job.order_id;
    v_summary := 'Status changed to '||v_target_status||' via WhatsApp';
  elsif v_action.action_type='cancel_order' then
    update public.orders set status='cancelled',cancelled_at=coalesce(cancelled_at,now()),whatsapp_replied_at=now(),
      whatsapp_last_action='cancelled_by_whatsapp',whatsapp_last_inbound_id=v_message_id,updated_at=now()
    where workspace_id=p_workspace_id and "Order ID"=v_job.order_id;
    v_summary := 'Order cancelled via WhatsApp';
  elsif v_action.action_type='add_note' then
    update public.orders set notes=concat_ws(E'\n',nullif(notes,''),'WhatsApp: '||p_body),whatsapp_replied_at=now(),
      whatsapp_last_action='note_added_by_whatsapp',whatsapp_last_inbound_id=v_message_id,updated_at=now()
    where workspace_id=p_workspace_id and "Order ID"=v_job.order_id;
    v_summary := 'Note added via WhatsApp';
  else
    update public.orders set whatsapp_replied_at=now(),whatsapp_last_action='reply_only',whatsapp_last_inbound_id=v_message_id,updated_at=now()
    where workspace_id=p_workspace_id and "Order ID"=v_job.order_id;
  end if;

  update public.whatsapp_messages set order_id=v_job.order_id,message_type='reply',reply_action=v_action.action_type,processed_at=now() where id=v_message_id;
  insert into public.whatsapp_events(workspace_id,order_id,event_type,severity,message,metadata)
  values(p_workspace_id,v_job.order_id,'inbound_action_applied','info','Exact WhatsApp Reply Action applied',jsonb_build_object('action_id',v_action.id,'action_type',v_action.action_type,'summary',v_summary));
  return jsonb_build_object('handled',true,'duplicate',false,'action',v_action.action_type,'order_id',v_job.order_id,'reply_text',v_action.response_template,'summary',v_summary);
end;
$function$;

revoke all on function public.process_whatsapp_extended_reply_action(uuid,text,text,text,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.process_whatsapp_extended_reply_action(uuid,text,text,text,text,text,timestamptz,jsonb) to service_role;

create or replace function public.execute_whatsapp_ai_action(
  p_workspace_id uuid,
  p_order_id uuid,
  p_provider_event_id text,
  p_inbound_message_id uuid,
  p_decision jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_settings public.whatsapp_ai_settings%rowtype;
  v_order public.orders%rowtype;
  v_action_id uuid;
  v_intent text := lower(coalesce(p_decision ->> 'intent', 'unknown'));
  v_params jsonb := coalesce(p_decision -> 'parameters', '{}'::jsonb);
  v_permission text;
  v_reply text := nullif(btrim(coalesce(p_decision ->> 'reply_text', '')), '');
  v_summary text;
  v_field text;
  v_old jsonb;
  v_new jsonb;
  v_rows integer := 0;
  v_quantity integer;
  v_item public.order_items%rowtype;
  v_variant public.product_variants%rowtype;
  v_product public.products%rowtype;
  v_target_status text;
  v_callback_at timestamptz;
  v_agent_id uuid;
  v_question_type text := lower(coalesce(v_params ->> 'question_type', 'other'));
  v_city text;
  v_shipping numeric;
  v_provider text;
  v_reply_action public.whatsapp_reply_actions%rowtype;
  v_reply_action_id uuid;
  v_confidence numeric;
begin
  if nullif(p_provider_event_id, '') is null then
    return jsonb_build_object('applied', false, 'action', 'unknown', 'reply_text', 'I could not safely understand that message.');
  end if;

  select * into v_settings from public.whatsapp_ai_settings
  where workspace_id = p_workspace_id and enabled = true;
  if not found then return jsonb_build_object('applied', false, 'ai_disabled', true); end if;

  select * into v_order from public.orders
  where workspace_id = p_workspace_id and "Order ID" = p_order_id
  for update;
  if not found then return jsonb_build_object('applied', false, 'rejected', true, 'reply_text', 'I could not find the matching order.'); end if;

  begin v_reply_action_id := nullif(p_decision ->> 'matched_reply_action_id','')::uuid; exception when others then v_reply_action_id := null; end;
  if v_reply_action_id is not null then
    select * into v_reply_action from public.whatsapp_reply_actions
    where id=v_reply_action_id and workspace_id=p_workspace_id and enabled=true;
    if found then
      v_intent := case v_reply_action.action_type
        when 'confirm_order' then 'confirm_order'
        when 'set_order_status' then 'change_status'
        when 'request_callback' then 'callback'
        when 'cancel_order' then 'cancel_order'
        when 'add_note' then 'add_note'
        when 'reply_only' then 'question'
        else v_intent
      end;
      if v_reply_action.action_type='set_order_status' then
        v_params := v_params || jsonb_build_object('status',v_reply_action.target_status);
      end if;
      if v_reply_action.action_type='reply_only' and nullif(btrim(v_reply_action.response_template),'') is not null then
        v_reply := coalesce(v_reply,v_reply_action.response_template);
      end if;
    end if;
  end if;

  insert into public.whatsapp_ai_actions (
    workspace_id, order_id, provider_event_id, inbound_message_id, intent, decision
  ) values (
    p_workspace_id, p_order_id, p_provider_event_id, p_inbound_message_id, v_intent, p_decision
  ) on conflict (workspace_id, provider_event_id) do nothing
  returning id into v_action_id;
  if v_action_id is null then return jsonb_build_object('duplicate', true); end if;

  v_permission := case v_intent
    when 'confirm_order' then 'confirm_order'
    when 'callback' then 'set_callback'
    when 'change_address' then 'change_address'
    when 'change_variant' then 'change_variant'
    when 'change_color' then 'change_variant'
    when 'change_size' then 'change_size'
    when 'change_quantity' then 'change_quantity'
    when 'add_item' then 'add_item'
    when 'remove_item' then 'remove_item'
    when 'cancel_order' then 'cancel_order'
    when 'add_note' then 'add_note'
    when 'change_status' then 'change_status'
    when 'question' then 'answer_questions'
    else null
  end;

  begin v_confidence := coalesce((p_decision ->> 'confidence')::numeric,0); exception when others then v_confidence := 0; end;
  if lower(coalesce(p_decision ->> 'needs_clarification','false')) in ('true','1','yes')
     or v_confidence < 0.72
     or v_permission is null then
    update public.whatsapp_ai_actions set status='clarification', result=jsonb_build_object('reply_text', v_reply), completed_at=now() where id=v_action_id;
    return jsonb_build_object('applied', false, 'action', v_intent, 'reply_text', coalesce(v_reply, 'ممكن توضح ليا أكثر من فضلك؟'));
  end if;
  if coalesce((v_settings.permissions ->> v_permission)::boolean, false) is not true then
    update public.whatsapp_ai_actions set status='rejected', result=jsonb_build_object('permission', v_permission), completed_at=now() where id=v_action_id;
    return jsonb_build_object('applied', false, 'action', v_intent, 'reply_text', 'هاد العملية خاصها موافقة البائع. غادي نخلي الفريق يتاصل بيك.');
  end if;

  if v_intent = 'confirm_order' then
    v_field := 'status'; v_old := to_jsonb(v_order.status); v_new := to_jsonb('confirmed'::text);
    update public.orders set status='confirmed', confirmation_method='whatsapp', confirmed_at=coalesce(confirmed_at,now()), updated_at=now()
    where workspace_id=p_workspace_id and "Order ID"=p_order_id;
    v_summary := 'Order confirmed via WhatsApp AI';

  elsif v_intent = 'change_address' then
    if nullif(btrim(v_params ->> 'address'), '') is null then
      v_reply := coalesce(v_reply, 'صيفط ليا العنوان كامل من فضلك.');
    else
      v_field := 'address'; v_old := to_jsonb(v_order.address); v_new := to_jsonb(btrim(v_params ->> 'address'));
      update public.orders set address=btrim(v_params ->> 'address'), updated_at=now()
      where workspace_id=p_workspace_id and "Order ID"=p_order_id;
      v_summary := 'Address changed via WhatsApp AI';
    end if;

  elsif v_intent = 'callback' then
    begin v_callback_at := nullif(v_params ->> 'callback_at','')::timestamptz; exception when others then v_callback_at := null; end;
    if v_callback_at is null or v_callback_at <= now() then v_callback_at := now() + make_interval(mins => 15); end if;
    select o.assigned_to into v_agent_id from public.orders o where o.workspace_id=p_workspace_id and o."Order ID"=p_order_id;
    if v_agent_id is null then
      select pw.profile_id into v_agent_id from public.profile_workspaces pw
      join public.profiles p on p.id=pw.profile_id where pw.workspace_id=p_workspace_id
      order by case lower(coalesce(p.role,'')) when 'owner' then 0 when 'supervisor' then 1 else 2 end limit 1;
    end if;
    if v_agent_id is null then v_reply := coalesce(v_reply, 'غادي نخلي الفريق يتاصل بيك.');
    else
      insert into public.confirmation_callbacks(workspace_id,order_id,customer_id,agent_id,scheduled_at,note)
      values(p_workspace_id,p_order_id,v_order.customer_id,v_agent_id,v_callback_at,'Requested by WhatsApp AI');
      v_field := 'callback_at'; v_old := null; v_new := to_jsonb(v_callback_at); v_summary := 'Callback scheduled via WhatsApp AI';
      if v_reply_action.id is not null and nullif(v_reply_action.target_status,'') is not null then
        select s.slug into v_target_status from public.order_statuses s
        where s.workspace_id=p_workspace_id and (lower(s.slug)=lower(v_reply_action.target_status) or lower(s.name)=lower(v_reply_action.target_status)) limit 1;
        if v_target_status is not null then
          update public.orders set status=v_target_status,updated_at=now() where workspace_id=p_workspace_id and "Order ID"=p_order_id;
          v_summary := 'Callback scheduled and status changed to '||v_target_status||' via WhatsApp AI';
        end if;
      end if;
    end if;

  elsif v_intent = 'change_status' then
    select s.slug into v_target_status from public.order_statuses s
    where s.workspace_id=p_workspace_id and (lower(s.slug)=lower(v_params->>'status') or lower(s.name)=lower(v_params->>'status')) limit 1;
    if v_target_status is null then v_reply := coalesce(v_reply, 'هاد الحالة ما كايناش عند البائع. شنو بغيتي ندير بالضبط؟');
    else
      v_field := 'status'; v_old := to_jsonb(v_order.status); v_new := to_jsonb(v_target_status);
      update public.orders set status=v_target_status, updated_at=now() where workspace_id=p_workspace_id and "Order ID"=p_order_id;
      v_summary := 'Status changed via WhatsApp AI';
    end if;

  elsif v_intent in ('change_variant','change_color','change_size') then
    select oi.* into v_item from public.order_items oi
    where oi.workspace_id=p_workspace_id and oi.order_id=p_order_id
      and ((v_params->>'item_id') is null or oi.id::text=v_params->>'item_id')
    order by oi.id limit 1;
    if not found then v_reply := coalesce(v_reply, 'ما قدرتش نحدد المنتوج اللي بغيتي تبدل.');
    else
      select pv.* into v_variant from public.product_variants pv
      where pv.workspace_id=p_workspace_id and pv.product_id=v_item.product_id and pv.is_active=true
        and (pv.id::text=v_params->>'variant_id' or lower(pv.variant_value)=lower(v_params->>'value') or lower(pv.variant_name)=lower(v_params->>'value'))
      order by pv.id limit 1;
      if not found or coalesce(v_variant.stock,0) < v_item.quantity then v_reply := coalesce(v_reply, 'هاد الاختيار ما متوفرش دابا. عطيني اختيار آخر من فضلك.');
      else
        v_field := 'variant'; v_old := to_jsonb(coalesce(v_item.variant_name,v_order.product_variant)); v_new := to_jsonb(v_variant.variant_name);
        update public.order_items set product_variant_id=v_variant.id, variant_name=v_variant.variant_name, variant_options=v_variant.variant_value, unit_price=v_variant.price
        where workspace_id=p_workspace_id and id=v_item.id;
        update public.orders set product_variant=v_variant.variant_name, sku=v_variant.sku, variant_price=v_variant.price, updated_at=now()
        where workspace_id=p_workspace_id and "Order ID"=p_order_id;
        v_summary := coalesce(v_item.variant_name,v_order.product_variant,'Variant') || ' → ' || v_variant.variant_name || ' via WhatsApp AI';
      end if;
    end if;

  elsif v_intent = 'change_quantity' then
    begin v_quantity := (v_params->>'quantity')::integer; exception when others then v_quantity := null; end;
    select oi.* into v_item from public.order_items oi where oi.workspace_id=p_workspace_id and oi.order_id=p_order_id
      and ((v_params->>'item_id') is null or oi.id::text=v_params->>'item_id') order by oi.id limit 1;
    if v_quantity is null or v_quantity < 1 or v_quantity > 100 or not found then v_reply := coalesce(v_reply, 'شحال من وحدة بغيتي بالضبط؟');
    else
      select p.* into v_product from public.products p where p.workspace_id=p_workspace_id and p.id=v_item.product_id;
      if found and coalesce(v_product.stock,0) < v_quantity then v_reply := coalesce(v_reply, 'هاد الكمية ما متوفراش دابا.');
      else
        v_field := 'quantity'; v_old := to_jsonb(v_item.quantity); v_new := to_jsonb(v_quantity);
        update public.order_items set quantity=v_quantity where workspace_id=p_workspace_id and id=v_item.id;
        update public.orders o set quantity=v_quantity,
          total=(select coalesce(sum(oi.quantity*oi.unit_price),o.total) from public.order_items oi where oi.workspace_id=p_workspace_id and oi.order_id=p_order_id), updated_at=now()
        where o.workspace_id=p_workspace_id and o."Order ID"=p_order_id;
        v_summary := 'Quantity ' || v_item.quantity || ' → ' || v_quantity || ' via WhatsApp AI';
      end if;
    end if;

  elsif v_intent = 'add_item' then
    select p.* into v_product from public.products p where p.workspace_id=p_workspace_id and p.id::text=v_params->>'product_id' and p.status='active';
    begin v_quantity := greatest(1,(v_params->>'quantity')::integer); exception when others then v_quantity := 1; end;
    if not found or coalesce(v_product.stock,0) < v_quantity then v_reply := coalesce(v_reply, 'هاد المنتوج أو الكمية ما متوفراش دابا.');
    else
      insert into public.order_items(workspace_id,order_id,product_id,quantity,unit_price) values(p_workspace_id,p_order_id,v_product.id,v_quantity,v_product.price);
      update public.orders o set total=(select coalesce(sum(oi.quantity*oi.unit_price),o.total) from public.order_items oi where oi.workspace_id=p_workspace_id and oi.order_id=p_order_id),updated_at=now()
      where o.workspace_id=p_workspace_id and o."Order ID"=p_order_id;
      v_field:='items';v_old:=null;v_new:=jsonb_build_object('product_id',v_product.id,'quantity',v_quantity);v_summary:='Item added via WhatsApp AI';
    end if;

  elsif v_intent = 'remove_item' then
    delete from public.order_items where workspace_id=p_workspace_id and order_id=p_order_id and id::text=v_params->>'item_id' returning * into v_item;
    if not found then v_reply:=coalesce(v_reply,'ما قدرتش نحدد المنتوج اللي بغيتي تحيد.');
    else
      update public.orders o set total=(select coalesce(sum(oi.quantity*oi.unit_price),0) from public.order_items oi where oi.workspace_id=p_workspace_id and oi.order_id=p_order_id),updated_at=now()
      where o.workspace_id=p_workspace_id and o."Order ID"=p_order_id;
      v_field:='items';v_old:=to_jsonb(v_item);v_new:=null;v_summary:='Item removed via WhatsApp AI';
    end if;

  elsif v_intent = 'add_note' then
    if nullif(btrim(v_params->>'note'),'') is null then v_reply:=coalesce(v_reply,'شنو هي الملاحظة اللي بغيتي نزيد؟');
    else
      v_field:='notes';v_old:=to_jsonb(v_order.notes);v_new:=to_jsonb(concat_ws(E'\n',nullif(v_order.notes,''),btrim(v_params->>'note')));
      update public.orders set notes=v_new#>>'{}',updated_at=now() where workspace_id=p_workspace_id and "Order ID"=p_order_id;
      v_summary:='Note added via WhatsApp AI';
    end if;

  elsif v_intent = 'cancel_order' then
    v_field:='status';v_old:=to_jsonb(v_order.status);v_new:=to_jsonb('cancelled'::text);
    update public.orders set status='cancelled',cancelled_at=coalesce(cancelled_at,now()),updated_at=now() where workspace_id=p_workspace_id and "Order ID"=p_order_id;
    v_summary:='Order cancelled via WhatsApp AI';

  elsif v_intent = 'question' then
    if v_question_type = 'price' then v_reply := 'الثمن ديال الطلب هو ' || coalesce(v_order.total,0)::text || ' DH.';
    elsif v_question_type = 'tracking' then v_reply := 'حالة الطلب دابا: ' || coalesce(v_order.shipping_status,v_order.status,'غير محددة') || case when v_order.tracking_number is not null then '. رقم التتبع: '||v_order.tracking_number else '' end;
    elsif v_question_type = 'shipping_price' then
      v_city := coalesce(nullif(v_params->>'city',''),v_order.city,v_order.city_name);
      v_provider := lower(coalesce(v_order.shipping_provider,v_order.shipping_company,''));
      if v_provider='' then select lower(coalesce(w.carrier,'')) into v_provider from public.workspaces w where w.id=p_workspace_id; end if;
      if lower(coalesce(v_city,'')) in (lower(coalesce(v_order.city,'')),lower(coalesce(v_order.city_name,''))) then v_shipping:=v_order.shipping_cost; end if;
      if v_shipping is null then
        select c.delivered_price into v_shipping from public.shipping_provider_cities c
        where c.workspace_id=p_workspace_id and c.is_active=true
          and (v_provider='' or lower(c.provider_key)=v_provider)
          and (lower(c.provider_city_name)=lower(v_city) or exists(select 1 from unnest(c.aliases) a where lower(a)=lower(v_city)))
        order by case when lower(c.provider_key)=v_provider then 0 else 1 end limit 1;
      end if;
      if v_shipping is null and v_provider like '%forcelog%' then
        select c.delivered_price into v_shipping from public.forcelog_cities c
        where c.workspace_id=p_workspace_id and (lower(c.name)=lower(v_city) or lower(c.code)=lower(v_city)) limit 1;
      end if;
      if v_shipping is null and (v_provider='' or v_provider like '%ozon%') then
        select c.delivered_price into v_shipping from public.ozon_cities c where lower(c.name)=lower(v_city) or c.id=v_order.ozon_city_id order by (c.id=v_order.ozon_city_id) desc limit 1;
      end if;
      if v_shipping is null then v_reply:='ما قدرتش نلقى ثمن التوصيل المؤكد لهاد المدينة. شنو هي المدينة بالضبط؟';
      else v_reply:='ثمن التوصيل لـ '||v_city||' هو '||v_shipping::text||' DH.'; end if;
    elsif v_question_type = 'availability' then
      if exists(select 1 from public.product_variants pv join public.order_items oi on oi.product_id=pv.product_id and oi.workspace_id=pv.workspace_id where oi.workspace_id=p_workspace_id and oi.order_id=p_order_id and pv.is_active and pv.stock>0 and (lower(pv.variant_value)=lower(v_params->>'value') or lower(pv.variant_name)=lower(v_params->>'value'))) then
        v_reply:='نعم، هاد الاختيار متوفر دابا.';
      else v_reply:='ما لقيتش هاد الاختيار متوفر دابا. عطيني اختيار آخر من فضلك.'; end if;
    else v_reply:=coalesce(v_reply,'ممكن توضح ليا السؤال أكثر من فضلك؟'); end if;
  end if;

  if v_summary is not null then
    insert into public.whatsapp_order_changes(workspace_id,order_id,ai_action_id,field_name,old_value,new_value,source,summary)
    values(p_workspace_id,p_order_id,v_action_id,v_field,v_old,v_new,'whatsapp_ai',v_summary);
    update public.orders set whatsapp_last_change_at=now(),whatsapp_last_change_source='whatsapp_ai',whatsapp_last_change_summary=v_summary
    where workspace_id=p_workspace_id and "Order ID"=p_order_id;
  end if;
  if p_inbound_message_id is not null then
    update public.whatsapp_messages set reply_action='ai:'||v_intent,processed_at=now() where workspace_id=p_workspace_id and id=p_inbound_message_id;
  end if;
  update public.whatsapp_ai_actions set status=case when v_summary is null and v_intent<>'question' then 'clarification' else 'applied' end,
    result=jsonb_build_object('reply_text',v_reply,'summary',v_summary),completed_at=now() where id=v_action_id;
  return jsonb_build_object('applied',v_summary is not null or v_intent='question','action',v_intent,'order_id',p_order_id,'reply_text',coalesce(v_reply,case when v_summary is not null then 'تم التحديث بنجاح ✅' else 'ممكن توضح ليا أكثر من فضلك؟' end),'summary',v_summary);
end;
$function$;

revoke all on function public.execute_whatsapp_ai_action(uuid,uuid,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.execute_whatsapp_ai_action(uuid,uuid,text,uuid,jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
