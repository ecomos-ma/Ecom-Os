-- Super-admin managed visual references for the Tools Landing Page AI.
-- Assets remain private; only the server-side generator may read them.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'landing-page-template-assets',
  'landing-page-template-assets',
  false,
  3145728,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.landing_page_ai_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  style_instructions TEXT NOT NULL DEFAULT '',
  fit_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  asset_path TEXT NOT NULL UNIQUE,
  asset_mime_type TEXT NOT NULL,
  quality_score SMALLINT NOT NULL DEFAULT 70 CHECK (quality_score BETWEEN 1 AND 100),
  priority INTEGER NOT NULL DEFAULT 100 CHECK (priority >= 0),
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS landing_page_ai_templates_selection_idx
  ON public.landing_page_ai_templates (enabled, quality_score DESC, priority ASC, last_used_at ASC);

ALTER TABLE public.landing_page_ai_templates ENABLE ROW LEVEL SECURITY;

-- There are deliberately no browser policies. The dedicated super-admin Edge
-- Function handles management and the Tools proxy is the only reader during
-- generation, so template images and instructions cannot leak to tenants.

CREATE OR REPLACE FUNCTION public.set_landing_page_ai_template_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_landing_page_ai_templates_updated_at
  ON public.landing_page_ai_templates;

CREATE TRIGGER trg_landing_page_ai_templates_updated_at
  BEFORE UPDATE ON public.landing_page_ai_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_landing_page_ai_template_updated_at();
