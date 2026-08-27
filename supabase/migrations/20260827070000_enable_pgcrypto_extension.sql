-- ============================================================
-- Enable pgcrypto Extension (Fix for gen_random_bytes error)
-- 
-- This ensures the pgcrypto extension is available for gen_random_bytes()
-- which is used by the notification system for generating deduplication keys.
-- ============================================================

-- Enable pgcrypto extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Verify the extension is enabled
SELECT extname, extversion 
FROM pg_extension 
WHERE extname = 'pgcrypto';