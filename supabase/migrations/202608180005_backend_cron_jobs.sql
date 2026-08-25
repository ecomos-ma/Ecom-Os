-- ============================================================
-- Backend Cron Jobs for 24/7 Automation
-- Project: wxfialbmyfkafobtkrde.supabase.co
-- ============================================================
-- BEFORE RUNNING:
--   1. Dashboard → Database → Extensions → enable pg_cron and pg_net
--   2. Replace YOUR_SUPABASE_ANON_KEY below
--        → Dashboard → Settings → API → anon public key
--   3. Replace YOUR_CRON_SECRET below with any secret string you choose,
--        then add it as CRON_SECRET in Edge Function secrets
--        (Dashboard → Edge Functions → Manage secrets)
-- ============================================================

-- Enable extensions (safe to run even if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── Helper: get Edge Function base URL ───────────────────────────────────────
-- This uses the pg_cron + pg_net integration to call Supabase Edge Functions.
-- Replace the URL pattern with your actual project URL.

-- ── Table: shipping_sync_logs ─────────────────────────────────────────────────
-- Stores per-workspace shipment sync audit logs.
CREATE TABLE IF NOT EXISTS public.shipping_sync_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shipping_sync_logs' AND column_name = 'orders_checked') THEN
    ALTER TABLE public.shipping_sync_logs ADD COLUMN orders_checked int DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shipping_sync_logs' AND column_name = 'orders_updated') THEN
    ALTER TABLE public.shipping_sync_logs ADD COLUMN orders_updated int DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shipping_sync_logs' AND column_name = 'errors') THEN
    ALTER TABLE public.shipping_sync_logs ADD COLUMN errors int DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shipping_sync_logs' AND column_name = 'synced_at') THEN
    ALTER TABLE public.shipping_sync_logs ADD COLUMN synced_at timestamptz DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shipping_sync_logs' AND column_name = 'notes') THEN
    ALTER TABLE public.shipping_sync_logs ADD COLUMN notes text;
  END IF;
END $$;

-- If synced_at wasn't there before, creating an index on it would fail. Now it's safe.
CREATE INDEX IF NOT EXISTS idx_shipping_sync_logs_workspace ON public.shipping_sync_logs (workspace_id, synced_at DESC);

-- ── Column: google_sheet_last_sync_at ────────────────────────────────────────
-- Track when each workspace was last synced by the backend cron process.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workspaces' AND column_name = 'google_sheet_last_sync_at'
  ) THEN
    ALTER TABLE public.workspaces ADD COLUMN google_sheet_last_sync_at timestamptz;
  END IF;
END $$;

-- ── Column: last_shipping_sync_at on orders ───────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'last_shipping_sync_at'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN last_shipping_sync_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'shipping_updated_at'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN shipping_updated_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'shipping_status_raw'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN shipping_status_raw jsonb;
  END IF;
END $$;

-- ── Index for efficient shipment polling ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_tracking_active
  ON public.orders (workspace_id, tracking_number, delivery_status)
  WHERE tracking_number IS NOT NULL AND tracking_number != '';

-- ── WhatsApp Queue: idempotency index ────────────────────────────────────────
-- Prevents duplicate confirmations per order per message type.
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_queue_idempotency
  ON public.whatsapp_queue (workspace_id, order_id, message_type)
  WHERE status IN ('pending', 'processing', 'sent');

-- ============================================================
-- CRON JOBS
-- NOTE: The URLs below use the Supabase project URL pattern.
-- You MUST set these environment variables in your Supabase project:
--   SUPABASE_URL          (auto-set by Supabase)
--   SUPABASE_SERVICE_ROLE_KEY (auto-set by Supabase)
--   CRON_SECRET           (set manually in Edge Function secrets)
--
-- To get YOUR_PROJECT_REF, go to Dashboard → Settings → General → Reference ID
-- To get your service role key, go to Dashboard → Settings → API
--
-- Replace YOUR_PROJECT_REF and YOUR_CRON_SECRET below.
-- ============================================================

-- Remove existing jobs if they exist (safe to re-run)
SELECT cron.unschedule('sync-google-sheets')
FROM cron.job WHERE jobname = 'sync-google-sheets';

SELECT cron.unschedule('cron-sync-shipments')
FROM cron.job WHERE jobname = 'cron-sync-shipments';

-- ── Google Sheets Sync — every 5 minutes ─────────────────────────────────────
-- This replaces the Layout.tsx setInterval that only ran when the browser was open.
SELECT cron.schedule(
  'sync-google-sheets',
  '*/5 * * * *',  -- every 5 minutes
  $$
  SELECT net.http_post(
    url       := 'https://wxfialbmyfkafobtkrde.supabase.co/functions/v1/sync-google-sheets',
    headers   := jsonb_build_object(
                   'Content-Type',    'application/json',
                   'Authorization',   'Bearer YOUR_SUPABASE_ANON_KEY',
                   'x-cron-secret',   'YOUR_CRON_SECRET'
                 ),
    body      := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) AS request_id;
  $$
);

-- ── Shipment Status Sync — every 10 minutes ───────────────────────────────────
-- Polls all active shipments from Ozon, Coliaty, SendIt, ForceLog, Ameex.
SELECT cron.schedule(
  'cron-sync-shipments',
  '*/10 * * * *',  -- every 10 minutes
  $$
  SELECT net.http_post(
    url       := 'https://wxfialbmyfkafobtkrde.supabase.co/functions/v1/cron-sync-shipments',
    headers   := jsonb_build_object(
                   'Content-Type',    'application/json',
                   'Authorization',   'Bearer YOUR_SUPABASE_ANON_KEY',
                   'x-cron-secret',   'YOUR_CRON_SECRET'
                 ),
    body      := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) AS request_id;
  $$
);

-- ── Verify cron jobs were created ────────────────────────────────────────────
SELECT jobname, schedule, command FROM cron.job WHERE jobname IN ('sync-google-sheets', 'cron-sync-shipments');
