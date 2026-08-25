-- Add confirmation_method column to orders table
-- Values: 'whatsapp' (auto-confirmed via WhatsApp), 'call' (manually confirmed via phone), null (not confirmed or unknown)

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS confirmation_method text;

-- Add comment for documentation
COMMENT ON COLUMN public.orders.confirmation_method IS 'Method used to confirm the order: whatsapp (auto-confirmed via WhatsApp response), call (manually confirmed via phone), or null (not confirmed or unknown)';
