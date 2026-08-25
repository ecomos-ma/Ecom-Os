-- ============================================================
-- Fix RLS policies for workspace_subscriptions to allow workspaces to read their own subscriptions
-- ============================================================

-- Drop existing supervisor-only policies to replace with more granular ones
DROP POLICY IF EXISTS "supervisors_can_read_workspace_subscriptions" ON public.workspace_subscriptions;
DROP POLICY IF EXISTS "supervisors_can_manage_workspace_subscriptions" ON public.workspace_subscriptions;

-- Create policy allowing workspaces to read their own subscriptions
CREATE POLICY "workspaces_can_read_own_subscriptions"
  ON public.workspace_subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_subscriptions.workspace_id
      AND w.id = (SELECT workspace_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- Keep supervisor management for all operations
CREATE POLICY "supervisors_can_manage_workspace_subscriptions"
  ON public.workspace_subscriptions FOR ALL
  USING (public.is_supervisor())
  WITH CHECK (public.is_supervisor());
