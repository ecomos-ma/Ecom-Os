-- Admin-managed presentation settings for the seller checkout.
-- Bank account details remain in payment_methods so multiple active accounts can
-- be offered without mixing operational payment data with presentation copy.

insert into public.platform_settings (setting_key, value, description, category)
values (
  'payment_checkout',
  jsonb_build_object(
    'headline', 'Choose the plan that fits your operation',
    'subheadline', 'Activate your Ecom OS workspace with a secure Moroccan bank transfer.',
    'accent_color', '#6d3ce7',
    'button_label', 'Confirm plan & continue',
    'trust_note', 'Your workspace activates after our team verifies your transfer.',
    'support_whatsapp', '0770877821',
    'default_plan', 'growth',
    'default_billing', 'monthly',
    'show_card', true,
    'show_paypal', true
  ),
  'Customer-facing copy and appearance for the subscription checkout.',
  'billing'
)
on conflict (setting_key) do nothing;

create or replace function public.get_payment_checkout_settings_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select settings.value
      from public.platform_settings as settings
      where settings.setting_key = 'payment_checkout'
    ),
    '{}'::jsonb
  );
$$;

create or replace function public.update_payment_checkout_settings_v1(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  accent text := lower(trim(coalesce(p_settings ->> 'accent_color', '#6d3ce7')));
  default_plan text := lower(trim(coalesce(p_settings ->> 'default_plan', 'growth')));
  default_billing text := lower(trim(coalesce(p_settings ->> 'default_billing', 'monthly')));
  sanitized jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if not public.has_platform_permission('billing.manage') then
    raise exception 'BILLING_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'PAYMENT_CHECKOUT_SETTINGS_OBJECT_REQUIRED' using errcode = '22023';
  end if;

  if accent !~ '^#[0-9a-f]{6}$' then
    raise exception 'INVALID_ACCENT_COLOR' using errcode = '22023';
  end if;

  if default_plan not in ('starter', 'growth', 'pro', 'scale') then
    raise exception 'INVALID_DEFAULT_PLAN' using errcode = '22023';
  end if;

  if default_billing not in ('monthly', 'yearly') then
    raise exception 'INVALID_DEFAULT_BILLING' using errcode = '22023';
  end if;

  sanitized := jsonb_build_object(
    'headline', left(trim(coalesce(p_settings ->> 'headline', 'Choose the plan that fits your operation')), 120),
    'subheadline', left(trim(coalesce(p_settings ->> 'subheadline', 'Activate your Ecom OS workspace with a secure Moroccan bank transfer.')), 240),
    'accent_color', accent,
    'button_label', left(trim(coalesce(p_settings ->> 'button_label', 'Confirm plan & continue')), 60),
    'trust_note', left(trim(coalesce(p_settings ->> 'trust_note', 'Your workspace activates after our team verifies your transfer.')), 200),
    'support_whatsapp', left(trim(coalesce(p_settings ->> 'support_whatsapp', '')), 40),
    'default_plan', default_plan,
    'default_billing', default_billing,
    'show_card', case when jsonb_typeof(p_settings -> 'show_card') = 'boolean' then (p_settings ->> 'show_card')::boolean else true end,
    'show_paypal', case when jsonb_typeof(p_settings -> 'show_paypal') = 'boolean' then (p_settings ->> 'show_paypal')::boolean else true end
  );

  insert into public.platform_settings (setting_key, value, description, category, updated_by, updated_at)
  values (
    'payment_checkout',
    sanitized,
    'Customer-facing copy and appearance for the subscription checkout.',
    'billing',
    auth.uid(),
    now()
  )
  on conflict (setting_key) do update
  set value = excluded.value,
      description = excluded.description,
      category = excluded.category,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  return sanitized;
end;
$$;

-- Replace the original manager function so custom customer instructions are
-- stored exactly once instead of being concatenated with the fallback copy.
create or replace function public.upsert_payment_method_v1(
  p_id uuid default null,
  p_slug text default null,
  p_display_name text default null,
  p_bank_name text default null,
  p_account_name text default null,
  p_rib text default null,
  p_iban text default null,
  p_instructions text default null,
  p_sort_order integer default 100,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_slug text;
  normalized_name text;
  normalized_instructions text;
  method_record public.payment_methods;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if not public.has_platform_permission('billing.manage') then
    raise exception 'BILLING_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  normalized_slug := lower(trim(coalesce(p_slug, '')));
  if normalized_slug = '' then
    normalized_slug := lower(regexp_replace(trim(coalesce(p_display_name, '')), '[^a-z0-9]+', '-', 'g'));
  end if;
  normalized_slug := trim(both '-' from normalized_slug);
  normalized_name := trim(coalesce(p_display_name, ''));
  normalized_instructions := coalesce(
    nullif(trim(coalesce(p_instructions, '')), ''),
    'Make the bank transfer using the details below, then upload your receipt.'
  );

  if normalized_slug = '' then
    raise exception 'PAYMENT_METHOD_SLUG_REQUIRED' using errcode = '22023';
  end if;
  if normalized_name = '' then
    raise exception 'PAYMENT_METHOD_NAME_REQUIRED' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.payment_methods (
      slug, display_name, bank_name, account_name, rib, iban, instructions,
      sort_order, is_active, archived_at, created_by, updated_at
    ) values (
      normalized_slug,
      normalized_name,
      nullif(trim(coalesce(p_bank_name, '')), ''),
      nullif(trim(coalesce(p_account_name, '')), ''),
      nullif(trim(coalesce(p_rib, '')), ''),
      nullif(trim(coalesce(p_iban, '')), ''),
      normalized_instructions,
      greatest(coalesce(p_sort_order, 100), 0),
      coalesce(p_is_active, true),
      null,
      auth.uid(),
      now()
    ) returning * into method_record;

    insert into public.payment_method_history(payment_method_id, event_type, snapshot, created_by)
    values (method_record.id, 'created', to_jsonb(method_record), auth.uid());
  else
    update public.payment_methods
    set slug = normalized_slug,
        display_name = normalized_name,
        bank_name = nullif(trim(coalesce(p_bank_name, '')), ''),
        account_name = nullif(trim(coalesce(p_account_name, '')), ''),
        rib = nullif(trim(coalesce(p_rib, '')), ''),
        iban = nullif(trim(coalesce(p_iban, '')), ''),
        instructions = normalized_instructions,
        sort_order = greatest(coalesce(p_sort_order, 100), 0),
        is_active = coalesce(p_is_active, true),
        archived_at = case when coalesce(p_is_active, true) then null else archived_at end,
        updated_at = now()
    where id = p_id
    returning * into method_record;

    if method_record.id is null then
      raise exception 'PAYMENT_METHOD_NOT_FOUND' using errcode = 'P0002';
    end if;

    insert into public.payment_method_history(payment_method_id, event_type, snapshot, created_by)
    values (method_record.id, 'updated', to_jsonb(method_record), auth.uid());
  end if;

  return to_jsonb(method_record);
end;
$$;

revoke all on function public.get_payment_checkout_settings_v1() from public, anon;
revoke all on function public.update_payment_checkout_settings_v1(jsonb) from public, anon;
revoke all on function public.upsert_payment_method_v1(uuid, text, text, text, text, text, text, text, integer, boolean) from public, anon;
grant execute on function public.get_payment_checkout_settings_v1() to authenticated, service_role;
grant execute on function public.update_payment_checkout_settings_v1(jsonb) to authenticated, service_role;
grant execute on function public.upsert_payment_method_v1(uuid, text, text, text, text, text, text, text, integer, boolean) to authenticated, service_role;
