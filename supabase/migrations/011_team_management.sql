-- Create team_audit_log table (legacy audit log preserved)
CREATE TABLE IF NOT EXISTS team_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id),
  actor_email VARCHAR(255),
  action VARCHAR(50) NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  target_id UUID,
  target_email VARCHAR(255),
  changes JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_audit_workspace ON team_audit_log(workspace_id);

ALTER TABLE team_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_can_view_audit" ON team_audit_log
  FOR SELECT USING (workspace_id IN (
    SELECT workspace_id FROM profiles WHERE id = auth.uid()
  ));
