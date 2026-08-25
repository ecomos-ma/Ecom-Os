-- 092_ai_marketing_angles.sql
-- Generated marketing angles for products

CREATE TABLE IF NOT EXISTS public.ai_marketing_angles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES public.ai_products(id) ON DELETE CASCADE,
  angle           TEXT NOT NULL,
  angle_details   TEXT,
  prompt_version  TEXT,
  provider_id     UUID REFERENCES public.ai_providers(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_marketing_angles_product ON public.ai_marketing_angles(product_id, created_at DESC);

ALTER TABLE public.ai_marketing_angles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_select_ai_marketing_angles"
  ON public.ai_marketing_angles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_products
      WHERE id = product_id AND workspace_id = public.get_user_workspace_id()
    )
  );

CREATE POLICY "super_admin_all_ai_marketing_angles"
  ON public.ai_marketing_angles FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
