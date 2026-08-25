-- 094_ai_landing_pages.sql
-- Landing page content and configurations

CREATE TABLE IF NOT EXISTS public.ai_landing_pages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  product_id          UUID REFERENCES public.ai_products(id) ON DELETE SET NULL,
  selected_angle      TEXT,
  selected_offer      TEXT,
  generated_content   JSONB DEFAULT '{}'::jsonb,
  status              TEXT NOT NULL DEFAULT 'draft',
  published_url       TEXT,
  prompt_version      TEXT,
  style_version       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_landing_pages_workspace ON public.ai_landing_pages(workspace_id, created_at DESC);
CREATE INDEX idx_ai_landing_pages_status ON public.ai_landing_pages(status);

CREATE TRIGGER update_ai_landing_pages_updated_at
  BEFORE UPDATE ON public.ai_landing_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ai_landing_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_select_ai_landing_pages"
  ON public.ai_landing_pages FOR SELECT
  USING (workspace_id = public.get_user_workspace_id());

CREATE POLICY "workspace_insert_ai_landing_pages"
  ON public.ai_landing_pages FOR INSERT
  WITH CHECK (workspace_id = public.get_user_workspace_id());

CREATE POLICY "workspace_update_ai_landing_pages"
  ON public.ai_landing_pages FOR UPDATE
  USING (workspace_id = public.get_user_workspace_id())
  WITH CHECK (workspace_id = public.get_user_workspace_id());

CREATE POLICY "workspace_delete_ai_landing_pages"
  ON public.ai_landing_pages FOR DELETE
  USING (workspace_id = public.get_user_workspace_id());

CREATE POLICY "public_read_published_landing_pages"
  ON public.ai_landing_pages FOR SELECT
  USING (status = 'published');

CREATE POLICY "super_admin_all_ai_landing_pages"
  ON public.ai_landing_pages FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
