-- Give each workspace an editable, non-silent AI failure response.
ALTER TABLE public.whatsapp_ai_settings
  ADD COLUMN IF NOT EXISTS fallback_reply text NOT NULL DEFAULT 'سمح ليا، وقع مشكل مؤقت ففهم الرسالة 🙏 عاود صيفطها ليا أو استعمل الاختيارات اللي عطيناك.';

ALTER TABLE public.whatsapp_ai_settings
  DROP CONSTRAINT IF EXISTS whatsapp_ai_settings_fallback_reply_check;

ALTER TABLE public.whatsapp_ai_settings
  ADD CONSTRAINT whatsapp_ai_settings_fallback_reply_check
  CHECK (char_length(fallback_reply) BETWEEN 1 AND 2000);
