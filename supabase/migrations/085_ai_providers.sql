-- 085_ai_providers.sql
-- AI Providers table for managing AI provider configurations

CREATE TYPE ai_provider_status AS ENUM ('HEALTHY', 'DEGRADED', 'RATE_LIMITED', 'FAILED', 'DISABLED', 'TESTING');

CREATE TABLE IF NOT EXISTS public.ai_providers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  provider_type       TEXT NOT NULL,
  project_id          TEXT,
  model_id            TEXT NOT NULL,
  priority            INT NOT NULL DEFAULT 100,
  status              ai_provider_status NOT NULL DEFAULT 'TESTING',
  encrypted_credential TEXT,
  capabilities        JSONB DEFAULT '{}'::jsonb,
  health_status       TEXT NOT NULL DEFAULT 'UNKNOWN',
  cooldown_until      TIMESTAMPTZ,
  last_health_check   TIMESTAMPTZ,
  failure_count       INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_providers_priority ON public.ai_providers(priority DESC, status);
CREATE INDEX idx_ai_providers_status ON public.ai_providers(status);

CREATE TRIGGER update_ai_providers_updated_at
  BEFORE UPDATE ON public.ai_providers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies
ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all_ai_providers"
  ON public.ai_providers FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
