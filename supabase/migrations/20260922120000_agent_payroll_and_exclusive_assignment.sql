-- EcomOS: exclusive confirmation assignment, attributed commissions and agent payroll.
-- This migration is additive. Legacy `orders.assigned_to` / `order_assignments`
-- remain the shared-mode compatibility path.

begin;

create table if not exists public.workspace_confirmation_assignment_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  assignment_mode text not null default 'shared'
    check (assignment_mode in ('shared', 'separated')),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- A current row represents the single recipient that owns a confirmation job in
-- separated mode. Released rows are retained as the audit history.
create table if not exists public.order_confirmation_recipients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid not null references public.orders("Order ID") on delete cascade,
  recipient_type text not null check (recipient_type in ('agent', 'whatsapp_automation')),
  agent_id uuid references public.profiles(id) on delete restrict,
  automation_key text,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  released_by uuid references public.profiles(id) on delete set null,
  release_reason text,
  metadata jsonb not null default '{}'::jsonb,
  check (
    (recipient_type = 'agent' and agent_id is not null and automation_key is null)
    or (recipient_type = 'whatsapp_automation' and agent_id is null and automation_key is not null)
  )
);
create unique index if not exists order_confirmation_recipients_one_current_idx
  on public.order_confirmation_recipients (workspace_id, order_id)
  where released_at is null;
create index if not exists order_confirmation_recipients_agent_open_idx
  on public.order_confirmation_recipients (workspace_id, agent_id, assigned_at desc)
  where released_at is null and recipient_type = 'agent';
create index if not exists order_confirmation_recipients_automation_open_idx
  on public.order_confirmation_recipients (workspace_id, automation_key, assigned_at desc)
  where released_at is null and recipient_type = 'whatsapp_automation';

-- One immutable source event is the authorization and commission source of
-- truth. It deliberately does not infer a historical agent from assignment.
create table if not exists public.order_confirmation_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid not null references public.orders("Order ID") on delete cascade,
  source text not null check (source in ('agent_call', 'whatsapp_automation', 'manual_review')),
  agent_id uuid references public.profiles(id) on delete restrict,
  automation_key text,
  event_key text not null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (
    (source = 'agent_call' and agent_id is not null and automation_key is null)
    or (source = 'whatsapp_automation' and agent_id is null and automation_key is not null)
    or (source = 'manual_review')
  ),
  unique (workspace_id, event_key)
);
create unique index if not exists order_confirmation_events_one_agent_source_idx
  on public.order_confirmation_events (workspace_id, order_id, source, agent_id)
  where agent_id is not null;
create unique index if not exists order_confirmation_events_one_automation_source_idx
  on public.order_confirmation_events (workspace_id, order_id, source, automation_key)
  where automation_key is not null;
create index if not exists order_confirmation_events_agent_date_idx
  on public.order_confirmation_events (workspace_id, agent_id, occurred_at desc)
  where agent_id is not null;

create table if not exists public.agent_payment_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  enabled boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_payment_rules_agent_idx on public.agent_payment_rules (workspace_id, agent_id) where enabled;

-- Versions are append-only. Amounts are numeric and parameters are declarative:
-- React never sends executable code or a SQL predicate.
create table if not exists public.agent_payment_rule_versions (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.agent_payment_rules(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete restrict,
  version_no integer not null check (version_no > 0),
  rule_type text not null check (rule_type in ('per_delivered_order', 'per_confirmed_order', 'upsell', 'avg_answer_time_bonus', 'fixed_salary', 'custom')),
  metric text not null default 'order',
  operator text check (operator in ('lt', 'lte', 'eq', 'gte', 'gt')),
  threshold numeric,
  minimum_sample_size integer not null default 0 check (minimum_sample_size >= 0),
  amount_type text not null default 'fixed' check (amount_type in ('fixed', 'percentage')),
  amount numeric not null check (amount >= 0),
  period text not null default 'invoice' check (period in ('order', 'invoice', 'week', 'biweekly', 'month')),
  cap_amount numeric check (cap_amount is null or cap_amount >= 0),
  effective_from date not null default current_date,
  effective_to date,
  config jsonb not null default '{}'::jsonb,
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  unique (rule_id, version_no)
);
create index if not exists agent_payment_rule_versions_effective_idx
  on public.agent_payment_rule_versions (workspace_id, agent_id, effective_from desc, effective_to);

create table if not exists public.agent_payroll_schedules (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  frequency text not null default 'monthly' check (frequency in ('weekly', 'biweekly', 'monthly', 'custom', 'manual')),
  period_days integer check (period_days is null or period_days between 1 and 366),
  timezone text not null default 'Africa/Casablanca',
  generation_weekday integer check (generation_weekday between 0 and 6),
  generation_day_of_month integer check (generation_day_of_month between 1 and 28),
  generation_time time not null default '02:00',
  next_run_at timestamptz,
  enabled boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_payroll_periods (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  generated_at timestamptz,
  generated_by uuid references public.profiles(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed', 'generated')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (workspace_id, starts_at, ends_at)
);

create table if not exists public.agent_earnings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete restrict,
  rule_version_id uuid references public.agent_payment_rule_versions(id) on delete restrict,
  confirmation_event_id uuid references public.order_confirmation_events(id) on delete restrict,
  order_id uuid references public.orders("Order ID") on delete restrict,
  earning_key text not null,
  earning_type text not null check (earning_type in ('delivered_commission', 'confirmed_commission', 'upsell_commission', 'answer_time_bonus', 'fixed_salary', 'custom', 'adjustment')),
  quantity numeric not null default 1 check (quantity >= 0),
  unit_amount numeric not null default 0 check (unit_amount >= 0),
  amount numeric not null check (amount >= 0),
  earned_at timestamptz not null default now(),
  status text not null default 'accrued' check (status in ('accrued', 'void', 'invoiced')),
  invoice_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (workspace_id, earning_key)
);
create index if not exists agent_earnings_invoice_idx on public.agent_earnings (workspace_id, agent_id, status, earned_at) where status = 'accrued';
create index if not exists agent_earnings_order_idx on public.agent_earnings (workspace_id, order_id) where order_id is not null;

create table if not exists public.agent_invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete restrict,
  payroll_period_id uuid not null references public.agent_payroll_periods(id) on delete restrict,
  invoice_number text not null,
  currency text not null default 'MAD' check (char_length(currency) = 3),
  issued_at timestamptz not null default now(),
  due_at timestamptz,
  total_earned numeric not null default 0 check (total_earned >= 0),
  adjustment_total numeric not null default 0,
  total_amount numeric not null default 0 check (total_amount >= 0),
  status text not null default 'issued' check (status in ('draft', 'issued', 'partially_paid', 'paid', 'disputed', 'void')),
  created_by uuid references public.profiles(id) on delete set null,
  finalized_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, agent_id, payroll_period_id),
  unique (workspace_id, invoice_number)
);
alter table public.agent_earnings
  add constraint agent_earnings_invoice_id_fkey
  foreign key (invoice_id) references public.agent_invoices(id) on delete restrict;
create index if not exists agent_invoices_agent_status_idx on public.agent_invoices (workspace_id, agent_id, status, issued_at desc);

create table if not exists public.agent_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.agent_invoices(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  earning_id uuid references public.agent_earnings(id) on delete restrict,
  line_type text not null,
  description text not null,
  quantity numeric not null default 1,
  unit_amount numeric not null default 0,
  amount numeric not null,
  rule_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (invoice_id, earning_id)
);

create table if not exists public.agent_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete cascade,
  account_holder text not null,
  bank_name text not null,
  rib_iban text not null,
  swift text,
  currency text not null default 'MAD' check (char_length(currency) = 3),
  payment_notes text,
  is_default boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agent_bank_accounts_one_default_idx
  on public.agent_bank_accounts (workspace_id, agent_id) where is_default;

create table if not exists public.agent_payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete restrict,
  bank_account_id uuid references public.agent_bank_accounts(id) on delete set null,
  amount numeric not null check (amount > 0),
  currency text not null default 'MAD' check (char_length(currency) = 3),
  payment_method text not null default 'bank_transfer',
  transaction_reference text,
  paid_at timestamptz not null default now(),
  status text not null default 'recorded' check (status in ('recorded', 'reversed')),
  recorded_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_payments_agent_idx on public.agent_payments (workspace_id, agent_id, paid_at desc) where status = 'recorded';

create table if not exists public.agent_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.agent_payments(id) on delete cascade,
  invoice_id uuid not null references public.agent_invoices(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (payment_id, invoice_id)
);
create index if not exists agent_payment_allocations_invoice_idx on public.agent_payment_allocations (workspace_id, invoice_id);

create table if not exists public.agent_payment_proofs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  payment_id uuid not null references public.agent_payments(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_payment_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  payment_id uuid not null unique references public.agent_payments(id) on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete restrict,
  outcome text not null check (outcome in ('received_full', 'not_received', 'received_different')),
  actual_amount numeric check (actual_amount is null or actual_amount >= 0),
  explanation text,
  acknowledged_at timestamptz not null default now(),
  check ((outcome = 'received_different' and actual_amount is not null) or outcome <> 'received_different')
);

create table if not exists public.agent_payment_disputes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  payment_id uuid not null unique references public.agent_payments(id) on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  reason text not null,
  resolution text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_payroll_audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists agent_payroll_audit_log_workspace_idx on public.agent_payroll_audit_log (workspace_id, created_at desc);

-- Reuse the established in-app notification pipeline; recipients are scoped
-- explicitly so payroll does not depend on a module permission.
insert into public.notification_event_catalog (
  event_key, category, default_title, default_priority, available_channels,
  default_in_app_enabled, default_push_enabled, default_sound_enabled,
  allowed_roles, required_section, dedupe_strategy, cooldown_seconds,
  can_bypass_quiet_hours, sound_allowed, sensitive_preview_allowed
) values
  ('agent_payroll.invoice_issued', 'finance', 'New agent earnings statement', 'high', array['in_app','push'], true, true, false, array['owner','supervisor','admin','manager','agent'], null, 'source_event', 0, false, false, false)
on conflict (event_key) do update set default_title = excluded.default_title, allowed_roles = excluded.allowed_roles, updated_at = now();

insert into public.notification_event_catalog (
  event_key, category, default_title, default_priority, available_channels,
  default_in_app_enabled, default_push_enabled, default_sound_enabled,
  allowed_roles, required_section, dedupe_strategy, cooldown_seconds,
  can_bypass_quiet_hours, sound_allowed, sensitive_preview_allowed
) values
  ('agent_payroll.payment_recorded', 'finance', 'Agent transfer recorded', 'high', array['in_app','push'], true, true, false, array['owner','supervisor','admin','manager','agent'], null, 'source_event', 0, false, false, false)
on conflict (event_key) do update set default_title = excluded.default_title, allowed_roles = excluded.allowed_roles, updated_at = now();

insert into public.notification_event_catalog (
  event_key, category, default_title, default_priority, available_channels,
  default_in_app_enabled, default_push_enabled, default_sound_enabled,
  allowed_roles, required_section, dedupe_strategy, cooldown_seconds,
  can_bypass_quiet_hours, sound_allowed, sensitive_preview_allowed
) values
  ('agent_payroll.payment_disputed', 'finance', 'Agent transfer needs review', 'high', array['in_app','push'], true, true, false, array['owner'], null, 'source_event', 0, false, false, false)
on conflict (event_key) do update set default_title = excluded.default_title, allowed_roles = excluded.allowed_roles, updated_at = now();

insert into public.notification_event_catalog (
  event_key, category, default_title, default_priority, available_channels,
  default_in_app_enabled, default_push_enabled, default_sound_enabled,
  allowed_roles, required_section, dedupe_strategy, cooldown_seconds,
  can_bypass_quiet_hours, sound_allowed, sensitive_preview_allowed
) values
  ('agent_payroll.proof_uploaded', 'finance', 'Transfer proof available', 'normal', array['in_app','push'], true, true, false, array['owner','agent'], null, 'source_event', 0, false, false, false)
on conflict (event_key) do update set default_title = excluded.default_title, allowed_roles = excluded.allowed_roles, updated_at = now();

insert into public.notification_event_catalog (
  event_key, category, default_title, default_priority, available_channels,
  default_in_app_enabled, default_push_enabled, default_sound_enabled,
  allowed_roles, required_section, dedupe_strategy, cooldown_seconds,
  can_bypass_quiet_hours, sound_allowed, sensitive_preview_allowed
) values
  ('confirmation.callback_due', 'confirmation', 'Callback due soon', 'high', array['in_app','push'], true, true, false, array['owner','agent'], 'Confirmation', 'source_event', 0, false, false, false)
on conflict (event_key) do update set default_title = excluded.default_title, allowed_roles = excluded.allowed_roles, updated_at = now();

create or replace function public.notify_agent_payroll_event_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'agent_invoices' then
    perform public.emit_notification_event_service(new.workspace_id, 'agent_payroll.invoice_issued', 'agent_invoice', new.id,
      jsonb_build_object('title', 'New earnings statement', 'message', 'Your payroll statement ' || new.invoice_number || ' is ready.', 'action_url', '/agent-invoices'),
      'agent-payroll-invoice:' || new.id::text, new.agent_id, new.id::text);
  elsif tg_table_name = 'agent_payments' then
    perform public.emit_notification_event_service(new.workspace_id, 'agent_payroll.payment_recorded', 'agent_payment', new.id,
      jsonb_build_object('title', 'Transfer recorded', 'message', 'A transfer of ' || new.amount::text || ' ' || new.currency || ' was recorded for you.', 'action_url', '/agent-invoices'),
      'agent-payroll-payment:' || new.id::text, new.agent_id, new.id::text);
  elsif tg_table_name = 'agent_payment_disputes' then
    perform public.emit_notification_event_service(new.workspace_id, 'agent_payroll.payment_disputed', 'agent_payment', new.payment_id,
      jsonb_build_object('title', 'Agent transfer needs review', 'message', 'An agent reported a payment discrepancy.', 'action_url', '/finance'),
      'agent-payroll-dispute:' || new.payment_id::text, null, new.id::text);
  elsif tg_table_name = 'agent_payment_proofs' then
    perform public.emit_notification_event_service(new.workspace_id, 'agent_payroll.proof_uploaded', 'agent_payment', new.payment_id,
      jsonb_build_object('title', 'Transfer proof available', 'message', 'A private transfer proof is ready to review.', 'action_url', '/agent-invoices'),
      'agent-payroll-proof:' || new.id::text,
      (select payment.agent_id from public.agent_payments payment where payment.id = new.payment_id), new.id::text);
  end if;
  return new;
end; $$;

create trigger agent_payroll_invoice_notification after insert on public.agent_invoices for each row execute function public.notify_agent_payroll_event_v1();
create trigger agent_payroll_payment_notification after insert on public.agent_payments for each row execute function public.notify_agent_payroll_event_v1();
create trigger agent_payroll_dispute_notification after insert on public.agent_payment_disputes for each row execute function public.notify_agent_payroll_event_v1();
create trigger agent_payroll_proof_notification after insert on public.agent_payment_proofs for each row execute function public.notify_agent_payroll_event_v1();

-- A small server-side reminder scan keeps callback alerts independent of open
-- browser tabs. The notification engine deduplicates each callback/time pair.
create or replace function public.notify_due_confirmation_callbacks_v1()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_callback record; v_count integer := 0;
begin
  for v_callback in
    select c.id, c.workspace_id, c.order_id, c.agent_id, c.scheduled_at
    from public.confirmation_callbacks c
    where c.status = 'scheduled' and c.scheduled_at >= now()
      and c.scheduled_at < now() + interval '15 minutes'
    order by c.scheduled_at
    limit 500
  loop
    perform public.emit_notification_event_service(v_callback.workspace_id, 'confirmation.callback_due', 'confirmation_callback', v_callback.id,
      jsonb_build_object('title', 'Callback due soon', 'message', 'You have a scheduled customer callback soon.', 'action_url', '/confirmation?order=' || v_callback.order_id::text),
      'callback-due:' || v_callback.id::text || ':' || v_callback.scheduled_at::text,
      v_callback.agent_id, v_callback.id::text || ':' || v_callback.scheduled_at::text);
    v_count := v_count + 1;
  end loop;
  return v_count;
end; $$;
revoke all on function public.notify_due_confirmation_callbacks_v1() from public, anon, authenticated;
grant execute on function public.notify_due_confirmation_callbacks_v1() to service_role;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      if not exists (select 1 from cron.job where jobname = 'ecomos-callback-reminders') then
        perform cron.schedule('ecomos-callback-reminders', '*/5 * * * *', 'select public.notify_due_confirmation_callbacks_v1();');
      end if;
    exception when insufficient_privilege then
      raise notice 'Configure a service scheduler to call notify_due_confirmation_callbacks_v1.';
    end;
  end if;
end; $$;

-- Central recipient claim. The `FOR UPDATE SKIP LOCKED` selection prevents
-- concurrent bulk requests from claiming the same order.
create or replace function public.assign_confirmation_orders_v2(
  p_workspace_id uuid,
  p_recipient_type text,
  p_agent_id uuid default null,
  p_quantity integer default 0,
  p_order_ids uuid[] default null,
  p_reassign boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text;
  v_order_id uuid;
  v_count integer := 0;
  v_requested integer := greatest(coalesce(p_quantity, 0), coalesce(array_length(p_order_ids, 1), 0));
  v_limit integer := greatest(0, least(greatest(coalesce(p_quantity, 0), coalesce(array_length(p_order_ids, 1), 0)), 1000));
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.can_manage_workspace_team(p_workspace_id) then raise exception 'TEAM_ASSIGNMENT_FORBIDDEN'; end if;
  if p_recipient_type not in ('agent', 'whatsapp_automation') then raise exception 'INVALID_RECIPIENT_TYPE'; end if;
  if v_limit = 0 then raise exception 'ORDER_QUANTITY_REQUIRED'; end if;

  select assignment_mode into v_mode from public.workspace_confirmation_assignment_settings where workspace_id = p_workspace_id;
  v_mode := coalesce(v_mode, 'shared');
  if v_mode = 'shared' and p_recipient_type = 'whatsapp_automation' then
    raise exception 'WHATSAPP_EXCLUSIVE_ASSIGNMENT_REQUIRES_SEPARATED_MODE';
  end if;
  if p_recipient_type = 'agent' and not exists (
    select 1 from public.profile_workspaces pw join public.profiles p on p.id = pw.profile_id
    where pw.workspace_id = p_workspace_id and pw.profile_id = p_agent_id
      and pw.status = 'active' and coalesce(p.is_active, true)
  ) then raise exception 'ACTIVE_AGENT_REQUIRED'; end if;

  for v_order_id in
    select o."Order ID"
    from public.orders o
    left join public.order_confirmation_recipients current_recipient
      on current_recipient.workspace_id = o.workspace_id and current_recipient.order_id = o."Order ID"
      and current_recipient.released_at is null
    where o.workspace_id = p_workspace_id
      and lower(coalesce(o.status, 'pending')) in ('new', 'pending', 'scheduled', 'busy', 'no_answer', 'unreachable', 'wrong_number')
      and (p_order_ids is null or o."Order ID" = any(p_order_ids))
      and (p_reassign or current_recipient.id is null)
      and (v_mode = 'separated' or p_recipient_type = 'agent')
    order by o.created_at asc, o."Order ID"
    limit v_limit
    for update of o skip locked
  loop
    if p_reassign then
      update public.order_confirmation_recipients
      set released_at = now(), released_by = (select auth.uid()), release_reason = 'reassigned'
      where workspace_id = p_workspace_id and order_id = v_order_id and released_at is null;
    end if;

    if v_mode = 'separated' then
      insert into public.order_confirmation_recipients (
        workspace_id, order_id, recipient_type, agent_id, automation_key, assigned_by
      ) values (
        p_workspace_id, v_order_id, p_recipient_type,
        case when p_recipient_type = 'agent' then p_agent_id else null end,
        case when p_recipient_type = 'whatsapp_automation' then 'default' else null end,
        (select auth.uid())
      );
    end if;

    if p_recipient_type = 'agent' then
      update public.orders set assigned_to = p_agent_id, updated_at = now()
      where workspace_id = p_workspace_id and "Order ID" = v_order_id;
      insert into public.order_assignments (workspace_id, order_id, assigned_to, assigned_by, result)
      values (p_workspace_id, v_order_id, p_agent_id, (select auth.uid()), 'pending');
    else
      update public.orders set assigned_to = null, updated_at = now()
      where workspace_id = p_workspace_id and "Order ID" = v_order_id;
    end if;
    v_count := v_count + 1;
  end loop;

  insert into public.agent_payroll_audit_log (workspace_id, actor_id, action, entity_type, details)
  values (p_workspace_id, (select auth.uid()), 'orders_assigned', 'confirmation_assignment',
    jsonb_build_object('recipient_type', p_recipient_type, 'agent_id', p_agent_id, 'requested', v_requested, 'assigned', v_count, 'mode', v_mode));
  return jsonb_build_object('requested_count', v_requested, 'assigned_count', v_count, 'assignment_mode', v_mode);
end;
$$;

create or replace function public.set_confirmation_assignment_mode_v1(p_workspace_id uuid, p_assignment_mode text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.can_manage_workspace_team(p_workspace_id) then raise exception 'TEAM_ASSIGNMENT_FORBIDDEN'; end if;
  if p_assignment_mode not in ('shared', 'separated') then raise exception 'INVALID_ASSIGNMENT_MODE'; end if;
  if p_assignment_mode = 'shared' and exists (
    select 1 from public.order_confirmation_recipients where workspace_id = p_workspace_id and released_at is null
  ) then raise exception 'ASSIGNMENT_RECONCILIATION_REQUIRED'; end if;
  insert into public.workspace_confirmation_assignment_settings (workspace_id, assignment_mode, updated_by, updated_at)
  values (p_workspace_id, p_assignment_mode, (select auth.uid()), now())
  on conflict (workspace_id) do update set assignment_mode = excluded.assignment_mode, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  return jsonb_build_object('assignment_mode', p_assignment_mode);
end;
$$;

create or replace function public.reconcile_separated_confirmation_assignments_v1(p_workspace_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_released integer;
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.can_manage_workspace_team(p_workspace_id) then raise exception 'TEAM_ASSIGNMENT_FORBIDDEN'; end if;
  -- Human `orders.assigned_to` values remain available to the legacy shared
  -- queue. WhatsApp-only reservations become shared/unassigned. Every old row
  -- stays in history with an explicit release reason.
  update public.order_confirmation_recipients
  set released_at = now(), released_by = (select auth.uid()), release_reason = 'reconciled_to_shared'
  where workspace_id = p_workspace_id and released_at is null;
  get diagnostics v_released = row_count;
  update public.workspace_confirmation_assignment_settings
  set assignment_mode = 'shared', updated_by = (select auth.uid()), updated_at = now()
  where workspace_id = p_workspace_id;
  insert into public.agent_payroll_audit_log (workspace_id, actor_id, action, entity_type, details)
  values (p_workspace_id, (select auth.uid()), 'separated_assignments_reconciled', 'confirmation_assignment', jsonb_build_object('released_count', v_released));
  return v_released;
end;
$$;

-- Enforce separated-mode ownership even if a future client bypasses its UI.
create or replace function public.enforce_separated_confirmation_recipient_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text;
  v_recipient public.order_confirmation_recipients%rowtype;
  v_actor uuid := coalesce(new.confirmed_by_user_id, (select auth.uid()));
begin
  if lower(coalesce(new.status, '')) <> 'confirmed' or lower(coalesce(old.status, '')) = 'confirmed' then return new; end if;
  select assignment_mode into v_mode from public.workspace_confirmation_assignment_settings where workspace_id = new.workspace_id;
  if coalesce(v_mode, 'shared') <> 'separated' then return new; end if;
  select * into v_recipient from public.order_confirmation_recipients
  where workspace_id = new.workspace_id and order_id = new."Order ID" and released_at is null
  for share;
  if not found then raise exception 'EXCLUSIVE_RECIPIENT_REQUIRED'; end if;
  if lower(coalesce(new.confirmation_method, '')) = 'whatsapp' then
    if v_recipient.recipient_type <> 'whatsapp_automation' then raise exception 'WHATSAPP_RECIPIENT_MISMATCH'; end if;
  elsif v_recipient.recipient_type <> 'agent' or v_recipient.agent_id is distinct from v_actor then
    raise exception 'AGENT_RECIPIENT_MISMATCH';
  end if;
  return new;
end;
$$;

create or replace function public.capture_confirmation_event_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text;
  v_agent uuid;
  v_automation text;
  v_key text;
begin
  if lower(coalesce(new.status, '')) <> 'confirmed' then return new; end if;
  if lower(coalesce(new.confirmation_method, '')) = 'whatsapp' then
    v_source := 'whatsapp_automation'; v_automation := 'default';
    v_key := 'whatsapp:' || new."Order ID"::text;
  elsif coalesce(new.confirmed_by_user_id, (select auth.uid())) is not null then
    v_source := 'agent_call'; v_agent := coalesce(new.confirmed_by_user_id, (select auth.uid()));
    v_key := 'agent:' || new."Order ID"::text || ':' || v_agent::text;
  else
    return new; -- Ambiguous imported history is intentionally left for founder review.
  end if;
  insert into public.order_confirmation_events (workspace_id, order_id, source, agent_id, automation_key, event_key, occurred_at, metadata)
  values (new.workspace_id, new."Order ID", v_source, v_agent, v_automation, v_key, coalesce(new.confirmed_at, now()),
    jsonb_build_object('confirmation_method', new.confirmation_method, 'captured_by', 'orders_trigger'))
  on conflict (workspace_id, event_key) do nothing;
  return new;
end;
$$;

-- The engine is re-runnable: each payable has a deterministic ledger key.
create or replace function public.materialize_agent_earnings_for_order_v1(p_workspace_id uuid, p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_event public.order_confirmation_events%rowtype;
  v_rule record;
  v_amount numeric;
  v_type text;
  v_key text;
  v_created integer := 0;
  v_delivered boolean;
begin
  select * into v_order from public.orders where workspace_id = p_workspace_id and "Order ID" = p_order_id;
  if not found then return 0; end if;
  select * into v_event from public.order_confirmation_events
  where workspace_id = p_workspace_id and order_id = p_order_id and source = 'agent_call' and agent_id is not null
  order by occurred_at asc limit 1;
  if not found then return 0; end if;
  v_delivered := lower(coalesce(v_order.shipping_status, v_order.delivery_status, '')) in ('delivered', 'livré', 'livre');

  for v_rule in
    select version.*, rule.enabled
    from public.agent_payment_rule_versions version
    join public.agent_payment_rules rule on rule.id = version.rule_id
    where version.workspace_id = p_workspace_id and version.agent_id = v_event.agent_id and rule.enabled
      and version.effective_from <= coalesce(v_order.confirmed_at, v_event.occurred_at)::date
      and (version.effective_to is null or version.effective_to >= coalesce(v_order.confirmed_at, v_event.occurred_at)::date)
  loop
    v_amount := null; v_type := null;
    if v_rule.rule_type = 'per_confirmed_order' and lower(coalesce(v_order.status, '')) = 'confirmed' then
      v_amount := v_rule.amount; v_type := 'confirmed_commission';
    elsif v_rule.rule_type = 'per_delivered_order' and v_delivered then
      v_amount := v_rule.amount; v_type := 'delivered_commission';
    elsif v_rule.rule_type = 'upsell' and coalesce(v_order.is_upsell, false) then
      v_amount := case when v_rule.amount_type = 'percentage' then round(coalesce(v_order.upsell_value, v_order.total, 0) * v_rule.amount / 100, 2) else v_rule.amount end;
      v_amount := least(v_amount, coalesce(v_rule.cap_amount, v_amount)); v_type := 'upsell_commission';
    elsif v_rule.rule_type = 'custom' and v_rule.metric = 'delivered' and v_delivered then
      v_amount := v_rule.amount; v_type := 'custom';
    elsif v_rule.rule_type = 'custom' and v_rule.metric = 'confirmed' and lower(coalesce(v_order.status, '')) = 'confirmed' then
      v_amount := v_rule.amount; v_type := 'custom';
    end if;
    if v_amount is null or v_amount <= 0 then continue; end if;
    v_key := concat_ws(':', 'order', p_order_id::text, v_event.id::text, v_rule.id::text, v_type);
    insert into public.agent_earnings (workspace_id, agent_id, rule_version_id, confirmation_event_id, order_id, earning_key, earning_type, unit_amount, amount, earned_at, metadata)
    values (p_workspace_id, v_event.agent_id, v_rule.id, v_event.id, p_order_id, v_key, v_type, v_rule.amount, v_amount, coalesce(v_order.delivered_at, v_order.confirmed_at, v_event.occurred_at), jsonb_build_object('rule_type', v_rule.rule_type))
    on conflict (workspace_id, earning_key) do nothing;
    if found then v_created := v_created + 1; end if;
  end loop;
  return v_created;
end;
$$;

create or replace function public.sync_agent_order_earnings_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.materialize_agent_earnings_for_order_v1(new.workspace_id, new."Order ID");
  return new;
end;
$$;

create or replace function public.sync_agent_event_earnings_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.materialize_agent_earnings_for_order_v1(new.workspace_id, new.order_id);
  return new;
end;
$$;

drop trigger if exists a_enforce_separated_confirmation_recipient on public.orders;
create trigger a_enforce_separated_confirmation_recipient before update of status, confirmation_method, confirmed_by_user_id on public.orders
for each row execute function public.enforce_separated_confirmation_recipient_v1();
drop trigger if exists b_capture_confirmation_event on public.orders;
create trigger b_capture_confirmation_event after update of status, confirmation_method, confirmed_by_user_id on public.orders
for each row execute function public.capture_confirmation_event_v1();
drop trigger if exists z_sync_agent_order_earnings on public.orders;
create trigger z_sync_agent_order_earnings after update of status, shipping_status, delivery_status, is_upsell, upsell_value on public.orders
for each row execute function public.sync_agent_order_earnings_v1();
drop trigger if exists z_sync_agent_event_earnings on public.order_confirmation_events;
create trigger z_sync_agent_event_earnings after insert on public.order_confirmation_events
for each row execute function public.sync_agent_event_earnings_v1();

create or replace function public.generate_agent_payroll_invoices_internal_v1(
  p_workspace_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period_id uuid;
  v_agent record;
  v_invoice_id uuid;
  v_earning record;
  v_total numeric;
  v_number text;
  v_rule record;
  v_call_count integer;
  v_avg_seconds numeric;
  v_bonus_key text;
  v_bonus_amount numeric;
  v_created integer := 0;
begin
  if p_ends_at <= p_starts_at then raise exception 'INVALID_PAYROLL_PERIOD'; end if;
  insert into public.agent_payroll_periods (workspace_id, starts_at, ends_at, status, generated_by, generated_at)
  values (p_workspace_id, p_starts_at, p_ends_at, 'closed', p_actor_id, now())
  on conflict (workspace_id, starts_at, ends_at) do update set generated_at = excluded.generated_at
  returning id into v_period_id;

  -- Catch delayed delivery statuses before closing the period.
  for v_earning in select "Order ID" as order_id from public.orders where workspace_id = p_workspace_id and confirmed_at < p_ends_at loop
    perform public.materialize_agent_earnings_for_order_v1(p_workspace_id, v_earning.order_id);
  end loop;

  for v_agent in
    select distinct e.agent_id from public.agent_earnings e
    where e.workspace_id = p_workspace_id and e.status = 'accrued' and e.earned_at >= p_starts_at and e.earned_at < p_ends_at
    union
    select distinct v.agent_id from public.agent_payment_rule_versions v join public.agent_payment_rules r on r.id = v.rule_id
    where v.workspace_id = p_workspace_id and r.enabled and v.rule_type in ('fixed_salary', 'avg_answer_time_bonus')
      and v.effective_from <= p_ends_at::date and (v.effective_to is null or v.effective_to >= p_starts_at::date)
  loop
    -- Periodic salary / measured answer-time bonuses each get deterministic keys.
    for v_rule in
      select v.* from public.agent_payment_rule_versions v join public.agent_payment_rules r on r.id = v.rule_id
      where v.workspace_id = p_workspace_id and v.agent_id = v_agent.agent_id and r.enabled
        and v.rule_type in ('fixed_salary', 'avg_answer_time_bonus')
        and v.effective_from <= p_ends_at::date and (v.effective_to is null or v.effective_to >= p_starts_at::date)
    loop
      v_bonus_amount := null;
      if v_rule.rule_type = 'fixed_salary' then
        v_bonus_amount := v_rule.amount;
      else
        select count(*), avg(extract(epoch from (activity.created_at - order_row.created_at)))
        into v_call_count, v_avg_seconds
        from public.confirmation_activities activity
        join public.orders order_row on order_row.workspace_id = activity.workspace_id and order_row."Order ID" = activity.order_id
        where activity.workspace_id = p_workspace_id and activity.agent_id = v_agent.agent_id
          and activity.activity_type = 'CALL_STARTED' and activity.created_at >= p_starts_at and activity.created_at < p_ends_at
          and activity.created_at >= order_row.created_at;
        if coalesce(v_call_count, 0) >= v_rule.minimum_sample_size and v_avg_seconds is not null
          and ((v_rule.operator = 'lt' and v_avg_seconds < v_rule.threshold) or (v_rule.operator = 'lte' and v_avg_seconds <= v_rule.threshold) or (v_rule.operator = 'gte' and v_avg_seconds >= v_rule.threshold) or (v_rule.operator = 'gt' and v_avg_seconds > v_rule.threshold) or (v_rule.operator = 'eq' and v_avg_seconds = v_rule.threshold)) then
          v_bonus_amount := v_rule.amount;
        end if;
      end if;
      if v_bonus_amount is not null and v_bonus_amount > 0 then
        v_bonus_key := concat_ws(':', 'period', v_period_id::text, v_rule.id::text, v_rule.rule_type);
        insert into public.agent_earnings (workspace_id, agent_id, rule_version_id, earning_key, earning_type, unit_amount, amount, earned_at, metadata)
        values (p_workspace_id, v_agent.agent_id, v_rule.id, v_bonus_key,
          case when v_rule.rule_type = 'fixed_salary' then 'fixed_salary' else 'answer_time_bonus' end,
          v_rule.amount, v_bonus_amount, p_ends_at - interval '1 microsecond',
          jsonb_build_object('period_id', v_period_id, 'avg_answer_seconds', v_avg_seconds, 'eligible_calls', v_call_count))
        on conflict (workspace_id, earning_key) do nothing;
      end if;
    end loop;

    select coalesce(sum(amount), 0) into v_total from public.agent_earnings
    where workspace_id = p_workspace_id and agent_id = v_agent.agent_id and status = 'accrued'
      and earned_at >= p_starts_at and earned_at < p_ends_at;
    if v_total <= 0 then continue; end if;
    v_number := 'AGT-' || to_char(p_starts_at at time zone 'UTC', 'YYYYMMDD') || '-' || left(v_agent.agent_id::text, 8);
    insert into public.agent_invoices (workspace_id, agent_id, payroll_period_id, invoice_number, total_earned, total_amount, status, created_by, finalized_at)
    values (p_workspace_id, v_agent.agent_id, v_period_id, v_number, v_total, v_total, 'issued', p_actor_id, now())
    on conflict (workspace_id, agent_id, payroll_period_id) do update set updated_at = now()
    returning id into v_invoice_id;
    insert into public.agent_invoice_lines (invoice_id, workspace_id, earning_id, line_type, description, quantity, unit_amount, amount, rule_snapshot)
    select v_invoice_id, p_workspace_id, e.id, e.earning_type,
      coalesce(rv.rule_type, e.earning_type), e.quantity, e.unit_amount, e.amount,
      coalesce(to_jsonb(rv), '{}'::jsonb)
    from public.agent_earnings e left join public.agent_payment_rule_versions rv on rv.id = e.rule_version_id
    where e.workspace_id = p_workspace_id and e.agent_id = v_agent.agent_id and e.status = 'accrued'
      and e.earned_at >= p_starts_at and e.earned_at < p_ends_at
    on conflict (invoice_id, earning_id) do nothing;
    update public.agent_earnings set status = 'invoiced', invoice_id = v_invoice_id
    where workspace_id = p_workspace_id and agent_id = v_agent.agent_id and status = 'accrued'
      and earned_at >= p_starts_at and earned_at < p_ends_at;
    v_created := v_created + 1;
  end loop;
  update public.agent_payroll_periods set status = 'generated', generated_at = now(), generated_by = p_actor_id where id = v_period_id;
  insert into public.agent_payroll_audit_log (workspace_id, actor_id, action, entity_type, entity_id, details)
  values (p_workspace_id, p_actor_id, 'payroll_generated', 'payroll_period', v_period_id, jsonb_build_object('invoice_count', v_created));
  return jsonb_build_object('period_id', v_period_id, 'invoice_count', v_created);
end;
$$;

-- Team supervisors can assign orders, but only the billing owner (or platform
-- founder) may see bank details or create/change payroll and transfer records.
create or replace function public.can_manage_workspace_payroll(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_platform_admin(), false)
    or public.has_workspace_role(p_workspace_id, array['owner']::text[]);
$$;
revoke all on function public.can_manage_workspace_payroll(uuid) from public, anon;
grant execute on function public.can_manage_workspace_payroll(uuid) to authenticated, service_role;

create or replace function public.generate_agent_payroll_invoices_v1(p_workspace_id uuid, p_starts_at timestamptz, p_ends_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.can_manage_workspace_payroll(p_workspace_id) then raise exception 'PAYROLL_MANAGEMENT_FORBIDDEN'; end if;
  return public.generate_agent_payroll_invoices_internal_v1(p_workspace_id, p_starts_at, p_ends_at, (select auth.uid()));
end; $$;

-- Invoked by pg_cron when the extension is available. The schedule lives in
-- data, so changing a workspace's cadence never requires a browser tab or a
-- new cron job. Row locks make retries and concurrent scheduler runs safe.
create or replace function public.run_due_agent_payroll_schedules_v1()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_schedule public.agent_payroll_schedules%rowtype; v_days integer; v_start timestamptz; v_next timestamptz; v_count integer := 0;
begin
  for v_schedule in select * from public.agent_payroll_schedules where enabled and next_run_at is not null and next_run_at <= now() for update skip locked loop
    v_days := case v_schedule.frequency when 'weekly' then 7 when 'biweekly' then 14 when 'monthly' then 30 when 'custom' then coalesce(v_schedule.period_days, 30) else 0 end;
    if v_days <= 0 then continue; end if;
    v_start := v_schedule.next_run_at - make_interval(days => v_days);
    perform public.generate_agent_payroll_invoices_internal_v1(v_schedule.workspace_id, v_start, v_schedule.next_run_at, null);
    v_next := v_schedule.next_run_at + make_interval(days => v_days);
    update public.agent_payroll_schedules set next_run_at = v_next, updated_at = now() where workspace_id = v_schedule.workspace_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end; $$;

do $$
begin
  -- The generic job executes a lightweight locked scan. Hosts without pg_cron
  -- still retain manual payroll; their platform scheduler can call this RPC.
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      if not exists (select 1 from cron.job where jobname = 'ecomos-agent-payroll-hourly') then
        perform cron.schedule('ecomos-agent-payroll-hourly', '5 * * * *', 'select public.run_due_agent_payroll_schedules_v1();');
      end if;
    exception when insufficient_privilege then
      raise notice 'pg_cron is not available to this migration role; configure the platform scheduler to call run_due_agent_payroll_schedules_v1.';
    end;
  end if;
end $$;

create or replace function public.save_agent_payment_rule_v1(
  p_workspace_id uuid, p_agent_id uuid, p_rule_id uuid, p_name text, p_enabled boolean, p_version jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_rule_id uuid; v_next_version integer;
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.can_manage_workspace_payroll(p_workspace_id) then raise exception 'PAYMENT_RULE_MANAGEMENT_FORBIDDEN'; end if;
  if nullif(btrim(p_name), '') is null then raise exception 'RULE_NAME_REQUIRED'; end if;
  if coalesce(p_version->>'rule_type', '') not in ('per_delivered_order','per_confirmed_order','upsell','avg_answer_time_bonus','fixed_salary','custom') then raise exception 'INVALID_PAYMENT_RULE_TYPE'; end if;
  if coalesce((p_version->>'amount')::numeric, -1) < 0 then raise exception 'INVALID_PAYMENT_RULE_AMOUNT'; end if;
  if p_rule_id is null then
    insert into public.agent_payment_rules (workspace_id, agent_id, name, enabled, created_by)
    values (p_workspace_id, p_agent_id, btrim(p_name), coalesce(p_enabled, true), (select auth.uid())) returning id into v_rule_id;
  else
    update public.agent_payment_rules set name = btrim(p_name), enabled = coalesce(p_enabled, true), updated_at = now()
    where id = p_rule_id and workspace_id = p_workspace_id and agent_id = p_agent_id returning id into v_rule_id;
    if not found then raise exception 'PAYMENT_RULE_NOT_FOUND'; end if;
  end if;
  select coalesce(max(version_no), 0) + 1 into v_next_version from public.agent_payment_rule_versions where rule_id = v_rule_id;
  insert into public.agent_payment_rule_versions (
    rule_id, workspace_id, agent_id, version_no, rule_type, metric, operator, threshold, minimum_sample_size,
    amount_type, amount, period, cap_amount, effective_from, effective_to, config, changed_by
  ) values (
    v_rule_id, p_workspace_id, p_agent_id, v_next_version,
    p_version->>'rule_type', coalesce(nullif(p_version->>'metric',''), 'order'), nullif(p_version->>'operator',''),
    nullif(p_version->>'threshold','')::numeric, coalesce(nullif(p_version->>'minimum_sample_size','')::integer, 0),
    coalesce(nullif(p_version->>'amount_type',''), 'fixed'), (p_version->>'amount')::numeric,
    coalesce(nullif(p_version->>'period',''), 'order'), nullif(p_version->>'cap_amount','')::numeric,
    coalesce(nullif(p_version->>'effective_from','')::date, current_date), nullif(p_version->>'effective_to','')::date,
    coalesce(p_version->'config', '{}'::jsonb), (select auth.uid())
  );
  insert into public.agent_payroll_audit_log (workspace_id, actor_id, action, entity_type, entity_id, details)
  values (p_workspace_id, (select auth.uid()), 'payment_rule_versioned', 'agent_payment_rule', v_rule_id, jsonb_build_object('version', v_next_version));
  return v_rule_id;
end; $$;

create or replace function public.save_agent_bank_account_v1(
  p_workspace_id uuid, p_agent_id uuid, p_account_holder text, p_bank_name text, p_rib_iban text,
  p_swift text default null, p_currency text default 'MAD', p_payment_notes text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.can_manage_workspace_payroll(p_workspace_id) then raise exception 'BANK_ACCOUNT_MANAGEMENT_FORBIDDEN'; end if;
  if nullif(btrim(p_account_holder), '') is null or nullif(btrim(p_bank_name), '') is null or nullif(btrim(p_rib_iban), '') is null then raise exception 'BANK_ACCOUNT_DETAILS_REQUIRED'; end if;
  update public.agent_bank_accounts set is_default = false, updated_at = now(), updated_by = (select auth.uid())
  where workspace_id = p_workspace_id and agent_id = p_agent_id and is_default;
  insert into public.agent_bank_accounts (workspace_id, agent_id, account_holder, bank_name, rib_iban, swift, currency, payment_notes, is_default, created_by, updated_by)
  values (p_workspace_id, p_agent_id, btrim(p_account_holder), btrim(p_bank_name), btrim(p_rib_iban), nullif(btrim(p_swift), ''), upper(coalesce(nullif(btrim(p_currency), ''), 'MAD')), nullif(btrim(p_payment_notes), ''), true, (select auth.uid()), (select auth.uid()))
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.save_agent_payroll_schedule_v1(p_workspace_id uuid, p_schedule jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_frequency text := coalesce(p_schedule->>'frequency', 'manual');
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.can_manage_workspace_payroll(p_workspace_id) then raise exception 'PAYROLL_MANAGEMENT_FORBIDDEN'; end if;
  if v_frequency not in ('weekly','biweekly','monthly','custom','manual') then raise exception 'INVALID_PAYROLL_FREQUENCY'; end if;
  insert into public.agent_payroll_schedules (workspace_id, frequency, period_days, timezone, generation_weekday, generation_day_of_month, generation_time, next_run_at, enabled, updated_by, updated_at)
  values (p_workspace_id, v_frequency, nullif(p_schedule->>'period_days','')::integer, coalesce(nullif(p_schedule->>'timezone',''), 'Africa/Casablanca'), nullif(p_schedule->>'generation_weekday','')::integer, nullif(p_schedule->>'generation_day_of_month','')::integer, coalesce(nullif(p_schedule->>'generation_time','')::time, '02:00'), nullif(p_schedule->>'next_run_at','')::timestamptz, coalesce((p_schedule->>'enabled')::boolean, false), (select auth.uid()), now())
  on conflict (workspace_id) do update set frequency = excluded.frequency, period_days = excluded.period_days, timezone = excluded.timezone, generation_weekday = excluded.generation_weekday, generation_day_of_month = excluded.generation_day_of_month, generation_time = excluded.generation_time, next_run_at = excluded.next_run_at, enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = now();
  return jsonb_build_object('saved', true);
end; $$;

create or replace function public.attach_agent_payment_proof_v1(p_workspace_id uuid, p_payment_id uuid, p_storage_path text, p_file_name text, p_mime_type text, p_file_size bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.can_manage_workspace_payroll(p_workspace_id) then raise exception 'PAYMENT_MANAGEMENT_FORBIDDEN'; end if;
  if p_mime_type not in ('application/pdf','image/png','image/jpeg','image/webp') or p_file_size <= 0 or p_file_size > 10485760 then raise exception 'INVALID_PAYMENT_PROOF'; end if;
  if not exists (select 1 from public.agent_payments where id = p_payment_id and workspace_id = p_workspace_id) then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if p_storage_path not like p_workspace_id::text || '/' || p_payment_id::text || '/%' then raise exception 'INVALID_PAYMENT_PROOF_PATH'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'agent-payment-proofs' and name = p_storage_path and owner_id = (select auth.uid())::text) then raise exception 'PAYMENT_PROOF_UPLOAD_NOT_FOUND'; end if;
  insert into public.agent_payment_proofs (workspace_id, payment_id, storage_path, file_name, mime_type, file_size, uploaded_by)
  values (p_workspace_id, p_payment_id, p_storage_path, p_file_name, p_mime_type, p_file_size, (select auth.uid())) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.record_agent_payment_v1(
  p_workspace_id uuid, p_agent_id uuid, p_amount numeric, p_payment_method text,
  p_transaction_reference text, p_paid_at timestamptz, p_notes text, p_allocations jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_payment_id uuid; v_allocation jsonb; v_invoice public.agent_invoices%rowtype; v_allocated numeric := 0; v_total numeric := 0;
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.can_manage_workspace_payroll(p_workspace_id) then raise exception 'PAYMENT_MANAGEMENT_FORBIDDEN'; end if;
  if p_amount <= 0 or jsonb_typeof(coalesce(p_allocations, '[]'::jsonb)) <> 'array' then raise exception 'INVALID_PAYMENT'; end if;
  for v_allocation in select value from jsonb_array_elements(p_allocations) loop
    select * into v_invoice from public.agent_invoices where id = (v_allocation->>'invoice_id')::uuid and workspace_id = p_workspace_id and agent_id = p_agent_id for update;
    if not found then raise exception 'INVOICE_NOT_FOUND'; end if;
    v_allocated := (v_allocation->>'amount')::numeric;
    if v_allocated <= 0 then raise exception 'INVALID_ALLOCATION'; end if;
    select coalesce(sum(allocation.amount), 0) into v_total from public.agent_payment_allocations allocation join public.agent_payments payment on payment.id = allocation.payment_id
    where allocation.invoice_id = v_invoice.id and payment.status = 'recorded';
    if v_total + v_allocated > v_invoice.total_amount then raise exception 'ALLOCATION_EXCEEDS_INVOICE_BALANCE'; end if;
  end loop;
  select coalesce(sum((value->>'amount')::numeric), 0) into v_total from jsonb_array_elements(p_allocations);
  if v_total <> p_amount then raise exception 'PAYMENT_ALLOCATION_TOTAL_MISMATCH'; end if;
  insert into public.agent_payments (workspace_id, agent_id, amount, payment_method, transaction_reference, paid_at, notes, recorded_by)
  values (p_workspace_id, p_agent_id, p_amount, coalesce(nullif(btrim(p_payment_method), ''), 'bank_transfer'), nullif(btrim(p_transaction_reference), ''), coalesce(p_paid_at, now()), nullif(btrim(p_notes), ''), (select auth.uid())) returning id into v_payment_id;
  for v_allocation in select value from jsonb_array_elements(p_allocations) loop
    insert into public.agent_payment_allocations (payment_id, invoice_id, workspace_id, amount)
    values (v_payment_id, (v_allocation->>'invoice_id')::uuid, p_workspace_id, (v_allocation->>'amount')::numeric);
  end loop;
  update public.agent_invoices invoice set status = case when paid.total_paid >= invoice.total_amount then 'paid' else 'partially_paid' end, updated_at = now()
  from (select allocation.invoice_id, sum(allocation.amount) total_paid from public.agent_payment_allocations allocation join public.agent_payments payment on payment.id = allocation.payment_id where payment.status = 'recorded' group by allocation.invoice_id) paid
  where invoice.id = paid.invoice_id and invoice.workspace_id = p_workspace_id;
  insert into public.agent_payroll_audit_log (workspace_id, actor_id, action, entity_type, entity_id, details)
  values (p_workspace_id, (select auth.uid()), 'payment_recorded', 'agent_payment', v_payment_id, jsonb_build_object('amount', p_amount, 'agent_id', p_agent_id));
  return v_payment_id;
end; $$;

create or replace function public.acknowledge_agent_payment_v1(p_payment_id uuid, p_outcome text, p_actual_amount numeric default null, p_explanation text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_payment public.agent_payments%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into v_payment from public.agent_payments where id = p_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if v_payment.agent_id <> (select auth.uid()) then raise exception 'PAYMENT_ACKNOWLEDGMENT_FORBIDDEN'; end if;
  if v_payment.status <> 'recorded' then raise exception 'PAYMENT_NOT_ACTIVE'; end if;
  if p_outcome not in ('received_full', 'not_received', 'received_different') then raise exception 'INVALID_ACKNOWLEDGMENT'; end if;
  if p_outcome = 'received_different' and (p_actual_amount is null or p_actual_amount < 0 or nullif(btrim(p_explanation), '') is null) then raise exception 'PAYMENT_DIFFERENCE_DETAILS_REQUIRED'; end if;
  insert into public.agent_payment_acknowledgments (workspace_id, payment_id, agent_id, outcome, actual_amount, explanation)
  values (v_payment.workspace_id, v_payment.id, v_payment.agent_id, p_outcome, p_actual_amount, nullif(btrim(p_explanation), ''))
  on conflict (payment_id) do nothing;
  if not found then raise exception 'PAYMENT_ALREADY_ACKNOWLEDGED'; end if;
  if p_outcome <> 'received_full' then
    insert into public.agent_payment_disputes (workspace_id, payment_id, agent_id, reason)
    values (v_payment.workspace_id, v_payment.id, v_payment.agent_id, coalesce(nullif(btrim(p_explanation), ''), p_outcome))
    on conflict (payment_id) do update set status = 'open', reason = excluded.reason, updated_at = now();
  end if;
  return jsonb_build_object('payment_id', v_payment.id, 'outcome', p_outcome);
end; $$;

-- Strict RLS: founders manage; agents only see their own invoices/payments and
-- their own bank record. Browser clients do not receive ledger write access.
alter table public.workspace_confirmation_assignment_settings enable row level security;
alter table public.order_confirmation_recipients enable row level security;
alter table public.order_confirmation_events enable row level security;
alter table public.agent_payment_rules enable row level security;
alter table public.agent_payment_rule_versions enable row level security;
alter table public.agent_payroll_schedules enable row level security;
alter table public.agent_payroll_periods enable row level security;
alter table public.agent_earnings enable row level security;
alter table public.agent_invoices enable row level security;
alter table public.agent_invoice_lines enable row level security;
alter table public.agent_bank_accounts enable row level security;
alter table public.agent_payments enable row level security;
alter table public.agent_payment_allocations enable row level security;
alter table public.agent_payment_proofs enable row level security;
alter table public.agent_payment_acknowledgments enable row level security;
alter table public.agent_payment_disputes enable row level security;
alter table public.agent_payroll_audit_log enable row level security;

create policy assignment_settings_founder_read on public.workspace_confirmation_assignment_settings for select to authenticated using ((select public.can_manage_workspace_team(workspace_id)));
create policy recipients_founder_or_recipient_read on public.order_confirmation_recipients for select to authenticated using ((select public.can_manage_workspace_team(workspace_id)) or (recipient_type = 'agent' and agent_id = (select auth.uid())));
create policy confirmation_events_founder_or_agent_read on public.order_confirmation_events for select to authenticated using ((select public.can_manage_workspace_team(workspace_id)) or agent_id = (select auth.uid()));
create policy agent_rules_founder_read on public.agent_payment_rules for select to authenticated using ((select public.can_manage_workspace_payroll(workspace_id)));
create policy agent_rule_versions_founder_read on public.agent_payment_rule_versions for select to authenticated using ((select public.can_manage_workspace_payroll(workspace_id)));
create policy payroll_schedules_founder_read on public.agent_payroll_schedules for select to authenticated using ((select public.can_manage_workspace_payroll(workspace_id)));
create policy payroll_periods_founder_read on public.agent_payroll_periods for select to authenticated using ((select public.can_manage_workspace_payroll(workspace_id)) or exists (select 1 from public.agent_invoices invoice where invoice.payroll_period_id = agent_payroll_periods.id and invoice.agent_id = (select auth.uid())));
create policy earnings_founder_or_agent_read on public.agent_earnings for select to authenticated using ((select public.can_manage_workspace_payroll(workspace_id)) or agent_id = (select auth.uid()));
create policy invoices_founder_or_agent_read on public.agent_invoices for select to authenticated using ((select public.can_manage_workspace_payroll(workspace_id)) or agent_id = (select auth.uid()));
create policy invoice_lines_founder_or_agent_read on public.agent_invoice_lines for select to authenticated using ((select public.can_manage_workspace_payroll(workspace_id)) or exists (select 1 from public.agent_invoices invoice where invoice.id = agent_invoice_lines.invoice_id and invoice.agent_id = (select auth.uid())));
create policy bank_accounts_founder_or_agent_read on public.agent_bank_accounts for select to authenticated using ((select public.can_manage_workspace_payroll(workspace_id)) or agent_id = (select auth.uid()));
create policy payments_founder_or_agent_read on public.agent_payments for select to authenticated using ((select public.can_manage_workspace_payroll(workspace_id)) or agent_id = (select auth.uid()));
create policy allocations_founder_or_agent_read on public.agent_payment_allocations for select to authenticated using ((select public.can_manage_workspace_payroll(workspace_id)) or exists (select 1 from public.agent_invoices invoice where invoice.id = agent_payment_allocations.invoice_id and invoice.agent_id = (select auth.uid())));
create policy proofs_founder_or_agent_read on public.agent_payment_proofs for select to authenticated using ((select public.can_manage_workspace_payroll(workspace_id)) or exists (select 1 from public.agent_payments payment where payment.id = agent_payment_proofs.payment_id and payment.agent_id = (select auth.uid())));
create policy acknowledgments_founder_or_agent_read on public.agent_payment_acknowledgments for select to authenticated using ((select public.can_manage_workspace_payroll(workspace_id)) or agent_id = (select auth.uid()));
create policy disputes_founder_or_agent_read on public.agent_payment_disputes for select to authenticated using ((select public.can_manage_workspace_payroll(workspace_id)) or agent_id = (select auth.uid()));
create policy payroll_audit_founder_read on public.agent_payroll_audit_log for select to authenticated using ((select public.can_manage_workspace_payroll(workspace_id)));

revoke all on public.workspace_confirmation_assignment_settings, public.order_confirmation_recipients, public.order_confirmation_events,
  public.agent_payment_rules, public.agent_payment_rule_versions, public.agent_payroll_schedules, public.agent_payroll_periods,
  public.agent_earnings, public.agent_invoices, public.agent_invoice_lines, public.agent_bank_accounts, public.agent_payments,
  public.agent_payment_allocations, public.agent_payment_proofs, public.agent_payment_acknowledgments, public.agent_payment_disputes,
  public.agent_payroll_audit_log from anon, authenticated;
grant select on public.workspace_confirmation_assignment_settings, public.order_confirmation_recipients, public.order_confirmation_events,
  public.agent_payment_rules, public.agent_payment_rule_versions, public.agent_payroll_schedules, public.agent_payroll_periods,
  public.agent_earnings, public.agent_invoices, public.agent_invoice_lines, public.agent_bank_accounts, public.agent_payments,
  public.agent_payment_allocations, public.agent_payment_proofs, public.agent_payment_acknowledgments, public.agent_payment_disputes,
  public.agent_payroll_audit_log to authenticated;

-- Historical orders SELECT policy uses profiles.workspace_id and predates
-- invited multi-workspace agents. Add a membership-based grant for only their
-- assigned rows, then AND every authenticated SELECT with the same boundary.
-- This also prevents the old global is_supervisor() branch leaking other
-- tenants' orders. Service-role imports remain unaffected.
create policy orders_assigned_member_read on public.orders for select to authenticated
using (
  assigned_to = (select auth.uid())
  and public.is_active_workspace_member(workspace_id)
  and exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid()) and coalesce(profile.is_active, true)
      and (coalesce(to_jsonb(profile.allowed_sections), '[]'::jsonb) ?| array['Orders','Confirmation','Shipping'])
  )
);
create policy orders_membership_read_boundary on public.orders as restrictive for select to authenticated
using (
  public.can_manage_workspace_team(workspace_id)
  or (
    assigned_to = (select auth.uid())
    and public.is_active_workspace_member(workspace_id)
    and exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid()) and coalesce(profile.is_active, true)
        and (coalesce(to_jsonb(profile.allowed_sections), '[]'::jsonb) ?| array['Orders','Confirmation','Shipping'])
    )
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('agent-payment-proofs', 'agent-payment-proofs', false, 10485760, array['application/pdf','image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy agent_payment_proof_upload_founder on storage.objects for insert to authenticated
with check (bucket_id = 'agent-payment-proofs' and name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/' and (select public.can_manage_workspace_payroll(split_part(name, '/', 1)::uuid)));
create policy agent_payment_proof_read_scoped on storage.objects for select to authenticated
using (bucket_id = 'agent-payment-proofs' and exists (select 1 from public.agent_payment_proofs proof join public.agent_payments payment on payment.id = proof.payment_id where proof.storage_path = name and ((select public.can_manage_workspace_payroll(proof.workspace_id)) or payment.agent_id = (select auth.uid()))));
create policy agent_payment_proof_orphan_owner_read on storage.objects for select to authenticated
using (bucket_id = 'agent-payment-proofs' and owner_id = (select auth.uid())::text and name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/' and (select public.can_manage_workspace_payroll(split_part(name, '/', 1)::uuid)));
create policy agent_payment_proof_orphan_owner_delete on storage.objects for delete to authenticated
using (bucket_id = 'agent-payment-proofs' and owner_id = (select auth.uid())::text and name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/' and (select public.can_manage_workspace_payroll(split_part(name, '/', 1)::uuid)) and not exists (select 1 from public.agent_payment_proofs proof where proof.storage_path = name));

revoke all on function public.assign_confirmation_orders_v2(uuid, text, uuid, integer, uuid[], boolean) from public, anon;
revoke all on function public.set_confirmation_assignment_mode_v1(uuid, text) from public, anon;
revoke all on function public.reconcile_separated_confirmation_assignments_v1(uuid) from public, anon;
revoke all on function public.generate_agent_payroll_invoices_v1(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.run_due_agent_payroll_schedules_v1() from public, anon, authenticated;
revoke all on function public.save_agent_payment_rule_v1(uuid, uuid, uuid, text, boolean, jsonb) from public, anon;
revoke all on function public.save_agent_bank_account_v1(uuid, uuid, text, text, text, text, text, text) from public, anon;
revoke all on function public.save_agent_payroll_schedule_v1(uuid, jsonb) from public, anon;
revoke all on function public.attach_agent_payment_proof_v1(uuid, uuid, text, text, text, bigint) from public, anon;
revoke all on function public.record_agent_payment_v1(uuid, uuid, numeric, text, text, timestamptz, text, jsonb) from public, anon;
revoke all on function public.acknowledge_agent_payment_v1(uuid, text, numeric, text) from public, anon;
grant execute on function public.assign_confirmation_orders_v2(uuid, text, uuid, integer, uuid[], boolean) to authenticated;
grant execute on function public.set_confirmation_assignment_mode_v1(uuid, text) to authenticated;
grant execute on function public.reconcile_separated_confirmation_assignments_v1(uuid) to authenticated;
grant execute on function public.generate_agent_payroll_invoices_v1(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.run_due_agent_payroll_schedules_v1() to service_role;
grant execute on function public.save_agent_payment_rule_v1(uuid, uuid, uuid, text, boolean, jsonb) to authenticated;
grant execute on function public.save_agent_bank_account_v1(uuid, uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.save_agent_payroll_schedule_v1(uuid, jsonb) to authenticated;
grant execute on function public.attach_agent_payment_proof_v1(uuid, uuid, text, text, text, bigint) to authenticated;
grant execute on function public.record_agent_payment_v1(uuid, uuid, numeric, text, text, timestamptz, text, jsonb) to authenticated;
grant execute on function public.acknowledge_agent_payment_v1(uuid, text, numeric, text) to authenticated;

comment on table public.order_confirmation_recipients is 'Exclusive recipient ownership used only in separated confirmation mode.';
comment on table public.agent_earnings is 'Append-only authoritative earnings ledger. Invoices reference, never recalculate, accrued amounts.';
comment on table public.agent_payment_allocations is 'Immutable allocation ledger; a payment can be split across invoices.';

commit;
