
ALTER TABLE public.whatsapp_settings
ADD COLUMN IF NOT EXISTS allow_confirm boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS allow_modify boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS allow_cancel boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS confirmation_message text,
ADD COLUMN IF NOT EXISTS confirmed_message text,
ADD COLUMN IF NOT EXISTS modification_message text,
ADD COLUMN IF NOT EXISTS cancelled_message text,
ADD COLUMN IF NOT EXISTS send_delay_minutes integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS conditions_pending boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS conditions_valid_phone boolean DEFAULT true;

-- Ensure auto_confirmation exists and is boolean
ALTER TABLE public.whatsapp_settings 
ADD COLUMN IF NOT EXISTS auto_confirmation boolean DEFAULT false;

-- Table to log whatsapp conversations
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body text NOT NULL,
  phone text NOT NULL,
  status text DEFAULT 'sent',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspaces can view their own whatsapp messages"
  ON public.whatsapp_messages FOR SELECT
  USING (workspace_id = (SELECT auth.uid()::uuid));
  
CREATE OR REPLACE FUNCTION auto_enqueue_whatsapp_confirmation()
RETURNS trigger AS $$
DECLARE
  ws_settings record;
BEGIN
  IF NEW.status = 'pending' THEN
    SELECT * INTO ws_settings
    FROM public.whatsapp_settings
    WHERE workspace_id = NEW.workspace_id;

    IF ws_settings.enabled = true AND ws_settings.auto_confirmation = true AND ws_settings.connection_status = 'ready' THEN
      IF ws_settings.conditions_valid_phone = false OR (NEW.phone IS NOT NULL AND TRIM(NEW.phone) != '') THEN
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
          NEW.id,
          NEW.phone,
          'order_confirmation',
          'pending',
          now() + (COALESCE(ws_settings.send_delay_minutes, 0) || ' minutes')::interval,
          3,
          0
        ) ON CONFLICT (workspace_id, order_id, message_type) DO NOTHING;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_order_pending_auto_whatsapp ON public.orders;
CREATE TRIGGER on_order_pending_auto_whatsapp
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION auto_enqueue_whatsapp_confirmation();
