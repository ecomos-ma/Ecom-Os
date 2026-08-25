-- Central, server-managed credentials for the public Tools workspace.
-- The encrypted values are only read by Supabase Edge Functions using the
-- service-role key; no browser role receives a policy for this table.

CREATE TABLE IF NOT EXISTS public.tool_api_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider ~ '^[a-z0-9_-]+$'),
  name TEXT NOT NULL,
  endpoint TEXT,
  credential_ciphertext TEXT,
  credential_iv TEXT,
  priority INTEGER NOT NULL DEFAULT 100 CHECK (priority >= 0),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tool_api_providers_rotation_idx
  ON public.tool_api_providers (provider, enabled, priority, last_used_at);

CREATE TABLE IF NOT EXISTS public.tool_api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES public.tool_api_providers(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  duration_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tool_api_usage_logs_lookup_idx
  ON public.tool_api_usage_logs (provider_id, created_at DESC);

ALTER TABLE public.tool_api_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_api_usage_logs ENABLE ROW LEVEL SECURITY;

-- Credentials and provider telemetry are deliberately Edge-Function only.
-- service_role bypasses RLS; anon and authenticated receive no policies.

DROP TRIGGER IF EXISTS update_tool_api_providers_updated_at ON public.tool_api_providers;
CREATE TRIGGER update_tool_api_providers_updated_at
  BEFORE UPDATE ON public.tool_api_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
