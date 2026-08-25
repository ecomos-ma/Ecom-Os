-- Rebuild the team invitation model around email-based RBAC invitations.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS allowed_sections jsonb;

CREATE TABLE IF NOT EXISTS public.workspace_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  email text NOT NULL,
  role text NOT NULL DEFAULT 'agent' CHECK (role IN ('owner','supervisor','agent')),
  allowed_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  invited_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired','revoked')),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_can_view_workspace_invitations"
  ON public.workspace_invitations FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "workspace_owners_can_manage_workspace_invitations"
  ON public.workspace_invitations FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('owner','supervisor')
    )
  );

CREATE POLICY "workspace_owners_can_update_workspace_invitations"
  ON public.workspace_invitations FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('owner','supervisor')
    )
  );

CREATE INDEX IF NOT EXISTS idx_workspace_invitations_workspace ON public.workspace_invitations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_email_status ON public.workspace_invitations(email, status);

CREATE OR REPLACE FUNCTION public.set_workspace_invitation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_workspace_invitations_updated_at ON public.workspace_invitations;
CREATE TRIGGER trg_workspace_invitations_updated_at
BEFORE UPDATE ON public.workspace_invitations
FOR EACH ROW
EXECUTE FUNCTION public.set_workspace_invitation_updated_at();
