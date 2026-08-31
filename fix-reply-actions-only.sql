-- Simple WhatsApp Reply Actions Only (NO Address Automation)
-- This removes conflicting function versions and creates a basic implementation
-- that ONLY handles Reply Actions keywords from the settings page

-- 1. DROP all old conflicting function signatures
DROP FUNCTION IF EXISTS public.process_whatsapp_inbound(uuid, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.process_whatsapp_inbound(uuid, text, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.process_whatsapp_inbound(uuid, text, text, text, text, text, timestamptz) CASCADE;
DROP FUNCTION IF EXISTS public.process_whatsapp_inbound(uuid, text, text, text, text, text, timestamptz, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.process_whatsapp_inbound(uuid, text, text, text, text, text, timestamptz, jsonb, text) CASCADE;

-- 2. CREATE simple Reply Actions only function
CREATE FUNCTION public.process_whatsapp_inbound(
  p_workspace_id uuid,
  p_provider_event_id text,
  p_remote_jid text,
  p_phone text,
  p_body text,
  p_quoted_message_id text DEFAULT NULL,
  p_received_at timestamptz DEFAULT now(),
  p_raw_payload jsonb DEFAULT '{}'::jsonb,
  p_message_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_body_normalized text;
  v_matched_action public.whatsapp_reply_actions%rowtype;
  v_response_template text;
  v_keyword text;
  v_message_id uuid;
BEGIN
  -- Normalize body for keyword matching
  v_body_normalized := lower(trim(coalesce(p_body, '')));

  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = p_workspace_id) THEN
    RETURN jsonb_build_object('handled', false, 'error', 'Unknown workspace');
  END IF;

  -- Normalize phone
  v_phone := public.normalize_moroccan_whatsapp_phone(p_phone);
  IF v_phone IS NULL THEN
    RETURN jsonb_build_object('handled', false, 'error', 'Invalid phone number');
  END IF;

  -- Log the incoming message
  INSERT INTO public.whatsapp_messages (
    workspace_id, phone, normalized_phone, remote_jid, direction, message_type,
    body, provider_event_id, status, raw_payload, created_at
  ) VALUES (
    p_workspace_id, p_phone, v_phone, p_remote_jid, 'inbound', 'text',
    p_body, p_provider_event_id, 'received', COALESCE(p_raw_payload, '{}'::jsonb), p_received_at
  ) ON CONFLICT (workspace_id, provider_event_id) WHERE provider_event_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_message_id;

  -- Find matching Reply Action keyword
  SELECT a.* INTO v_matched_action
  FROM public.whatsapp_reply_actions a
  CROSS JOIN LATERAL unnest(a.keywords) AS keyword
  WHERE a.workspace_id = p_workspace_id
    AND a.enabled
    AND lower(trim(keyword)) = v_body_normalized
  ORDER BY a.priority DESC
  LIMIT 1;

  -- If no keyword match found
  IF v_matched_action.id IS NULL THEN
    IF v_message_id IS NOT NULL THEN
      UPDATE public.whatsapp_messages
      SET reply_action = 'no_match', processed_at = now()
      WHERE id = v_message_id;
    END IF;
    RETURN jsonb_build_object('handled', false, 'reason', 'No matching keyword');
  END IF;

  -- Found a match - queue the response
  v_response_template := v_matched_action.response_template;

  INSERT INTO public.whatsapp_queue (
    workspace_id, phone, normalized_phone, message_type,
    automation_event, payload, status, scheduled_for, attempts, max_attempts
  ) VALUES (
    p_workspace_id, p_phone, v_phone, 'reply',
    'reply_action',
    jsonb_build_object(
      'text_template', v_response_template,
      'action_type', v_matched_action.action_type,
      'action_id', v_matched_action.id
    ),
    'pending', now(), 0, 3
  );

  -- Mark message as processed
  IF v_message_id IS NOT NULL THEN
    UPDATE public.whatsapp_messages
    SET reply_action = v_matched_action.action_type, processed_at = now()
    WHERE id = v_message_id;
  END IF;

  RETURN jsonb_build_object(
    'handled', true,
    'action', v_matched_action.action_type,
    'keyword_matched', v_matched_action.keywords[1],
    'response_queued', true
  );
END;
$$;

-- Grant permissions
REVOKE ALL ON FUNCTION public.process_whatsapp_inbound(uuid, text, text, text, text, text, timestamptz, jsonb, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_whatsapp_inbound(uuid, text, text, text, text, text, timestamptz, jsonb, text)
  TO service_role;
