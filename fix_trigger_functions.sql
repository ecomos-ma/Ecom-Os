-- ============================================================
-- CORRECTED TRIGGER FUNCTIONS FOR ORDERS TABLE
-- FIX: Replace NEW.id/new.id with NEW."Order ID"/new."Order ID"
-- READ AND REVIEW BEFORE APPLYING
-- ============================================================

-- ============================================================
-- CORRECTED FUNCTION 1: queue_whatsapp_confirmation
-- FIX: All NEW.id references changed to NEW."Order ID"
-- ============================================================
CREATE OR REPLACE FUNCTION public.queue_whatsapp_confirmation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  wa_settings record;
  q_scheduled_for timestamptz;
  order_phone text;
BEGIN
  -- Only process when status is 'pending'
  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, only fire if status actually changed TO pending
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' THEN
    RETURN NEW; -- already was pending, do not re-enqueue
  END IF;

  -- Get phone: try multiple column names safely
  order_phone := NEW.phone;

  -- Skip if no phone
  IF order_phone IS NULL OR TRIM(order_phone) = '' THEN
    RAISE LOG '[WhatsApp] Skipped order %: missing phone', NEW."Order ID";
    RETURN NEW;
  END IF;

  -- Get WhatsApp settings for this workspace
  SELECT * INTO wa_settings 
  FROM public.whatsapp_settings
  WHERE workspace_id = NEW.workspace_id AND enabled = true;

  IF NOT FOUND THEN
    RAISE LOG '[WhatsApp] Skipped order %: no configured whatsapp_settings', NEW."Order ID";
    RETURN NEW;
  END IF;

  -- Check auto_confirmation (supports BOTH column names saved by different versions)
  IF NOT (COALESCE(wa_settings.auto_confirmation, false) OR COALESCE(wa_settings.auto_order_confirmation, false)) THEN
    RAISE LOG '[WhatsApp] Skipped order %: auto_confirmation disabled', NEW."Order ID";
    RETURN NEW;
  END IF;

  -- Only run if worker is actually connected and ready
  IF wa_settings.connection_status != 'ready' THEN
    RAISE LOG '[WhatsApp] Skipped order %: worker not ready (status: %)', NEW."Order ID", wa_settings.connection_status;
    RETURN NEW;
  END IF;

  -- Calculate scheduled time
  q_scheduled_for := now() + (COALESCE(wa_settings.send_delay_minutes, 0) || ' minutes')::interval;

  -- Insert into queue — ON CONFLICT DO NOTHING prevents duplicate sends
  INSERT INTO public.whatsapp_queue (
    workspace_id,
    order_id,
    phone,
    message_type,
    status,
    scheduled_for,
    max_attempts,
    attempts
  ) VALUES (
    NEW.workspace_id,
    NEW."Order ID",
    order_phone,
    'confirmation',        -- must match check constraint: ('confirmation','status_update','custom')
    'pending',
    q_scheduled_for,
    3,
    0
  ) ON CONFLICT (workspace_id, order_id, message_type) DO NOTHING;

  RAISE LOG '[WhatsApp] Queue job created for order % (workspace: %)', NEW."Order ID", NEW.workspace_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG '[WhatsApp] Trigger error for order %: %', NEW."Order ID", SQLERRM;
  RETURN NEW;
END;
$$;

-- ============================================================
-- CORRECTED FUNCTION 2: trigger_whatsapp_confirmation
-- FIX: All new.id references changed to new."Order ID"
-- FIX: UPDATE statement uses WHERE "Order ID" = new."Order ID"
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_whatsapp_confirmation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
AS $$
begin
  if new.status = 'NEW' 
     and new.bot_status = 'not_attempted' 
     and new.phone is not null 
     and new.whatsapp_opt_out = false then
    
    update public.orders 
    set bot_status = 'awaiting_reply',
        bot_attempted_at = now()
    where "Order ID" = new."Order ID";
    
  end if;
  
  return new;
end;
$$;
