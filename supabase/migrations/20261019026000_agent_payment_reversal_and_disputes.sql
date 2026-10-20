-- Ecom OS: correction-safe agent payment reversals and dispute propagation.
-- Existing payments and allocations stay immutable. Reversal changes payment
-- state and derives invoice status from active allocations plus open disputes.

begin;

create or replace function public.refresh_agent_invoice_payment_status_v1(p_payment_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid;
  v_total_paid numeric;
  v_invoice_total numeric;
  v_has_open_dispute boolean;
  v_changed integer := 0;
begin
  for v_invoice_id in
    select distinct allocation.invoice_id
    from public.agent_payment_allocations allocation
    where allocation.payment_id = p_payment_id
  loop
    select invoice.total_amount into v_invoice_total
    from public.agent_invoices invoice
    where invoice.id = v_invoice_id
    for update;
    if not found then continue; end if;

    select coalesce(sum(allocation.amount), 0)
      into v_total_paid
    from public.agent_payment_allocations allocation
    join public.agent_payments payment on payment.id = allocation.payment_id
    where allocation.invoice_id = v_invoice_id
      and payment.status = 'recorded';

    select exists (
      select 1
      from public.agent_payment_allocations allocation
      join public.agent_payments payment on payment.id = allocation.payment_id
      join public.agent_payment_disputes dispute on dispute.payment_id = payment.id
      where allocation.invoice_id = v_invoice_id
        and payment.status = 'recorded'
        and dispute.status = 'open'
    ) into v_has_open_dispute;

    update public.agent_invoices invoice
    set status = case
          when invoice.status = 'void' then 'void'
          when v_has_open_dispute then 'disputed'
          when v_total_paid >= invoice.total_amount and invoice.total_amount > 0 then 'paid'
          when v_total_paid > 0 then 'partially_paid'
          when invoice.status = 'draft' then 'draft'
          else 'issued'
        end,
        updated_at = now()
    where invoice.id = v_invoice_id;
    v_changed := v_changed + 1;
  end loop;
  return v_changed;
end;
$$;

create or replace function public.sync_agent_payment_state_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'agent_payments' then
    perform public.refresh_agent_invoice_payment_status_v1(new.id);
  else
    perform public.refresh_agent_invoice_payment_status_v1(new.payment_id);
  end if;
  return new;
end;
$$;

drop trigger if exists sync_agent_invoice_after_payment_state on public.agent_payments;
create trigger sync_agent_invoice_after_payment_state
after update of status on public.agent_payments
for each row execute function public.sync_agent_payment_state_v1();

drop trigger if exists sync_agent_invoice_after_dispute_state on public.agent_payment_disputes;
create trigger sync_agent_invoice_after_dispute_state
after insert or update of status on public.agent_payment_disputes
for each row execute function public.sync_agent_payment_state_v1();

create or replace function public.reverse_agent_payment_v1(
  p_workspace_id uuid,
  p_payment_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_payment public.agent_payments%rowtype;
  v_changed integer := 0;
begin
  if v_actor_id is null then raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED'; end if;
  if not public.can_manage_workspace_payroll(p_workspace_id) then
    raise exception using errcode = '42501', message = 'PAYMENT_MANAGEMENT_FORBIDDEN';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 4 then
    raise exception using errcode = '22023', message = 'PAYMENT_REVERSAL_REASON_REQUIRED';
  end if;

  select payment.* into v_payment
  from public.agent_payments payment
  where payment.workspace_id = p_workspace_id and payment.id = p_payment_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'PAYMENT_NOT_FOUND'; end if;

  if v_payment.status = 'reversed' then
    return jsonb_build_object('payment_id', v_payment.id, 'status', 'reversed', 'idempotent', true);
  end if;

  update public.agent_payments payment
  set status = 'reversed',
      notes = concat_ws(E'\n', nullif(payment.notes, ''), 'Reversal: ' || left(btrim(p_reason), 500)),
      updated_at = now()
  where payment.id = v_payment.id;

  select public.refresh_agent_invoice_payment_status_v1(v_payment.id) into v_changed;
  insert into public.agent_payroll_audit_log (
    workspace_id, actor_id, action, entity_type, entity_id, details
  ) values (
    p_workspace_id, v_actor_id, 'payment_reversed', 'agent_payment', v_payment.id,
    jsonb_build_object('amount', v_payment.amount, 'agent_id', v_payment.agent_id, 'reason', left(btrim(p_reason), 500), 'invoices_recalculated', v_changed)
  );

  return jsonb_build_object('payment_id', v_payment.id, 'status', 'reversed', 'idempotent', false, 'invoices_recalculated', v_changed);
end;
$$;

create or replace function public.resolve_agent_payment_dispute_v1(
  p_workspace_id uuid,
  p_dispute_id uuid,
  p_resolution_status text,
  p_resolution text,
  p_reverse_payment boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_dispute public.agent_payment_disputes%rowtype;
  v_payment public.agent_payments%rowtype;
begin
  if v_actor_id is null then raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED'; end if;
  if not public.can_manage_workspace_payroll(p_workspace_id) then
    raise exception using errcode = '42501', message = 'PAYMENT_MANAGEMENT_FORBIDDEN';
  end if;
  if p_resolution_status not in ('resolved', 'dismissed') then
    raise exception using errcode = '22023', message = 'INVALID_DISPUTE_RESOLUTION_STATUS';
  end if;
  if char_length(btrim(coalesce(p_resolution, ''))) < 4 then
    raise exception using errcode = '22023', message = 'DISPUTE_RESOLUTION_REQUIRED';
  end if;

  select dispute.* into v_dispute
  from public.agent_payment_disputes dispute
  where dispute.workspace_id = p_workspace_id and dispute.id = p_dispute_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'PAYMENT_DISPUTE_NOT_FOUND'; end if;

  select payment.* into v_payment
  from public.agent_payments payment
  where payment.workspace_id = p_workspace_id and payment.id = v_dispute.payment_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'PAYMENT_NOT_FOUND'; end if;

  if p_reverse_payment and v_payment.status = 'recorded' then
    update public.agent_payments payment
    set status = 'reversed',
        notes = concat_ws(E'\n', nullif(payment.notes, ''), 'Dispute reversal: ' || left(btrim(p_resolution), 500)),
        updated_at = now()
    where payment.id = v_payment.id;
  end if;

  update public.agent_payment_disputes dispute
  set status = p_resolution_status,
      resolution = left(btrim(p_resolution), 1000),
      resolved_by = v_actor_id,
      resolved_at = now(),
      updated_at = now()
  where dispute.id = v_dispute.id;

  perform public.refresh_agent_invoice_payment_status_v1(v_payment.id);
  insert into public.agent_payroll_audit_log (
    workspace_id, actor_id, action, entity_type, entity_id, details
  ) values (
    p_workspace_id, v_actor_id, 'payment_dispute_resolved', 'agent_payment_dispute', v_dispute.id,
    jsonb_build_object(
      'payment_id', v_payment.id, 'resolution_status', p_resolution_status,
      'resolution', left(btrim(p_resolution), 1000), 'payment_reversed', p_reverse_payment
    )
  );

  return jsonb_build_object(
    'dispute_id', v_dispute.id, 'payment_id', v_payment.id,
    'status', p_resolution_status,
    'payment_status', case when p_reverse_payment then 'reversed' else v_payment.status end
  );
end;
$$;

revoke all on function public.refresh_agent_invoice_payment_status_v1(uuid) from public, anon, authenticated;
revoke all on function public.sync_agent_payment_state_v1() from public, anon, authenticated;
grant execute on function public.refresh_agent_invoice_payment_status_v1(uuid) to service_role;
grant execute on function public.sync_agent_payment_state_v1() to service_role;

revoke all on function public.reverse_agent_payment_v1(uuid, uuid, text) from public, anon;
revoke all on function public.resolve_agent_payment_dispute_v1(uuid, uuid, text, text, boolean) from public, anon;
grant execute on function public.reverse_agent_payment_v1(uuid, uuid, text) to authenticated;
grant execute on function public.resolve_agent_payment_dispute_v1(uuid, uuid, text, text, boolean) to authenticated;

commit;
