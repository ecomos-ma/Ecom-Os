-- ═══════════════════════════════════════════════════════════════════════════════
-- 202608200001_dual_profit_system.sql
-- Dual Profit/Cost Calculation System
-- Adds: business_cost_model, flexible cost rules, affiliate SKU costs
-- NON-DESTRUCTIVE: all existing columns preserved
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Business Cost Model on workspaces ─────────────────────────────────────
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS business_cost_model TEXT NOT NULL DEFAULT 'seller'
    CHECK (business_cost_model IN ('seller', 'affiliate'));

-- ── 2. Affiliate default cost settings on workspaces ─────────────────────────
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS affiliate_default_product_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS affiliate_default_shipping_cost NUMERIC(12,2) NOT NULL DEFAULT 35,
  ADD COLUMN IF NOT EXISTS affiliate_shipping_cost_source TEXT NOT NULL DEFAULT 'fixed'
    CHECK (affiliate_shipping_cost_source IN ('fixed', 'provider'));

-- ── 3. workspace_cost_rules — flexible per-workspace fee engine ───────────────
-- Replaces the 5 hardcoded fixed fee columns for new workspaces.
-- Old columns (business_delivery_fee etc.) kept for backward compat.

CREATE TABLE IF NOT EXISTS public.workspace_cost_rules (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID       NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  trigger     TEXT        NOT NULL DEFAULT 'entered'
                CHECK (trigger IN ('entered', 'confirmed', 'delivered')),
  enabled     BOOLEAN     NOT NULL DEFAULT true,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wcr_workspace_id
  ON public.workspace_cost_rules(workspace_id);

CREATE INDEX IF NOT EXISTS idx_wcr_workspace_enabled
  ON public.workspace_cost_rules(workspace_id, enabled)
  WHERE enabled = true;

-- RLS
ALTER TABLE public.workspace_cost_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_cost_rules_select" ON public.workspace_cost_rules;
CREATE POLICY "workspace_cost_rules_select"
  ON public.workspace_cost_rules FOR SELECT
  USING (
    workspace_id IN (
      SELECT id FROM public.workspaces WHERE created_by = auth.uid()
      UNION
      SELECT workspace_id FROM public.profile_workspaces WHERE profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "workspace_cost_rules_insert" ON public.workspace_cost_rules;
CREATE POLICY "workspace_cost_rules_insert"
  ON public.workspace_cost_rules FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT id FROM public.workspaces WHERE created_by = auth.uid()
      UNION
      SELECT workspace_id FROM public.profile_workspaces WHERE profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "workspace_cost_rules_update" ON public.workspace_cost_rules;
CREATE POLICY "workspace_cost_rules_update"
  ON public.workspace_cost_rules FOR UPDATE
  USING (
    workspace_id IN (
      SELECT id FROM public.workspaces WHERE created_by = auth.uid()
      UNION
      SELECT workspace_id FROM public.profile_workspaces WHERE profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "workspace_cost_rules_delete" ON public.workspace_cost_rules;
CREATE POLICY "workspace_cost_rules_delete"
  ON public.workspace_cost_rules FOR DELETE
  USING (
    workspace_id IN (
      SELECT id FROM public.workspaces WHERE created_by = auth.uid()
      UNION
      SELECT workspace_id FROM public.profile_workspaces WHERE profile_id = auth.uid()
    )
  );

-- ── 4. workspace_affiliate_sku_costs ─────────────────────────────────────────
-- Lets affiliate users set per-SKU product cost overrides.

CREATE TABLE IF NOT EXISTS public.workspace_affiliate_sku_costs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  sku          TEXT        NOT NULL,
  cost         NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, sku)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wasc_workspace_id
  ON public.workspace_affiliate_sku_costs(workspace_id);

CREATE INDEX IF NOT EXISTS idx_wasc_sku
  ON public.workspace_affiliate_sku_costs(workspace_id, sku);

-- RLS
ALTER TABLE public.workspace_affiliate_sku_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wasc_select" ON public.workspace_affiliate_sku_costs;
CREATE POLICY "wasc_select"
  ON public.workspace_affiliate_sku_costs FOR SELECT
  USING (
    workspace_id IN (
      SELECT id FROM public.workspaces WHERE created_by = auth.uid()
      UNION
      SELECT workspace_id FROM public.profile_workspaces WHERE profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "wasc_insert" ON public.workspace_affiliate_sku_costs;
CREATE POLICY "wasc_insert"
  ON public.workspace_affiliate_sku_costs FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT id FROM public.workspaces WHERE created_by = auth.uid()
      UNION
      SELECT workspace_id FROM public.profile_workspaces WHERE profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "wasc_update" ON public.workspace_affiliate_sku_costs;
CREATE POLICY "wasc_update"
  ON public.workspace_affiliate_sku_costs FOR UPDATE
  USING (
    workspace_id IN (
      SELECT id FROM public.workspaces WHERE created_by = auth.uid()
      UNION
      SELECT workspace_id FROM public.profile_workspaces WHERE profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "wasc_delete" ON public.workspace_affiliate_sku_costs;
CREATE POLICY "wasc_delete"
  ON public.workspace_affiliate_sku_costs FOR DELETE
  USING (
    workspace_id IN (
      SELECT id FROM public.workspaces WHERE created_by = auth.uid()
      UNION
      SELECT workspace_id FROM public.profile_workspaces WHERE profile_id = auth.uid()
    )
  );

-- ── 5. Backward-compatibility seed function ───────────────────────────────────
-- For any workspace that has old fee values but no rules yet,
-- this function can be called client-side after migration to seed defaults.
-- We do NOT auto-run this to avoid wiping any partially-migrated workspaces.

CREATE OR REPLACE FUNCTION public.seed_cost_rules_from_legacy(p_workspace_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ws RECORD;
  v_count INTEGER;
BEGIN
  -- Only seed if no rules exist yet for this workspace
  SELECT COUNT(*) INTO v_count
  FROM public.workspace_cost_rules
  WHERE workspace_id = p_workspace_id;

  IF v_count > 0 THEN
    RETURN; -- already seeded, skip
  END IF;

  SELECT
    business_delivery_fee,
    business_confirmation_fee,
    business_fulfillment_fee,
    business_lead_fee
  INTO v_ws
  FROM public.workspaces
  WHERE id = p_workspace_id;

  IF NOT FOUND THEN RETURN; END IF;

  -- Insert legacy fees as named cost rules
  INSERT INTO public.workspace_cost_rules
    (workspace_id, name, amount, trigger, sort_order)
  VALUES
    (p_workspace_id, 'Delivery Fee',      COALESCE(v_ws.business_delivery_fee, 35),      'delivered',  1),
    (p_workspace_id, 'Confirmation Fee',  COALESCE(v_ws.business_confirmation_fee, 11),   'confirmed',  2),
    (p_workspace_id, 'Fulfillment Fee',   COALESCE(v_ws.business_fulfillment_fee, 2),     'delivered',  3),
    (p_workspace_id, 'Lead Fee',          COALESCE(v_ws.business_lead_fee, 0),             'entered',    4);
END;
$$;
