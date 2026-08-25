-- 091_ai_product_analyses.sql
-- Detailed product analyses by type

CREATE TABLE IF NOT EXISTS public.ai_product_analyses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES public.ai_products(id) ON DELETE CASCADE,
  analysis_type   TEXT NOT NULL,
  analysis_data   JSONB DEFAULT '{}'::jsonb,
  prompt_version  TEXT,
  provider_id     UUID REFERENCES public.ai_providers(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_product_analyses_product ON public.ai_product_analyses(product_id, created_at DESC);

ALTER TABLE public.ai_product_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_select_ai_product_analyses"
  ON public.ai_product_analyses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_products
      WHERE id = product_id AND workspace_id = public.get_user_workspace_id()
    )
  );

CREATE POLICY "super_admin_all_ai_product_analyses"
  ON public.ai_product_analyses FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
