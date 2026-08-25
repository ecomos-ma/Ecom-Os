-- 096_ai_generation_jobs.sql
-- Async job tracking for AI generation tasks

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

CREATE TABLE IF NOT EXISTS public.ai_generation_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  task_type       ai_task_type NOT NULL,
  input_data      JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'pending',
  progress        INT DEFAULT 0,
  result          JSONB,
  error           TEXT,
  provider_id     UUID REFERENCES public.ai_providers(id) ON DELETE SET NULL,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_generation_jobs_workspace ON public.ai_generation_jobs(workspace_id, created_at DESC);
CREATE INDEX idx_ai_generation_jobs_status ON public.ai_generation_jobs(status);

ALTER TABLE public.ai_generation_jobs ENABLE ROW LEVEL SECURITY;

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
