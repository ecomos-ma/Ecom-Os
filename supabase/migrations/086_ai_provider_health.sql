-- 086_ai_provider_health.sql
-- AI Provider Health check history

CREATE TABLE IF NOT EXISTS public.ai_provider_health (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id   UUID NOT NULL REFERENCES public.ai_providers(id) ON DELETE CASCADE,
  status        TEXT NOT NULL,
  latency_ms    INT,
  error_code    TEXT,
  error_message TEXT,
  checked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_provider_health_provider ON public.ai_provider_health(provider_id, checked_at DESC);
CREATE INDEX idx_ai_provider_health_checked_at ON public.ai_provider_health(checked_at DESC);

ALTER TABLE public.ai_provider_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all_ai_provider_health"
  ON public.ai_provider_health FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
