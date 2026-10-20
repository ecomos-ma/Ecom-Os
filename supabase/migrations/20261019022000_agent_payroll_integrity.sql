-- Agent payroll integrity: non-overlapping periods/rules and exact invoice totals
--
-- Existing rows are preserved. Guards apply to new/changed periods and rule
-- versions, so the one legacy overlapping period pair found in the 2026-10-19
-- read-only snapshot can be reviewed separately without rewriting history.

begin;

create or replace function public.prevent_agent_payroll_period_overlap_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.agent_payroll_periods existing
    where existing.workspace_id = new.workspace_id
      and existing.id is distinct from new.id
      and tstzrange(existing.starts_at, existing.ends_at, '[)')
          && tstzrange(new.starts_at, new.ends_at, '[)')
      and not (
        existing.starts_at = new.starts_at
        and existing.ends_at = new.ends_at
      )
  ) then
    raise exception using
      errcode = '23P01',
      message = 'PAYROLL_PERIOD_OVERLAP';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_agent_payroll_period_overlap on public.agent_payroll_periods;
create trigger prevent_agent_payroll_period_overlap
before insert or update of workspace_id, starts_at, ends_at
on public.agent_payroll_periods
for each row execute function public.prevent_agent_payroll_period_overlap_v1();

create or replace function public.prevent_agent_payment_rule_overlap_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_enabled boolean;
begin
  select rule.enabled into v_parent_enabled
  from public.agent_payment_rules rule
  where rule.id = new.rule_id
    and rule.workspace_id = new.workspace_id
    and rule.agent_id = new.agent_id;

  if not coalesce(v_parent_enabled, false) then
    return new;
  end if;

  if exists (
    select 1
    from public.agent_payment_rule_versions existing
    join public.agent_payment_rules parent
      on parent.id = existing.rule_id
     and parent.enabled
    where existing.id is distinct from new.id
      and existing.workspace_id = new.workspace_id
      and existing.agent_id = new.agent_id
      and existing.rule_type = new.rule_type
      and existing.metric = new.metric
      and existing.period = new.period
      and daterange(
            existing.effective_from,
            coalesce(existing.effective_to + 1, 'infinity'::date),
            '[)'
          ) && daterange(
            new.effective_from,
            coalesce(new.effective_to + 1, 'infinity'::date),
            '[)'
          )
  ) then
    raise exception using
      errcode = '23P01',
      message = 'PAYMENT_RULE_EFFECTIVE_PERIOD_OVERLAP';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_agent_payment_rule_overlap on public.agent_payment_rule_versions;
create trigger prevent_agent_payment_rule_overlap
before insert or update of workspace_id, agent_id, rule_type, metric, period, effective_from, effective_to
on public.agent_payment_rule_versions
for each row execute function public.prevent_agent_payment_rule_overlap_v1();

-- Invoice headers are derived from immutable line amounts, never trusted from a
-- browser payload. The trigger also protects future adjustment-line support.
create or replace function public.sync_agent_invoice_totals_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid;
begin
  if tg_op = 'DELETE' then
    v_invoice_id := old.invoice_id;
  else
    v_invoice_id := new.invoice_id;
  end if;

  update public.agent_invoices invoice
  set total_earned = totals.earned,
      adjustment_total = totals.adjustments,
      total_amount = totals.total,
      updated_at = now()
  from (
    select
      coalesce(sum(line.amount) filter (where line.line_type <> 'adjustment'), 0) as earned,
      coalesce(sum(line.amount) filter (where line.line_type = 'adjustment'), 0) as adjustments,
      coalesce(sum(line.amount), 0) as total
    from public.agent_invoice_lines line
    where line.invoice_id = v_invoice_id
  ) totals
  where invoice.id = v_invoice_id;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_agent_invoice_totals on public.agent_invoice_lines;
create trigger sync_agent_invoice_totals
after insert or update of amount, line_type or delete
on public.agent_invoice_lines
for each row execute function public.sync_agent_invoice_totals_v1();

create or replace function public.save_agent_payment_rule_v1(
  p_workspace_id uuid,
  p_agent_id uuid,
  p_rule_id uuid,
  p_name text,
  p_enabled boolean,
  p_version jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule_id uuid;
  v_next_version integer;
  v_effective_from date := coalesce(nullif(p_version->>'effective_from', '')::date, current_date);
  v_effective_to date := nullif(p_version->>'effective_to', '')::date;
  v_rule_type text := coalesce(p_version->>'rule_type', '');
  v_metric text := coalesce(nullif(p_version->>'metric', ''), 'order');
  v_period text := coalesce(nullif(p_version->>'period', ''), 'order');
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.can_manage_workspace_payroll(p_workspace_id) then raise exception 'PAYMENT_RULE_MANAGEMENT_FORBIDDEN'; end if;
  if nullif(btrim(p_name), '') is null then raise exception 'RULE_NAME_REQUIRED'; end if;
  if v_rule_type not in ('per_delivered_order','per_confirmed_order','upsell','avg_answer_time_bonus','fixed_salary','custom') then raise exception 'INVALID_PAYMENT_RULE_TYPE'; end if;
  if coalesce((p_version->>'amount')::numeric, -1) < 0 then raise exception 'INVALID_PAYMENT_RULE_AMOUNT'; end if;
  if v_effective_to is not null and v_effective_to < v_effective_from then raise exception 'INVALID_PAYMENT_RULE_DATES'; end if;

  if p_rule_id is null then
    insert into public.agent_payment_rules (workspace_id, agent_id, name, enabled, created_by)
    values (p_workspace_id, p_agent_id, btrim(p_name), coalesce(p_enabled, true), (select auth.uid()))
    returning id into v_rule_id;
  else
    select rule.id into v_rule_id
    from public.agent_payment_rules rule
    where rule.id = p_rule_id
      and rule.workspace_id = p_workspace_id
      and rule.agent_id = p_agent_id
    for update;
    if v_rule_id is null then raise exception 'PAYMENT_RULE_NOT_FOUND'; end if;

    if exists (
      select 1
      from public.agent_payment_rule_versions version
      where version.rule_id = v_rule_id
        and version.effective_from >= v_effective_from
    ) then
      raise exception 'PAYMENT_RULE_EFFECTIVE_DATE_MUST_ADVANCE';
    end if;

    update public.agent_payment_rule_versions
    set effective_to = v_effective_from - 1
    where rule_id = v_rule_id
      and effective_from < v_effective_from
      and (effective_to is null or effective_to >= v_effective_from);

    update public.agent_payment_rules
    set name = btrim(p_name),
        enabled = coalesce(p_enabled, true),
        updated_at = now()
    where id = v_rule_id;
  end if;

  select coalesce(max(version_no), 0) + 1
  into v_next_version
  from public.agent_payment_rule_versions
  where rule_id = v_rule_id;

  insert into public.agent_payment_rule_versions (
    rule_id, workspace_id, agent_id, version_no, rule_type, metric, operator,
    threshold, minimum_sample_size, amount_type, amount, period, cap_amount,
    effective_from, effective_to, config, changed_by
  ) values (
    v_rule_id, p_workspace_id, p_agent_id, v_next_version, v_rule_type, v_metric,
    nullif(p_version->>'operator',''), nullif(p_version->>'threshold','')::numeric,
    coalesce(nullif(p_version->>'minimum_sample_size','')::integer, 0),
    coalesce(nullif(p_version->>'amount_type',''), 'fixed'),
    (p_version->>'amount')::numeric, v_period,
    nullif(p_version->>'cap_amount','')::numeric, v_effective_from, v_effective_to,
    coalesce(p_version->'config', '{}'::jsonb), (select auth.uid())
  );

  insert into public.agent_payroll_audit_log (
    workspace_id, actor_id, action, entity_type, entity_id, details
  ) values (
    p_workspace_id, (select auth.uid()), 'payment_rule_versioned',
    'agent_payment_rule', v_rule_id,
    jsonb_build_object(
      'version', v_next_version,
      'effective_from', v_effective_from,
      'effective_to', v_effective_to,
      'rule_type', v_rule_type,
      'metric', v_metric,
      'period', v_period
    )
  );
  return v_rule_id;
end;
$$;

-- Invoice generation is serialized by workspace and idempotent by exact period.
-- Accrued earnings older than the new cutoff are carried forward, so a late
-- carrier delivery never mutates a previously generated invoice and is not lost.
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
  v_period_status text;
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
  v_carried_forward integer := 0;
begin
  if p_ends_at <= p_starts_at then raise exception 'INVALID_PAYROLL_PERIOD'; end if;
  perform pg_advisory_xact_lock(hashtextextended('agent-payroll:' || p_workspace_id::text, 0));

  select period.id, period.status
  into v_period_id, v_period_status
  from public.agent_payroll_periods period
  where period.workspace_id = p_workspace_id
    and period.starts_at = p_starts_at
    and period.ends_at = p_ends_at
  for update;

  if v_period_id is not null and v_period_status = 'generated' then
    return jsonb_build_object(
      'period_id', v_period_id,
      'invoice_count', 0,
      'idempotent', true
    );
  end if;

  if v_period_id is null then
    insert into public.agent_payroll_periods (
      workspace_id, starts_at, ends_at, status, generated_by, generated_at
    ) values (
      p_workspace_id, p_starts_at, p_ends_at, 'closed', p_actor_id, now()
    ) returning id into v_period_id;
  end if;

  -- Materialization remains idempotent by earning_key. Delayed carrier updates
  -- receive their real delivered_at timestamp where available.
  for v_earning in
    select "Order ID" as order_id
    from public.orders
    where workspace_id = p_workspace_id
      and confirmed_at < p_ends_at
  loop
    perform public.materialize_agent_earnings_for_order_v1(p_workspace_id, v_earning.order_id);
  end loop;

  select count(*) into v_carried_forward
  from public.agent_earnings earning
  where earning.workspace_id = p_workspace_id
    and earning.status = 'accrued'
    and earning.earned_at < p_starts_at;

  for v_agent in
    select distinct earning.agent_id
    from public.agent_earnings earning
    where earning.workspace_id = p_workspace_id
      and earning.status = 'accrued'
      and earning.earned_at < p_ends_at
    union
    select distinct version.agent_id
    from public.agent_payment_rule_versions version
    join public.agent_payment_rules rule on rule.id = version.rule_id
    where version.workspace_id = p_workspace_id
      and rule.enabled
      and version.rule_type in ('fixed_salary', 'avg_answer_time_bonus')
      and version.effective_from <= p_ends_at::date
      and (version.effective_to is null or version.effective_to >= p_starts_at::date)
  loop
    for v_rule in
      select version.*
      from public.agent_payment_rule_versions version
      join public.agent_payment_rules rule on rule.id = version.rule_id
      where version.workspace_id = p_workspace_id
        and version.agent_id = v_agent.agent_id
        and rule.enabled
        and version.rule_type in ('fixed_salary', 'avg_answer_time_bonus')
        and version.effective_from <= p_ends_at::date
        and (version.effective_to is null or version.effective_to >= p_starts_at::date)
    loop
      v_bonus_amount := null;
      v_avg_seconds := null;
      v_call_count := 0;
      if v_rule.rule_type = 'fixed_salary' then
        v_bonus_amount := v_rule.amount;
      else
        select count(*), avg(extract(epoch from (activity.created_at - order_row.created_at)))
        into v_call_count, v_avg_seconds
        from public.confirmation_activities activity
        join public.orders order_row
          on order_row.workspace_id = activity.workspace_id
         and order_row."Order ID" = activity.order_id
        where activity.workspace_id = p_workspace_id
          and activity.agent_id = v_agent.agent_id
          and activity.activity_type = 'CALL_STARTED'
          and activity.created_at >= p_starts_at
          and activity.created_at < p_ends_at
          and activity.created_at >= order_row.created_at;

        if coalesce(v_call_count, 0) >= v_rule.minimum_sample_size
           and v_avg_seconds is not null
           and (
             (v_rule.operator = 'lt' and v_avg_seconds < v_rule.threshold)
             or (v_rule.operator = 'lte' and v_avg_seconds <= v_rule.threshold)
             or (v_rule.operator = 'gte' and v_avg_seconds >= v_rule.threshold)
             or (v_rule.operator = 'gt' and v_avg_seconds > v_rule.threshold)
             or (v_rule.operator = 'eq' and v_avg_seconds = v_rule.threshold)
           ) then
          v_bonus_amount := v_rule.amount;
        end if;
      end if;

      if v_bonus_amount is not null and v_bonus_amount > 0 then
        v_bonus_key := concat_ws(':', 'period', v_period_id::text, v_rule.id::text, v_rule.rule_type);
        insert into public.agent_earnings (
          workspace_id, agent_id, rule_version_id, earning_key, earning_type,
          unit_amount, amount, earned_at, metadata
        ) values (
          p_workspace_id, v_agent.agent_id, v_rule.id, v_bonus_key,
          case when v_rule.rule_type = 'fixed_salary' then 'fixed_salary' else 'answer_time_bonus' end,
          v_rule.amount, v_bonus_amount, p_ends_at - interval '1 microsecond',
          jsonb_build_object(
            'period_id', v_period_id,
            'avg_answer_seconds', v_avg_seconds,
            'eligible_calls', v_call_count
          )
        ) on conflict (workspace_id, earning_key) do nothing;
      end if;
    end loop;

    select coalesce(sum(earning.amount), 0)
    into v_total
    from public.agent_earnings earning
    where earning.workspace_id = p_workspace_id
      and earning.agent_id = v_agent.agent_id
      and earning.status = 'accrued'
      and earning.earned_at < p_ends_at;

    if v_total <= 0 then continue; end if;

    v_number := 'AGT-' || to_char(p_starts_at at time zone 'UTC', 'YYYYMMDD') || '-' || left(v_agent.agent_id::text, 8);
    insert into public.agent_invoices (
      workspace_id, agent_id, payroll_period_id, invoice_number,
      total_earned, total_amount, status, created_by, finalized_at
    ) values (
      p_workspace_id, v_agent.agent_id, v_period_id, v_number,
      v_total, v_total, 'issued', p_actor_id, now()
    )
    on conflict (workspace_id, agent_id, payroll_period_id)
    do update set updated_at = now()
    returning id into v_invoice_id;

    insert into public.agent_invoice_lines (
      invoice_id, workspace_id, earning_id, line_type, description,
      quantity, unit_amount, amount, rule_snapshot
    )
    select
      v_invoice_id, p_workspace_id, earning.id, earning.earning_type,
      coalesce(version.rule_type, earning.earning_type), earning.quantity,
      earning.unit_amount, earning.amount, coalesce(to_jsonb(version), '{}'::jsonb)
    from public.agent_earnings earning
    left join public.agent_payment_rule_versions version on version.id = earning.rule_version_id
    where earning.workspace_id = p_workspace_id
      and earning.agent_id = v_agent.agent_id
      and earning.status = 'accrued'
      and earning.earned_at < p_ends_at
    on conflict (invoice_id, earning_id) do nothing;

    update public.agent_earnings earning
    set status = 'invoiced', invoice_id = v_invoice_id
    where earning.workspace_id = p_workspace_id
      and earning.agent_id = v_agent.agent_id
      and earning.status = 'accrued'
      and earning.earned_at < p_ends_at;

    -- Recalculate once after the complete line set, in addition to the invariant
    -- trigger, so the returned invoice is internally consistent in this txn.
    update public.agent_invoices invoice
    set total_earned = totals.earned,
        adjustment_total = totals.adjustments,
        total_amount = totals.total,
        updated_at = now()
    from (
      select
        coalesce(sum(line.amount) filter (where line.line_type <> 'adjustment'), 0) as earned,
        coalesce(sum(line.amount) filter (where line.line_type = 'adjustment'), 0) as adjustments,
        coalesce(sum(line.amount), 0) as total
      from public.agent_invoice_lines line
      where line.invoice_id = v_invoice_id
    ) totals
    where invoice.id = v_invoice_id;

    v_created := v_created + 1;
  end loop;

  update public.agent_payroll_periods
  set status = 'generated', generated_at = now(), generated_by = p_actor_id
  where id = v_period_id;

  insert into public.agent_payroll_audit_log (
    workspace_id, actor_id, action, entity_type, entity_id, details
  ) values (
    p_workspace_id, p_actor_id, 'payroll_generated', 'payroll_period', v_period_id,
    jsonb_build_object(
      'invoice_count', v_created,
      'cutoff', p_ends_at,
      'carried_forward_earnings', v_carried_forward
    )
  );

  return jsonb_build_object(
    'period_id', v_period_id,
    'invoice_count', v_created,
    'carried_forward_earnings', v_carried_forward,
    'idempotent', false
  );
end;
$$;

revoke all on function public.prevent_agent_payroll_period_overlap_v1() from public, anon, authenticated;
revoke all on function public.prevent_agent_payment_rule_overlap_v1() from public, anon, authenticated;
revoke all on function public.sync_agent_invoice_totals_v1() from public, anon, authenticated;
revoke all on function public.generate_agent_payroll_invoices_internal_v1(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;

grant execute on function public.prevent_agent_payroll_period_overlap_v1() to service_role;
grant execute on function public.prevent_agent_payment_rule_overlap_v1() to service_role;
grant execute on function public.sync_agent_invoice_totals_v1() to service_role;
grant execute on function public.generate_agent_payroll_invoices_internal_v1(uuid, timestamptz, timestamptz, uuid) to service_role;

commit;
