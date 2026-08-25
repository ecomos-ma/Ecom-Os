-- Add RLS policies for ameex_city_mappings table
-- The table was created with RLS enabled but no policies, preventing all access

-- Enable read access for authenticated users within their workspace
CREATE POLICY "ameex_city_mappings_workspace_read"
  ON public.ameex_city_mappings
  FOR SELECT
  USING (public.user_has_workspace_access(workspace_id));

-- Enable insert for authenticated users within their workspace
CREATE POLICY "ameex_city_mappings_workspace_insert"
  ON public.ameex_city_mappings
  FOR INSERT
  WITH CHECK (public.user_has_workspace_access(workspace_id));

-- Enable update for authenticated users within their workspace
CREATE POLICY "ameex_city_mappings_workspace_update"
  ON public.ameex_city_mappings
  FOR UPDATE
  USING (public.user_has_workspace_access(workspace_id))
  WITH CHECK (public.user_has_workspace_access(workspace_id));

-- Enable delete for authenticated users within their workspace
CREATE POLICY "ameex_city_mappings_workspace_delete"
  ON public.ameex_city_mappings
  FOR DELETE
  USING (public.user_has_workspace_access(workspace_id));
