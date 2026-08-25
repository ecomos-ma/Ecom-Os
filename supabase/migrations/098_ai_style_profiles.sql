-- 098_ai_style_profiles.sql
-- Style profile definitions for landing pages

CREATE TABLE IF NOT EXISTS public.ai_style_profiles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  colors      JSONB DEFAULT '{}'::jsonb,
  typography  JSONB DEFAULT '{}'::jsonb,
  spacing     JSONB DEFAULT '{}'::jsonb,
  buttons     JSONB DEFAULT '{}'::jsonb,
  cards       JSONB DEFAULT '{}'::jsonb,
  hero        JSONB DEFAULT '{}'::jsonb,
  sections    JSONB DEFAULT '{}'::jsonb,
  mobile      JSONB DEFAULT '{}'::jsonb,
  desktop     JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_style_profiles_name ON public.ai_style_profiles(name);

ALTER TABLE public.ai_style_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_ai_style_profiles"
  ON public.ai_style_profiles FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "super_admin_all_ai_style_profiles"
  ON public.ai_style_profiles FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
