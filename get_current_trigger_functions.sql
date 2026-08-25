-- ============================================================
-- GET CURRENT TRIGGER FUNCTION DEFINITIONS
-- READ-ONLY - FOR REVIEW BEFORE FIXING
-- ============================================================

-- Get queue_whatsapp_confirmation function definition
SELECT pg_get_functiondef('queue_whatsapp_confirmation'::regproc);

-- Get trigger_whatsapp_confirmation function definition  
SELECT pg_get_functiondef('trigger_whatsapp_confirmation'::regproc);
