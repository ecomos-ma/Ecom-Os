-- 090_ai_products.sql
-- Product analysis and data for AI marketing

CREATE TABLE IF NOT EXISTS public.ai_products (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  product_name        TEXT NOT NULL,
  product_image_url   TEXT,
  benefit             TEXT,
  target_customer     TEXT,
  problem             TEXT,
  marketing_angle     TEXT,
  analysis_data       JSONB DEFAULT '{}'::jsonb,
  prompt_version      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_products_workspace ON public.ai_products(workspace_id, created_at DESC);

CREATE TRIGGER update_ai_products_updated_at
  BEFORE UPDATE ON public.ai_products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ai_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_select_ai_products"
  ON public.ai_products FOR SELECT
  USING (workspace_id = public.get_user_workspace_id());

CREATE POLICY "workspace_insert_ai_products"
  ON public.ai_products FOR INSERT
  WITH CHECK (workspace_id = public.get_user_workspace_id());

CREATE POLICY "workspace_update_ai_products"
  ON public.ai_products FOR UPDATE
  USING (workspace_id = public.get_user_workspace_id())
  WITH CHECK (workspace_id = public.get_user_workspace_id());

CREATE POLICY "workspace_delete_ai_products"
  ON public.ai_products FOR DELETE
  USING (workspace_id = public.get_user_workspace_id());

CREATE POLICY "super_admin_all_ai_products"
  ON public.ai_products FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
