-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Add Workspace Supplies & Operational Stock
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.workspace_supplies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT,
    current_quantity INTEGER DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.workspace_supply_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    supply_id UUID NOT NULL REFERENCES public.workspace_supplies(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    total_price NUMERIC NOT NULL,
    unit_cost NUMERIC NOT NULL,
    supplier TEXT,
    note TEXT,
    purchase_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.workspace_supply_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    supply_id UUID NOT NULL REFERENCES public.workspace_supplies(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    note TEXT,
    usage_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Turn on RLS for the new tables
ALTER TABLE public.workspace_supplies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_supply_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_supply_usage ENABLE ROW LEVEL SECURITY;

-- Create Policies for workspace_supplies
CREATE POLICY "Users can select supplies in their workspace"
    ON public.workspace_supplies FOR SELECT
    USING (workspace_id IN (SELECT auth.uid() UNION SELECT id FROM workspaces));

CREATE POLICY "Users can insert supplies in their workspace"
    ON public.workspace_supplies FOR INSERT
    WITH CHECK (workspace_id IN (SELECT auth.uid() UNION SELECT id FROM workspaces));

CREATE POLICY "Users can update supplies in their workspace"
    ON public.workspace_supplies FOR UPDATE
    USING (workspace_id IN (SELECT auth.uid() UNION SELECT id FROM workspaces));

CREATE POLICY "Users can delete supplies in their workspace"
    ON public.workspace_supplies FOR DELETE
    USING (workspace_id IN (SELECT auth.uid() UNION SELECT id FROM workspaces));

-- Create Policies for workspace_supply_purchases
CREATE POLICY "Users can select supply purchases in their workspace"
    ON public.workspace_supply_purchases FOR SELECT
    USING (workspace_id IN (SELECT auth.uid() UNION SELECT id FROM workspaces));

CREATE POLICY "Users can insert supply purchases in their workspace"
    ON public.workspace_supply_purchases FOR INSERT
    WITH CHECK (workspace_id IN (SELECT auth.uid() UNION SELECT id FROM workspaces));

CREATE POLICY "Users can update supply purchases in their workspace"
    ON public.workspace_supply_purchases FOR UPDATE
    USING (workspace_id IN (SELECT auth.uid() UNION SELECT id FROM workspaces));

CREATE POLICY "Users can delete supply purchases in their workspace"
    ON public.workspace_supply_purchases FOR DELETE
    USING (workspace_id IN (SELECT auth.uid() UNION SELECT id FROM workspaces));

-- Create Policies for workspace_supply_usage
CREATE POLICY "Users can select supply usage in their workspace"
    ON public.workspace_supply_usage FOR SELECT
    USING (workspace_id IN (SELECT auth.uid() UNION SELECT id FROM workspaces));

CREATE POLICY "Users can insert supply usage in their workspace"
    ON public.workspace_supply_usage FOR INSERT
    WITH CHECK (workspace_id IN (SELECT auth.uid() UNION SELECT id FROM workspaces));

CREATE POLICY "Users can update supply usage in their workspace"
    ON public.workspace_supply_usage FOR UPDATE
    USING (workspace_id IN (SELECT auth.uid() UNION SELECT id FROM workspaces));

CREATE POLICY "Users can delete supply usage in their workspace"
    ON public.workspace_supply_usage FOR DELETE
    USING (workspace_id IN (SELECT auth.uid() UNION SELECT id FROM workspaces));

-- Migrate entered fees to confirmed triggers
UPDATE public.workspace_cost_rules 
SET trigger = 'confirmed' 
WHERE trigger = 'entered';

-- Disable generic 'Delivery' fees to avoid double counting with automated shipping (optional guard but good for data cleanup)
UPDATE public.workspace_cost_rules
SET enabled = false
WHERE (name ILIKE '%delivery%' OR name ILIKE '%shipping%' OR name ILIKE '%livraison%');
