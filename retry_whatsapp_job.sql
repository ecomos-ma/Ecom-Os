-- Retry the failed WhatsApp job
UPDATE public.whatsapp_queue
SET 
  status = 'pending',
  scheduled_for = NOW(),
  processing_at = NULL,
  last_error = NULL,
  attempts = 0,
  updated_at = NOW()
WHERE id = '1a6531e3-0ab8-46f2-a6f8-a46dc5515548';

-- Verify the update
SELECT * FROM public.whatsapp_queue WHERE id = '1a6531e3-0ab8-46f2-a6f8-a46dc5515548';
