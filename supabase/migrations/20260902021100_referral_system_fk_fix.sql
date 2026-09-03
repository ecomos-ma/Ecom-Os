-- Payment request IDs are assigned only after the payment row exists; this
-- prevents the referral FK from being written during a BEFORE INSERT trigger.
create or replace function public.referral_payment_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare referral public.seller_referrals;
declare reward public.seller_referrals;
declare original numeric(12,2);
begin
  original := new.expected_amount_mad;
  if new.request_type = 'initial_activation' then
    select * into referral from public.seller_referrals where referred_user_id = new.owner_user_id and status in ('signed_up','payment_pending') and first_payment_request_id is null for update;
    if found then
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
