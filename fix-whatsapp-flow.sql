-- Fix WhatsApp address flow function signature conflict
-- This removes conflicting function versions and creates the unified implementation

-- 1. DROP old conflicting function signatures
DROP FUNCTION IF EXISTS public.process_whatsapp_inbound(uuid, text, text, text, text, text, timestamptz, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.process_whatsapp_inbound(uuid, text, text, text, text, text, timestamptz, jsonb, text) CASCADE;

-- 2. CREATE the unified function with all parameters
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
  v_body text := trim(coalesce(p_body, ''));
  v_body_normalized text;
  v_settings public.whatsapp_address_automation_settings%rowtype;
  v_collection public.whatsapp_address_collection%rowtype;
  v_message_id uuid;
  v_retry_count integer;
  v_is_opt_out boolean := false;
  v_is_valid_address boolean := false;
BEGIN
  -- Normalize the body for matching
  v_body_normalized := lower(trim(replace(replace(coalesce(p_body, ''), chr(65039), ''), chr(8419), '')));

  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = p_workspace_id) THEN
    RAISE EXCEPTION 'Unknown workspace';
  END IF;

  -- Normalize phone
  v_phone := public.normalize_moroccan_whatsapp_phone(p_phone);
  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'Invalid Moroccan mobile number';
  END IF;

  -- Get address automation settings
  SELECT * INTO v_settings
  FROM public.whatsapp_address_automation_settings
  WHERE workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('handled', false);
  END IF;

  -- Check for opt-out keywords
  SELECT EXISTS (
    SELECT 1
    FROM public.whatsapp_reply_actions a
    CROSS JOIN LATERAL unnest(a.keywords) keyword
    WHERE a.workspace_id = p_workspace_id
      AND a.enabled
      AND a.action = 'opt_out'
      AND lower(trim(replace(replace(keyword, chr(65039), ''), chr(8419), ''))) = v_body_normalized
  ) INTO v_is_opt_out;

  IF v_is_opt_out THEN
    RETURN jsonb_build_object('handled', false);
  END IF;

  -- Find active address collection
  SELECT * INTO v_collection
  FROM public.whatsapp_address_collection c
  WHERE c.workspace_id = p_workspace_id
    AND c.normalized_phone = v_phone
    AND c.automation_settings_id = v_settings.id
    AND c.status IN ('waiting_for_start_reply', 'waiting_for_address', 'waiting_for_address_confirmation')
  ORDER BY c.requested_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    -- Check expiration
    IF v_collection.expires_at <= now() THEN
      UPDATE public.whatsapp_address_collection
      SET status = 'expired', updated_at = now()
      WHERE id = v_collection.id;
      RETURN jsonb_build_object('handled', true, 'expired', true, 'order_id', v_collection.order_id);
    END IF;

    -- Check if settings are enabled
    IF NOT v_settings.enabled THEN
      RETURN jsonb_build_object('handled', true, 'paused', true, 'order_id', v_collection.order_id);
    END IF;

    -- Store the message
    INSERT INTO public.whatsapp_messages (
      workspace_id, order_id, phone, normalized_phone, remote_jid, direction, message_type,
      body, wa_message_id, provider_event_id, status, raw_payload, created_at
    ) VALUES (
      p_workspace_id, v_collection.order_id, p_phone, v_phone, p_remote_jid, 'inbound', 'reply',
      p_body, p_provider_event_id, p_provider_event_id, 'received', COALESCE(p_raw_payload, '{}'::jsonb), p_received_at
    ) ON CONFLICT (workspace_id, provider_event_id) WHERE provider_event_id IS NOT NULL DO NOTHING
    RETURNING id INTO v_message_id;

    IF v_message_id IS NULL THEN
      RETURN jsonb_build_object('handled', true, 'duplicate', true, 'order_id', v_collection.order_id);
    END IF;

    -- Handle waiting for start reply
    IF v_collection.status = 'waiting_for_start_reply' THEN
      IF EXISTS (
        SELECT 1 FROM unnest(v_settings.start_aliases) alias
        WHERE lower(trim(replace(replace(alias, chr(65039), ''), chr(8419), ''))) = v_body_normalized
      ) THEN
        UPDATE public.whatsapp_address_collection
        SET status = 'waiting_for_address', last_inbound_id = v_message_id, updated_at = now()
        WHERE id = v_collection.id;

        -- Queue the address prompt
        INSERT INTO public.whatsapp_queue (
          workspace_id, order_id, phone, normalized_phone, message_type,
          automation_event, payload, status, scheduled_for, attempts, max_attempts
        ) VALUES (
          p_workspace_id, v_collection.order_id, p_phone, v_phone, 'reply',
          'address_confirmation', 
          jsonb_build_object(
            'text_template', v_settings.address_prompt,
            'address_collection_id', v_collection.id,
            'address_step', 'ask_address'
          ),
          'pending', now(), 0, 3
        );

        UPDATE public.whatsapp_messages
        SET reply_action = 'address_flow_start', processed_at = now()
        WHERE id = v_message_id;

        RETURN jsonb_build_object('handled', true, 'action', 'address_flow_start', 'reply_queued', true, 'order_id', v_collection.order_id);
      END IF;

      UPDATE public.whatsapp_messages
      SET reply_action = 'address_flow_wrong_start_reply', processed_at = now()
      WHERE id = v_message_id;
      RETURN jsonb_build_object('handled', true, 'action', 'address_flow_wrong_start_reply', 'order_id', v_collection.order_id);
    END IF;

    -- Handle waiting for address
    IF v_collection.status = 'waiting_for_address' THEN
      v_is_valid_address := COALESCE(p_message_type, 'conversation') IN ('conversation', 'extendedTextMessage')
        AND char_length(v_body) >= 5
        AND v_body ~ '[[:alnum:]]';

      IF NOT v_is_valid_address THEN
        v_retry_count := v_collection.attempts + 1;
        UPDATE public.whatsapp_address_collection
        SET attempts = v_retry_count,
            last_inbound_id = v_message_id,
            status = CASE WHEN v_retry_count >= v_settings.max_retries THEN 'expired' ELSE 'waiting_for_address' END,
            updated_at = now()
        WHERE id = v_collection.id;

        UPDATE public.whatsapp_messages
        SET reply_action = 'address_flow_invalid_address', processed_at = now()
        WHERE id = v_message_id;

        -- Queue retry message
        INSERT INTO public.whatsapp_queue (
          workspace_id, order_id, phone, normalized_phone, message_type,
          automation_event, payload, status, scheduled_for, attempts, max_attempts
        ) VALUES (
          p_workspace_id, v_collection.order_id, p_phone, v_phone, 'reply',
          'address_confirmation', 
          jsonb_build_object(
            'text_template', v_settings.address_retry_message,
            'address_collection_id', v_collection.id,
            'address_step', 'address_retry'
          ),
          'pending', now(), 0, 3
        );

        RETURN jsonb_build_object('handled', true, 'action', 'address_flow_invalid_address', 'reply_queued', true, 'order_id', v_collection.order_id);
      END IF;

      -- Save address to order
      UPDATE public.orders
      SET address = v_body,
          address_source = 'whatsapp_automation',
          whatsapp_replied_at = now(),
          whatsapp_last_action = 'address_updated',
          whatsapp_last_inbound_id = v_message_id,
          updated_at = now()
      WHERE workspace_id = p_workspace_id AND "Order ID" = v_collection.order_id;

      UPDATE public.whatsapp_address_collection
      SET address = v_body,
          attempts = 0,
          status = 'waiting_for_address_confirmation',
          last_inbound_id = v_message_id,
          updated_at = now()
      WHERE id = v_collection.id;

      UPDATE public.whatsapp_messages
      SET reply_action = 'address_flow_address_saved', processed_at = now()
      WHERE id = v_message_id;

      -- Queue confirmation message
      INSERT INTO public.whatsapp_queue (
        workspace_id, order_id, phone, normalized_phone, message_type,
        automation_event, payload, status, scheduled_for, attempts, max_attempts
      ) VALUES (
        p_workspace_id, v_collection.order_id, p_phone, v_phone, 'reply',
        'address_confirmation', 
        jsonb_build_object(
          'text_template', v_settings.address_confirmation_message,
          'address_collection_id', v_collection.id,
          'address_step', 'confirm_address',
          'address', v_body
        ),
        'pending', now(), 0, 3
      );

      RETURN jsonb_build_object('handled', true, 'action', 'address_flow_address_saved', 'reply_queued', true, 'order_id', v_collection.order_id);
    END IF;

    -- Handle waiting for address confirmation
    IF v_collection.status = 'waiting_for_address_confirmation' THEN
      -- Check if customer wants to change address
      IF v_settings.change_address_enabled AND EXISTS (
        SELECT 1 FROM unnest(v_settings.change_address_aliases) alias
        WHERE lower(trim(replace(replace(alias, chr(65039), ''), chr(8419), ''))) = v_body_normalized
      ) THEN
        UPDATE public.whatsapp_address_collection
        SET status = 'waiting_for_address', attempts = 0, last_inbound_id = v_message_id, updated_at = now()
        WHERE id = v_collection.id;

        INSERT INTO public.whatsapp_queue (
          workspace_id, order_id, phone, normalized_phone, message_type,
          automation_event, payload, status, scheduled_for, attempts, max_attempts
        ) VALUES (
          p_workspace_id, v_collection.order_id, p_phone, v_phone, 'reply',
          'address_confirmation', 
          jsonb_build_object(
            'text_template', v_settings.address_prompt,
            'address_collection_id', v_collection.id,
            'address_step', 'ask_address_again'
          ),
          'pending', now(), 0, 3
        );

        UPDATE public.whatsapp_messages
        SET reply_action = 'address_flow_change_address', processed_at = now()
        WHERE id = v_message_id;

        RETURN jsonb_build_object('handled', true, 'action', 'address_flow_change_address', 'reply_queued', true, 'order_id', v_collection.order_id);
      END IF;

      -- Check if customer confirmed
      IF EXISTS (
        SELECT 1 FROM unnest(v_settings.confirmation_aliases) alias
        WHERE lower(trim(replace(replace(alias, chr(65039), ''), chr(8419), ''))) = v_body_normalized
      ) THEN
        -- Mark order as confirmed with address
        UPDATE public.orders
        SET status = 'confirmed',
            confirmation_method = 'whatsapp',
            confirmed_at = COALESCE(confirmed_at, now()),
            whatsapp_replied_at = now(),
            whatsapp_last_action = 'confirmed_by_address_automation',
            whatsapp_last_inbound_id = v_message_id,
            updated_at = now()
        WHERE workspace_id = p_workspace_id AND "Order ID" = v_collection.order_id;

        -- Cancel pending queue messages for this order
        UPDATE public.whatsapp_queue
        SET status = 'cancelled',
            last_error = 'Order confirmed by WhatsApp address automation',
            error_code = 'order_confirmed',
            updated_at = now()
        WHERE workspace_id = p_workspace_id
          AND order_id = v_collection.order_id
          AND status = 'pending'
          AND automation_event IN ('confirmation', 'address_confirmation');

        UPDATE public.whatsapp_address_collection
        SET status = 'completed', completed_at = now(), last_inbound_id = v_message_id, updated_at = now()
        WHERE id = v_collection.id;

        UPDATE public.whatsapp_messages
        SET reply_action = 'address_flow_confirm_order', processed_at = now()
        WHERE id = v_message_id;

        -- Queue success message
        INSERT INTO public.whatsapp_queue (
          workspace_id, order_id, phone, normalized_phone, message_type,
          automation_event, payload, status, scheduled_for, attempts, max_attempts
        ) VALUES (
          p_workspace_id, v_collection.order_id, p_phone, v_phone, 'reply',
          'address_confirmation', 
          jsonb_build_object(
            'text_template', v_settings.success_message,
            'address_collection_id', v_collection.id,
            'address_step', 'success'
          ),
          'pending', now(), 0, 3
        );

        INSERT INTO public.whatsapp_events (workspace_id, order_id, event_type, severity, message, metadata)
        VALUES (
          p_workspace_id,
          v_collection.order_id,
          'address_flow_completed',
          'info',
          'Address and order confirmed by WhatsApp Automation',
          jsonb_build_object('automation_id', v_settings.id, 'collection_id', v_collection.id)
        );

        RETURN jsonb_build_object('handled', true, 'action', 'address_flow_confirm_order', 'reply_queued', true, 'order_id', v_collection.order_id);
      END IF;

      UPDATE public.whatsapp_messages
      SET reply_action = 'address_flow_wrong_confirmation_reply', processed_at = now()
      WHERE id = v_message_id;
      RETURN jsonb_build_object('handled', true, 'action', 'address_flow_wrong_confirmation_reply', 'order_id', v_collection.order_id);
    END IF;
  END IF;

  RETURN jsonb_build_object('handled', false);
END;
$$;

-- Grant permissions
REVOKE ALL ON FUNCTION public.process_whatsapp_inbound(uuid, text, text, text, text, text, timestamptz, jsonb, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_whatsapp_inbound(uuid, text, text, text, text, text, timestamptz, jsonb, text)
  TO service_role;

-- Create helper function for normalization if not exists
CREATE OR REPLACE FUNCTION public.normalize_whatsapp_flow_reply(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(trim(replace(replace(COALESCE(p_value, ''), chr(65039), ''), chr(8419), '')))
$$;
