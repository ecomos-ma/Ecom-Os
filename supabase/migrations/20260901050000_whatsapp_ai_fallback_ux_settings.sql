-- Workspace-scoped controls for the AI unavailable fallback UX.
ALTER TABLE public.whatsapp_ai_settings
  ADD COLUMN IF NOT EXISTS fallback_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS fallback_show_options boolean NOT NULL DEFAULT true;

ALTER TABLE public.whatsapp_ai_settings
  ALTER COLUMN fallback_reply SET DEFAULT 'سمح ليا، وقع مشكل مؤقت ففهم الرسالة 🙏
عاود صيفطها ليا أو استعمل واحد من الاختيارات:

{{available_options}}';
