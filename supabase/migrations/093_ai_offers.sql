-- 093_ai_offers.sql
-- Offer configurations for landing pages

CREATE TABLE IF NOT EXISTS public.ai_offers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_page_id UUID NOT NULL REFERENCES public.ai_landing_pages(id) ON DELETE CASCADE,
  offer_text      TEXT NOT NULL,
  price           NUMERIC(12,2),
  currency        TEXT,
  discount_type   TEXT,
  discount_value  NUMERIC(12,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_offers_landing_page ON public.ai_offers(landing_page_id);

ALTER TABLE public.ai_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_select_ai_offers"
  ON public.ai_offers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_landing_pages
      WHERE id = landing_page_id AND workspace_id = public.get_user_workspace_id()
    )
  );

CREATE POLICY "super_admin_all_ai_offers"
  ON public.ai_offers FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
