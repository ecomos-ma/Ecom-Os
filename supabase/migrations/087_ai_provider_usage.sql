-- 087_ai_provider_usage.sql
-- AI Provider Usage statistics tracking

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
  total_latency   BIGINT NOT NULL DEFAULT 0,
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider_id, model, task, date)
);

CREATE INDEX idx_ai_provider_usage_date ON public.ai_provider_usage(date DESC);
CREATE INDEX idx_ai_provider_usage_workspace ON public.ai_provider_usage(project_id);

ALTER TABLE public.ai_provider_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_select_ai_provider_usage"
  ON public.ai_provider_usage FOR SELECT
  USING (project_id = public.get_user_workspace_id());

CREATE POLICY "super_admin_all_ai_provider_usage"
  ON public.ai_provider_usage FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
