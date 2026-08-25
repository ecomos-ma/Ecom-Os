-- Migration: ensure immutable order_received_at and provide SQL helpers
-- Idempotent: drops functions if they exist and re-creates them

-- 1) Add order_received_at if missing, defaulting to created_at when available
ALTER TABLE IF EXISTS public.orders
  ADD COLUMN IF NOT EXISTS order_received_at timestamptz DEFAULT (created_at);

-- 2) Ensure existing NULLs are populated with created_at when possible
DO $$
BEGIN
  UPDATE public.orders SET order_received_at = created_at WHERE order_received_at IS NULL AND created_at IS NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipping backfill for order_received_at: %', SQLERRM;
END;
$$;

-- 3) Add synced_at column to track when order was imported
ALTER TABLE IF EXISTS public.orders
  ADD COLUMN IF NOT EXISTS synced_at timestamptz;

-- 4) Prevent accidental updates to order_received_at for non-Google Sheets orders
CREATE OR REPLACE FUNCTION public._orders_order_received_at_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Only enforce immutability for orders NOT from Google Sheets
    IF NEW.source IS DISTINCT FROM OLD.source AND NEW.source <> 'sheets' THEN
      IF NEW.order_received_at IS DISTINCT FROM OLD.order_received_at THEN
        RAISE EXCEPTION 'order_received_at is immutable for non-Google Sheets orders';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_order_received_at_immutable ON public.orders;
CREATE TRIGGER orders_order_received_at_immutable
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE PROCEDURE public._orders_order_received_at_immutable();

-- 5) Index for fast filtering by time
CREATE INDEX IF NOT EXISTS idx_orders_order_received_at ON public.orders USING btree(order_received_at);

-- 6) Index for filtering by synced_at
CREATE INDEX IF NOT EXISTS idx_orders_synced_at ON public.orders USING btree(synced_at DESC);

-- 7) Index for filtering by source + order_received_at
CREATE INDEX IF NOT EXISTS idx_orders_source_order_received_at ON public.orders USING btree(source, order_received_at DESC);

-- 8) SQL function to return 24 hourly buckets between given timestamps
DROP FUNCTION IF EXISTS public.get_orders_by_hour(timestamptz, timestamptz);
CREATE FUNCTION public.get_orders_by_hour(start_ts timestamptz, end_ts timestamptz)
RETURNS TABLE(hour text, orders bigint) AS $$
WITH agg AS (
  SELECT EXTRACT(HOUR FROM COALESCE(order_received_at, created_at))::int AS h, COUNT(*)::bigint AS cnt
  FROM public.orders
  WHERE COALESCE(order_received_at, created_at) BETWEEN start_ts AND end_ts
  GROUP BY h
)
SELECT to_char(make_time(gs,0,0),'HH24:MI') AS hour,
       COALESCE(agg.cnt,0)::bigint AS orders
FROM generate_series(0,23) AS gs
LEFT JOIN agg ON agg.h = gs
ORDER BY gs;
$$ LANGUAGE sql STABLE;

-- 9) Optional helper to compute peak hour and average
DROP FUNCTION IF EXISTS public.get_peak_order_hours(timestamptz, timestamptz);
CREATE FUNCTION public.get_peak_order_hours(start_ts timestamptz, end_ts timestamptz)
RETURNS TABLE(best_hour text, orders bigint, average_per_hour numeric) AS $$
WITH hours AS (
  SELECT to_char(make_time(gs,0,0),'HH24:MI') AS hour, COALESCE(agg.cnt,0)::bigint AS orders
  FROM generate_series(0,23) AS gs
  LEFT JOIN (
    SELECT EXTRACT(HOUR FROM COALESCE(order_received_at, created_at))::int AS h, COUNT(*)::bigint AS cnt
    FROM public.orders
    WHERE COALESCE(order_received_at, created_at) BETWEEN start_ts AND end_ts
    GROUP BY h
  ) agg ON agg.h = gs
)
SELECT (SELECT hour FROM hours ORDER BY orders DESC, hour LIMIT 1) AS best_hour,
       (SELECT orders FROM hours ORDER BY orders DESC, hour LIMIT 1) AS orders,
       (SELECT (SUM(orders)::numeric / 24.0) FROM hours) AS average_per_hour;
$$ LANGUAGE sql STABLE;
