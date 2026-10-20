-- Founder-only, intent-specific compensation editing. This migration is
-- additive: it does not alter issued invoices or delete existing rule history.
-- Apply after 20261019022000_agent_payroll_integrity.sql.

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.agent_payment_rule_versions'::regclass
      and tgname = 'prevent_agent_payment_rule_overlap' and not tgisinternal
  ) then
    raise exception 'AGENT_PAYROLL_INTEGRITY_MIGRATION_REQUIRED';
  end if;
end;
$$;

create or replace function public.agent_compensation_capabilities_v1()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select (select auth.uid()) is not null;
$$;

revoke all on function public.agent_compensation_capabilities_v1() from public, anon;
grant execute on function public.agent_compensation_capabilities_v1() to authenticated;

create or replace function public.save_agent_compensation_rule_v2(
  p_workspace_id uuid,
  p_agent_id uuid,
  p_rule_id uuid,
  p_intent text,
  p_amount_type text,
  p_amount numeric,
  p_effective_from date,
  p_enabled boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule_id uuid;
  v_previous public.agent_payment_rule_versions%rowtype;
  v_next_version integer;
  v_period text;
  v_name text;
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.can_manage_workspace_payroll(p_workspace_id) then raise exception 'PAYMENT_RULE_MANAGEMENT_FORBIDDEN'; end if;
  if p_agent_id is null or not exists (
    select 1 from public.profile_workspaces pw
    join public.profiles p on p.id = pw.profile_id
    where pw.workspace_id = p_workspace_id and pw.profile_id = p_agent_id
      and pw.status = 'active' and coalesce(p.is_active, true)
  ) then raise exception 'ACTIVE_AGENT_REQUIRED'; end if;
  if p_intent not in ('per_confirmed_order', 'per_delivered_order', 'fixed_salary') then raise exception 'UNSUPPORTED_PAYMENT_INTENT'; end if;
  if p_amount_type not in ('fixed', 'percentage') or (p_intent = 'fixed_salary' and p_amount_type <> 'fixed') then raise exception 'INVALID_PAYMENT_RATE_TYPE'; end if;
  if p_amount is null or p_amount < 0 or (p_amount_type = 'percentage' and p_amount > 100) then raise exception 'INVALID_PAYMENT_AMOUNT'; end if;
  if p_enabled is distinct from true then raise exception 'DISABLE_REQUIRES_SEPARATE_PAYROLL_WORKFLOW'; end if;
  if p_effective_from is null or p_effective_from < current_date then raise exception 'INVALID_EFFECTIVE_DATE'; end if;

  v_period := case when p_intent = 'fixed_salary' then 'invoice' else 'order' end;
  v_name := case p_intent
    when 'per_confirmed_order' then 'Confirmed order'
    when 'per_delivered_order' then 'Delivered order'
    else 'Base salary' end;

  -- Serialize edits to this agent across concurrent browser sessions.
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_agent_id::text || ':' || p_intent, 0));

  if p_rule_id is not null then
    select rule.id into v_rule_id
    from public.agent_payment_rules rule
    where rule.id = p_rule_id and rule.workspace_id = p_workspace_id and rule.agent_id = p_agent_id
    for update;
    if v_rule_id is null then raise exception 'PAYMENT_RULE_NOT_FOUND'; end if;
    select * into v_previous from public.agent_payment_rule_versions
    where rule_id = v_rule_id order by version_no desc limit 1 for update;
    if not found or v_previous.rule_type <> p_intent then raise exception 'PAYMENT_RULE_INTENT_MISMATCH'; end if;
    if p_effective_from <= v_previous.effective_from then raise exception 'PAYMENT_RULE_EFFECTIVE_DATE_MUST_ADVANCE'; end if;
    if v_previous.effective_to is not null and v_previous.effective_to < p_effective_from - 1 then
      raise exception 'PAYMENT_RULE_HAS_GAP';
    end if;
  end if;

  if coalesce(p_enabled, true) and exists (
    select 1 from public.agent_payment_rule_versions version
    join public.agent_payment_rules rule on rule.id = version.rule_id
    where version.workspace_id = p_workspace_id and version.agent_id = p_agent_id
      and version.rule_type = p_intent and rule.enabled
      and (v_rule_id is null or version.rule_id <> v_rule_id)
      and daterange(version.effective_from, coalesce(version.effective_to + 1, 'infinity'::date), '[)')
        && daterange(p_effective_from, 'infinity'::date, '[)')
  ) then raise exception 'DUPLICATE_ACTIVE_PAYMENT_INTENT'; end if;

  if v_rule_id is null then
    insert into public.agent_payment_rules (workspace_id, agent_id, name, enabled, created_by)
    values (p_workspace_id, p_agent_id, v_name, coalesce(p_enabled, true), (select auth.uid()))
    returning id into v_rule_id;
    v_next_version := 1;
  else
    update public.agent_payment_rule_versions
    set effective_to = p_effective_from - 1
    where id = v_previous.id and (effective_to is null or effective_to >= p_effective_from);
    update public.agent_payment_rules
    set enabled = coalesce(p_enabled, true), name = v_name, updated_at = now()
    where id = v_rule_id;
    v_next_version := v_previous.version_no + 1;
  end if;

  insert into public.agent_payment_rule_versions (
    rule_id, workspace_id, agent_id, version_no, rule_type, metric,
    amount_type, amount, period, effective_from, changed_by, config
  ) values (
    v_rule_id, p_workspace_id, p_agent_id, v_next_version, p_intent, 'order',
    p_amount_type, p_amount, v_period, p_effective_from, (select auth.uid()),
    jsonb_build_object('formula_base', case when p_intent = 'fixed_salary' then 'invoice' when p_amount_type = 'percentage' then 'order_total' else 'event' end)
  );

  insert into public.agent_payroll_audit_log (workspace_id, actor_id, action, entity_type, entity_id, details)
  values (p_workspace_id, (select auth.uid()), 'payment_rule_versioned', 'agent_payment_rule', v_rule_id,
    jsonb_build_object('version', v_next_version, 'intent', p_intent, 'amount_type', p_amount_type,
      'amount', p_amount, 'effective_from', p_effective_from, 'enabled', p_enabled));
  return v_rule_id;
end;
$$;

revoke all on function public.save_agent_compensation_rule_v2(uuid, uuid, uuid, text, text, numeric, date, boolean) from public, anon;
grant execute on function public.save_agent_compensation_rule_v2(uuid, uuid, uuid, text, text, numeric, date, boolean) to authenticated;

-- Capture the amount at the human confirmation event. Existing events without
-- a snapshot are intentionally ineligible for a newly configured percentage
-- rule; using today's possibly changed total would misstate the commission.
create or replace function public.snapshot_agent_confirmation_amount_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total numeric;
begin
  if new.source <> 'agent_call' then return new; end if;
  select total into v_total from public.orders
  where workspace_id = new.workspace_id and "Order ID" = new.order_id;
  if v_total is not null then
    update public.order_confirmation_events
    set metadata = metadata || jsonb_build_object('order_total_at_confirmation', v_total)
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists a_snapshot_agent_confirmation_amount on public.order_confirmation_events;
create trigger a_snapshot_agent_confirmation_amount
after insert on public.order_confirmation_events
for each row execute function public.snapshot_agent_confirmation_amount_v1();

create or replace function public.stamp_agent_delivery_time_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.delivered_at is null
    and (lower(coalesce(new.shipping_status, '')) in ('delivered', 'livré', 'livre')
      or lower(coalesce(new.delivery_status, '')) in ('delivered', 'livré', 'livre'))
    and not (lower(coalesce(old.shipping_status, '')) in ('delivered', 'livré', 'livre')
      or lower(coalesce(old.delivery_status, '')) in ('delivered', 'livré', 'livre'))
  then new.delivered_at := now(); end if;
  return new;
end;
$$;

drop trigger if exists a_stamp_agent_delivery_time on public.orders;
create trigger a_stamp_agent_delivery_time
before update of shipping_status, delivery_status on public.orders
for each row execute function public.stamp_agent_delivery_time_v1();

-- Percentage is based on the order total at the qualifying event. The
-- legacy upsell branch is deliberately disabled: its source column currently
-- contains the final total, not an independently verified incremental value.
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
  v_event_at timestamptz;
  v_created integer := 0;
  v_delivered boolean;
begin
  select * into v_order from public.orders where workspace_id = p_workspace_id and "Order ID" = p_order_id;
  if not found then return 0; end if;
  select * into v_event from public.order_confirmation_events
  where workspace_id = p_workspace_id and order_id = p_order_id and source = 'agent_call' and agent_id is not null
  order by occurred_at asc limit 1;
  if not found then return 0; end if;
  v_delivered := lower(coalesce(v_order.shipping_status, '')) in ('delivered', 'livré', 'livre')
    or lower(coalesce(v_order.delivery_status, '')) in ('delivered', 'livré', 'livre');

  for v_rule in
    select version.*, rule.enabled
    from public.agent_payment_rule_versions version
    join public.agent_payment_rules rule on rule.id = version.rule_id
    where version.workspace_id = p_workspace_id and version.agent_id = v_event.agent_id and rule.enabled
      and version.rule_type in ('per_confirmed_order', 'per_delivered_order')
  loop
    if v_rule.rule_type = 'per_confirmed_order' then
      if lower(coalesce(v_order.status, '')) in ('cancelled', 'returned') then continue; end if;
      v_event_at := coalesce(v_order.confirmed_at, v_event.occurred_at);
      v_type := 'confirmed_commission';
    else
      if not v_delivered or v_order.delivered_at is null then continue; end if;
      v_event_at := v_order.delivered_at;
      v_type := 'delivered_commission';
    end if;
    if v_rule.effective_from > v_event_at::date or (v_rule.effective_to is not null and v_rule.effective_to < v_event_at::date) then continue; end if;
    if v_rule.amount_type = 'percentage' then
      if v_rule.rule_type = 'per_confirmed_order' then
        if not (v_event.metadata ? 'order_total_at_confirmation') then continue; end if;
        v_amount := round((v_event.metadata->>'order_total_at_confirmation')::numeric * v_rule.amount / 100, 2);
      else
        if v_order.total is null then continue; end if;
        v_amount := round(v_order.total * v_rule.amount / 100, 2);
      end if;
    else
      v_amount := v_rule.amount;
    end if;
    if v_amount <= 0 then continue; end if;
    v_key := concat_ws(':', 'order', p_order_id::text, v_event.id::text, v_rule.rule_id::text, v_type);
    insert into public.agent_earnings (
      workspace_id, agent_id, rule_version_id, confirmation_event_id, order_id,
      earning_key, earning_type, unit_amount, amount, earned_at, metadata
    ) values (
      p_workspace_id, v_event.agent_id, v_rule.id, v_event.id, p_order_id,
      v_key, v_type, v_rule.amount, v_amount, v_event_at,
      jsonb_build_object('rule_type', v_rule.rule_type, 'amount_type', v_rule.amount_type,
        'formula_base', case when v_rule.amount_type = 'percentage' and v_rule.rule_type = 'per_confirmed_order'
          then (v_event.metadata->>'order_total_at_confirmation')::numeric
          when v_rule.amount_type = 'percentage' then v_order.total else 1 end)
    ) on conflict (workspace_id, earning_key) do nothing;
    if found then v_created := v_created + 1; end if;
  end loop;
  return v_created;
end;
$$;

-- The total can change during a legitimate order correction; this trigger
-- lets the ledger inspect it, while the deterministic earning key prevents
-- another payment for the same qualifying event.
drop trigger if exists z_sync_agent_order_earnings on public.orders;
create trigger z_sync_agent_order_earnings
after update of status, shipping_status, delivery_status, delivered_at, is_upsell, upsell_value, total
on public.orders for each row execute function public.sync_agent_order_earnings_v1();

revoke all on function public.snapshot_agent_confirmation_amount_v1() from public, anon, authenticated;
revoke all on function public.stamp_agent_delivery_time_v1() from public, anon, authenticated;
revoke all on function public.materialize_agent_earnings_for_order_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.snapshot_agent_confirmation_amount_v1() to service_role;
grant execute on function public.stamp_agent_delivery_time_v1() to service_role;
grant execute on function public.materialize_agent_earnings_for_order_v1(uuid, uuid) to service_role;
