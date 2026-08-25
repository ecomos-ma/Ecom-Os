-- 095_ai_landing_page_versions.sql
-- Version history for landing pages

CREATE TABLE IF NOT EXISTS public.ai_landing_page_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_page_id UUID NOT NULL REFERENCES public.ai_landing_pages(id) ON DELETE CASCADE,
  version_number  INT NOT NULL,
  content         JSONB NOT NULL DEFAULT '{}'::jsonb,
  style_config    JSONB DEFAULT '{}'::jsonb,
  prompt_version  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_landing_page_versions_landing_page ON public.ai_landing_page_versions(landing_page_id, version_number);

ALTER TABLE public.ai_landing_page_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_select_ai_landing_page_versions"
  ON public.ai_landing_page_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_landing_pages
      WHERE id = landing_page_id AND workspace_id = public.get_user_workspace_id()
    )
  );

CREATE POLICY "super_admin_all_ai_landing_page_versions"
  ON public.ai_landing_page_versions FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
