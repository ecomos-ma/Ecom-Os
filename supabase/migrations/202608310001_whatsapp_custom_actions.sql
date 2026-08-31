-- =============================================================================
-- 202608310001: WhatsApp Custom Reply Actions + Full Inbound Processor Rewrite
-- =============================================================================
-- Goals:
--   1.  Expand whatsapp_reply_actions to support custom action types and
--       arbitrary target statuses (e.g. "Call me", "Wrong number", etc.)
--   2.  Add order provenance columns so WhatsApp actions are auditable.
--   3.  Rewrite process_whatsapp_inbound to a full action dispatcher.
--   4.  Protect STOP/opt_out from being overridden by custom rules.
--   5.  Keyword-collision trigger: two enabled rules cannot share a keyword.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. EXPAND whatsapp_reply_actions
-- ---------------------------------------------------------------------------

-- Drop the old hard CHECK on action column
do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.whatsapp_reply_actions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%action%'
  loop
    execute format('alter table public.whatsapp_reply_actions drop constraint %I', r.conname);
  end loop;
end $$;

-- Drop the old unique (workspace_id, action)
do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.whatsapp_reply_actions'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%action%'
  loop
    execute format('alter table public.whatsapp_reply_actions drop constraint %I', r.conname);
  end loop;
end $$;

-- Add new columns
alter table public.whatsapp_reply_actions
  add column if not exists name         text      not null default '',
  add column if not exists action_type  text      not null default 'reply_only',
  add column if not exists target_status text,
  add column if not exists priority     integer   not null default 20;

-- Migrate existing rows
update public.whatsapp_reply_actions
set
  name = case action
           when 'confirm'  then 'Confirm Order'
           when 'callback' then 'Callback'
           when 'opt_out'  then 'Stop / Opt Out'
           else initcap(action)
         end,
  action_type = case action
                  when 'confirm'  then 'confirm_order'
                  when 'callback' then 'request_callback'
                  when 'opt_out'  then 'opt_out'
                  else 'reply_only'
                end,
  priority = case action
               when 'opt_out'  then 0
               when 'confirm'  then 10
               when 'callback' then 20
               else 30
             end
where action_type = 'reply_only'
  and action in ('confirm','callback','opt_out');

-- Add new constraints
alter table public.whatsapp_reply_actions
  add constraint whatsapp_reply_actions_name_len
    check (char_length(trim(name)) between 1 and 120),
  add constraint whatsapp_reply_actions_action_type_check
    check (action_type in (
      'confirm_order','set_order_status','request_callback',
      'cancel_order','add_note','opt_out','reply_only'
    )),
  add constraint whatsapp_reply_actions_target_status_required
    check (action_type <> 'set_order_status' or (target_status is not null and trim(target_status) <> '')),
  add constraint whatsapp_reply_actions_priority_check
    check (priority between 0 and 999);

-- ---------------------------------------------------------------------------
-- 2. ORDER PROVENANCE COLUMNS
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists whatsapp_replied_at      timestamptz,
  add column if not exists whatsapp_last_action      text,
  add column if not exists whatsapp_last_inbound_id  uuid;

-- ---------------------------------------------------------------------------
-- 3. ENSURE WORKSPACE ORDER STATUS HELPER
-- ---------------------------------------------------------------------------
-- Creates a custom status for the workspace if it does not already exist.
-- Returns the normalized slug.

create or replace function public.ensure_workspace_order_status(
  p_workspace_id uuid,
  p_status_name  text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
begin
  v_slug := lower(trim(regexp_replace(p_status_name, '[^a-zA-Z0-9\u0600-\u06FF]+', '_', 'g')));

  -- Try the custom order_statuses table if it exists
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'order_statuses'
  ) then
    insert into public.order_statuses (workspace_id, name, slug, color, is_custom)
    values (p_workspace_id, p_status_name, v_slug, '#6366f1', true)
    on conflict do nothing;
  end if;

  return v_slug;
exception when others then
  -- Non-fatal: if the table structure differs we still return the slug
  return v_slug;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. KEYWORD-COLLISION TRIGGER
-- ---------------------------------------------------------------------------
-- Prevents two ENABLED rules in the same workspace from sharing a keyword.

create or replace function public.whatsapp_check_keyword_collision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kw text;
  v_conflict_id uuid;
begin
  if not new.enabled then
    return new;
  end if;

  foreach v_kw in array new.keywords
  loop
    select id into v_conflict_id
    from public.whatsapp_reply_actions
    where workspace_id = new.workspace_id
      and id <> new.id
      and enabled = true
      and exists (
        select 1 from unnest(keywords) k
        where lower(trim(k)) = lower(trim(v_kw))
      )
    limit 1;

    if found then
      raise exception
        'Keyword conflict: keyword "%" is already used by another enabled reply action (id: %)',
        v_kw, v_conflict_id
        using errcode = 'unique_violation';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists whatsapp_reply_actions_keyword_collision on public.whatsapp_reply_actions;
create trigger whatsapp_reply_actions_keyword_collision
  before insert or update on public.whatsapp_reply_actions
  for each row execute function public.whatsapp_check_keyword_collision();

-- ---------------------------------------------------------------------------
-- 5. REWRITE process_whatsapp_inbound — FULL ACTION DISPATCHER
-- ---------------------------------------------------------------------------

create or replace function public.process_whatsapp_inbound(
  p_workspace_id      uuid,
  p_provider_event_id text,
  p_remote_jid        text,
  p_phone             text,
  p_body              text,
  p_quoted_message_id text                default null,
  p_received_at       timestamptz         default now(),
  p_raw_payload       jsonb               default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone        text;
  v_body_norm    text   := lower(trim(coalesce(p_body, '')));
  v_action_row   public.whatsapp_reply_actions%rowtype;
  v_job          public.whatsapp_queue%rowtype;
  v_candidates   uuid[];
  v_context_hours integer := 72;
  v_reply        text;
  v_agent_id     uuid;
  v_message_id   uuid;
  v_status_slug  text;
begin
  -- ── 0. Validate workspace ────────────────────────────────────────────────
  if not exists (select 1 from public.workspaces where id = p_workspace_id) then
    raise exception 'Unknown workspace';
  end if;

  -- ── 1. Normalize phone ───────────────────────────────────────────────────
  v_phone := public.normalize_moroccan_whatsapp_phone(p_phone);
  if v_phone is null then
    raise exception 'Invalid Moroccan mobile number: %', p_phone;
  end if;

  -- ── 2. Persist inbound message (idempotent) ───────────────────────────────
  insert into public.whatsapp_messages (
    workspace_id, phone, normalized_phone, remote_jid,
    direction, message_type, body, wa_message_id,
    provider_event_id, status, raw_payload, created_at
  ) values (
    p_workspace_id, p_phone, v_phone, p_remote_jid,
    'inbound', 'reply', p_body, p_provider_event_id,
    p_provider_event_id, 'received',
    coalesce(p_raw_payload, '{}'), p_received_at
  )
  on conflict (workspace_id, provider_event_id)
    where provider_event_id is not null
  do nothing
  returning id into v_message_id;

  -- Duplicate inbound event
  if v_message_id is null then
    return jsonb_build_object('duplicate', true);
  end if;

  -- ── 3. Log inbound_received event ─────────────────────────────────────────
  insert into public.whatsapp_events (
    workspace_id, event_type, severity, message, metadata
  ) values (
    p_workspace_id, 'inbound_received', 'info',
    'Customer inbound WhatsApp message received',
    jsonb_build_object(
      'message_id',         v_message_id,
      'provider_event_id',  p_provider_event_id,
      'phone',              v_phone,
      'body_preview',       left(p_body, 100)
    )
  );

  -- ── 4. Match reply action (opt_out first, then by priority) ───────────────
  select *
  into v_action_row
  from public.whatsapp_reply_actions
  where workspace_id = p_workspace_id
    and enabled = true
    and exists (
      select 1
      from unnest(keywords) k
      where lower(trim(k)) = v_body_norm
    )
  order by priority asc
  limit 1;

  -- ── 5. OPT-OUT is always protected (priority=0) ───────────────────────────
  if found and v_action_row.action_type = 'opt_out' then
    -- Record opt-out
    insert into public.whatsapp_opt_outs (workspace_id, normalized_phone)
    values (p_workspace_id, v_phone)
    on conflict (workspace_id, normalized_phone)
    do update set opted_out_at = now(), source = 'customer_reply';

    -- Cancel pending automation for this phone
    update public.whatsapp_queue
    set status    = 'cancelled',
        last_error = 'Customer opted out',
        error_code = 'opt_out',
        updated_at = now()
    where workspace_id    = p_workspace_id
      and normalized_phone = v_phone
      and status          = 'pending';

    -- Flag all orders for this phone
    update public.orders
    set whatsapp_opt_out = true
    where workspace_id = p_workspace_id
      and public.normalize_moroccan_whatsapp_phone(phone) = v_phone;

    -- Tag the message
    update public.whatsapp_messages
    set message_type  = 'opt_out',
        reply_action  = 'opt_out',
        processed_at = now()
    where id = v_message_id;

    return jsonb_build_object(
      'duplicate',   false,
      'action',      'opt_out',
      'reply_text',  v_action_row.response_template
    );
  end if;

  -- ── 6. Locate the related order ───────────────────────────────────────────
  -- 6a. Via quoted provider message ID (most reliable)
  if p_quoted_message_id is not null then
    select q.*
    into v_job
    from public.whatsapp_queue q
    where q.workspace_id    = p_workspace_id
      and q.wa_message_id   = p_quoted_message_id
      and q.normalized_phone = v_phone
    order by q.sent_at desc nulls last
    limit 1;
  end if;

  -- 6b. Via recent sent confirmation in context window
  if v_job.id is null then
    select coalesce(array_agg(distinct q.order_id order by q.order_id), '{}')
    into v_candidates
    from public.whatsapp_queue q
    join public.whatsapp_settings s on s.workspace_id = q.workspace_id
    where q.workspace_id    = p_workspace_id
      and q.normalized_phone = v_phone
      and q.automation_event = 'confirmation'
      and q.status           in ('sent', 'delivered', 'read')
      and q.sent_at          >= now() - make_interval(hours => s.reply_context_hours);

    if cardinality(v_candidates) = 1 then
      select q.*
      into v_job
      from public.whatsapp_queue q
      where q.workspace_id    = p_workspace_id
        and q.order_id        = v_candidates[1]
        and q.normalized_phone = v_phone
      order by q.sent_at desc nulls last
      limit 1;
    end if;
  end if;

  -- 6c. If still no match → manual review
  if v_job.id is null then
    insert into public.whatsapp_manual_reviews (
      workspace_id, normalized_phone, provider_event_id,
      reason, inbound_body, candidate_order_ids
    ) values (
      p_workspace_id, v_phone, p_provider_event_id,
      case
        when cardinality(v_candidates) = 0 then 'No matching confirmation message'
        else 'Ambiguous phone-to-order match'
      end,
      p_body,
      coalesce(v_candidates, '{}')
    )
    on conflict (workspace_id, provider_event_id) do nothing;

    update public.whatsapp_messages
    set message_type = 'unmatched',
        processed_at = now()
    where id = v_message_id;

    return jsonb_build_object(
      'duplicate',      false,
      'action',         coalesce(v_action_row.action_type, 'unmatched'),
      'manual_review',  true,
      'reply_text',     case when found then v_action_row.response_template else null end
    );
  end if;

  -- ── 7. Tag message with order and action ──────────────────────────────────
  update public.whatsapp_messages
  set order_id     = v_job.order_id,
      message_type = coalesce(v_action_row.action_type, 'unmatched'),
      reply_action  = v_action_row.action_type,
      processed_at = now()
  where id = v_message_id;

  -- If no action matched, store unmatched and return
  if not found or v_action_row.id is null then
    insert into public.whatsapp_manual_reviews (
      workspace_id, order_id, normalized_phone, provider_event_id,
      reason, inbound_body
    ) values (
      p_workspace_id, v_job.order_id, v_phone, p_provider_event_id,
      'No reply action matched for this message', p_body
    )
    on conflict (workspace_id, provider_event_id) do nothing;

    return jsonb_build_object(
      'duplicate',     false,
      'action',        'unmatched',
      'order_id',      v_job.order_id,
      'manual_review', true
    );
  end if;

  -- ── 8. ACTION DISPATCHER ─────────────────────────────────────────────────

  if v_action_row.action_type = 'confirm_order' then
    -- ── 8a. Confirm order ─────────────────────────────────────────────────
    update public.orders
    set status              = 'confirmed',
        confirmation_status = 'confirmed',
        confirmation_method = 'whatsapp',
        confirmed_at        = coalesce(confirmed_at, now()),
        whatsapp_replied_at = now(),
        whatsapp_last_action = 'confirm_order',
        whatsapp_last_inbound_id = v_message_id
    where "Order ID" = v_job.order_id and workspace_id = p_workspace_id;

  elsif v_action_row.action_type = 'set_order_status' then
    -- ── 8b. Set custom order status ───────────────────────────────────────
    v_status_slug := public.ensure_workspace_order_status(
      p_workspace_id,
      v_action_row.target_status
    );

    update public.orders
    set status                  = v_action_row.target_status,
        whatsapp_replied_at     = now(),
        whatsapp_last_action    = 'set_order_status:' || v_action_row.target_status,
        whatsapp_last_inbound_id = v_message_id
    where "Order ID" = v_job.order_id and workspace_id = p_workspace_id;

  elsif v_action_row.action_type = 'request_callback' then
    -- ── 8c. Callback ──────────────────────────────────────────────────────
    update public.orders
    set status                  = 'scheduled',
        whatsapp_replied_at     = now(),
        whatsapp_last_action    = 'request_callback',
        whatsapp_last_inbound_id = v_message_id
    where "Order ID" = v_job.order_id and workspace_id = p_workspace_id;

    -- Assign to agent
    select o.assigned_to into v_agent_id
    from public.orders o
    where o."Order ID" = v_job.order_id and o.workspace_id = p_workspace_id;

    if v_agent_id is null then
      select pw.profile_id into v_agent_id
      from public.profile_workspaces pw
      join public.profiles p on p.id = pw.profile_id
      where pw.workspace_id = p_workspace_id
      order by case lower(coalesce(p.role, ''))
                 when 'owner'      then 0
                 when 'supervisor' then 1
                 else 2
               end
      limit 1;
    end if;

    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'confirmation_callbacks'
    ) then
      if v_agent_id is not null then
        insert into public.confirmation_callbacks (
          workspace_id, order_id, customer_id, agent_id, scheduled_at, note
        )
        select p_workspace_id,
               o."Order ID",
               o.customer_id,
               v_agent_id,
               now() + make_interval(mins => s.callback_delay_minutes),
               'Requested from WhatsApp reply'
        from public.orders o
        join public.whatsapp_settings s on s.workspace_id = o.workspace_id
        where o."Order ID" = v_job.order_id and o.workspace_id = p_workspace_id;
      else
        insert into public.whatsapp_manual_reviews (
          workspace_id, order_id, normalized_phone, provider_event_id,
          reason, inbound_body
        ) values (
          p_workspace_id, v_job.order_id, v_phone, p_provider_event_id,
          'Callback requested but no workspace agent is available', p_body
        )
        on conflict (workspace_id, provider_event_id) do nothing;
      end if;
    end if;

  elsif v_action_row.action_type = 'cancel_order' then
    -- ── 8d. Cancel order ─────────────────────────────────────────────────
    update public.orders
    set status                  = 'cancelled',
        whatsapp_replied_at     = now(),
        whatsapp_last_action    = 'cancel_order',
        whatsapp_last_inbound_id = v_message_id
    where "Order ID" = v_job.order_id and workspace_id = p_workspace_id;

    -- Cancel any pending automation for this order
    update public.whatsapp_queue
    set status    = 'cancelled',
        last_error = 'Order cancelled by customer via WhatsApp',
        error_code = 'order_cancelled',
        updated_at = now()
    where workspace_id = p_workspace_id
      and order_id     = v_job.order_id
      and status       = 'pending';

  elsif v_action_row.action_type = 'add_note' then
    -- ── 8e. Add note to order ────────────────────────────────────────────
    -- Uses whatsapp_events as a lightweight note store; also updates provenance
    update public.orders
    set whatsapp_replied_at      = now(),
        whatsapp_last_action     = 'add_note',
        whatsapp_last_inbound_id = v_message_id
    where "Order ID" = v_job.order_id and workspace_id = p_workspace_id;

    insert into public.whatsapp_events (
      workspace_id, order_id, event_type, severity, message, metadata
    ) values (
      p_workspace_id, v_job.order_id, 'customer_note', 'info',
      'Customer note from WhatsApp reply',
      jsonb_build_object(
        'body',             p_body,
        'inbound_id',       v_message_id,
        'reply_action_id',  v_action_row.id
      )
    );

  end if;
  -- 'reply_only' intentionally has no order mutation

  -- ── 9. Audit event ────────────────────────────────────────────────────────
  if v_action_row.action_type not in ('reply_only') then
    insert into public.whatsapp_events (
      workspace_id, order_id, event_type, severity, message, metadata
    ) values (
      p_workspace_id, v_job.order_id,
      'inbound_action_applied', 'info',
      'WhatsApp reply action applied to order',
      jsonb_build_object(
        'action_type',      v_action_row.action_type,
        'target_status',    v_action_row.target_status,
        'reply_action_id',  v_action_row.id,
        'inbound_id',       v_message_id,
        'source',           'whatsapp'
      )
    );
  end if;

  -- ── 10. Return ────────────────────────────────────────────────────────────
  return jsonb_build_object(
    'duplicate',      false,
    'action',         v_action_row.action_type,
    'order_id',       v_job.order_id,
    'reply_text',     v_action_row.response_template,
    'reply_action_id', v_action_row.id
  );
end;
$$;

-- Revoke/grant unchanged
revoke all on function public.process_whatsapp_inbound(uuid, text, text, text, text, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.process_whatsapp_inbound(uuid, text, text, text, text, text, timestamptz, jsonb)
  to service_role;

-- Grant insert on new events for service_role (already service-role bypasses RLS but be explicit)
grant insert on public.whatsapp_events to service_role;
grant select, insert on public.whatsapp_manual_reviews to service_role;
grant insert on public.whatsapp_opt_outs to service_role;

-- Grant on ensure_workspace_order_status
revoke all on function public.ensure_workspace_order_status(uuid, text) from public, anon;
grant execute on function public.ensure_workspace_order_status(uuid, text) to service_role;

commit;
