-- 088_ai_sawty_generations.sql
-- Sawty script generations for marketing

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
  prompt_version      TEXT,
  provider_id         UUID REFERENCES public.ai_providers(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_sawty_generations_workspace ON public.ai_sawty_generations(workspace_id, created_at DESC);

ALTER TABLE public.ai_sawty_generations ENABLE ROW LEVEL SECURITY;

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
