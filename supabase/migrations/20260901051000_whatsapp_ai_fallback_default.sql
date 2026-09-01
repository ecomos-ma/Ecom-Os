ALTER TABLE public.whatsapp_ai_settings
  ALTER COLUMN fallback_reply SET DEFAULT 'سمح ليا، وقع مشكل مؤقت ففهم الرسالة 🙏
عاود صيفطها ليا أو استعمل واحد من الاختيارات:

{{available_options}}';

UPDATE public.whatsapp_ai_settings
SET fallback_reply = 'سمح ليا، وقع مشكل مؤقت ففهم الرسالة 🙏
عاود صيفطها ليا أو استعمل واحد من الاختيارات:

{{available_options}}'
WHERE fallback_reply = 'سمح ليا، وقع مشكل مؤقت ففهم الرسالة 🙏 عاود صيفطها ليا أو استعمل الاختيارات اللي عطيناك.';
