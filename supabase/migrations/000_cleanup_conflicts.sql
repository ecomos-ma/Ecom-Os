-- Pre-migration cleanup: drop problematic policies, constraints, and publication memberships
-- This migration is intentionally aggressive and idempotent: it removes possibly-duplicated database objects
-- so the main ordered migrations can run cleanly. All objects are recreated by later migrations.

-- Drop common policy name patterns in public schema
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        policyname ILIKE 'workspace%'
        OR policyname ILIKE '%workspace%'
        OR policyname ILIKE 'users%'
        OR policyname ILIKE 'authenticated users%'
        OR policyname ILIKE '%supervisor%'
        OR policyname ILIKE '%workspace isolation%'
        OR policyname ILIKE '%workspace_limits%'
        OR policyname ILIKE '%meta_campaigns%'
        OR policyname ILIKE '%shipping_logs%'
      )
  LOOP
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    EXCEPTION WHEN others THEN
      -- ignore errors
      RAISE NOTICE 'Failed dropping policy % on %.%: %', r.policyname, r.schemaname, r.tablename, SQLERRM;
    END;
  END LOOP;
END$$;

-- Drop known constraints that might already exist
ALTER TABLE IF EXISTS public.meta_campaigns DROP CONSTRAINT IF EXISTS meta_campaigns_meta_campaign_id_workspace_id_key;
ALTER TABLE IF EXISTS public.customers DROP CONSTRAINT IF EXISTS customers_phone_key;
ALTER TABLE IF EXISTS public.products DROP CONSTRAINT IF EXISTS products_sku_key;
ALTER TABLE IF EXISTS public.orders DROP CONSTRAINT IF EXISTS orders_order_number_key;

-- Remove membership from publication for tables that might already be present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE n.nspname = 'public' AND c.relname = 'meta_campaigns' AND p.pubname = 'supabase_realtime'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.meta_campaigns;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE n.nspname = 'public' AND c.relname = 'customers' AND p.pubname = 'supabase_realtime'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.customers;
  END IF;
END$$;

-- No-op: safe to run multiple times

COMMENT ON TABLE public.meta_campaigns IS 'cleanup: allow re-creation by migrations';
