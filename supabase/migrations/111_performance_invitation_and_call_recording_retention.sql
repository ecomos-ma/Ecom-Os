-- Ecom OS: secure invitation lookup and seven-day recording retention.
-- This migration is additive: business records are never deleted here.

-- ---------------------------------------------------------------------------
-- Invitation lookup: self-only for invitees, manager-only for workspace data.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_workspace_invitations(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public.is_founder()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.workspace_id = p_workspace_id
        AND p.role IN ('owner', 'supervisor')
        AND coalesce(p.is_active, true)
        AND p.deleted_at IS NULL
    );
$$;

-- Previous installations accumulated overlapping policies, some of which
-- query protected user relations. Rebuild only this table's policies around
-- auth.uid()/auth.jwt() and the scoped helper above.
DO $$
DECLARE policy_name text;
BEGIN
  FOR policy_name IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'workspace_invitations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.workspace_invitations', policy_name);
  END LOOP;
END;
$$;

CREATE POLICY workspace_invitations_select_scoped
  ON public.workspace_invitations FOR SELECT
  USING (
    (
      status = 'pending'
      AND lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    OR public.can_manage_workspace_invitations(workspace_id)
  );

CREATE POLICY workspace_invitations_insert_scoped
  ON public.workspace_invitations FOR INSERT
  WITH CHECK (public.can_manage_workspace_invitations(workspace_id));

CREATE POLICY workspace_invitations_update_scoped
  ON public.workspace_invitations FOR UPDATE
  USING (public.can_manage_workspace_invitations(workspace_id))
  WITH CHECK (public.can_manage_workspace_invitations(workspace_id));

CREATE POLICY workspace_invitations_delete_scoped
  ON public.workspace_invitations FOR DELETE
  USING (public.can_manage_workspace_invitations(workspace_id));

-- The browser cannot choose an email parameter. This eliminates the failing
-- direct REST lookup while keeping acceptance constrained to the JWT owner.
CREATE OR REPLACE FUNCTION public.get_my_pending_workspace_invitation()
RETURNS TABLE (
  id uuid,
  workspace_id uuid,
  email text,
  role text,
  allowed_sections jsonb,
  status text,
  created_at timestamptz,
  user_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT wi.id, wi.workspace_id, wi.email, wi.role, wi.allowed_sections,
         wi.status, wi.created_at, wi.user_id
  FROM public.workspace_invitations wi
  WHERE wi.status = 'pending'
    AND lower(wi.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  ORDER BY wi.created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_pending_workspace_invitation() TO authenticated;

-- Keep the privileged acceptance transition server-side. In particular,
-- allowed_sections is JSONB in the current schema and must not be cast to a
-- text array by legacy versions of this function.
CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE invitation_row public.workspace_invitations;
BEGIN
  SELECT * INTO invitation_row
  FROM public.workspace_invitations
  WHERE id = p_invitation_id
    AND status = 'pending'
    AND lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITATION_NOT_FOUND_OR_NOT_ALLOWED';
  END IF;

  UPDATE public.profiles
  SET workspace_id = invitation_row.workspace_id,
      allowed_sections = invitation_row.allowed_sections,
      role = CASE
        WHEN invitation_row.role IN ('owner', 'supervisor', 'agent') THEN invitation_row.role
        ELSE 'agent'
      END,
      is_active = true
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;

  INSERT INTO public.profile_workspaces (profile_id, workspace_id, is_owner)
  VALUES (auth.uid(), invitation_row.workspace_id, invitation_row.role = 'owner')
  ON CONFLICT (profile_id, workspace_id) DO NOTHING;

  UPDATE public.workspace_invitations
  SET status = 'accepted', accepted_at = now(), user_id = auth.uid()
  WHERE id = invitation_row.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Call-recording metadata survives; only its private Storage object expires.
-- ---------------------------------------------------------------------------
ALTER TABLE public.confirmation_call_recordings
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS cleanup_attempted_at timestamptz;

-- Older recordings become eligible from their original capture time. This
-- retains their call history while the scheduled Edge Function removes only
-- their positively linked Storage object.
UPDATE public.confirmation_call_recordings
SET expires_at = created_at + interval '7 days'
WHERE expires_at IS NULL;

ALTER TABLE public.confirmation_call_recordings
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '7 days'),
  ALTER COLUMN storage_path DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.set_confirmation_recording_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := coalesce(NEW.created_at, now()) + interval '7 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS confirmation_recordings_set_expiry ON public.confirmation_call_recordings;
CREATE TRIGGER confirmation_recordings_set_expiry
  BEFORE INSERT ON public.confirmation_call_recordings
  FOR EACH ROW EXECUTE FUNCTION public.set_confirmation_recording_expiry();

CREATE INDEX IF NOT EXISTS confirmation_recordings_expiry_cleanup_idx
  ON public.confirmation_call_recordings (expires_at)
  WHERE expired_at IS NULL AND storage_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS confirmation_recordings_workspace_expiry_idx
  ON public.confirmation_call_recordings (workspace_id, expires_at DESC);

-- Founder storage reporting uses lightweight metadata, never a bucket-wide
-- scan during a normal workspace page load.
CREATE OR REPLACE FUNCTION public.get_call_recording_storage_summary()
RETURNS TABLE (
  active_recordings bigint,
  active_bytes bigint,
  expiring_within_24h bigint,
  expired_recordings bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_founder() THEN
    RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED';
  END IF;

  RETURN QUERY
  SELECT
    count(*) FILTER (WHERE r.expired_at IS NULL AND r.storage_path IS NOT NULL),
    coalesce(sum(r.file_size) FILTER (WHERE r.expired_at IS NULL AND r.storage_path IS NOT NULL), 0)::bigint,
    count(*) FILTER (
      WHERE r.expired_at IS NULL
        AND r.storage_path IS NOT NULL
        AND r.expires_at <= now() + interval '24 hours'
    ),
    count(*) FILTER (WHERE r.expired_at IS NOT NULL)
  FROM public.confirmation_call_recordings r;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_call_recording_storage_summary() TO authenticated;

-- Deploy supabase/functions/cleanup-expired-call-recordings and schedule that
-- single server-side function every six hours. The job must use a protected
-- server secret; it must never be called from the browser or once per row.
