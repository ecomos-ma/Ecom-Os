-- Allow signup provisioning triggers to complete without granting lasting access.

CREATE OR REPLACE FUNCTION public.ensure_profile_workspace_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created_subscription boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_subscriptions WHERE owner_user_id = NEW.id
  ) THEN
    INSERT INTO public.user_subscriptions (
      owner_user_id,
      plan_id,
      billing_cycle,
      status,
      payment_status,
      migration_state
    )
    VALUES (NEW.id, NULL, NULL, 'active', 'unpaid', 'assigned');
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
