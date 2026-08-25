-- ============================================================
-- Modify handle_new_user to create pending_activation subscription (FIXED)
-- ============================================================

-- Ensure there's a free plan to reference
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE name = 'free') THEN
    INSERT INTO public.subscription_plans (name, description, orders_limit, products_limit, members_limit, storage_limit_gb, integrations_limit, price_cents, currency)
    VALUES ('free', 'Free plan with basic features', 1000, 1000, 10, 10, 5, 0, 'USD');
  END IF;
END $$;

-- Modify handle_new_user to create workspace_subscription with pending_activation status
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_workspace_name text;
  v_full_name text;
  v_free_plan_id uuid;
BEGIN
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'User');
  v_workspace_name := coalesce(new.raw_user_meta_data->>'workspace_name', v_full_name || '''s Workspace');

  -- Create workspace
  INSERT INTO public.workspaces (name, status, plan)
  VALUES (v_workspace_name, 'active', 'free')
  RETURNING id INTO v_workspace_id;

  -- Create profile
  INSERT INTO public.profiles (id, full_name, role, workspace_id)
  VALUES (new.id, v_full_name, 'owner', v_workspace_id)
  ON CONFLICT (id) DO UPDATE
    SET workspace_id = excluded.workspace_id,
        full_name    = excluded.full_name;

  -- Get free plan ID
  SELECT id INTO v_free_plan_id FROM public.subscription_plans WHERE name = 'free' LIMIT 1;

  -- Create workspace subscription with pending_activation status
  IF v_free_plan_id IS NOT NULL THEN
    INSERT INTO public.workspace_subscriptions (workspace_id, plan_id, status, started_at)
    VALUES (v_workspace_id, v_free_plan_id, 'pending_activation', now())
    ON CONFLICT DO NOTHING;
  END IF;

  -- Create workspace limits entry
  INSERT INTO public.workspace_limits (profile_id, max_workspaces)
  VALUES (new.id, 1)
  ON CONFLICT (profile_id) DO NOTHING;

  -- Create profile workspace membership
  INSERT INTO public.profile_workspaces (profile_id, workspace_id, is_owner)
  VALUES (new.id, v_workspace_id, true)
  ON CONFLICT (profile_id, workspace_id) DO NOTHING;

  RETURN new;
END;
$$;
