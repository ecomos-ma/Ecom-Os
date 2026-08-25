-- ═══════════════════════════════════════════════════════════════
-- 065_meta_campaigns_workspace_fix.sql
--
-- PROBLEM: meta_campaigns rows have workspace_id = NULL because migration
-- 003_multi_tenant.sql added the column but the sync Edge Function was
-- not including it at the time. All rows need to be backfilled.
--
-- Migration 003 already:
--   ✅ Added workspace_id column
--   ✅ Added unique constraint (meta_campaign_id, workspace_id)
--   ✅ Wrote the RLS policy using get_my_workspace_id()
--
-- This migration only needs to:
--   1. Backfill existing NULL rows with the first workspace
--   2. Ensure the correct RLS SELECT policy exists
-- ═══════════════════════════════════════════════════════════════

-- 1. Backfill all NULL workspace_id rows with the first workspace
DO $$
DECLARE
  v_workspace_id UUID;
  v_updated INTEGER;
BEGIN
  SELECT id INTO v_workspace_id FROM public.workspaces ORDER BY created_at ASC LIMIT 1;
  IF v_workspace_id IS NOT NULL THEN
    UPDATE public.meta_campaigns
    SET workspace_id = v_workspace_id
    WHERE workspace_id IS NULL;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RAISE NOTICE 'Backfilled % meta_campaigns rows with workspace_id = %', v_updated, v_workspace_id;
  ELSE
    RAISE NOTICE 'No workspaces found — skipping backfill';
  END IF;
END $$;

-- 2. Ensure correct SELECT policy exists (uses existing get_my_workspace_id() helper)
DROP POLICY IF EXISTS "Authenticated users can read meta_campaigns" ON public.meta_campaigns;
DROP POLICY IF EXISTS "Workspace isolation for meta_campaigns" ON public.meta_campaigns;
DROP POLICY IF EXISTS "Workspace members can read their meta_campaigns" ON public.meta_campaigns;

CREATE POLICY "Workspace isolation for meta_campaigns"
  ON public.meta_campaigns FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());

-- 3. Ensure service_role can upsert (for Edge Function)
DROP POLICY IF EXISTS "Service role can upsert meta_campaigns" ON public.meta_campaigns;
DROP POLICY IF EXISTS "Service role full access meta_campaigns" ON public.meta_campaigns;

CREATE POLICY "Service role full access meta_campaigns"
  ON public.meta_campaigns FOR ALL
  USING (auth.role() = 'service_role');

-- 4. Verify
DO $$
DECLARE
  v_null_count INTEGER;
  v_total INTEGER;
BEGIN
  SELECT count(*) INTO v_null_count FROM public.meta_campaigns WHERE workspace_id IS NULL;
  SELECT count(*) INTO v_total FROM public.meta_campaigns;
  RAISE NOTICE 'Result: % total rows, % still have NULL workspace_id', v_total, v_null_count;
END $$;
