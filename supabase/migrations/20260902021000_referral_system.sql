-- Referral system: one immutable relationship per referred account.
create extension if not exists pgcrypto;

create table if not exists public.seller_referral_codes (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null unique references public.profiles(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.seller_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references public.profiles(id) on delete cascade,
  referred_user_id uuid not null unique references public.profiles(id) on delete cascade,
  referral_code_id uuid not null references public.seller_referral_codes(id) on delete restrict,
  status text not null default 'signed_up',
  first_payment_discount_pct numeric(5,2) not null default 25 check (first_payment_discount_pct = 25),
  first_payment_request_id uuid references public.subscription_payment_requests(id) on delete set null,
  first_payment_discount_amount_mad numeric(12,2),
  activated_at timestamptz,
  reward_status text not null default 'pending',
  reward_discount_pct numeric(5,2) not null default 25 check (reward_discount_pct = 25),
  reward_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seller_referrals_not_self check (referrer_user_id <> referred_user_id),
  constraint seller_referrals_status_check check (status in ('signed_up','payment_pending','activated')),
  constraint seller_referrals_reward_check check (reward_status in ('pending','earned','used'))
);
create index if not exists seller_referrals_referrer_idx on public.seller_referrals(referrer_user_id, created_at desc);
create index if not exists seller_referrals_code_idx on public.seller_referral_codes(code);

alter table public.subscription_payment_requests
  add column if not exists original_amount_mad numeric(12,2),
  add column if not exists discount_amount_mad numeric(12,2) not null default 0,
  add column if not exists referral_id uuid references public.seller_referrals(id) on delete set null,
  add column if not exists reward_referral_id uuid references public.seller_referrals(id) on delete set null;

alter table public.seller_referral_codes enable row level security;
alter table public.seller_referrals enable row level security;
grant select on public.seller_referral_codes, public.seller_referrals to authenticated;

drop policy if exists seller_referral_codes_owner_read on public.seller_referral_codes;
create policy seller_referral_codes_owner_read on public.seller_referral_codes
  for select to authenticated using (referrer_user_id = (select auth.uid()));
drop policy if exists seller_referrals_participant_read on public.seller_referrals;
create policy seller_referrals_participant_read on public.seller_referrals
  for select to authenticated using (referrer_user_id = (select auth.uid()) or referred_user_id = (select auth.uid()));

create or replace function public.get_or_create_referral_code_v1()
returns text language plpgsql security definer set search_path = '' as $$
declare result text;
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501'; end if;
  select code into result from public.seller_referral_codes where referrer_user_id = (select auth.uid());
  if result is null then
    result := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    insert into public.seller_referral_codes(referrer_user_id, code) values ((select auth.uid()), result)
      on conflict (referrer_user_id) do nothing;
    select code into result from public.seller_referral_codes where referrer_user_id = (select auth.uid());
  end if;
  return result;
end;
$$;

create or replace function public.claim_referral_code_v1(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare code_row public.seller_referral_codes;
declare existing public.seller_referrals;
declare referrer uuid := (select auth.uid());
begin
  if referrer is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501'; end if;
  select * into code_row from public.seller_referral_codes where code = upper(trim(coalesce(p_code, '')));
  if not found then raise exception 'REFERRAL_CODE_NOT_FOUND' using errcode = '22023'; end if;
  if code_row.referrer_user_id = referrer then raise exception 'SELF_REFERRAL_NOT_ALLOWED' using errcode = '22023'; end if;
  select * into existing from public.seller_referrals where referred_user_id = referrer;
  if found then return jsonb_build_object('id', existing.id, 'status', existing.status, 'idempotent', true); end if;
  insert into public.seller_referrals(referrer_user_id, referred_user_id, referral_code_id)
    values (code_row.referrer_user_id, referrer, code_row.id)
    returning * into existing;
  return jsonb_build_object('id', existing.id, 'status', existing.status, 'idempotent', false);
end;
$$;

create or replace function public.get_my_referral_overview_v1()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'code', (select code from public.seller_referral_codes where referrer_user_id = (select auth.uid())),
    'referrals', coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'status', case when r.status = 'activated' then 'Activated' when r.status = 'payment_pending' then 'Payment Pending' else 'Signed Up' end,
      'reward_status', case when r.reward_status = 'earned' then 'Earned' when r.reward_status = 'used' then 'Used' else 'Pending' end,
      'created_at', r.created_at, 'activated_at', r.activated_at,
      'referred_email', coalesce(p.email, 'Seller')
    ) order by r.created_at desc) from public.seller_referrals r left join public.profiles p on p.id = r.referred_user_id where r.referrer_user_id = (select auth.uid())), '[]'::jsonb),
    'referred_by', (select jsonb_build_object('status', case when r.status = 'activated' then 'Activated' when r.status = 'payment_pending' then 'Payment Pending' else 'Signed Up' end, 'discount_pct', 25) from public.seller_referrals r where r.referred_user_id = (select auth.uid()))
  );
$$;

create or replace function public.get_my_referral_checkout_v1(p_request_type text default 'initial_activation')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare referral public.seller_referrals;
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501'; end if;
  if lower(trim(coalesce(p_request_type, 'initial_activation'))) = 'initial_activation' then
    select * into referral from public.seller_referrals where referred_user_id = (select auth.uid()) and status in ('signed_up','payment_pending') and first_payment_request_id is null limit 1;
  else
    select * into referral from public.seller_referrals where referrer_user_id = (select auth.uid()) and reward_status = 'earned' order by activated_at asc limit 1;
  end if;
  return jsonb_build_object('eligible', found, 'discount_pct', case when found then 25 else 0 end, 'kind', case when lower(trim(coalesce(p_request_type, 'initial_activation'))) = 'initial_activation' then 'first_payment' else 'renewal_reward' end);
end;
$$;

create or replace function public.platform_list_referrals_v1()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'referrer_user_id', r.referrer_user_id,
    'referrer_email', coalesce(ref.email, 'Seller'),
    'referred_user_id', r.referred_user_id,
    'referred_email', coalesce(referred.email, 'Seller'),
    'status', r.status,
    'reward_status', r.reward_status,
    'created_at', r.created_at,
    'activated_at', r.activated_at
  ) order by r.created_at desc), '[]'::jsonb)
  from public.seller_referrals r
  left join public.profiles ref on ref.id = r.referrer_user_id
  left join public.profiles referred on referred.id = r.referred_user_id
  where public.has_platform_permission('billing.read');
$$;

create or replace function public.referral_payment_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare referral public.seller_referrals;
declare reward public.seller_referrals;
declare original numeric(12,2);
begin
  original := new.expected_amount_mad;
  if new.request_type = 'initial_activation' then
    select * into referral from public.seller_referrals where referred_user_id = new.owner_user_id and status in ('signed_up','payment_pending') for update;
    if found and referral.first_payment_request_id is null then
      new.original_amount_mad := original;
      new.discount_amount_mad := round(original * referral.first_payment_discount_pct / 100, 2);
      new.expected_amount_mad := greatest(original - new.discount_amount_mad, 0);
      new.referral_id := referral.id;
      new.user_note := concat_ws(E'\n', new.user_note, 'Referral discount applied: 25%');
    end if;
  elsif new.request_type = 'renewal' then
    select * into reward from public.seller_referrals where referrer_user_id = new.owner_user_id and reward_status = 'earned' order by activated_at asc limit 1 for update;
    if found then
      new.original_amount_mad := original;
      new.discount_amount_mad := round(original * reward.reward_discount_pct / 100, 2);
      new.expected_amount_mad := greatest(original - new.discount_amount_mad, 0);
      new.reward_referral_id := reward.id;
    end if;
  end if;
  return new;
end;
$$;
create or replace function public.referral_payment_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.referral_id is not null then
    update public.seller_referrals set status = 'payment_pending', first_payment_request_id = new.id, first_payment_discount_amount_mad = new.discount_amount_mad, updated_at = now() where id = new.referral_id and first_payment_request_id is null;
  end if;
  return new;
end;
$$;
drop trigger if exists subscription_payment_referral_before_insert on public.subscription_payment_requests;
create trigger subscription_payment_referral_before_insert before insert on public.subscription_payment_requests for each row execute function public.referral_payment_before_insert();
drop trigger if exists subscription_payment_referral_after_insert on public.subscription_payment_requests;
create trigger subscription_payment_referral_after_insert after insert on public.subscription_payment_requests for each row execute function public.referral_payment_after_insert();

create or replace function public.referral_payment_after_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'rejected' and old.status is distinct from new.status and new.referral_id is not null then
    update public.seller_referrals set status = 'signed_up', first_payment_request_id = null, first_payment_discount_amount_mad = null, updated_at = now() where id = new.referral_id;
  end if;
  if new.status = 'paid' and old.status is distinct from new.status then
    if new.referral_id is not null then
      update public.seller_referrals set status = 'activated', activated_at = coalesce(activated_at, now()), reward_status = 'earned', updated_at = now() where id = new.referral_id;
    end if;
    if new.reward_referral_id is not null then
      update public.seller_referrals set reward_status = 'used', reward_used_at = now(), updated_at = now() where id = new.reward_referral_id and reward_status = 'earned';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists subscription_payment_referral_after_update on public.subscription_payment_requests;
create trigger subscription_payment_referral_after_update after update of status on public.subscription_payment_requests for each row execute function public.referral_payment_after_update();

revoke all on function public.get_or_create_referral_code_v1() from public, anon;
revoke all on function public.claim_referral_code_v1(text) from public, anon;
revoke all on function public.get_my_referral_overview_v1() from public, anon;
grant execute on function public.get_or_create_referral_code_v1() to authenticated, service_role;
grant execute on function public.claim_referral_code_v1(text) to authenticated, service_role;
grant execute on function public.get_my_referral_overview_v1() to authenticated, service_role;
revoke all on function public.get_my_referral_checkout_v1(text) from public, anon;
grant execute on function public.get_my_referral_checkout_v1(text) to authenticated, service_role;
revoke all on function public.platform_list_referrals_v1() from public, anon;
grant execute on function public.platform_list_referrals_v1() to authenticated, service_role;
