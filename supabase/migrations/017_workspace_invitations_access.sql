-- ============================================================
-- EcomOS · Workspace invitation access policies and helper RPCs
-- ============================================================

-- Allow invited users to look up their pending invitation by email.
CREATE POLICY "invitees_can_view_their_pending_workspace_invitations"
  ON public.workspace_invitations FOR SELECT
  USING (
    status = 'pending'
    AND lower(email) = lower(auth.jwt() ->> 'email')
  );

-- Allow invited users to accept their own pending invitation.
CREATE POLICY "invitees_can_accept_their_pending_workspace_invitations"
  ON public.workspace_invitations FOR UPDATE
  USING (
    status = 'pending'
    AND lower(email) = lower(auth.jwt() ->> 'email')
  )
  WITH CHECK (
    status = 'accepted'
    AND user_id = auth.uid()
    AND lower(email) = lower(auth.jwt() ->> 'email')
  );

CREATE OR REPLACE FUNCTION public.get_pending_workspace_invitation_by_email(user_email text)
RETURNS public.workspace_invitations LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT *
  FROM public.workspace_invitations
  WHERE lower(email) = lower(user_email)
    AND status = 'pending'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(invitation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  invite_row public.workspace_invitations%ROWTYPE;
BEGIN
  SELECT * INTO invite_row
  FROM public.workspace_invitations
  WHERE id = invitation_id
    AND status = 'pending'
    AND lower(email) = lower(auth.jwt() ->> 'email');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITATION_NOT_FOUND_OR_NOT_AUTHORIZED';
  END IF;

  UPDATE public.workspace_invitations
  SET status = 'accepted', accepted_at = now(), user_id = auth.uid()
  WHERE id = invitation_id;
END;
$$;
