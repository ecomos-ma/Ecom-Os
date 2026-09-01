CREATE OR REPLACE FUNCTION public.execute_whatsapp_ai_handoff(
  p_workspace_id uuid, p_order_id uuid, p_provider_event_id text,
  p_inbound_message_id uuid, p_reason text, p_phone text, p_inbound_body text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_settings public.whatsapp_ai_settings%rowtype; v_order public.orders%rowtype; v_status text; v_reason text;
BEGIN
  SELECT * INTO v_settings FROM public.whatsapp_ai_settings WHERE workspace_id=p_workspace_id AND enabled=true;
  IF NOT FOUND OR v_settings.handoff_enabled IS NOT TRUE THEN RETURN jsonb_build_object('applied',false,'handoff_disabled',true); END IF;
  SELECT * INTO v_order FROM public.orders WHERE workspace_id=p_workspace_id AND "Order ID"=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('applied',false,'rejected',true); END IF;
  v_status := nullif(btrim(v_settings.handoff_status),'');
  IF v_status IS NULL OR NOT EXISTS (SELECT 1 FROM public.order_statuses s WHERE s.workspace_id=p_workspace_id AND (s.slug=v_status OR s.name=v_status)) THEN
    INSERT INTO public.whatsapp_events(workspace_id,order_id,event_type,severity,message,metadata) VALUES (p_workspace_id,p_order_id,'ai_handoff_configuration_error','error','Human handoff status is not configured',jsonb_build_object('provider_event_id',p_provider_event_id));
    RETURN jsonb_build_object('applied',false,'configuration_error',true);
  END IF;
  v_reason := coalesce(nullif(p_reason,''),'unsupported_action');
  UPDATE public.orders SET whatsapp_handoff_active=true, whatsapp_handoff_reason=v_reason, whatsapp_handoff_source='whatsapp_ai', whatsapp_handoff_at=now(), status=v_status, updated_at=now() WHERE workspace_id=p_workspace_id AND "Order ID"=p_order_id;
  INSERT INTO public.whatsapp_manual_reviews(workspace_id,order_id,normalized_phone,provider_event_id,reason,inbound_body) VALUES (p_workspace_id,p_order_id,p_phone,p_provider_event_id,v_reason,p_inbound_body) ON CONFLICT (workspace_id,provider_event_id) DO NOTHING;
  INSERT INTO public.whatsapp_events(workspace_id,order_id,event_type,severity,message,metadata) VALUES (p_workspace_id,p_order_id,'ai_handoff','warning','Human handoff requested',jsonb_build_object('reason',v_reason,'source','whatsapp_ai','status',v_status,'customer_message',p_inbound_body,'provider_event_id',p_provider_event_id));
  RETURN jsonb_build_object('applied',true,'action','human_handoff','reply_text',v_settings.handoff_message,'handoff_reason',v_reason);
END; $function$;
