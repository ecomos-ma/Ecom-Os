-- ============================================================
-- Backend Cron Jobs for 24/7 Automation
-- Project: wxfialbmyfkafobtkrde.supabase.co
-- ============================================================
-- READY TO RUN - Credentials already configured
--
-- BEFORE RUNNING:
--   1. Dashboard → Database → Extensions → enable pg_cron and pg_net
--   2. Dashboard → Edge Functions → Manage secrets → Add CRON_SECRET = ecomos-cron-secret-2024
-- ============================================================

-- Enable extensions (safe to run even if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── Helper: get Edge Function base URL ───────────────────────────────────────
-- This uses the pg_cron + pg_net integration to call Supabase Edge Functions.
-- Replace the URL pattern with your actual project URL.

-- ── Table: shipping_sync_logs ─────────────────────────────────────────────────
-- Stores per-workspace shipment sync audit logs if it doesn't already exist.
CREATE TABLE IF NOT EXISTS public.shipping_sync_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  orders_checked int DEFAULT 0,
  orders_updated int DEFAULT 0,
  errors int DEFAULT 0,
  synced_at timestamptz DEFAULT now(),
  notes text
);

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

-- ── Google Sheets Sync — every 1 minute ───────────────────────────────────────
-- Standard pg_cron minimum interval is 1 minute. This replaces the frontend
-- polling that only worked when the browser was open. The sync now runs
-- reliably on the backend even when the browser is closed.
SELECT cron.schedule(
  'sync-google-sheets',
  '* * * * *',  -- every minute
  $$
  SELECT net.http_post(
    url       := 'https://wxfialbmyfkafobtkrde.supabase.co/functions/v1/sync-google-sheets',
    headers   := jsonb_build_object(
                   'Content-Type',    'application/json',
                   'Authorization',   'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4ZmlhbGJteWZrYWZvYnRrcmRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0NjA4NDAsImV4cCI6MjA5OTAzNjg0MH0.rJh4TDBlvxBgv6PI23SXC9IPxttotyuq08xIP31Pj0U',
                   'x-cron-secret',   'ecomos-cron-secret-2024'
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
                   'Authorization',   'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4ZmlhbGJteWZrYWZvYnRrcmRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0NjA4NDAsImV4cCI6MjA5OTAzNjg0MH0.rJh4TDBlvxBgv6PI23SXC9IPxttotyuq08xIP31Pj0U',
                   'x-cron-secret',   'ecomos-cron-secret-2024'
                 ),
    body      := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) AS request_id;
  $$
);

-- ── Verify cron jobs were created ────────────────────────────────────────────
SELECT jobname, schedule, command FROM cron.job WHERE jobname IN ('sync-google-sheets', 'cron-sync-shipments');
