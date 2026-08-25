-- ============================================================
-- FOUNDER IMPERSONATION ACCESS
-- ============================================================
-- Allows founder to access a specific workspace's data via SECURITY DEFINER
-- Functions are scoped to a single workspace_id and verify founder status first

-- Create audit log table for impersonation sessions
CREATE TABLE IF NOT EXISTS public.founder_impersonation_audit (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  founder_email text NOT NULL,
  workspace_id uuid NOT NULL,
  workspace_name text,
  session_start timestamptz NOT NULL DEFAULT now(),
  session_end timestamptz,
  duration_seconds integer,
  created_at timestamptz DEFAULT now()
);

-- Grant access
GRANT SELECT, INSERT ON public.founder_impersonation_audit TO authenticated;
GRANT SELECT, INSERT ON public.founder_impersonation_audit TO anon;

-- RLS for audit log (only founder can see their own logs)
ALTER TABLE public.founder_impersonation_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Founders can view own impersonation logs"
  ON public.founder_impersonation_audit
  FOR SELECT
  USING (founder_email = auth.jwt()->>'email');

CREATE POLICY "Founders can insert impersonation logs"
  ON public.founder_impersonation_audit
  FOR INSERT
  WITH CHECK (founder_email = auth.jwt()->>'email');

-- Function to log impersonation session start
CREATE OR REPLACE FUNCTION public.log_impersonation_start(p_workspace_id uuid, p_workspace_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_founder_email text;
  v_session_id uuid;
BEGIN
  -- Get founder email from JWT
  v_founder_email := auth.jwt()->>'email';
  
  -- Verify founder status
  IF NOT public.is_founder_internal_user() THEN
    RAISE EXCEPTION 'Unauthorized: founder access required' USING ERRCODE = '42501';
  END IF;
  
  -- Log session start
  INSERT INTO public.founder_impersonation_audit (founder_email, workspace_id, workspace_name, session_start)
  VALUES (v_founder_email, p_workspace_id, p_workspace_name, now())
  RETURNING id INTO v_session_id;
  
  RETURN v_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_impersonation_start(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_impersonation_start(uuid, text) TO anon;

-- Function to log impersonation session end
CREATE OR REPLACE FUNCTION public.log_impersonation_end(p_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_founder_email text;
  v_session_start timestamptz;
BEGIN
  -- Get founder email from JWT
  v_founder_email := auth.jwt()->>'email';
  
  -- Verify founder status
  IF NOT public.is_founder_internal_user() THEN
    RAISE EXCEPTION 'Unauthorized: founder access required' USING ERRCODE = '42501';
  END IF;
  
  -- Get session start time
  SELECT session_start INTO v_session_start
  FROM public.founder_impersonation_audit
  WHERE id = p_session_id AND founder_email = v_founder_email;
  
  IF v_session_start IS NULL THEN
    RAISE EXCEPTION 'Session not found or unauthorized' USING ERRCODE = '42501';
  END IF;
  
  -- Update session end and duration
  UPDATE public.founder_impersonation_audit
  SET 
    session_end = now(),
    duration_seconds = EXTRACT(EPOCH FROM (now() - v_session_start))::integer
  WHERE id = p_session_id AND founder_email = v_founder_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_impersonation_end(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_impersonation_end(uuid) TO anon;

-- Function to get orders for impersonated workspace (scoped to single workspace)
CREATE OR REPLACE FUNCTION public.founder_impersonation_get_orders(p_workspace_id uuid)
RETURNS TABLE (
  id uuid,
  workspace_id uuid,
  total numeric,
  status text,
  shipping_status text,
  delivery_status text,
  created_at timestamptz,
  customer_name text,
  phone text,
  address text,
  raw_city text,
  sku text,
  product_name text,
  product_variant text,
  quantity integer,
  unit_price numeric
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Verify founder status
  IF NOT public.is_founder_internal_user() THEN
    RAISE EXCEPTION 'Unauthorized: founder access required' USING ERRCODE = '42501';
  END IF;
  
  RETURN QUERY
  SELECT 
    o.id,
    o.workspace_id,
    o.total,
    o.status,
    o.shipping_status,
    o.delivery_status,
    o.created_at,
    o.customer_name,
    o.phone,
    o.address,
    o.raw_city,
    o.sku,
    o.product_name,
    o.product_variant,
    o.quantity,
    o.unit_price
  FROM orders o
  WHERE o.workspace_id = p_workspace_id
  ORDER BY o.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.founder_impersonation_get_orders(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_impersonation_get_orders(uuid) TO anon;

-- Function to get workspace details for impersonation
CREATE OR REPLACE FUNCTION public.founder_impersonation_get_workspace(p_workspace_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  created_at timestamptz,
  settings jsonb
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Verify founder status
  IF NOT public.is_founder_internal_user() THEN
    RAISE EXCEPTION 'Unauthorized: founder access required' USING ERRCODE = '42501';
  END IF;
  
  RETURN QUERY
  SELECT 
    w.id,
    w.name,
    w.created_at,
    w.settings
  FROM workspaces w
  WHERE w.id = p_workspace_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.founder_impersonation_get_workspace(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_impersonation_get_workspace(uuid) TO anon;

-- Add comments
COMMENT ON TABLE public.founder_impersonation_audit IS 'Audit log for founder impersonation sessions. Tracks which workspaces founders access and for how long.';
COMMENT ON FUNCTION public.log_impersonation_start IS 'Logs the start of a founder impersonation session. Returns session ID for later tracking.';
COMMENT ON FUNCTION public.log_impersonation_end IS 'Logs the end of a founder impersonation session and calculates duration.';
COMMENT ON FUNCTION public.founder_impersonation_get_orders IS 'Returns orders for a specific workspace during impersonation. Scoped to single workspace_id and requires founder verification.';
COMMENT ON FUNCTION public.founder_impersonation_get_workspace IS 'Returns workspace details for impersonation. Scoped to single workspace_id and requires founder verification.';
