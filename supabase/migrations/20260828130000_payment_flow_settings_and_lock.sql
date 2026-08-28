-- Keep new accounts locked until a bank-transfer payment is approved.

INSERT INTO public.platform_settings (setting_key, value, description, category)
VALUES (
  'bank_transfer_details',
  '{"bank_name":"","account_name":"","rib":"","iban":"","instructions":"Make the bank transfer using the details below, then upload your receipt."}'::jsonb,
  'Bank transfer details shown on the customer payment page.',
  'billing'
)
ON CONFLICT (setting_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_bank_transfer_details_v1()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT value FROM public.platform_settings WHERE setting_key = 'bank_transfer_details'),
    '{"bank_name":"","account_name":"","rib":"","iban":"","instructions":"Make the bank transfer using the details below, then upload your receipt."}'::jsonb
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_bank_transfer_details_v1() TO authenticated;

CREATE OR REPLACE FUNCTION public.update_subscription_payment_reference_v1(
  p_request_id uuid,
  p_transaction_reference text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.subscription_payment_requests
  SET transaction_reference = nullif(trim(coalesce(p_transaction_reference, '')), '')
  WHERE id = p_request_id
    AND owner_user_id = auth.uid()
    AND status IN ('unpaid', 'rejected');
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_REQUEST_NOT_EDITABLE' USING errcode = '42501'; END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_subscription_payment_reference_v1(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_profile_workspace_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created_subscription boolean := false;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_subscriptions WHERE owner_user_id = NEW.id) THEN
    INSERT INTO public.user_subscriptions (
    owner_user_id, plan_id, billing_cycle, status, payment_status, migration_state
    )
    VALUES (NEW.id, NULL, NULL, 'grace', 'unpaid', 'assigned');
    created_subscription := true;
  END IF;

  INSERT INTO public.workspace_subscription_owners (workspace_id, owner_user_id, reason)
  VALUES (NEW.workspace_id, NEW.id, 'New user signup')
  ON CONFLICT (workspace_id) DO NOTHING;

  INSERT INTO public.profile_workspaces (profile_id, workspace_id, is_owner)
  VALUES (NEW.id, NEW.workspace_id, true)
  ON CONFLICT (profile_id, workspace_id) DO NOTHING;

  IF created_subscription THEN
    UPDATE public.user_subscriptions
    SET status = 'pending_payment', updated_at = now()
    WHERE owner_user_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;