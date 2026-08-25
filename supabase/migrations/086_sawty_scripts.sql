-- Migration 086: Sawty.ma Script History — workspace-scoped AI script storage

CREATE TABLE IF NOT EXISTS public.sawty_scripts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Input parameters
  product          TEXT NOT NULL,
  benefit          TEXT NOT NULL DEFAULT '',
  cta              TEXT NOT NULL DEFAULT '',
  tone             TEXT NOT NULL DEFAULT 'energetic',
  pacing           TEXT NOT NULL DEFAULT 'fast',
  angle            TEXT NOT NULL DEFAULT 'pain_point',
  custom_angle     TEXT,
  scene_description TEXT,
  -- Generated output
  hook             TEXT,
  body             TEXT,
  script_cta       TEXT,
  full_script      TEXT NOT NULL DEFAULT '',
  -- Metadata
  model_used       TEXT,
  provider_id      UUID REFERENCES public.ai_providers(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sawty_scripts_workspace ON public.sawty_scripts(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sawty_scripts_user ON public.sawty_scripts(user_id, created_at DESC);

-- RLS
ALTER TABLE public.sawty_scripts ENABLE ROW LEVEL SECURITY;

-- Workspace members can see their workspace scripts
CREATE POLICY "workspace_sawty_scripts_select"
  ON public.sawty_scripts FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Workspace members can insert their own scripts
CREATE POLICY "workspace_sawty_scripts_insert"
  ON public.sawty_scripts FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Users can delete their own scripts
CREATE POLICY "sawty_scripts_delete_own"
  ON public.sawty_scripts FOR DELETE
  USING (user_id = auth.uid());

-- Super admin can see all
CREATE POLICY "super_admin_all_sawty_scripts"
  ON public.sawty_scripts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );
