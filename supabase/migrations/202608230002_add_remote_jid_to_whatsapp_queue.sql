-- Add remote_jid column to whatsapp_queue for LID matching
-- This stores the WhatsApp JID (including LID format) of the recipient
-- to match incoming messages that use LID instead of phone numbers

ALTER TABLE public.whatsapp_queue
ADD COLUMN remote_jid text;

-- Add index for faster lookups
CREATE INDEX idx_whatsapp_queue_remote_jid ON public.whatsapp_queue(remote_jid);
