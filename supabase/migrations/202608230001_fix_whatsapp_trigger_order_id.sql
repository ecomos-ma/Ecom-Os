-- ============================================================
-- FIX: WhatsApp trigger uses correct column name "Order ID" instead of "id"
-- ============================================================
-- The table orders uses "Order ID" as primary key (with quotes, space, uppercase)
-- Previous migration used NEW.id which caused NULL order_id in whatsapp_queue

-- Recreate the trigger function with correct column name
CREATE OR REPLACE FUNCTION public.queue_whatsapp_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wa_settings public.whatsapp_settings%ROWTYPE;
  order_phone text;
  q_scheduled_for timestamptz;
BEGIN
  -- Only process orders with status = 'pending'
  IF NEW.status IS NULL OR TRIM(NEW.status) = '' OR LOWER(TRIM(NEW.status)) != 'pending' THEN
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
    NEW."Order ID",  -- FIXED: use correct column name
    order_phone,
    'confirmation',
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

-- Recreate the trigger to ensure it uses the updated function
DROP TRIGGER IF EXISTS on_new_order_whatsapp ON public.orders;

CREATE TRIGGER on_new_order_whatsapp
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_whatsapp_confirmation();
