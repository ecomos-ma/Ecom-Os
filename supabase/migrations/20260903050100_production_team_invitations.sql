-- Production workspace invitations: one canonical row, expiring links,
-- server-side acceptance, and auditability.
ALTER TABLE public.workspace_invitations
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS agent_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.workspace_invitations
SET expires_at = coalesce(expires_at, created_at + interval '7 days'),
    last_sent_at = coalesce(last_sent_at, created_at)
WHERE expires_at IS NULL OR last_sent_at IS NULL;

ALTER TABLE public.workspace_invitations
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '7 days');

CREATE UNIQUE INDEX IF NOT EXISTS workspace_invitations_pending_email_uidx
  ON public.workspace_invitations (workspace_id, lower(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS workspace_invitations_expiry_idx
  ON public.workspace_invitations (expires_at)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  invitation_row public.workspace_invitations;
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  active_members integer;
  member_limit integer;
BEGIN
  SELECT * INTO invitation_row
  FROM public.workspace_invitations
  WHERE id = p_invitation_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'INVITATION_NOT_FOUND'; END IF;

  IF invitation_row.status = 'accepted' AND invitation_row.user_id = auth.uid() THEN
    RETURN;
  END IF;
  IF invitation_row.status <> 'pending' THEN RAISE EXCEPTION 'INVITATION_NOT_AVAILABLE'; END IF;
  IF invitation_row.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'INVITATION_REVOKED'; END IF;
  IF invitation_row.expires_at IS NOT NULL AND invitation_row.expires_at <= now() THEN
    UPDATE public.workspace_invitations
    SET status = 'expired'
    WHERE id = invitation_row.id AND status = 'pending';
    RAISE EXCEPTION 'INVITATION_EXPIRED';
  END IF;
  IF lower(invitation_row.email) <> current_email THEN RAISE EXCEPTION 'INVITATION_EMAIL_MISMATCH'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles inviter
    WHERE inviter.id = invitation_row.invited_by
      AND inviter.workspace_id = invitation_row.workspace_id
      AND inviter.role IN ('owner', 'supervisor')
      AND coalesce(inviter.is_active, true)
      AND inviter.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'INVITER_NO_LONGER_AUTHORIZED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = invitation_row.workspace_id AND coalesce(is_active, true) AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'WORKSPACE_NOT_AVAILABLE';
  END IF;

  SELECT count(*)::integer INTO active_members
  FROM public.profile_workspaces
  WHERE workspace_id = invitation_row.workspace_id AND coalesce(status, 'active') = 'active';
  SELECT coalesce(active_override.team_member_limit, plan.team_member_limit, 10000)
  INTO member_limit
  FROM public.workspace_subscription_owners owner
  LEFT JOIN public.user_subscriptions subscription ON subscription.owner_user_id = owner.owner_user_id
  LEFT JOIN public.subscription_plans plan ON plan.id = subscription.plan_id AND plan.is_official
  LEFT JOIN LATERAL (
    SELECT override.team_member_limit
    FROM public.subscription_limit_overrides override
    WHERE override.subscription_id = subscription.id
      AND override.team_member_limit IS NOT NULL
      AND override.revoked_at IS NULL
      AND override.starts_at <= now()
      AND (override.ends_at IS NULL OR override.ends_at > now())
    ORDER BY override.created_at DESC
    LIMIT 1
  ) active_override ON true
  WHERE owner.workspace_id = invitation_row.workspace_id;
  IF coalesce(member_limit, 10000) <= active_members THEN RAISE EXCEPTION 'TEAM_MEMBER_LIMIT_REACHED'; END IF;

  UPDATE public.profiles
  SET workspace_id = invitation_row.workspace_id,
      allowed_sections = invitation_row.allowed_sections,
      role = CASE WHEN invitation_row.role IN ('owner', 'supervisor', 'agent') THEN invitation_row.role ELSE 'agent' END,
      is_active = true,
      full_name = coalesce(nullif(invitation_row.full_name, ''), full_name)
  WHERE id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

  INSERT INTO public.profile_workspaces (profile_id, workspace_id, is_owner, role, status)
  VALUES (auth.uid(), invitation_row.workspace_id, false,
          CASE WHEN invitation_row.role IN ('owner', 'supervisor', 'agent') THEN invitation_row.role ELSE 'agent' END,
          'active')
  ON CONFLICT (profile_id, workspace_id) DO UPDATE
    SET role = excluded.role, status = 'active', is_owner = false;

  INSERT INTO public.team_member_profiles (profile_id, workspace_id, daily_limit, max_active_orders)
  VALUES (
    auth.uid(), invitation_row.workspace_id,
    coalesce(nullif(invitation_row.agent_settings->>'daily_limit', '')::integer, 80),
    coalesce(nullif(invitation_row.agent_settings->>'max_active_orders', '')::integer, 30)
  )
  ON CONFLICT (profile_id, workspace_id) DO UPDATE
    SET daily_limit = excluded.daily_limit, max_active_orders = excluded.max_active_orders;

  UPDATE public.workspace_invitations
  SET status = 'accepted', accepted_at = now(), user_id = auth.uid()
  WHERE id = invitation_row.id AND status = 'pending';

  INSERT INTO public.team_audit_log (workspace_id, actor_id, actor_email, action, target_type, target_id, target_email, changes)
  VALUES (invitation_row.workspace_id, auth.uid(), current_email, 'invitation_accepted', 'invitation', invitation_row.id, invitation_row.email,
          jsonb_build_object('role', invitation_row.role, 'allowed_sections', invitation_row.allowed_sections));
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation(uuid) TO authenticated;
