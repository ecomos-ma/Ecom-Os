-- =============================================================================
-- 202608310002: WhatsApp Custom Reply Actions v2 — CORRECTED
-- Replaces 202608310001 with bug fixes:
--   • Removed reference to non-existent `confirmation_status` column
--   • Creates `order_statuses` table if it doesn't exist
--   • Fixed PostgreSQL FOUND variable overwrite bug in inbound RPC
--   • Added digit-emoji normalization (1️⃣ → 1)
--   • Added `v_action_matched boolean` flag for correct unmatched detection
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. HELPER: Normalize digit emojis so 1️⃣ matches "1" etc.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_whatsapp_keyword(p_text text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  select lower(trim(
    -- Replace keycap digit emojis (1️⃣ through 9️⃣) with plain digits
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        coalesce(p_text, ''),
                        '0️⃣', '0', 'g'),
                      '1️⃣', '1', 'g'),
                    '2️⃣', '2', 'g'),
                  '3️⃣', '3', 'g'),
                '4️⃣', '4', 'g'),
              '5️⃣', '5', 'g'),
            '6️⃣', '6', 'g'),
          '7️⃣', '7', 'g'),
        '8️⃣', '8', 'g'),
      '9️⃣', '9', 'g')
  ));
$$;

-- ---------------------------------------------------------------------------
-- 2. EXPAND whatsapp_reply_actions
-- ---------------------------------------------------------------------------

-- Drop the old hard CHECK on action column (all existing constraints with 'action')
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
    execute format('alter table public.whatsapp_reply_actions drop constraint if exists %I', r.conname);
  end loop;
end $$;

-- Drop old unique (workspace_id, action)
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
    execute format('alter table public.whatsapp_reply_actions drop constraint if exists %I', r.conname);
  end loop;
end $$;

-- Add new columns (idempotent)
alter table public.whatsapp_reply_actions
  add column if not exists name          text    not null default '',
  add column if not exists action_type   text    not null default 'reply_only',
  add column if not exists target_status text,
  add column if not exists priority      integer not null default 20;

-- Migrate existing rows that haven't been migrated yet
update public.whatsapp_reply_actions
set
  name = case action
           when 'confirm'  then 'Confirm Order'
           when 'callback' then 'Callback'
           when 'opt_out'  then 'Stop / Opt Out'
           else initcap(replace(action, '_', ' '))
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
  and action in ('confirm', 'callback', 'opt_out');

-- Add constraints (drop first to be safe)
alter table public.whatsapp_reply_actions
  drop constraint if exists whatsapp_reply_actions_name_len,
  drop constraint if exists whatsapp_reply_actions_action_type_check,
  drop constraint if exists whatsapp_reply_actions_target_status_required,
  drop constraint if exists whatsapp_reply_actions_priority_check;

alter table public.whatsapp_reply_actions
  add constraint whatsapp_reply_actions_name_len
    check (char_length(trim(name)) between 1 and 120),
  add constraint whatsapp_reply_actions_action_type_check
    check (action_type in (
      'confirm_order', 'set_order_status', 'request_callback',
      'cancel_order', 'add_note', 'opt_out', 'reply_only'
    )),
  add constraint whatsapp_reply_actions_target_status_required
    check (
      action_type <> 'set_order_status'
      or (target_status is not null and trim(target_status) <> '')
    ),
  add constraint whatsapp_reply_actions_priority_check
    check (priority between 0 and 999);

-- ---------------------------------------------------------------------------
-- 3. ORDER PROVENANCE COLUMNS (safe ADD IF NOT EXISTS)
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists whatsapp_replied_at       timestamptz,
  add column if not exists whatsapp_last_action       text,
  add column if not exists whatsapp_last_inbound_id   uuid;

-- ---------------------------------------------------------------------------
-- 4. WORKSPACE ORDER STATUSES TABLE (create if not exists)
-- ---------------------------------------------------------------------------

create table if not exists public.order_statuses (
  id           uuid    primary key default gen_random_uuid(),
  workspace_id uuid    not null references public.workspaces(id) on delete cascade,
  name         text    not null,
  slug         text    not null,
  color        text    not null default '#6366f1',
  is_default   boolean not null default false,
  is_custom    boolean not null default false,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, slug)
);

create index if not exists order_statuses_workspace_idx
  on public.order_statuses (workspace_id, position);

-- Enable RLS
alter table public.order_statuses enable row level security;

drop policy if exists order_statuses_read on public.order_statuses;
drop policy if exists order_statuses_manage on public.order_statuses;

create policy order_statuses_read on public.order_statuses
  for select to authenticated
  using (public.whatsapp_is_workspace_member(workspace_id));

create policy order_statuses_manage on public.order_statuses
  for all to authenticated
  using (public.whatsapp_can_manage(workspace_id))
  with check (public.whatsapp_can_manage(workspace_id));

grant select, insert, update, delete on public.order_statuses to authenticated;
grant all on public.order_statuses to service_role;

-- Seed built-in statuses for workspaces that have WhatsApp settings
insert into public.order_statuses (workspace_id, name, slug, color, is_default, is_custom, position)
select
  s.workspace_id,
  v.name,
  v.slug,
  v.color,
  v.is_default,
  false,
  v.position
from public.whatsapp_settings s
cross join (values
  ('Pending',    'pending',    '#f59e0b', true,  0),
  ('Confirmed',  'confirmed',  '#10b981', false, 1),
  ('No Answer',  'no_answer',  '#6b7280', false, 2),
  ('Reported',   'reported',   '#f97316', false, 3),
  ('Cancelled',  'cancelled',  '#ef4444', false, 4)
) as v(name, slug, color, is_default, position)
where not exists (
  select 1 from public.order_statuses o 
  where o.workspace_id = s.workspace_id and o.slug = v.slug
);

-- ---------------------------------------------------------------------------
-- 5. ENSURE WORKSPACE ORDER STATUS HELPER
-- ---------------------------------------------------------------------------

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
  if p_status_name is null or trim(p_status_name) = '' then
    return null;
  end if;

  -- Create a URL-safe slug (preserve Arabic by encoding non-ASCII as underscores for slug)
  v_slug := lower(trim(regexp_replace(p_status_name, '[^a-zA-Z0-9]+', '_', 'g')));
  if v_slug = '' or v_slug = '_' then
    v_slug := 'custom_' || encode(digest(p_status_name, 'md5'), 'hex');
  end if;

  if not exists (select 1 from public.order_statuses where workspace_id = p_workspace_id and slug = v_slug) then
    insert into public.order_statuses (
      workspace_id, name, slug, color, is_custom, position
    )
    values (
      p_workspace_id, p_status_name, v_slug, '#6366f1', true,
      (select coalesce(max(position), 0) + 1 from public.order_statuses where workspace_id = p_workspace_id)
    );
  end if;

  return v_slug;
exception when others then
  return v_slug;
end;
$$;

revoke all on function public.ensure_workspace_order_status(uuid, text) from public, anon;
grant execute on function public.ensure_workspace_order_status(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. KEYWORD-COLLISION TRIGGER
-- ---------------------------------------------------------------------------

create or replace function public.whatsapp_check_keyword_collision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kw         text;
  v_kw_norm    text;
  v_conflict_id uuid;
begin
  if not new.enabled then
    return new;
  end if;

  foreach v_kw in array new.keywords
  loop
    v_kw_norm := public.normalize_whatsapp_keyword(v_kw);

    select id into v_conflict_id
    from public.whatsapp_reply_actions
    where  workspace_id = new.workspace_id
      and  id           <> new.id
      and  enabled      = true
      and  exists (
             select 1
             from   unnest(keywords) k
             where  public.normalize_whatsapp_keyword(k) = v_kw_norm
           )
    limit 1;

    if found then
      raise exception
        'Keyword conflict: keyword "%" (normalized: "%") is already used by another enabled reply action (id: %)',
        v_kw, v_kw_norm, v_conflict_id
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
-- 7. REWRITE process_whatsapp_inbound — CORRECTED FULL ACTION DISPATCHER
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
  v_phone         text;
  v_body_norm     text   := public.normalize_whatsapp_keyword(coalesce(p_body, ''));
  v_action_row    public.whatsapp_reply_actions%rowtype;
  v_action_matched boolean := false;  -- explicit flag, avoids FOUND overwrite issue
  v_job           public.whatsapp_queue%rowtype;
  v_job_found     boolean := false;
  v_candidates    uuid[];
  v_context_hours integer := 72;
  v_message_id    uuid;
  v_agent_id      uuid;
  v_status_slug   text;
  v_rows_affected integer;
begin
  -- ── 0. Validate workspace ────────────────────────────────────────────────
  if not exists (select 1 from public.workspaces where id = p_workspace_id) then
    raise exception 'Unknown workspace: %', p_workspace_id;
  end if;

  -- ── 1. Normalize phone ───────────────────────────────────────────────────
  v_phone := public.normalize_moroccan_whatsapp_phone(p_phone);
  if v_phone is null then
    raise exception 'Invalid Moroccan mobile number: %', p_phone;
  end if;

  -- ── 2. Persist inbound message (idempotent) ───────────────────────────────
  select id into v_message_id
  from public.whatsapp_messages
  where workspace_id = p_workspace_id
    and provider_event_id = p_provider_event_id
  limit 1;

  if found then
    -- True duplicate: provider delivered the same event twice
    return jsonb_build_object('duplicate', true);
  end if;

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
  returning id into v_message_id;

  -- ── 3. Log inbound_received ───────────────────────────────────────────────
  insert into public.whatsapp_events (
    workspace_id, event_type, severity, message, metadata
  ) values (
    p_workspace_id, 'inbound_received', 'info',
    'Customer inbound WhatsApp message received',
    jsonb_build_object(
      'message_id',        v_message_id,
      'provider_event_id', p_provider_event_id,
      'phone',             v_phone,
      'body_preview',      left(p_body, 100)
    )
  );

  -- ── 4. Match reply action (opt_out has lowest priority number = runs first)
  select * into v_action_row
  from public.whatsapp_reply_actions
  where workspace_id = p_workspace_id
    and enabled      = true
    and exists (
      select 1
      from   unnest(keywords) k
      where  public.normalize_whatsapp_keyword(k) = v_body_norm
    )
  order by priority asc
  limit 1;

  if found then
    v_action_matched := true;
  end if;

  -- ── 5. OPT-OUT — always processed immediately, no order needed ────────────
  if v_action_matched and v_action_row.action_type = 'opt_out' then
    update public.whatsapp_opt_outs
    set opted_out_at = now(), source = 'customer_reply'
    where workspace_id = p_workspace_id
      and normalized_phone = v_phone;

    if not found then
      insert into public.whatsapp_opt_outs (workspace_id, normalized_phone, source)
      values (p_workspace_id, v_phone, 'customer_reply');
    end if;

    update public.orders
    set whatsapp_opt_out = true
    where workspace_id = p_workspace_id
      and public.normalize_moroccan_whatsapp_phone(phone) = v_phone;

    update public.whatsapp_queue
    set status     = 'cancelled',
        last_error = 'Customer opted out',
        error_code = 'opt_out',
        updated_at = now()
    where workspace_id    = p_workspace_id
      and normalized_phone = v_phone
      and status          = 'pending';

    update public.whatsapp_messages
    set message_type = 'opt_out',
        reply_action = 'opt_out',
        processed_at = now()
    where id = v_message_id;

    return jsonb_build_object(
      'duplicate',  false,
      'action',     'opt_out',
      'reply_text', v_action_row.response_template
    );
  end if;

  -- ── 6. Resolve related order ─────────────────────────────────────────────
  -- 6a. Via quoted provider message ID (most reliable)
  if p_quoted_message_id is not null then
    select q.* into v_job
    from public.whatsapp_queue q
    where q.workspace_id    = p_workspace_id
      and q.wa_message_id   = p_quoted_message_id
      and q.normalized_phone = v_phone
    order by q.sent_at desc nulls last
    limit 1;

    if found then
      v_job_found := true;
    end if;
  end if;

  -- 6b. Via recent confirmation context
  if not v_job_found then
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
      select q.* into v_job
      from public.whatsapp_queue q
      where q.workspace_id    = p_workspace_id
        and q.order_id        = v_candidates[1]
        and q.normalized_phone = v_phone
      order by q.sent_at desc nulls last
      limit 1;

      if found then
        v_job_found := true;
      end if;
    end if;
  end if;

  -- 6c. No order match → manual review
  if not v_job_found then
    if not exists (
      select 1 from public.whatsapp_manual_reviews
      where workspace_id = p_workspace_id and provider_event_id = p_provider_event_id
    ) then
      insert into public.whatsapp_manual_reviews (
        workspace_id, normalized_phone, provider_event_id,
        reason, inbound_body, candidate_order_ids
      ) values (
        p_workspace_id, v_phone, p_provider_event_id,
        case
          when cardinality(coalesce(v_candidates, '{}')) = 0
            then 'No matching confirmation message'
          else 'Ambiguous phone-to-order match'
        end,
        p_body,
        coalesce(v_candidates, '{}')
      );
    end if;

    update public.whatsapp_messages
    set message_type = 'unmatched',
        processed_at = now()
    where id = v_message_id;

    return jsonb_build_object(
      'duplicate',     false,
      'action',        case when v_action_matched then v_action_row.action_type else 'unmatched' end,
      'manual_review', true,
      'reply_text',    case when v_action_matched then v_action_row.response_template else null end
    );
  end if;

  -- ── 7. We have an order. Tag the inbound message. ─────────────────────────
  update public.whatsapp_messages
  set order_id     = v_job.order_id,
      message_type = case when v_action_matched then v_action_row.action_type else 'unmatched' end,
      reply_action  = case when v_action_matched then v_action_row.action_type else null end,
      processed_at = now()
  where id = v_message_id;

  -- ── 8. If NO action matched (order found, but no reply rule) → manual ─────
  if not v_action_matched then
    if not exists (
      select 1 from public.whatsapp_manual_reviews
      where workspace_id = p_workspace_id and provider_event_id = p_provider_event_id
    ) then
      insert into public.whatsapp_manual_reviews (
        workspace_id, order_id, normalized_phone, provider_event_id,
        reason, inbound_body
      ) values (
        p_workspace_id, v_job.order_id, v_phone, p_provider_event_id,
        'No reply action matched for this message', p_body
      );
    end if;

    return jsonb_build_object(
      'duplicate',     false,
      'action',        'unmatched',
      'order_id',      v_job.order_id,
      'manual_review', true
    );
  end if;

  -- ── 9. ACTION DISPATCHER ─────────────────────────────────────────────────
  if v_action_row.action_type = 'confirm_order' then
    -- Confirm order
    update public.orders
    set status                   = 'confirmed',
        confirmed_at             = coalesce(confirmed_at, now()),
        whatsapp_replied_at      = now(),
        whatsapp_last_action     = 'confirm_order',
        whatsapp_last_inbound_id = v_message_id
    where id           = v_job.order_id
      and workspace_id = p_workspace_id;

    get diagnostics v_rows_affected = row_count;
    if v_rows_affected > 0 then
      v_action_matched := true;
    else
      v_action_row.response_template := null;
    end if;

  elsif v_action_row.action_type = 'set_order_status' then
    -- Custom order status
    v_status_slug := public.ensure_workspace_order_status(
      p_workspace_id,
      v_action_row.target_status
    );

    update public.orders
    set status                   = v_status_slug,
        whatsapp_replied_at      = now(),
        whatsapp_last_action     = 'set_order_status:' || v_action_row.target_status,
        whatsapp_last_inbound_id = v_message_id
    where id           = v_job.order_id
      and workspace_id = p_workspace_id;

    get diagnostics v_rows_affected = row_count;
    if v_rows_affected > 0 then
      v_action_matched := true;
    else
      v_action_row.response_template := null;
    end if;

  elsif v_action_row.action_type = 'request_callback' then
    update public.orders
    set status                   = 'pas de reponse',
        whatsapp_replied_at      = now(),
        whatsapp_last_action     = 'request_callback',
        whatsapp_last_inbound_id = v_message_id
    where id           = v_job.order_id
      and workspace_id = p_workspace_id;

    get diagnostics v_rows_affected = row_count;
    if v_rows_affected > 0 then
      v_action_matched := true;
      if exists (
        select 1 from information_schema.tables
        where table_schema = 'public' and table_name = 'confirmation_callbacks'
      ) then
        insert into public.confirmation_callbacks (
          workspace_id, order_id, customer_id, scheduled_at, note
        )
        select p_workspace_id, o.id, o.customer_id,
               now() + make_interval(mins => s.callback_delay_minutes),
               'Requested from WhatsApp reply'
        from public.orders o
        join public.whatsapp_settings s on s.workspace_id = o.workspace_id
        where o.id = v_job.order_id and o.workspace_id = p_workspace_id;
      end if;
    else
      v_action_row.response_template := null;
    end if;

  elsif v_action_row.action_type = 'cancel_order' then
    update public.orders
    set status                   = 'cancelled',
        cancelled_at             = coalesce(cancelled_at, now()),
        whatsapp_replied_at      = now(),
        whatsapp_last_action     = 'cancel_order',
        whatsapp_last_inbound_id = v_message_id
    where id           = v_job.order_id
      and workspace_id = p_workspace_id;

    get diagnostics v_rows_affected = row_count;
    if v_rows_affected > 0 then
      v_action_matched := true;
      update public.whatsapp_queue
      set status     = 'cancelled',
          last_error = 'Order cancelled by customer via WhatsApp',
          error_code = 'order_cancelled',
          updated_at = now()
      where workspace_id = p_workspace_id
        and order_id     = v_job.order_id
        and status       = 'pending';
    else
      v_action_row.response_template := null;
    end if;

  elsif v_action_row.action_type = 'add_note' then
    update public.orders
    set whatsapp_replied_at      = now(),
        whatsapp_last_action     = 'add_note',
        whatsapp_last_inbound_id = v_message_id
    where id           = v_job.order_id
      and workspace_id = p_workspace_id;

    get diagnostics v_rows_affected = row_count;
    if v_rows_affected > 0 then
      v_action_matched := true;
    else
      v_action_row.response_template := null;
    end if;

    -- Lightweight note via events
    insert into public.whatsapp_events (
      workspace_id, order_id, event_type, severity, message, metadata
    ) values (
      p_workspace_id, v_job.order_id, 'customer_note', 'info',
      'Customer note from WhatsApp reply',
      jsonb_build_object(
        'body',            p_body,
        'inbound_id',      v_message_id,
        'reply_action_id', v_action_row.id
      )
    );

  end if;
  -- 'reply_only' → no order mutation, just send auto-reply (handled by worker)

  -- ── 10. Audit event ───────────────────────────────────────────────────────
  if v_action_row.action_type not in ('reply_only', 'add_note') then
    insert into public.whatsapp_events (
      workspace_id, order_id, event_type, severity, message, metadata
    ) values (
      p_workspace_id, v_job.order_id,
      'inbound_action_applied', 'info',
      'WhatsApp reply action applied to order',
      jsonb_build_object(
        'action_type',     v_action_row.action_type,
        'target_status',   v_action_row.target_status,
        'reply_action_id', v_action_row.id,
        'inbound_id',      v_message_id,
        'source',          'whatsapp'
      )
    );
  end if;

  -- ── 11. Return ────────────────────────────────────────────────────────────
  return jsonb_build_object(
    'duplicate',       false,
    'action',          v_action_row.action_type,
    'order_id',        v_job.order_id,
    'reply_text',      v_action_row.response_template,
    'reply_action_id', v_action_row.id
  );
end;
$$;

-- Revoke/grant (unchanged from v1)
revoke all on function public.process_whatsapp_inbound(uuid, text, text, text, text, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.process_whatsapp_inbound(uuid, text, text, text, text, text, timestamptz, jsonb)
  to service_role;

revoke all on function public.normalize_whatsapp_keyword(text) from public, anon;
grant execute on function public.normalize_whatsapp_keyword(text) to service_role, authenticated;

-- Ensure service_role can write these tables (bypasses RLS but explicit grants are safer)
grant insert, update on public.whatsapp_events to service_role;
grant select, insert, update on public.whatsapp_manual_reviews to service_role;
grant insert, update on public.whatsapp_opt_outs to service_role;
grant insert, update, delete on public.whatsapp_queue to service_role;
grant update on public.whatsapp_messages to service_role;
grant update on public.orders to service_role;
grant insert on public.order_statuses to service_role;

commit;
