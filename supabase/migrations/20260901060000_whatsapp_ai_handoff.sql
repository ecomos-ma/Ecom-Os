ALTER TABLE public.whatsapp_ai_settings
  ADD COLUMN IF NOT EXISTS handoff_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS handoff_message text NOT NULL DEFAULT 'سمح ليا، غادي ندوزك دابا لواحد من الفريق باش يعاونك مزيان 🙏 غادي يتاصل بيك قريب.',
  ADD COLUMN IF NOT EXISTS handoff_status text,
  ADD COLUMN IF NOT EXISTS handoff_voice_recording_id uuid REFERENCES public.whatsapp_audio_recordings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS clarification_attempt_limit integer NOT NULL DEFAULT 1 CHECK (clarification_attempt_limit BETWEEN 0 AND 3);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS whatsapp_handoff_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_handoff_reason text,
  ADD COLUMN IF NOT EXISTS whatsapp_handoff_source text,
  ADD COLUMN IF NOT EXISTS whatsapp_handoff_at timestamptz;

CREATE OR REPLACE FUNCTION public.execute_whatsapp_ai_handoff(
  p_workspace_id uuid,
  p_order_id uuid,
  p_provider_event_id text,
  p_inbound_message_id uuid,
  p_reason text,
  p_phone text,
  p_inbound_body text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_settings public.whatsapp_ai_settings%rowtype;
  v_order public.orders%rowtype;
  v_status text;
BEGIN
  SELECT * INTO v_settings FROM public.whatsapp_ai_settings
   WHERE workspace_id = p_workspace_id AND enabled = true;
  IF NOT FOUND OR v_settings.handoff_enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('applied', false, 'handoff_disabled', true);
  END IF;
  SELECT * INTO v_order FROM public.orders
   WHERE workspace_id = p_workspace_id AND "Order ID" = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('applied', false, 'rejected', true); END IF;
  v_status := nullif(btrim(v_settings.handoff_status), '');
  IF v_status IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.order_statuses s
     WHERE s.workspace_id = p_workspace_id AND (s.slug = v_status OR s.name = v_status)
  ) THEN v_status := NULL; END IF;
  UPDATE public.orders SET
    whatsapp_handoff_active = true,
    whatsapp_handoff_reason = coalesce(nullif(p_reason, ''), 'unsupported_action'),
    whatsapp_handoff_source = 'whatsapp_ai_handoff',
    whatsapp_handoff_at = now(),
    status = coalesce(v_status, status),
    updated_at = now()
   WHERE workspace_id = p_workspace_id AND "Order ID" = p_order_id;
  INSERT INTO public.whatsapp_manual_reviews
    (workspace_id, order_id, normalized_phone, provider_event_id, reason, inbound_body)
  VALUES (p_workspace_id, p_order_id, p_phone, p_provider_event_id,
          coalesce(nullif(p_reason, ''), 'unsupported_action'), p_inbound_body)
  ON CONFLICT (workspace_id, provider_event_id) DO NOTHING;
  RETURN jsonb_build_object('applied', true, 'action', 'human_handoff',
    'reply_text', v_settings.handoff_message, 'handoff_reason', coalesce(nullif(p_reason, ''), 'unsupported_action'));
END;
$function$;

REVOKE ALL ON FUNCTION public.execute_whatsapp_ai_handoff(uuid,uuid,text,uuid,text,text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_whatsapp_ai_handoff(uuid,uuid,text,uuid,text,text,text) TO service_role;
