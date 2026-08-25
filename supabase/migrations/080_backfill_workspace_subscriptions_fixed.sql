  -- ============================================================
  -- Backfill workspace_subscriptions for existing workspaces (FIXED)
  -- Ensure all existing workspaces have an active subscription entry
  -- ============================================================

  -- First, check if the free plan exists, if not create it
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE name = 'free') THEN
      INSERT INTO public.subscription_plans (name, description, orders_limit, products_limit, members_limit, storage_limit_gb, integrations_limit, price_cents, currency)
      VALUES ('free', 'Free plan with basic features', 1000, 1000, 10, 10, 5, 0, 'USD');
    END IF;
  END $$;

  -- Insert active subscriptions for workspaces that don't have one yet
  INSERT INTO public.workspace_subscriptions (workspace_id, plan_id, status, started_at)
  SELECT 
    id,
    (SELECT id FROM public.subscription_plans WHERE name = 'free' LIMIT 1),
    'active',
    created_at
  FROM public.workspaces 
  WHERE id NOT IN (SELECT workspace_id FROM public.workspace_subscriptions)
  AND (deleted_at IS NULL OR deleted_at IS NULL = false);
