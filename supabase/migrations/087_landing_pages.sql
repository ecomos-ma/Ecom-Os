-- Migration 087: AI Landing Pages — workspace-scoped landing page storage

-- ─── Style DNA ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.landing_page_styles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  version     INT NOT NULL DEFAULT 1,
  is_active   BOOLEAN NOT NULL DEFAULT false,
  style_dna   JSONB NOT NULL DEFAULT '{}',  -- CSS variables, fonts, colors, spacing
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one active style at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_landing_page_styles_active
  ON public.landing_page_styles(is_active) WHERE is_active = true;

-- ─── Landing Pages ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.landing_pages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Product data
  product_image_url TEXT,
  product_analysis  JSONB NOT NULL DEFAULT '{}',   -- structured JSON from Gemini
  -- Configuration
  market            TEXT NOT NULL DEFAULT 'morocco',
  language          TEXT NOT NULL DEFAULT 'darija',
  marketing_angle   TEXT NOT NULL DEFAULT '',
  angle_details     JSONB DEFAULT '{}',
  -- Pricing (deterministic, never from AI)
  cost_price        NUMERIC(10,2),
  selling_price     NUMERIC(10,2),
  shipping_cost     NUMERIC(10,2) DEFAULT 0,
  currency          TEXT DEFAULT 'MAD',
  max_discount      NUMERIC(5,2) DEFAULT 0,
  -- Offer (calculated server-side)
  offer_config      JSONB DEFAULT '{}',
  -- Generated content
  content_json      JSONB NOT NULL DEFAULT '{}',   -- structured page sections
  -- Style locking
  style_id          UUID REFERENCES public.landing_page_styles(id) ON DELETE SET NULL,
  style_version     INT,
  -- QA scores
  conversion_score  INT,
  style_score       INT,
  qa_issues         JSONB DEFAULT '[]',
  qa_recommendations JSONB DEFAULT '[]',
  -- Publishing
  is_published      BOOLEAN NOT NULL DEFAULT false,
  published_slug    TEXT UNIQUE,
  published_at      TIMESTAMPTZ,
  -- Metadata
  name              TEXT NOT NULL DEFAULT 'Untitled Landing Page',
  provider_id       UUID REFERENCES public.ai_providers(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_landing_pages_workspace ON public.landing_pages(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_landing_pages_published ON public.landing_pages(published_slug) WHERE is_published = true;

-- Updated_at trigger
DO $$ BEGIN
  CREATE TRIGGER trg_landing_pages_updated_at
    BEFORE UPDATE ON public.landing_pages
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_landing_page_styles_updated_at
    BEFORE UPDATE ON public.landing_page_styles
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landing_page_styles ENABLE ROW LEVEL SECURITY;

-- Published pages are publicly readable (no auth needed — for public landing page route)
CREATE POLICY "public_read_published_landing_pages"
  ON public.landing_pages FOR SELECT
  USING (is_published = true);

-- Workspace members can see all pages in their workspace
CREATE POLICY "workspace_landing_pages_select"
  ON public.landing_pages FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Workspace members can create pages
CREATE POLICY "workspace_landing_pages_insert"
  ON public.landing_pages FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Workspace members can update their pages
CREATE POLICY "workspace_landing_pages_update"
  ON public.landing_pages FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Users can delete their own pages
CREATE POLICY "landing_pages_delete_own"
  ON public.landing_pages FOR DELETE
  USING (user_id = auth.uid());

-- Super admin has full access
CREATE POLICY "super_admin_all_landing_pages"
  ON public.landing_pages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- Landing page styles: anyone authenticated can read; super admin manages
CREATE POLICY "authenticated_read_styles"
  ON public.landing_page_styles FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "super_admin_all_styles"
  ON public.landing_page_styles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- ─── Default Style DNA ────────────────────────────────────────────────────────
INSERT INTO public.landing_page_styles (name, version, is_active, style_dna)
VALUES (
  'EcomOS Default v1',
  1,
  true,
  '{
    "colors": {
      "primary": "#e11d48",
      "primaryLight": "#fbe9ef",
      "dark": "#0f0f0f",
      "surface": "#161616",
      "card": "#1c1c1c",
      "text": "#f5f5f5",
      "textMuted": "#a0a0a0",
      "border": "#2a2a2a",
      "success": "#22c55e",
      "warning": "#f59e0b"
    },
    "typography": {
      "fontFamily": "Inter, system-ui, sans-serif",
      "headingWeight": "800",
      "bodyWeight": "400",
      "baseSizePx": 16,
      "lineHeight": 1.6
    },
    "spacing": {
      "sectionPaddingY": "80px",
      "cardPadding": "32px",
      "borderRadius": "16px",
      "borderRadiusLg": "24px"
    },
    "buttons": {
      "borderRadius": "50px",
      "paddingX": "32px",
      "paddingY": "16px",
      "fontWeight": "700",
      "fontSize": "16px"
    },
    "shadows": {
      "card": "0 4px 24px rgba(0,0,0,0.4)",
      "button": "0 4px 20px rgba(225,29,72,0.4)"
    },
    "mobile": {
      "breakpoint": "768px",
      "sectionPaddingY": "48px",
      "headingScale": 0.85
    }
  }'::jsonb
)
ON CONFLICT DO NOTHING;
