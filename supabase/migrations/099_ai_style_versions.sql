-- 099_ai_style_versions.sql
-- Version history for style profiles

CREATE TABLE IF NOT EXISTS public.ai_style_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  style_profile_id UUID NOT NULL REFERENCES public.ai_style_profiles(id) ON DELETE CASCADE,
  version         INT NOT NULL,
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_style_versions_profile ON public.ai_style_versions(style_profile_id, version DESC);

ALTER TABLE public.ai_style_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_ai_style_versions"
  ON public.ai_style_versions FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "super_admin_all_ai_style_versions"
  ON public.ai_style_versions FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
