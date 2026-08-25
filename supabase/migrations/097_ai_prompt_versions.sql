-- 097_ai_prompt_versions.sql
-- Prompt template versions for different AI tasks

CREATE TABLE IF NOT EXISTS public.ai_prompt_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type   ai_task_type NOT NULL,
  version     INT NOT NULL,
  content     TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(task_type, version)
);

CREATE INDEX idx_ai_prompt_versions_task ON public.ai_prompt_versions(task_type, version DESC);

ALTER TABLE public.ai_prompt_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_ai_prompt_versions"
  ON public.ai_prompt_versions FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "super_admin_all_ai_prompt_versions"
  ON public.ai_prompt_versions FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
