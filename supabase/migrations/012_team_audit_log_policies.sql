-- Add missing INSERT policy for team_audit_log
drop policy if exists "owner_can_insert_audit_log" on team_audit_log;
CREATE POLICY "owner_can_insert_audit_log" ON team_audit_log
  FOR INSERT WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM profiles 
    WHERE id = auth.uid() AND role IN ('owner', 'supervisor')
  ));

-- Add UPDATE policy for team_audit_log (if needed for future use)
drop policy if exists "owner_can_update_audit_log" on team_audit_log;
CREATE POLICY "owner_can_update_audit_log" ON team_audit_log
  FOR UPDATE USING (workspace_id IN (
    SELECT workspace_id FROM profiles 
    WHERE id = auth.uid() AND role IN ('owner', 'supervisor')
  ));

-- Add DELETE policy for team_audit_log
drop policy if exists "owner_can_delete_audit_log" on team_audit_log;
CREATE POLICY "owner_can_delete_audit_log" ON team_audit_log
  FOR DELETE USING (workspace_id IN (
    SELECT workspace_id FROM profiles 
    WHERE id = auth.uid() AND role IN ('owner', 'supervisor')
  ));
