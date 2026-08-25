-- 089_ai_sawty_audio.sql
-- Audio generation records for Sawty scripts

CREATE TABLE IF NOT EXISTS public.ai_sawty_audio (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id   UUID NOT NULL REFERENCES public.ai_sawty_generations(id) ON DELETE CASCADE,
  audio_url       TEXT,
  audio_duration  INT,
  provider_id     UUID REFERENCES public.ai_providers(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_sawty_audio_generation ON public.ai_sawty_audio(generation_id);

ALTER TABLE public.ai_sawty_audio ENABLE ROW LEVEL SECURITY;

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
