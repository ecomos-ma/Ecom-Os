-- ═══════════════════════════════════════════════════════════════
-- 066_ai_infrastructure.sql
-- AI Infrastructure System - Comprehensive AI Provider and Generation Management
-- ═══════════════════════════════════════════════════════════════

-- ─── Helper Function: Check if user is Super Admin ─────────────────────────────
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT coalesce((select role from public.profiles where id = auth.uid()), '') = 'super_admin';
$$;

-- ─── Helper Function: Get user's workspace ID ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_workspace_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT workspace_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ─── Enum Types ───────────────────────────────────────────────────────────────
CREATE TYPE ai_provider_status AS ENUM ('HEALTHY', 'DEGRADED', 'RATE_LIMITED', 'FAILED', 'DISABLED', 'TESTING');
CREATE TYPE ai_task_type AS ENUM (
  'PRODUCT_ANALYSIS', 
  'MARKETING_ANGLE', 
  'COPY_GENERATION', 
  'OFFER_GENERATION', 
  'LANDING_PAGE_GENERATION', 
  'LANDING_PAGE_EDIT', 
  'SECTION_REGENERATION', 
  'CONVERSION_QA', 
  'STYLE_QA', 
  'SAWTY_SCRIPT', 
  'SAWTY_VOICE'
);

-- ─── Table: ai_providers ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_providers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  provider_type       TEXT NOT NULL,                          -- 'openai', 'gemini', 'anthropic', etc.
  project_id          TEXT,                                   -- For cloud provider project IDs
  model_id            TEXT NOT NULL,                          -- Model identifier
  priority            INT NOT NULL DEFAULT 100,               -- Lower = higher priority
  status              ai_provider_status NOT NULL DEFAULT 'TESTING',
  encrypted_credential TEXT,                                   -- Encrypted API key/token
  capabilities        JSONB DEFAULT '{}'::jsonb,              -- Available capabilities
  health_status       TEXT NOT NULL DEFAULT 'UNKNOWN',        -- Current health status
  cooldown_until      TIMESTAMPTZ,                            -- Rate limit cooldown
  last_health_check   TIMESTAMPTZ,
  failure_count       INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Table: ai_provider_health ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_provider_health (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id   UUID NOT NULL REFERENCES public.ai_providers(id) ON DELETE CASCADE,
  status        TEXT NOT NULL,                               -- 'healthy', 'unhealthy', 'error'
  latency_ms    INT,
  error_code    TEXT,
  error_message TEXT,
  checked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Table: ai_provider_usage ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_provider_usage (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     UUID NOT NULL REFERENCES public.ai_providers(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  model           TEXT NOT NULL,
  task            TEXT NOT NULL,
  request_count   BIGINT NOT NULL DEFAULT 0,
  success_count   BIGINT NOT NULL DEFAULT 0,
  failure_count   BIGINT NOT NULL DEFAULT 0,
  total_tokens    BIGINT NOT NULL DEFAULT 0,
  total_latency   BIGINT NOT NULL DEFAULT 0,                 -- Total latency in ms
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider_id, model, task, date)
);

-- ─── Table: ai_sawty_generations ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_sawty_generations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  product_name        TEXT NOT NULL,
  benefit             TEXT,
  cta                 TEXT,
  tone                TEXT,
  pacing              TEXT,
  marketing_angle     TEXT,
  generated_script    TEXT,
  prompt_version      INT DEFAULT 1,
  provider_id         UUID REFERENCES public.ai_providers(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'pending',       -- 'pending', 'completed', 'failed'
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Table: ai_sawty_audio ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_sawty_audio (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id   UUID NOT NULL REFERENCES public.ai_sawty_generations(id) ON DELETE CASCADE,
  audio_url       TEXT,
  audio_duration  INT,                                        -- Duration in seconds
  provider_id     UUID REFERENCES public.ai_providers(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Table: ai_products ─────────────────────────────────────────────────────────
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
  prompt_version      INT DEFAULT 1,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Table: ai_product_analyses ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_product_analyses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES public.ai_products(id) ON DELETE CASCADE,
  analysis_type   TEXT NOT NULL,                             -- 'market', 'competitor', 'customer', etc.
  analysis_data   JSONB NOT NULL DEFAULT '{}'::jsonb,
  prompt_version  INT DEFAULT 1,
  provider_id     UUID REFERENCES public.ai_providers(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Table: ai_marketing_angles ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_marketing_angles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES public.ai_products(id) ON DELETE CASCADE,
  angle           TEXT NOT NULL,
  angle_details   JSONB DEFAULT '{}'::jsonb,
  prompt_version  INT DEFAULT 1,
  provider_id     UUID REFERENCES public.ai_providers(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Table: ai_offers ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_offers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_page_id UUID REFERENCES public.ai_landing_pages(id) ON DELETE CASCADE,
  offer_text      TEXT NOT NULL,
  price           DECIMAL(10, 2),
  currency        TEXT DEFAULT 'USD',
  discount_type   TEXT,                                      -- 'percentage', 'fixed', 'none'
  discount_value  DECIMAL(10, 2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Table: ai_landing_pages ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_landing_pages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  product_id          UUID REFERENCES public.ai_products(id) ON DELETE SET NULL,
  selected_angle      TEXT,
  selected_offer      UUID REFERENCES public.ai_offers(id) ON DELETE SET NULL,
  generated_content   JSONB DEFAULT '{}'::jsonb,
  status              TEXT NOT NULL DEFAULT 'draft',          -- 'draft', 'published', 'archived'
  published_url       TEXT,
  prompt_version      INT DEFAULT 1,
  style_version       INT DEFAULT 1,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Table: ai_landing_page_versions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_landing_page_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_page_id UUID NOT NULL REFERENCES public.ai_landing_pages(id) ON DELETE CASCADE,
  version_number  INT NOT NULL,
  content         JSONB NOT NULL DEFAULT '{}'::jsonb,
  style_config    JSONB DEFAULT '{}'::jsonb,
  prompt_version  INT DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(landing_page_id, version_number)
);

-- ─── Table: ai_generation_jobs ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_generation_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  task_type       ai_task_type NOT NULL,
  input_data      JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'pending',           -- 'pending', 'processing', 'completed', 'failed'
  progress        INT DEFAULT 0,                              -- 0-100
  result          JSONB,
  error           TEXT,
  provider_id     UUID REFERENCES public.ai_providers(id) ON DELETE SET NULL,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Table: ai_prompt_versions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_prompt_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type   ai_task_type NOT NULL,
  version     INT NOT NULL,
  content     TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(task_type, version)
);

-- ─── Table: ai_style_profiles ──────────────────────────────────────────────────
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

-- ─── Table: ai_style_versions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_style_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  style_profile_id UUID NOT NULL REFERENCES public.ai_style_profiles(id) ON DELETE CASCADE,
  version         INT NOT NULL,
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(style_profile_id, version)
);

-- ─── Table: ai_audit_logs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL,                                  -- 'provider', 'prompt', 'style', etc.
  target_id   UUID,
  details     JSONB DEFAULT '{}'::jsonb,
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Updated_at Trigger Function ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ─── Apply updated_at triggers ────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TRIGGER trg_ai_providers_updated_at
    BEFORE UPDATE ON public.ai_providers
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_ai_products_updated_at
    BEFORE UPDATE ON public.ai_products
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_ai_landing_pages_updated_at
    BEFORE UPDATE ON public.ai_landing_pages
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Indexes for Performance ───────────────────────────────────────────────────
-- ai_providers
CREATE INDEX IF NOT EXISTS idx_ai_providers_priority ON public.ai_providers(priority ASC) WHERE status = 'HEALTHY';
CREATE INDEX IF NOT EXISTS idx_ai_providers_status ON public.ai_providers(status);
CREATE INDEX IF NOT EXISTS idx_ai_providers_type ON public.ai_providers(provider_type);

-- ai_provider_health
CREATE INDEX IF NOT EXISTS idx_ai_provider_health_provider ON public.ai_provider_health(provider_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_provider_health_status ON public.ai_provider_health(status, checked_at DESC);

-- ai_provider_usage
CREATE INDEX IF NOT EXISTS idx_ai_provider_usage_provider ON public.ai_provider_usage(provider_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ai_provider_usage_project ON public.ai_provider_usage(project_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ai_provider_usage_task ON public.ai_provider_usage(task, date DESC);

-- ai_sawty_generations
CREATE INDEX IF NOT EXISTS idx_ai_sawty_generations_workspace ON public.ai_sawty_generations(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_sawty_generations_user ON public.ai_sawty_generations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_sawty_generations_status ON public.ai_sawty_generations(status);

-- ai_sawty_audio
CREATE INDEX IF NOT EXISTS idx_ai_sawty_audio_generation ON public.ai_sawty_audio(generation_id);

-- ai_products
CREATE INDEX IF NOT EXISTS idx_ai_products_workspace ON public.ai_products(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_products_user ON public.ai_products(user_id, created_at DESC);

-- ai_product_analyses
CREATE INDEX IF NOT EXISTS idx_ai_product_analyses_product ON public.ai_product_analyses(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_product_analyses_type ON public.ai_product_analyses(analysis_type);

-- ai_marketing_angles
CREATE INDEX IF NOT EXISTS idx_ai_marketing_angles_product ON public.ai_marketing_angles(product_id, created_at DESC);

-- ai_offers
CREATE INDEX IF NOT EXISTS idx_ai_offers_landing_page ON public.ai_offers(landing_page_id);

-- ai_landing_pages
CREATE INDEX IF NOT EXISTS idx_ai_landing_pages_workspace ON public.ai_landing_pages(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_landing_pages_user ON public.ai_landing_pages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_landing_pages_product ON public.ai_landing_pages(product_id);
CREATE INDEX IF NOT EXISTS idx_ai_landing_pages_status ON public.ai_landing_pages(status);

-- ai_landing_page_versions
CREATE INDEX IF NOT EXISTS idx_ai_landing_page_versions_page ON public.ai_landing_page_versions(landing_page_id, version_number DESC);

-- ai_generation_jobs
CREATE INDEX IF NOT EXISTS idx_ai_generation_jobs_workspace ON public.ai_generation_jobs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_generation_jobs_user ON public.ai_generation_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_generation_jobs_status ON public.ai_generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ai_generation_jobs_task ON public.ai_generation_jobs(task_type);

-- ai_prompt_versions
CREATE INDEX IF NOT EXISTS idx_ai_prompt_versions_task ON public.ai_prompt_versions(task_type, version DESC);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_versions_active ON public.ai_prompt_versions(task_type) WHERE is_active = true;

-- ai_style_profiles
CREATE INDEX IF NOT EXISTS idx_ai_style_profiles_name ON public.ai_style_profiles(name);

-- ai_style_versions
CREATE INDEX IF NOT EXISTS idx_ai_style_versions_profile ON public.ai_style_versions(style_profile_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_ai_style_versions_active ON public.ai_style_versions(style_profile_id) WHERE is_active = true;

-- ai_audit_logs
CREATE INDEX IF NOT EXISTS idx_ai_audit_logs_admin ON public.ai_audit_logs(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_logs_target ON public.ai_audit_logs(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_logs_action ON public.ai_audit_logs(action, created_at DESC);

-- ─── Row Level Security (RLS) Policies ─────────────────────────────────────────

-- Enable RLS on all tables
ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_provider_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_provider_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_sawty_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_sawty_audio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_product_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_marketing_angles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_landing_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_landing_page_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_style_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_style_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_audit_logs ENABLE ROW LEVEL SECURITY;

-- ─── ai_providers: Super Admin only ───────────────────────────────────────────
CREATE POLICY "super_admin_all_ai_providers"
  ON public.ai_providers FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ─── ai_provider_health: Super Admin only ─────────────────────────────────────
CREATE POLICY "super_admin_all_ai_provider_health"
  ON public.ai_provider_health FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ─── ai_provider_usage: Workspace isolation + Super Admin ─────────────────────
CREATE POLICY "workspace_select_ai_provider_usage"
  ON public.ai_provider_usage FOR SELECT
  USING (project_id = public.get_user_workspace_id());

CREATE POLICY "super_admin_all_ai_provider_usage"
  ON public.ai_provider_usage FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ─── ai_sawty_generations: Workspace isolation + Super Admin ─────────────────
CREATE POLICY "workspace_select_ai_sawty_generations"
  ON public.ai_sawty_generations FOR SELECT
  USING (workspace_id = public.get_user_workspace_id());

CREATE POLICY "workspace_insert_ai_sawty_generations"
  ON public.ai_sawty_generations FOR INSERT
  WITH CHECK (workspace_id = public.get_user_workspace_id());

CREATE POLICY "workspace_update_ai_sawty_generations"
  ON public.ai_sawty_generations FOR UPDATE
  USING (workspace_id = public.get_user_workspace_id())
  WITH CHECK (workspace_id = public.get_user_workspace_id());

CREATE POLICY "super_admin_all_ai_sawty_generations"
  ON public.ai_sawty_generations FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ─── ai_sawty_audio: Workspace isolation via generation + Super Admin ─────────
CREATE POLICY "workspace_select_ai_sawty_audio"
  ON public.ai_sawty_audio FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_sawty_generations
      WHERE id = generation_id AND workspace_id = public.get_user_workspace_id()
    )
  );

CREATE POLICY "super_admin_all_ai_sawty_audio"
  ON public.ai_sawty_audio FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ─── ai_products: Workspace isolation + Super Admin ───────────────────────────
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

-- ─── ai_product_analyses: Workspace isolation via product + Super Admin ────────
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

-- ─── ai_marketing_angles: Workspace isolation via product + Super Admin ────────
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

-- ─── ai_offers: Workspace isolation via landing page + Super Admin ────────────
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

-- ─── ai_landing_pages: Workspace isolation + Super Admin ─────────────────────
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

CREATE POLICY "super_admin_all_ai_landing_pages"
  ON public.ai_landing_pages FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ─── ai_landing_page_versions: Workspace isolation via landing page + Super Admin ───
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

-- ─── ai_generation_jobs: Workspace isolation + Super Admin ───────────────────
CREATE POLICY "workspace_select_ai_generation_jobs"
  ON public.ai_generation_jobs FOR SELECT
  USING (workspace_id = public.get_user_workspace_id());

CREATE POLICY "workspace_insert_ai_generation_jobs"
  ON public.ai_generation_jobs FOR INSERT
  WITH CHECK (workspace_id = public.get_user_workspace_id());

CREATE POLICY "workspace_update_ai_generation_jobs"
  ON public.ai_generation_jobs FOR UPDATE
  USING (workspace_id = public.get_user_workspace_id())
  WITH CHECK (workspace_id = public.get_user_workspace_id());

CREATE POLICY "super_admin_all_ai_generation_jobs"
  ON public.ai_generation_jobs FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ─── ai_prompt_versions: Authenticated read, Super Admin manage ───────────────
CREATE POLICY "authenticated_read_ai_prompt_versions"
  ON public.ai_prompt_versions FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "super_admin_all_ai_prompt_versions"
  ON public.ai_prompt_versions FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ─── ai_style_profiles: Authenticated read, Super Admin manage ────────────────
CREATE POLICY "authenticated_read_ai_style_profiles"
  ON public.ai_style_profiles FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "super_admin_all_ai_style_profiles"
  ON public.ai_style_profiles FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ─── ai_style_versions: Authenticated read, Super Admin manage ────────────────
CREATE POLICY "authenticated_read_ai_style_versions"
  ON public.ai_style_versions FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "super_admin_all_ai_style_versions"
  ON public.ai_style_versions FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ─── ai_audit_logs: Super Admin only ───────────────────────────────────────────
CREATE POLICY "super_admin_all_ai_audit_logs"
  ON public.ai_audit_logs FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ─── Comments for documentation ────────────────────────────────────────────────
COMMENT ON TABLE public.ai_providers IS 'AI provider configurations with credentials and health monitoring';
COMMENT ON TABLE public.ai_provider_health IS 'Health check history for AI providers';
COMMENT ON TABLE public.ai_provider_usage IS 'Usage statistics tracking for AI providers per workspace';
COMMENT ON TABLE public.ai_sawty_generations IS 'Sawty script generations for marketing';
COMMENT ON TABLE public.ai_sawty_audio IS 'Audio generation records for Sawty scripts';
COMMENT ON TABLE public.ai_products IS 'Product analysis and data for AI marketing';
COMMENT ON TABLE public.ai_product_analyses IS 'Detailed product analyses by type';
COMMENT ON TABLE public.ai_marketing_angles IS 'Generated marketing angles for products';
COMMENT ON TABLE public.ai_offers IS 'Offer configurations for landing pages';
COMMENT ON TABLE public.ai_landing_pages IS 'Landing page content and configurations';
COMMENT ON TABLE public.ai_landing_page_versions IS 'Version history for landing pages';
COMMENT ON TABLE public.ai_generation_jobs IS 'Async job tracking for AI generation tasks';
COMMENT ON TABLE public.ai_prompt_versions IS 'Prompt template versions for different AI tasks';
COMMENT ON TABLE public.ai_style_profiles IS 'Style profile definitions for landing pages';
COMMENT ON TABLE public.ai_style_versions IS 'Version history for style profiles';
COMMENT ON TABLE public.ai_audit_logs IS 'Audit log for AI infrastructure changes';

COMMENT ON FUNCTION public.is_super_admin() IS 'Check if current user has super_admin role';
COMMENT ON FUNCTION public.get_user_workspace_id() IS 'Get the workspace ID of the current user';
