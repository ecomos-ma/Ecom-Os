-- Ecom OS WhatsApp Automation v2
-- Consolidates the legacy queue without breaking existing sender rows.
-- The external worker uses the service role, which already bypasses RLS.

begin;

-- ---------------------------------------------------------------------------
-- Shared authorization and normalization helpers
-- ---------------------------------------------------------------------------

create or replace function public.whatsapp_is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    p_workspace_id = public.get_my_workspace_id()
    or exists (
      select 1
      from public.profile_workspaces pw
      where pw.profile_id = auth.uid()
        and pw.workspace_id = p_workspace_id
    )
  );
$$;

create or replace function public.whatsapp_can_manage(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.whatsapp_is_workspace_member(p_workspace_id)
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = any (
          array['owner','supervisor','admin','founder','super_admin']
        )
    );
$$;

create or replace function public.normalize_moroccan_whatsapp_phone(p_phone text)
returns text
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  v_digits text;
begin
  v_digits := regexp_replace(p_phone, '[^0-9]', '', 'g');

  if v_digits like '00%' then
    v_digits := substr(v_digits, 3);
  end if;

  if v_digits ~ '^0[67][0-9]{8}$' then
    v_digits := '212' || substr(v_digits, 2);
  elsif v_digits ~ '^[67][0-9]{8}$' then
    v_digits := '212' || v_digits;
  end if;

  if v_digits !~ '^212[67][0-9]{8}$' then
    return null;
  end if;

  return v_digits;
end;
$$;

create or replace function public.normalize_whatsapp_status(p_status text)
returns text
language sql
immutable
set search_path = public
as $$
  select case regexp_replace(lower(trim(coalesce(p_status, ''))), '[^a-z0-9]+', '_', 'g')
    when 'nouveau' then 'new'
    when 'new_parcel' then 'new_parcel'
    when 'en_attente' then 'pending'
    when 'waiting_pickup' then 'waiting_pickup'
    when 'picked_up' then 'picked_up'
    when 'ramasse' then 'picked_up'
    when 'livre' then 'delivered'
    when 'injoignable' then 'customer_unreachable'
    when 'ne_repond_pas' then 'no_answer'
    when 'retourne' then 'returned'
    when 'annule' then 'cancelled'
    else regexp_replace(lower(trim(coalesce(p_status, ''))), '[^a-z0-9]+', '_', 'g')
  end;
$$;

-- ---------------------------------------------------------------------------
-- Settings, rules, recordings, opt-outs, reviews and health
-- ---------------------------------------------------------------------------

alter table public.whatsapp_settings
  add column if not exists provider text not null default 'whatsapp_web_js',
  add column if not exists timezone text not null default 'Africa/Casablanca',
  add column if not exists active_days integer[] not null default array[0,1,2,3,4,5,6],
  add column if not exists quiet_hours_start time,
  add column if not exists quiet_hours_end time,
  add column if not exists minimum_interval_seconds integer not null default 5,
  add column if not exists hourly_rate_limit integer not null default 120,
  add column if not exists daily_rate_limit integer not null default 1000,
  add column if not exists retry_base_seconds integer not null default 60,
  add column if not exists retry_max_seconds integer not null default 3600,
  add column if not exists reply_context_hours integer not null default 72,
  add column if not exists callback_delay_minutes integer not null default 15,
  add column if not exists worker_last_seen_at timestamptz,
  add column if not exists worker_version text,
  add column if not exists last_message_sent_at timestamptz;

alter table public.whatsapp_settings
  drop constraint if exists whatsapp_settings_send_delay_minutes_check;

do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.whatsapp_settings'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%send_delay_minutes%'
  loop
    execute format('alter table public.whatsapp_settings drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.whatsapp_settings
  add constraint whatsapp_settings_send_delay_nonnegative check (send_delay_minutes between 0 and 1440),
  add constraint whatsapp_settings_minimum_interval_check check (minimum_interval_seconds between 0 and 3600),
  add constraint whatsapp_settings_hourly_limit_check check (hourly_rate_limit between 1 and 10000),
  add constraint whatsapp_settings_daily_limit_check check (daily_rate_limit between 1 and 100000),
  add constraint whatsapp_settings_retry_check check (
    retry_base_seconds between 10 and 86400
    and retry_max_seconds >= retry_base_seconds
    and retry_max_seconds <= 604800
  ),
  add constraint whatsapp_settings_reply_context_check check (reply_context_hours between 1 and 720),
  add constraint whatsapp_settings_callback_delay_check check (callback_delay_minutes between 0 and 10080),
  add constraint whatsapp_settings_active_days_check check (
    active_days <@ array[0,1,2,3,4,5,6]
    and cardinality(active_days) > 0
  );

create table if not exists public.whatsapp_audio_recordings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  storage_path text not null unique,
  mime_type text not null check (mime_type like 'audio/%'),
  file_size bigint not null check (file_size between 1 and 10485760),
  duration_seconds numeric(8,2) check (duration_seconds is null or duration_seconds between 0 and 900),
  provider_media_id text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_automation_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_type text not null check (event_type in ('confirmation','delivery')),
  enabled boolean not null default false,
  status_source text not null check (status_source in ('status','shipping_status','delivery_status','provider_status')),
  trigger_statuses text[] not null default '{}',
  text_enabled boolean not null default true,
  text_template text not null default '',
  audio_enabled boolean not null default false,
  audio_recording_id uuid references public.whatsapp_audio_recordings(id) on delete set null,
  fallback_text_enabled boolean not null default true,
  fallback_text text not null default '',
  channel_sequence text[] not null default array['text'],
  delay_minutes integer not null default 0 check (delay_minutes between 0 and 10080),
  expires_after_minutes integer not null default 1440 check (expires_after_minutes between 5 and 10080),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, event_type),
  check (cardinality(trigger_statuses) > 0),
  check (text_enabled or audio_enabled),
  check (channel_sequence <@ array['text','audio','fallback_text'])
);

create table if not exists public.whatsapp_reply_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  action text not null check (action in ('confirm','callback','opt_out')),
  enabled boolean not null default true,
  keywords text[] not null,
  response_template text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, action),
  check (cardinality(keywords) > 0)
);

create table if not exists public.whatsapp_opt_outs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  normalized_phone text not null,
  source text not null default 'customer_reply' check (source in ('customer_reply','manual','import')),
  reason text,
  opted_out_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  unique (workspace_id, normalized_phone),
  check (normalized_phone ~ '^212[67][0-9]{8}$')
);

create table if not exists public.whatsapp_manual_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid references public.orders("Order ID") on delete set null,
  normalized_phone text,
  provider_event_id text,
  reason text not null,
  inbound_body text,
  candidate_order_ids uuid[] not null default '{}',
  status text not null default 'open' check (status in ('open','resolved','ignored')),
  resolution text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, provider_event_id)
);

create table if not exists public.whatsapp_worker_heartbeats (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  worker_id text not null,
  worker_version text,
  provider text not null default 'whatsapp_web_js',
  status text not null check (status in ('starting','qr_required','authenticated','ready','reconnecting','disconnected','error')),
  queue_depth integer not null default 0 check (queue_depth >= 0),
  last_error text,
  metadata jsonb not null default '{}',
  seen_at timestamptz not null default now()
);

create table if not exists public.whatsapp_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid references public.orders("Order ID") on delete set null,
  event_type text not null,
  severity text not null default 'info' check (severity in ('info','warning','error')),
  message text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_rules_workspace_enabled_idx
  on public.whatsapp_automation_rules (workspace_id, enabled, event_type);
create index if not exists whatsapp_opt_outs_workspace_phone_idx
  on public.whatsapp_opt_outs (workspace_id, normalized_phone);
create index if not exists whatsapp_reviews_workspace_status_idx
  on public.whatsapp_manual_reviews (workspace_id, status, created_at desc);
create index if not exists whatsapp_events_workspace_created_idx
  on public.whatsapp_events (workspace_id, created_at desc);

-- Defaults retain existing confirmation behavior and leave delivery opt-in.
insert into public.whatsapp_automation_rules (
  workspace_id, event_type, enabled, status_source, trigger_statuses,
  text_template, fallback_text, channel_sequence, delay_minutes
)
select s.workspace_id, 'confirmation',
       coalesce(s.auto_confirmation, false) or coalesce(s.auto_order_confirmation, false),
       'status', array['pending','new'],
       s.confirmation_message, s.confirmation_message, array['text'], s.send_delay_minutes
from public.whatsapp_settings s
on conflict (workspace_id, event_type) do nothing;

insert into public.whatsapp_automation_rules (
  workspace_id, event_type, enabled, status_source, trigger_statuses,
  text_template, fallback_text, channel_sequence, delay_minutes
)
select s.workspace_id, 'delivery', false, 'shipping_status',
       array['out_for_delivery'],
       'Salam {{customer_name}} 👋\nTalab dyalk رقم {{order_number}} خرج للتوصيل 🚚\nالتتبع: {{tracking_number}}\nالمجموع: {{total}} DH',
       'Talab dyalk رقم {{order_number}} خرج للتوصيل 🚚',
       array['text'], 0
from public.whatsapp_settings s
on conflict (workspace_id, event_type) do nothing;

insert into public.whatsapp_reply_actions (workspace_id, action, enabled, keywords, response_template)
select s.workspace_id, 'confirm', s.allow_confirm, array['1','1️⃣','نعم','نعم اكد','confirm','confirmer'], s.confirmed_message
from public.whatsapp_settings s
on conflict (workspace_id, action) do nothing;

insert into public.whatsapp_reply_actions (workspace_id, action, enabled, keywords, response_template)
select s.workspace_id, 'callback', s.allow_modify, array['2','2️⃣','عيط ليا','اتصل بي','callback','rappel'], s.modification_message
from public.whatsapp_settings s
on conflict (workspace_id, action) do nothing;

insert into public.whatsapp_reply_actions (workspace_id, action, enabled, keywords, response_template)
select s.workspace_id, 'opt_out', true, array['stop','توقف','حبس','الغاء الرسائل','désabonner'],
       'تم إيقاف رسائل واتساب لهاد الرقم. شكراً.'
from public.whatsapp_settings s
on conflict (workspace_id, action) do nothing;

-- ---------------------------------------------------------------------------
-- Extend the legacy queue/message contracts in place
-- ---------------------------------------------------------------------------

alter table public.whatsapp_queue
  add column if not exists rule_id uuid references public.whatsapp_automation_rules(id) on delete set null,
  add column if not exists automation_event text,
  add column if not exists normalized_phone text,
  add column if not exists idempotency_key text,
  add column if not exists channel_sequence text[] not null default array['text'],
  add column if not exists payload jsonb not null default '{}',
  add column if not exists audio_recording_id uuid references public.whatsapp_audio_recordings(id) on delete set null,
  add column if not exists expires_at timestamptz,
  add column if not exists next_retry_at timestamptz,
  add column if not exists send_started_at timestamptz,
  add column if not exists send_token uuid,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists error_code text,
  add column if not exists error_class text,
  add column if not exists locked_by text;

update public.whatsapp_queue
set normalized_phone = public.normalize_moroccan_whatsapp_phone(phone),
    automation_event = coalesce(automation_event, message_type),
    idempotency_key = coalesce(
      idempotency_key,
      'legacy:' || workspace_id::text || ':' || order_id::text || ':' || message_type
    ),
    expires_at = coalesce(expires_at, created_at + interval '24 hours')
where normalized_phone is null
   or automation_event is null
   or idempotency_key is null
   or expires_at is null;

do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.whatsapp_queue'::regclass
      and (
        (contype = 'c' and (
          pg_get_constraintdef(oid) ilike '%message_type%'
          or pg_get_constraintdef(oid) ilike '%status%'
        ))
        or (contype = 'u' and pg_get_constraintdef(oid) ilike '%workspace_id%order_id%message_type%')
      )
  loop
    execute format('alter table public.whatsapp_queue drop constraint %I', r.conname);
  end loop;
end $$;

drop index if exists public.whatsapp_queue_idempotency;
drop index if exists public.idx_whatsapp_queue_idempotency;

alter table public.whatsapp_queue
  alter column idempotency_key set not null,
  add constraint whatsapp_queue_message_type_v2_check check (
    message_type in ('confirmation','delivery','status_update','custom','test','reply')
  ),
  add constraint whatsapp_queue_status_v2_check check (
    status in ('pending','processing','sent','delivered','read','failed','cancelled','skipped')
  ),
  add constraint whatsapp_queue_attempts_check check (attempts >= 0 and max_attempts between 1 and 20),
  add constraint whatsapp_queue_idempotency_v2 unique (idempotency_key);

create index if not exists whatsapp_queue_claim_v2_idx
  on public.whatsapp_queue (workspace_id, scheduled_for, created_at)
  where status = 'pending';
create index if not exists whatsapp_queue_phone_context_idx
  on public.whatsapp_queue (workspace_id, normalized_phone, sent_at desc)
  where status in ('sent','delivered','read');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.whatsapp_queue'::regclass
      and conname = 'whatsapp_queue_order_fk_v2'
  ) then
    alter table public.whatsapp_queue
      add constraint whatsapp_queue_order_fk_v2
      foreign key (order_id) references public.orders("Order ID") on delete cascade not valid;
  end if;
end $$;

alter table public.whatsapp_messages
  add column if not exists provider_event_id text,
  add column if not exists remote_jid text,
  add column if not exists normalized_phone text,
  add column if not exists reply_action text,
  add column if not exists raw_payload jsonb not null default '{}',
  add column if not exists processed_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists error_code text;

update public.whatsapp_messages
set normalized_phone = public.normalize_moroccan_whatsapp_phone(phone)
where normalized_phone is null;

do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.whatsapp_messages'::regclass
      and contype = 'c'
      and (
        pg_get_constraintdef(oid) ilike '%message_type%'
        or pg_get_constraintdef(oid) ilike '%status%'
      )
  loop
    execute format('alter table public.whatsapp_messages drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.whatsapp_messages
  add constraint whatsapp_messages_status_v2_check check (
    status is null or status in ('queued','processing','sent','delivered','read','failed','received','skipped')
  ),
  add constraint whatsapp_messages_type_v2_check check (
    message_type is null or message_type in (
      'confirmation','delivery','status_update','confirmed','callback','opt_out',
      'confirm','cancelled','modification','custom','test','reply','unmatched'
    )
  );

create unique index if not exists whatsapp_messages_provider_event_uidx
  on public.whatsapp_messages (workspace_id, provider_event_id)
  where provider_event_id is not null;
create index if not exists whatsapp_messages_workspace_phone_created_idx
  on public.whatsapp_messages (workspace_id, normalized_phone, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.whatsapp_messages'::regclass
      and conname = 'whatsapp_messages_order_fk_v2'
  ) then
    alter table public.whatsapp_messages
      add constraint whatsapp_messages_order_fk_v2
      foreign key (order_id) references public.orders("Order ID") on delete set null not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Sending-window, trigger, atomic claim, recovery, heartbeat and inbound RPCs
-- ---------------------------------------------------------------------------

create or replace function public.next_whatsapp_send_at(
  p_workspace_id uuid,
  p_candidate timestamptz default now()
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_timezone text := 'Africa/Casablanca';
  v_days integer[] := array[0,1,2,3,4,5,6];
  v_quiet_start time;
  v_quiet_end time;
  v_candidate timestamptz := greatest(p_candidate, now());
  v_local timestamp;
  v_dow integer;
  i integer;
begin
  select timezone, active_days, quiet_hours_start, quiet_hours_end
  into v_timezone, v_days, v_quiet_start, v_quiet_end
  from public.whatsapp_settings
  where workspace_id = p_workspace_id;

  for i in 0..14 loop
    v_local := v_candidate at time zone v_timezone;
    v_dow := extract(dow from v_local)::integer;

    if not (v_dow = any(v_days)) then
      v_candidate := ((v_local::date + 1) + time '00:00') at time zone v_timezone;
      continue;
    end if;

    if v_quiet_start is null or v_quiet_end is null or v_quiet_start = v_quiet_end then
      return v_candidate;
    end if;

    if v_quiet_start < v_quiet_end
       and v_local::time >= v_quiet_start
       and v_local::time < v_quiet_end then
      v_candidate := (v_local::date + v_quiet_end) at time zone v_timezone;
      continue;
    elsif v_quiet_start > v_quiet_end and v_local::time >= v_quiet_start then
      v_candidate := ((v_local::date + 1) + v_quiet_end) at time zone v_timezone;
      continue;
    elsif v_quiet_start > v_quiet_end and v_local::time < v_quiet_end then
      v_candidate := (v_local::date + v_quiet_end) at time zone v_timezone;
      continue;
    end if;

    return v_candidate;
  end loop;

  return v_candidate;
end;
$$;

create or replace function public.queue_whatsapp_automations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.whatsapp_settings%rowtype;
  v_rule public.whatsapp_automation_rules%rowtype;
  v_new_status text;
  v_old_status text;
  v_phone text;
  v_order_json jsonb := to_jsonb(new);
begin
  if new.workspace_id is null then
    return new;
  end if;

  select * into v_settings
  from public.whatsapp_settings
  where workspace_id = new.workspace_id
    and enabled = true
    and connection_status = 'ready';

  if not found then
    return new;
  end if;

  if lower(coalesce(v_order_json ->> 'whatsapp_opt_out', 'false')) = 'true' then
    return new;
  end if;

  v_phone := public.normalize_moroccan_whatsapp_phone(new.phone);
  if v_phone is null then
    insert into public.whatsapp_events (workspace_id, order_id, event_type, severity, message, metadata)
    values (new.workspace_id, new."Order ID", 'queue_skipped', 'warning', 'Invalid Moroccan mobile number', jsonb_build_object('phone', new.phone));
    return new;
  end if;

  if exists (
    select 1 from public.whatsapp_opt_outs o
    where o.workspace_id = new.workspace_id and o.normalized_phone = v_phone
  ) then
    return new;
  end if;

  for v_rule in
    select *
    from public.whatsapp_automation_rules
    where workspace_id = new.workspace_id and enabled = true
  loop
    v_new_status := public.normalize_whatsapp_status(v_order_json ->> v_rule.status_source);
    v_old_status := null;
    if tg_op = 'UPDATE' then
      v_old_status := public.normalize_whatsapp_status(to_jsonb(old) ->> v_rule.status_source);
    end if;

    if v_new_status = any (
         select public.normalize_whatsapp_status(x)
         from unnest(v_rule.trigger_statuses) x
       )
       and (tg_op = 'INSERT' or v_old_status is distinct from v_new_status) then
      insert into public.whatsapp_queue (
        workspace_id, order_id, phone, normalized_phone, message_type,
        automation_event, rule_id, idempotency_key, channel_sequence,
        audio_recording_id, payload, status, scheduled_for, expires_at,
        attempts, max_attempts
      ) values (
        new.workspace_id, new."Order ID", new.phone, v_phone, v_rule.event_type,
        v_rule.event_type, v_rule.id,
        new.workspace_id::text || ':' || new."Order ID"::text || ':' || v_rule.id::text,
        v_rule.channel_sequence, v_rule.audio_recording_id,
        jsonb_build_object('status_source', v_rule.status_source, 'status', v_new_status),
        'pending',
        public.next_whatsapp_send_at(new.workspace_id, now() + make_interval(mins => v_rule.delay_minutes)),
        now() + make_interval(mins => v_rule.expires_after_minutes),
        0, 3
      ) on conflict (idempotency_key) do nothing;
    end if;
  end loop;

  return new;
exception when others then
  insert into public.whatsapp_events (workspace_id, order_id, event_type, severity, message, metadata)
  values (new.workspace_id, new."Order ID", 'trigger_error', 'error', sqlerrm, jsonb_build_object('sqlstate', sqlstate));
  return new;
end;
$$;

drop trigger if exists on_new_order_whatsapp on public.orders;
drop trigger if exists on_whatsapp_confirmation_trigger on public.orders;
drop trigger if exists on_order_pending_auto_whatsapp on public.orders;
drop trigger if exists whatsapp_automation_v2_orders on public.orders;

create trigger whatsapp_automation_v2_orders
after insert or update of status, shipping_status, delivery_status, provider_status, phone
on public.orders
for each row execute function public.queue_whatsapp_automations();

create or replace function public.claim_whatsapp_jobs(p_workspace_id uuid, p_limit integer default 5)
returns setof public.whatsapp_queue
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.whatsapp_queue
  set status = 'skipped',
      last_error = 'Job expired before it could be sent',
      error_code = 'expired',
      updated_at = now()
  where workspace_id = p_workspace_id
    and status = 'pending'
    and expires_at is not null
    and expires_at <= now();

  return query
  with claimed as (
    select q.id
    from public.whatsapp_queue q
    join public.whatsapp_settings s on s.workspace_id = q.workspace_id
    where q.workspace_id = p_workspace_id
      and q.status = 'pending'
      and q.scheduled_for <= now()
      and (q.next_retry_at is null or q.next_retry_at <= now())
      and (q.expires_at is null or q.expires_at > now())
      and q.attempts < q.max_attempts
      and s.enabled = true
      and s.connection_status = 'ready'
      and not exists (
        select 1 from public.whatsapp_opt_outs o
        where o.workspace_id = q.workspace_id and o.normalized_phone = q.normalized_phone
      )
      and (
        s.last_message_sent_at is null
        or s.last_message_sent_at <= now() - make_interval(secs => s.minimum_interval_seconds)
      )
      and (
        select count(*) from public.whatsapp_queue h
        where h.workspace_id = q.workspace_id
          and h.sent_at >= now() - interval '1 hour'
          and h.status in ('sent','delivered','read')
      ) < s.hourly_rate_limit
      and (
        select count(*) from public.whatsapp_queue d
        where d.workspace_id = q.workspace_id
          and d.sent_at >= now() - interval '24 hours'
          and d.status in ('sent','delivered','read')
      ) < s.daily_rate_limit
    order by q.scheduled_for, q.created_at
    limit greatest(1, least(p_limit, 50))
    for update of q skip locked
  )
  update public.whatsapp_queue q
  set status = 'processing', processing_at = now(), updated_at = now(),
      attempts = q.attempts + 1
  from claimed c
  where q.id = c.id
  returning q.*;
end;
$$;

create or replace function public.recover_stale_whatsapp_jobs(p_timeout_minutes integer default 10)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_recovered integer;
begin
  update public.whatsapp_queue q
  set status = case
        when send_started_at is not null and wa_message_id is null then 'failed'
        when attempts >= max_attempts then 'failed'
        else 'pending'
      end,
      processing_at = null,
      failed_at = case
        when send_started_at is not null and wa_message_id is null then now()
        when attempts >= max_attempts then now()
        else failed_at
      end,
      next_retry_at = case
        when send_started_at is not null and wa_message_id is null then null
        when attempts >= max_attempts then null
        else now() + interval '1 minute'
      end,
      last_error = case
        when send_started_at is not null and wa_message_id is null
          then 'Worker stopped after provider send began; manual review required to avoid a duplicate'
        else coalesce(last_error, 'Recovered after stale worker lock')
      end,
      error_code = case
        when send_started_at is not null and wa_message_id is null then 'delivery_unknown'
        else coalesce(error_code, 'stale_lock')
      end,
      updated_at = now()
  where status = 'processing'
    and processing_at < now() - make_interval(mins => greatest(1, p_timeout_minutes));
  get diagnostics v_recovered = row_count;
  return v_recovered;
end;
$$;

create or replace function public.record_whatsapp_worker_heartbeat(
  p_workspace_id uuid,
  p_worker_id text,
  p_worker_version text,
  p_status text,
  p_queue_depth integer default 0,
  p_last_error text default null,
  p_metadata jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.whatsapp_worker_heartbeats (
    workspace_id, worker_id, worker_version, status, queue_depth, last_error, metadata, seen_at
  ) values (
    p_workspace_id, p_worker_id, p_worker_version, p_status,
    greatest(0, p_queue_depth), p_last_error, coalesce(p_metadata, '{}'), now()
  ) on conflict (workspace_id) do update set
    worker_id = excluded.worker_id,
    worker_version = excluded.worker_version,
    status = excluded.status,
    queue_depth = excluded.queue_depth,
    last_error = excluded.last_error,
    metadata = excluded.metadata,
    seen_at = now();

  update public.whatsapp_settings
  set worker_last_seen_at = now(), worker_version = p_worker_version
  where workspace_id = p_workspace_id;
end;
$$;

create or replace function public.retry_whatsapp_job(p_job_id uuid)
returns public.whatsapp_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.whatsapp_queue%rowtype;
begin
  select * into v_job from public.whatsapp_queue where id = p_job_id for update;
  if not found then raise exception 'WhatsApp job not found'; end if;
  if not public.whatsapp_can_manage(v_job.workspace_id) then raise insufficient_privilege; end if;
  if v_job.status not in ('failed','skipped','cancelled') then
    raise exception 'Only failed, skipped, or cancelled jobs can be retried manually';
  end if;
  if exists (
    select 1 from public.whatsapp_opt_outs o
    where o.workspace_id = v_job.workspace_id and o.normalized_phone = v_job.normalized_phone
  ) then
    raise exception 'Customer has opted out';
  end if;

  update public.whatsapp_queue
  set status = 'pending', attempts = 0, scheduled_for = public.next_whatsapp_send_at(v_job.workspace_id, now()),
      expires_at = now() + interval '24 hours', processing_at = null, sent_at = null,
      failed_at = null, delivered_at = null, read_at = null, next_retry_at = null,
      send_started_at = null, send_token = null, wa_message_id = null, remote_jid = null,
      last_error = null, error_code = null, error_class = null, locked_by = null, updated_at = now()
  where id = p_job_id returning * into v_job;

  insert into public.whatsapp_events (workspace_id, order_id, event_type, message, metadata)
  values (v_job.workspace_id, v_job.order_id, 'manual_retry', 'WhatsApp job manually requeued', jsonb_build_object('job_id', p_job_id, 'actor_id', auth.uid()));
  return v_job;
end;
$$;

create or replace function public.process_whatsapp_inbound(
  p_workspace_id uuid,
  p_provider_event_id text,
  p_remote_jid text,
  p_phone text,
  p_body text,
  p_quoted_message_id text default null,
  p_received_at timestamptz default now(),
  p_raw_payload jsonb default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_body text := lower(trim(coalesce(p_body, '')));
  v_action text;
  v_job public.whatsapp_queue%rowtype;
  v_candidates uuid[];
  v_context_hours integer := 72;
  v_reply text;
  v_agent_id uuid;
  v_message_id uuid;
begin
  if not exists (select 1 from public.workspaces where id = p_workspace_id) then
    raise exception 'Unknown workspace';
  end if;

  v_phone := public.normalize_moroccan_whatsapp_phone(p_phone);
  if v_phone is null then
    raise exception 'Invalid Moroccan mobile number';
  end if;

  insert into public.whatsapp_messages (
    workspace_id, phone, normalized_phone, remote_jid, direction, message_type,
    body, wa_message_id, provider_event_id, status, raw_payload, created_at
  ) values (
    p_workspace_id, p_phone, v_phone, p_remote_jid, 'inbound', 'reply',
    p_body, p_provider_event_id, p_provider_event_id, 'received', coalesce(p_raw_payload, '{}'), p_received_at
  ) on conflict (workspace_id, provider_event_id) where provider_event_id is not null do nothing
  returning id into v_message_id;

  if v_message_id is null then
    return jsonb_build_object('duplicate', true);
  end if;

  select a.action, a.response_template
  into v_action, v_reply
  from public.whatsapp_reply_actions a
  where a.workspace_id = p_workspace_id
    and a.enabled = true
    and exists (
      select 1 from unnest(a.keywords) k
      where lower(trim(k)) = v_body
    )
  order by case a.action when 'opt_out' then 0 when 'confirm' then 1 else 2 end
  limit 1;

  if v_action = 'opt_out' then
    insert into public.whatsapp_opt_outs (workspace_id, normalized_phone)
    values (p_workspace_id, v_phone)
    on conflict (workspace_id, normalized_phone) do update set opted_out_at = now(), source = 'customer_reply';

    update public.orders
    set whatsapp_opt_out = true
    where workspace_id = p_workspace_id
      and public.normalize_moroccan_whatsapp_phone(phone) = v_phone;

    update public.whatsapp_queue
    set status = 'cancelled', last_error = 'Customer opted out', error_code = 'opt_out', updated_at = now()
    where workspace_id = p_workspace_id and normalized_phone = v_phone and status = 'pending';

    update public.whatsapp_messages
    set reply_action = v_action, processed_at = now(), message_type = 'opt_out'
    where id = v_message_id;

    return jsonb_build_object('duplicate', false, 'action', v_action, 'reply_text', v_reply);
  end if;

  if p_quoted_message_id is not null then
    select * into v_job
    from public.whatsapp_queue
    where workspace_id = p_workspace_id
      and wa_message_id = p_quoted_message_id
      and normalized_phone = v_phone
    order by sent_at desc nulls last
    limit 1;
  end if;

  if v_job.id is null then
    select coalesce(array_agg(distinct q.order_id), '{}')
    into v_candidates
    from public.whatsapp_queue q
    join public.whatsapp_settings s on s.workspace_id = q.workspace_id
    where q.workspace_id = p_workspace_id
      and q.normalized_phone = v_phone
      and q.automation_event = 'confirmation'
      and q.status in ('sent','delivered','read')
      and q.sent_at >= now() - make_interval(hours => s.reply_context_hours);

    if cardinality(v_candidates) = 1 then
      select * into v_job
      from public.whatsapp_queue
      where workspace_id = p_workspace_id
        and order_id = v_candidates[1]
        and normalized_phone = v_phone
      order by sent_at desc nulls last
      limit 1;
    else
      insert into public.whatsapp_manual_reviews (
        workspace_id, normalized_phone, provider_event_id, reason, inbound_body, candidate_order_ids
      ) values (
        p_workspace_id, v_phone, p_provider_event_id,
        case when cardinality(v_candidates) = 0 then 'No matching confirmation message' else 'Ambiguous phone-to-order match' end,
        p_body, coalesce(v_candidates, '{}')
      ) on conflict (workspace_id, provider_event_id) do nothing;

      update public.whatsapp_messages
      set message_type = 'unmatched', processed_at = now(), reply_action = v_action
      where id = v_message_id;
      return jsonb_build_object('duplicate', false, 'action', coalesce(v_action, 'unmatched'), 'manual_review', true);
    end if;
  end if;

  update public.whatsapp_messages
  set order_id = v_job.order_id, message_type = coalesce(v_action, 'unmatched'),
      reply_action = v_action, processed_at = now()
  where id = v_message_id;

  if v_action = 'confirm' then
    update public.orders
    set status = 'confirmed', confirmation_method = 'whatsapp', confirmed_at = coalesce(confirmed_at, now())
    where "Order ID" = v_job.order_id and workspace_id = p_workspace_id;
  elsif v_action = 'callback' then
    update public.orders
    set status = 'scheduled'
    where "Order ID" = v_job.order_id and workspace_id = p_workspace_id;

    select o.assigned_to into v_agent_id
    from public.orders o
    where o."Order ID" = v_job.order_id and o.workspace_id = p_workspace_id;

    if v_agent_id is null then
      select pw.profile_id into v_agent_id
      from public.profile_workspaces pw
      join public.profiles p on p.id = pw.profile_id
      where pw.workspace_id = p_workspace_id
      order by case lower(coalesce(p.role,'')) when 'owner' then 0 when 'supervisor' then 1 else 2 end
      limit 1;
    end if;

    if v_agent_id is not null then
      insert into public.confirmation_callbacks (
        workspace_id, order_id, customer_id, agent_id, scheduled_at, note
      )
      select p_workspace_id, o."Order ID", o.customer_id, v_agent_id,
             now() + make_interval(mins => s.callback_delay_minutes),
             'Requested from WhatsApp reply'
      from public.orders o
      join public.whatsapp_settings s on s.workspace_id = o.workspace_id
      where o."Order ID" = v_job.order_id and o.workspace_id = p_workspace_id;
    else
      insert into public.whatsapp_manual_reviews (
        workspace_id, order_id, normalized_phone, provider_event_id, reason, inbound_body
      ) values (
        p_workspace_id, v_job.order_id, v_phone, p_provider_event_id,
        'Callback requested but no workspace agent is available', p_body
      ) on conflict (workspace_id, provider_event_id) do nothing;
    end if;
  end if;

  return jsonb_build_object(
    'duplicate', false,
    'action', coalesce(v_action, 'unmatched'),
    'order_id', v_job.order_id,
    'reply_text', case when v_action is null then null else v_reply end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Strict tenant RLS. Service-role policies are intentionally unnecessary.
-- ---------------------------------------------------------------------------

alter table public.whatsapp_automation_rules enable row level security;
alter table public.whatsapp_audio_recordings enable row level security;
alter table public.whatsapp_reply_actions enable row level security;
alter table public.whatsapp_opt_outs enable row level security;
alter table public.whatsapp_manual_reviews enable row level security;
alter table public.whatsapp_worker_heartbeats enable row level security;
alter table public.whatsapp_events enable row level security;

drop policy if exists "Service role can insert whatsapp queue" on public.whatsapp_queue;
drop policy if exists "Service role can update whatsapp queue" on public.whatsapp_queue;
drop policy if exists "Service role can insert whatsapp messages" on public.whatsapp_messages;
drop policy if exists "Workspaces can view their own whatsapp messages" on public.whatsapp_messages;
drop policy if exists "Service role can manage conversations" on public.whatsapp_conversations;
drop policy if exists "Users can insert own workspace whatsapp queue" on public.whatsapp_queue;
drop policy if exists "Users can update own workspace whatsapp queue" on public.whatsapp_queue;
drop policy if exists "Users can delete own workspace whatsapp queue" on public.whatsapp_queue;
drop policy if exists "Users can insert own workspace whatsapp messages" on public.whatsapp_messages;
drop policy if exists "Users can update own workspace whatsapp messages" on public.whatsapp_messages;
drop policy if exists "Users can delete own workspace whatsapp messages" on public.whatsapp_messages;
drop policy if exists "Users can read own workspace whatsapp settings" on public.whatsapp_settings;
drop policy if exists "Users can insert own workspace whatsapp settings" on public.whatsapp_settings;
drop policy if exists "Users can update own workspace whatsapp settings" on public.whatsapp_settings;
drop policy if exists "Users can delete own workspace whatsapp settings" on public.whatsapp_settings;

drop policy if exists whatsapp_settings_read_v2 on public.whatsapp_settings;
drop policy if exists whatsapp_settings_manage_v2 on public.whatsapp_settings;
create policy whatsapp_settings_read_v2
on public.whatsapp_settings for select to authenticated
using (public.whatsapp_is_workspace_member(workspace_id));
create policy whatsapp_settings_manage_v2
on public.whatsapp_settings for all to authenticated
using (public.whatsapp_can_manage(workspace_id)) with check (public.whatsapp_can_manage(workspace_id));

drop policy if exists whatsapp_queue_workspace_read_v2 on public.whatsapp_queue;
create policy whatsapp_queue_workspace_read_v2
on public.whatsapp_queue for select to authenticated
using (public.whatsapp_is_workspace_member(workspace_id));

drop policy if exists whatsapp_messages_workspace_read_v2 on public.whatsapp_messages;
create policy whatsapp_messages_workspace_read_v2
on public.whatsapp_messages for select to authenticated
using (public.whatsapp_is_workspace_member(workspace_id));

drop policy if exists whatsapp_rules_read on public.whatsapp_automation_rules;
drop policy if exists whatsapp_rules_manage on public.whatsapp_automation_rules;
create policy whatsapp_rules_read on public.whatsapp_automation_rules for select to authenticated
using (public.whatsapp_is_workspace_member(workspace_id));
create policy whatsapp_rules_manage on public.whatsapp_automation_rules for all to authenticated
using (public.whatsapp_can_manage(workspace_id)) with check (public.whatsapp_can_manage(workspace_id));

drop policy if exists whatsapp_audio_read on public.whatsapp_audio_recordings;
drop policy if exists whatsapp_audio_manage on public.whatsapp_audio_recordings;
create policy whatsapp_audio_read on public.whatsapp_audio_recordings for select to authenticated
using (public.whatsapp_is_workspace_member(workspace_id));
create policy whatsapp_audio_manage on public.whatsapp_audio_recordings for all to authenticated
using (public.whatsapp_can_manage(workspace_id)) with check (public.whatsapp_can_manage(workspace_id));

drop policy if exists whatsapp_reply_actions_read on public.whatsapp_reply_actions;
drop policy if exists whatsapp_reply_actions_manage on public.whatsapp_reply_actions;
create policy whatsapp_reply_actions_read on public.whatsapp_reply_actions for select to authenticated
using (public.whatsapp_is_workspace_member(workspace_id));
create policy whatsapp_reply_actions_manage on public.whatsapp_reply_actions for all to authenticated
using (public.whatsapp_can_manage(workspace_id)) with check (public.whatsapp_can_manage(workspace_id));

drop policy if exists whatsapp_opt_outs_read on public.whatsapp_opt_outs;
drop policy if exists whatsapp_opt_outs_manage on public.whatsapp_opt_outs;
create policy whatsapp_opt_outs_read on public.whatsapp_opt_outs for select to authenticated
using (public.whatsapp_is_workspace_member(workspace_id));
create policy whatsapp_opt_outs_manage on public.whatsapp_opt_outs for all to authenticated
using (public.whatsapp_can_manage(workspace_id)) with check (public.whatsapp_can_manage(workspace_id));

drop policy if exists whatsapp_reviews_read on public.whatsapp_manual_reviews;
drop policy if exists whatsapp_reviews_manage on public.whatsapp_manual_reviews;
create policy whatsapp_reviews_read on public.whatsapp_manual_reviews for select to authenticated
using (public.whatsapp_is_workspace_member(workspace_id));
create policy whatsapp_reviews_manage on public.whatsapp_manual_reviews for update to authenticated
using (public.whatsapp_can_manage(workspace_id)) with check (public.whatsapp_can_manage(workspace_id));

drop policy if exists whatsapp_heartbeats_read on public.whatsapp_worker_heartbeats;
create policy whatsapp_heartbeats_read on public.whatsapp_worker_heartbeats for select to authenticated
using (public.whatsapp_is_workspace_member(workspace_id));

drop policy if exists whatsapp_events_read on public.whatsapp_events;
create policy whatsapp_events_read on public.whatsapp_events for select to authenticated
using (public.whatsapp_is_workspace_member(workspace_id));

-- Private audio bucket. Object names must start with the workspace UUID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'whatsapp-audio', 'whatsapp-audio', false, 10485760,
  array['audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists whatsapp_audio_objects_read on storage.objects;
drop policy if exists whatsapp_audio_objects_insert on storage.objects;
drop policy if exists whatsapp_audio_objects_update on storage.objects;
drop policy if exists whatsapp_audio_objects_delete on storage.objects;

create policy whatsapp_audio_objects_read
on storage.objects for select to authenticated
using (
  bucket_id = 'whatsapp-audio'
  and case
    when ((storage.foldername(name))[1]) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.whatsapp_is_workspace_member(((storage.foldername(name))[1])::uuid)
    else false
  end
);
create policy whatsapp_audio_objects_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'whatsapp-audio'
  and case
    when ((storage.foldername(name))[1]) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.whatsapp_can_manage(((storage.foldername(name))[1])::uuid)
    else false
  end
  and owner_id = auth.uid()::text
);
create policy whatsapp_audio_objects_update
on storage.objects for update to authenticated
using (
  bucket_id = 'whatsapp-audio'
  and case
    when ((storage.foldername(name))[1]) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.whatsapp_can_manage(((storage.foldername(name))[1])::uuid)
    else false
  end
) with check (
  bucket_id = 'whatsapp-audio'
  and case
    when ((storage.foldername(name))[1]) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.whatsapp_can_manage(((storage.foldername(name))[1])::uuid)
    else false
  end
);
create policy whatsapp_audio_objects_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'whatsapp-audio'
  and case
    when ((storage.foldername(name))[1]) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.whatsapp_can_manage(((storage.foldername(name))[1])::uuid)
    else false
  end
);

-- Timestamp triggers reuse the existing project helper.
drop trigger if exists whatsapp_audio_updated_at on public.whatsapp_audio_recordings;
create trigger whatsapp_audio_updated_at before update on public.whatsapp_audio_recordings
for each row execute function public.update_updated_at_whatsapp();
drop trigger if exists whatsapp_rules_updated_at on public.whatsapp_automation_rules;
create trigger whatsapp_rules_updated_at before update on public.whatsapp_automation_rules
for each row execute function public.update_updated_at_whatsapp();
drop trigger if exists whatsapp_reply_actions_updated_at on public.whatsapp_reply_actions;
create trigger whatsapp_reply_actions_updated_at before update on public.whatsapp_reply_actions
for each row execute function public.update_updated_at_whatsapp();

revoke all on function public.claim_whatsapp_jobs(uuid, integer) from public, anon, authenticated;
revoke all on function public.recover_stale_whatsapp_jobs(integer) from public, anon, authenticated;
revoke all on function public.record_whatsapp_worker_heartbeat(uuid, text, text, text, integer, text, jsonb) from public, anon, authenticated;
revoke all on function public.process_whatsapp_inbound(uuid, text, text, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.retry_whatsapp_job(uuid) from public, anon;
grant execute on function public.claim_whatsapp_jobs(uuid, integer) to service_role;
grant execute on function public.recover_stale_whatsapp_jobs(integer) to service_role;
grant execute on function public.record_whatsapp_worker_heartbeat(uuid, text, text, text, integer, text, jsonb) to service_role;
grant execute on function public.process_whatsapp_inbound(uuid, text, text, text, text, text, timestamptz, jsonb) to service_role;
grant execute on function public.retry_whatsapp_job(uuid) to authenticated;

grant select on public.whatsapp_automation_rules, public.whatsapp_audio_recordings,
  public.whatsapp_reply_actions, public.whatsapp_opt_outs, public.whatsapp_manual_reviews,
  public.whatsapp_worker_heartbeats, public.whatsapp_events to authenticated;
grant insert, update, delete on public.whatsapp_automation_rules, public.whatsapp_audio_recordings,
  public.whatsapp_reply_actions, public.whatsapp_opt_outs to authenticated;
grant update on public.whatsapp_manual_reviews to authenticated;

commit;
