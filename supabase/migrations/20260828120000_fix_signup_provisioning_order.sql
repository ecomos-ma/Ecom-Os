-- Ensure new-user provisioning creates billing ownership before membership triggers run.

CREATE OR REPLACE FUNCTION public.ensure_profile_workspace_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_subscriptions (
    owner_user_id,
    plan_id,
    billing_cycle,
    status,
    payment_status,
    timezone,
    migration_state
  )
  VALUES (NEW.id, NULL, NULL, 'grace', 'unpaid', 'Africa/Casablanca', 'assigned')
  ON CONFLICT (owner_user_id) DO NOTHING;

  INSERT INTO public.workspace_subscription_owners (workspace_id, owner_user_id, reason)
  VALUES (NEW.workspace_id, NEW.id, 'New user signup')
  ON CONFLICT (workspace_id) DO NOTHING;

  INSERT INTO public.profile_workspaces (profile_id, workspace_id, is_owner)
  VALUES (NEW.id, NEW.workspace_id, true)
  ON CONFLICT (profile_id, workspace_id) DO NOTHING;

  RETURN NEW;
END;
$$;