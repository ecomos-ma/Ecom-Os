-- ============================================================
-- EcomOS · Supervisor Admin Platform schema
-- Add platform settings, notifications, audit logs, subscriptions, and workspace metadata
-- ============================================================

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','starter','pro','enterprise')),
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS storage_used_gb numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_members integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS max_orders integer NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS max_products integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE TABLE IF NOT EXISTS public.platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settings_key text NOT NULL UNIQUE,
  platform_name text NOT NULL DEFAULT 'Ecom Scale',
  logo_url text,
  favicon_url text,
  maintenance_mode boolean NOT NULL DEFAULT false,
  registration_enabled boolean NOT NULL DEFAULT true,
  invitations_enabled boolean NOT NULL DEFAULT true,
  max_workspaces integer NOT NULL DEFAULT 1000,
  max_members integer NOT NULL DEFAULT 50,
  max_orders integer NOT NULL DEFAULT 10000,
  max_products integer NOT NULL DEFAULT 1000,
  default_plan text NOT NULL DEFAULT 'free' CHECK (default_plan IN ('free','starter','pro','enterprise')),
  smtp_host text,
  smtp_port integer,
  smtp_user text,
  smtp_sender_email text,
  feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  storage_limit_gb integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  audience_type text NOT NULL DEFAULT 'all' CHECK (audience_type IN ('all','workspace','role','user')),
  audience_target uuid,
  audience_role text,
  priority text NOT NULL DEFAULT 'info' CHECK (priority IN ('info','warning','critical')),
  channel text NOT NULL DEFAULT 'banner' CHECK (channel IN ('toast','banner','persistent')),
  start_at timestamptz NOT NULL DEFAULT now(),
  end_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  scheduled_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id),
  actor_email text,
  actor_role text,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  target_name text,
  ip_address text,
  user_agent text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  orders_limit integer NOT NULL DEFAULT 1000,
  products_limit integer NOT NULL DEFAULT 1000,
  members_limit integer NOT NULL DEFAULT 10,
  storage_limit_gb integer NOT NULL DEFAULT 10,
  integrations_limit integer NOT NULL DEFAULT 5,
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspace_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','trial','cancelled','expired')),
  started_at timestamptz NOT NULL DEFAULT now(),
  renews_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspace_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  due_date date NOT NULL DEFAULT current_date,
  paid_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','overdue','cancelled')),
  description text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supervisors_can_read_platform_settings"
  ON public.platform_settings FOR SELECT USING (public.is_supervisor());
CREATE POLICY "supervisors_can_manage_platform_settings"
  ON public.platform_settings FOR ALL USING (public.is_supervisor()) WITH CHECK (public.is_supervisor());

CREATE POLICY "supervisors_can_read_platform_notifications"
  ON public.platform_notifications FOR SELECT USING (public.is_supervisor());
CREATE POLICY "supervisors_can_manage_platform_notifications"
  ON public.platform_notifications FOR ALL USING (public.is_supervisor()) WITH CHECK (public.is_supervisor());

DROP POLICY IF EXISTS "supervisors_can_read_platform_audit_logs" ON public.platform_audit_logs;
CREATE POLICY "supervisors_can_read_platform_audit_logs"
  ON public.platform_audit_logs FOR SELECT USING (public.is_supervisor());
DROP POLICY IF EXISTS "supervisors_can_manage_platform_audit_logs" ON public.platform_audit_logs;
CREATE POLICY "supervisors_can_manage_platform_audit_logs"
  ON public.platform_audit_logs FOR ALL USING (public.is_supervisor()) WITH CHECK (public.is_supervisor());

CREATE POLICY "supervisors_can_read_subscription_plans"
  ON public.subscription_plans FOR SELECT USING (public.is_supervisor());
CREATE POLICY "supervisors_can_manage_subscription_plans"
  ON public.subscription_plans FOR ALL USING (public.is_supervisor()) WITH CHECK (public.is_supervisor());

CREATE POLICY "supervisors_can_read_workspace_subscriptions"
  ON public.workspace_subscriptions FOR SELECT USING (public.is_supervisor());
CREATE POLICY "supervisors_can_manage_workspace_subscriptions"
  ON public.workspace_subscriptions FOR ALL USING (public.is_supervisor()) WITH CHECK (public.is_supervisor());

CREATE POLICY "supervisors_can_read_workspace_invoices"
  ON public.workspace_invoices FOR SELECT USING (public.is_supervisor());
CREATE POLICY "supervisors_can_manage_workspace_invoices"
  ON public.workspace_invoices FOR ALL USING (public.is_supervisor()) WITH CHECK (public.is_supervisor());

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_platform_settings_updated_at ON public.platform_settings;
CREATE TRIGGER trg_platform_settings_updated_at
BEFORE UPDATE ON public.platform_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_platform_notifications_updated_at ON public.platform_notifications;
CREATE TRIGGER trg_platform_notifications_updated_at
BEFORE UPDATE ON public.platform_notifications
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_subscription_plans_updated_at ON public.subscription_plans;
CREATE TRIGGER trg_subscription_plans_updated_at
BEFORE UPDATE ON public.subscription_plans
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_workspace_subscriptions_updated_at ON public.workspace_subscriptions;
CREATE TRIGGER trg_workspace_subscriptions_updated_at
BEFORE UPDATE ON public.workspace_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_workspace_invoices_updated_at ON public.workspace_invoices;
CREATE TRIGGER trg_workspace_invoices_updated_at
BEFORE UPDATE ON public.workspace_invoices
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.platform_settings (settings_key)
VALUES ('default')
on conflict (settings_key) do nothing;

INSERT INTO public.subscription_plans (name, description, orders_limit, products_limit, members_limit, storage_limit_gb, integrations_limit, price_cents, currency)
VALUES
  ('Free', 'Entry-level plan for small sellers', 500, 250, 5, 5, 2, 0, 'USD'),
  ('Starter', 'Growth plan with expanded capacity', 2500, 1000, 15, 20, 5, 2999, 'USD'),
  ('Pro', 'Professional plan for scaling operations', 10000, 5000, 50, 100, 10, 9999, 'USD'),
  ('Enterprise', 'Full platform access with unlimited capacity', 999999, 999999, 999, 1000, 50, 24999, 'USD')
on conflict (name) do nothing;

INSERT INTO public.workspace_subscriptions (workspace_id, plan_id, status, started_at, renews_at)
SELECT
  w.id,
  (SELECT id FROM public.subscription_plans WHERE name = 'Free' LIMIT 1),
  'active',
  now(),
  now() + interval '30 days'
FROM public.workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM public.workspace_subscriptions s WHERE s.workspace_id = w.id
);

CREATE OR REPLACE FUNCTION public.get_admin_platform_metrics()
RETURNS TABLE(
  total_workspaces bigint,
  active_workspaces bigint,
  suspended_workspaces bigint,
  total_users bigint,
  owners bigint,
  agents bigint,
  orders_today bigint,
  orders_this_month bigint,
  revenue_this_month numeric,
  total_products bigint,
  total_customers bigint,
  total_integrations bigint,
  pending_invitations bigint,
  active_sessions bigint,
  platform_storage_gb numeric,
  database_size_bytes bigint,
  new_users_today bigint,
  new_workspaces_today bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_active_sessions bigint := 0;
BEGIN
  IF EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'sessions' AND column_name = 'expires_at'
  ) THEN
    EXECUTE 'SELECT count(*) FROM auth.sessions WHERE expires_at > now() AND revoked = false' INTO v_active_sessions;
  ELSIF EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'sessions' AND column_name = 'expiry'
  ) THEN
    EXECUTE 'SELECT count(*) FROM auth.sessions WHERE expiry > now() AND revoked = false' INTO v_active_sessions;
  ELSE
    v_active_sessions := 0;
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.workspaces) AS total_workspaces,
    (SELECT count(*) FROM public.workspaces WHERE status = 'active') AS active_workspaces,
    (SELECT count(*) FROM public.workspaces WHERE status = 'suspended') AS suspended_workspaces,
    (SELECT count(*) FROM public.profiles) AS total_users,
    (SELECT count(*) FROM public.profiles WHERE role = 'owner') AS owners,
    (SELECT count(*) FROM public.profiles WHERE role = 'agent') AS agents,
    (SELECT count(*) FROM public.orders WHERE created_at >= date_trunc('day', now())) AS orders_today,
    (SELECT count(*) FROM public.orders WHERE created_at >= date_trunc('month', now())) AS orders_this_month,
    (SELECT coalesce(sum(total), 0) FROM public.orders WHERE created_at >= date_trunc('month', now())) AS revenue_this_month,
    (SELECT count(*) FROM public.products) AS total_products,
    (SELECT count(*) FROM public.customers) AS total_customers,
    (SELECT count(*) FROM public.integrations) AS total_integrations,
    (SELECT count(*) FROM public.workspace_invitations WHERE status = 'pending') AS pending_invitations,
    v_active_sessions AS active_sessions,
    (SELECT coalesce(sum(storage_used_gb), 0) FROM public.workspaces) AS platform_storage_gb,
    pg_database_size(current_database()) AS database_size_bytes,
    (SELECT count(*) FROM public.profiles WHERE created_at >= date_trunc('day', now())) AS new_users_today,
    (SELECT count(*) FROM public.workspaces WHERE created_at >= date_trunc('day', now())) AS new_workspaces_today;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_platform_metrics() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_search(query text)
RETURNS TABLE(kind text, item_id uuid, title text, subtitle text, details jsonb)
LANGUAGE sql
SECURITY DEFINER
AS $$
SELECT 'User' AS kind, p.id AS item_id, p.full_name AS title, p.email AS subtitle,
  jsonb_build_object('workspace_id', p.workspace_id, 'role', p.role) AS details
FROM public.profiles p
WHERE (p.full_name ILIKE '%' || query || '%' OR p.email ILIKE '%' || query || '%')
UNION ALL
SELECT 'Workspace' AS kind, w.id AS item_id, w.name AS title, w.status AS subtitle,
  jsonb_build_object('plan', w.plan, 'owner_email', (SELECT email FROM public.profiles WHERE workspace_id = w.id AND role = 'owner' LIMIT 1)) AS details
FROM public.workspaces w
WHERE w.name ILIKE '%' || query || '%'
UNION ALL
SELECT 'Order' AS kind, o.id AS item_id, o.order_number AS title, o.status AS subtitle,
  jsonb_build_object('workspace_id', o.workspace_id, 'customer_phone', o.phone) AS details
FROM public.orders o
WHERE o.order_number ILIKE '%' || query || '%' OR o.phone ILIKE '%' || query || '%'
UNION ALL
SELECT 'Customer' AS kind, c.id AS item_id, c.name AS title, c.phone AS subtitle,
  jsonb_build_object('workspace_id', c.workspace_id, 'city', c.city) AS details
FROM public.customers c
WHERE c.name ILIKE '%' || query || '%' OR c.phone ILIKE '%' || query || '%'
UNION ALL
SELECT 'Product' AS kind, p.id AS item_id, p.name AS title, p.sku AS subtitle,
  jsonb_build_object('workspace_id', p.workspace_id, 'status', p.status) AS details
FROM public.products p
WHERE p.name ILIKE '%' || query || '%' OR p.sku ILIKE '%' || query || '%';
$$;

GRANT EXECUTE ON FUNCTION public.admin_search(text) TO authenticated;
