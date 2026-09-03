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
