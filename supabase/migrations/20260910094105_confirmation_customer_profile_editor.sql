-- Confirmation agents can correct a customer's contact and delivery details
-- without performing separate, partially-applied client updates. The function
-- derives the target customer from the workspace-scoped order and checks the
-- caller's operational workspace access before using elevated privileges.

create or replace function public.update_confirmation_customer_profile(
  p_workspace_id uuid,
  p_order_id uuid,
  p_name text,
  p_phone text,
  p_city text,
  p_address text
)
returns table (
  customer_id uuid,
  customer_name text,
  phone text,
  city text,
  address text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_customer_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_city text := nullif(btrim(coalesce(p_city, '')), '');
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
  v_normalized_phone text;
begin
  if (select auth.uid()) is null
     or not public.workspace_operational_access_v1(p_workspace_id) then
    raise exception using errcode = '42501', message = 'Workspace access denied';
  end if;

  if char_length(v_name) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'Customer name must be between 1 and 120 characters';
  end if;
  if v_phone is not null and char_length(v_phone) > 40 then
    raise exception using errcode = '22023', message = 'Customer phone is too long';
  end if;
  if v_city is not null and char_length(v_city) > 120 then
    raise exception using errcode = '22023', message = 'Customer city is too long';
  end if;
  if v_address is not null and char_length(v_address) > 500 then
    raise exception using errcode = '22023', message = 'Customer address is too long';
  end if;

  select o.*
    into v_order
  from public.orders o
  where o.workspace_id = p_workspace_id
    and o."Order ID" = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Order not found in current workspace';
  end if;

  v_normalized_phone := nullif(public.confirmation_crm_normalize_phone(v_phone), '');
  v_customer_id := v_order.customer_id;

  -- Older imported orders can lack customer_id. Reuse a same-workspace phone
  -- match when possible; otherwise create the canonical customer record now.
  if v_customer_id is null and v_phone is not null then
    select c.id
      into v_customer_id
    from public.customers c
    where c.workspace_id = p_workspace_id
      and (
        (v_normalized_phone is not null and c.normalized_phone = v_normalized_phone)
        or c.phone = v_phone
      )
    order by c.created_at asc
    limit 1;
  end if;

  if v_customer_id is null then
    insert into public.customers (
      workspace_id, name, phone, normalized_phone, city, address
    ) values (
      p_workspace_id, v_name, v_phone, v_normalized_phone, v_city, v_address
    )
    returning id into v_customer_id;
  else
    update public.customers c
    set name = v_name,
        phone = v_phone,
        normalized_phone = v_normalized_phone,
        city = v_city,
        address = v_address
    where c.workspace_id = p_workspace_id
      and c.id = v_customer_id;

    if not found then
      raise exception using errcode = 'P0002', message = 'Customer not found in current workspace';
    end if;
  end if;

  update public.orders o
  set customer_id = v_customer_id,
      customer_name = v_name,
      "Customer" = v_name,
      phone = v_phone,
      city = v_city,
      city_name = v_city,
      raw_city = v_city,
      address = v_address,
      address_source = 'confirmation_agent',
      ozon_city_id = case when o.city is distinct from v_city then null else o.ozon_city_id end,
      coliaty_city_id = case when o.city is distinct from v_city then null else o.coliaty_city_id end,
      provider_city_id = case when o.city is distinct from v_city then null else o.provider_city_id end,
      city_mapping_status = case when o.city is distinct from v_city then 'unresolved' else o.city_mapping_status end,
      city_mapping_confidence = case when o.city is distinct from v_city then null else o.city_mapping_confidence end,
      city_mapping_source = case when o.city is distinct from v_city then 'confirmation_agent' else o.city_mapping_source end,
      updated_at = now()
  where o.workspace_id = p_workspace_id
    and o."Order ID" = p_order_id;

  -- Attach any older notes for this order to the now-canonical customer.
  update public.confirmation_notes n
  set customer_id = v_customer_id
  where n.workspace_id = p_workspace_id
    and n.order_id = p_order_id
    and n.customer_id is null;

  return query
  select v_customer_id, v_name, v_phone, v_city, v_address;
end;
$function$;

revoke all on function public.update_confirmation_customer_profile(uuid, uuid, text, text, text, text)
  from public, anon;
grant execute on function public.update_confirmation_customer_profile(uuid, uuid, text, text, text, text)
  to authenticated, service_role;

comment on function public.update_confirmation_customer_profile(uuid, uuid, text, text, text, text)
  is 'Atomically updates a workspace order and its canonical customer profile for Confirmation CRM.';

-- Customer notes are loaded across all of the customer's orders.
update public.confirmation_notes n
set customer_id = o.customer_id
from public.orders o
where n.workspace_id = o.workspace_id
  and n.order_id = o."Order ID"
  and n.customer_id is null
  and o.customer_id is not null;

create index if not exists confirmation_notes_customer_created_idx
  on public.confirmation_notes (workspace_id, customer_id, created_at desc)
  where customer_id is not null;
