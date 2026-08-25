-- Migration: enable RLS and add workspace policies for workspace_shipping_providers
-- Ensures only authenticated users in the same workspace (or supervisors) can access rows

ALTER TABLE public.workspace_shipping_providers ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies to avoid duplicates
DROP POLICY IF EXISTS "workspace_shipping_providers_select" ON public.workspace_shipping_providers;
DROP POLICY IF EXISTS "workspace_shipping_providers_insert" ON public.workspace_shipping_providers;
DROP POLICY IF EXISTS "workspace_shipping_providers_update" ON public.workspace_shipping_providers;
DROP POLICY IF EXISTS "workspace_shipping_providers_delete" ON public.workspace_shipping_providers;

-- SELECT: supervisors or same workspace
CREATE POLICY "workspace_shipping_providers_select"
  ON public.workspace_shipping_providers FOR SELECT
  USING (
    public.is_supervisor() OR workspace_id = public.get_my_workspace_id()
  );

-- INSERT: allow inserts only for rows that belong to the caller's workspace (or supervisors)
CREATE POLICY "workspace_shipping_providers_insert"
  ON public.workspace_shipping_providers FOR INSERT
  WITH CHECK (
    public.is_supervisor() OR workspace_id = public.get_my_workspace_id()
  );

-- UPDATE: allow updating rows only within caller's workspace (or supervisors)
CREATE POLICY "workspace_shipping_providers_update"
  ON public.workspace_shipping_providers FOR UPDATE
  USING (
    public.is_supervisor() OR workspace_id = public.get_my_workspace_id()
  )
  WITH CHECK (
    public.is_supervisor() OR workspace_id = public.get_my_workspace_id()
  );

-- DELETE: allow delete only for rows within caller's workspace (or supervisors)
CREATE POLICY "workspace_shipping_providers_delete"
  ON public.workspace_shipping_providers FOR DELETE
  USING (
    public.is_supervisor() OR workspace_id = public.get_my_workspace_id()
  );
