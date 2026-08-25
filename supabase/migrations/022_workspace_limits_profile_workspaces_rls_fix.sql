-- Migration 022: create workspace_limits + profile_workspaces and fix RLS/policies
-- Idempotent: uses IF NOT EXISTS, DROP POLICY IF EXISTS, CREATE OR REPLACE FUNCTION

-- 1) Create workspace_limits
CREATE TABLE IF NOT EXISTS public.workspace_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','unlimited','custom')),
  max_workspaces integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id)
);

-- 2) Create profile_workspaces
CREATE TABLE IF NOT EXISTS public.profile_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  is_owner boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id, workspace_id)
);

-- 3) Indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_workspace_limits_profile ON public.workspace_limits(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_workspaces_profile ON public.profile_workspaces(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_workspaces_workspace ON public.profile_workspaces(workspace_id);

-- 4) Ensure updated_at trigger/function for workspace_limits
CREATE OR REPLACE FUNCTION public.set_updated_at_workspace_limits()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_workspace_limits_updated_at ON public.workspace_limits;
CREATE TRIGGER trg_workspace_limits_updated_at
BEFORE UPDATE ON public.workspace_limits
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_workspace_limits();

-- 5) Helper RPCs (create or replace)
CREATE OR REPLACE FUNCTION public.get_my_workspace_limit()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT coalesce(max_workspaces, 1) FROM public.workspace_limits WHERE profile_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_workspace_plan()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT coalesce(plan, 'free') FROM public.workspace_limits WHERE profile_id = auth.uid();
$$;

-- 6) Ensure membership trigger for profiles -> profile_workspaces (idempotent)
CREATE OR REPLACE FUNCTION public.ensure_profile_workspace_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profile_workspaces (profile_id, workspace_id, is_owner)
  VALUES (NEW.id, NEW.workspace_id, true)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_workspace_membership ON public.profiles;
CREATE TRIGGER trg_profiles_workspace_membership
AFTER INSERT OR UPDATE OF workspace_id ON public.profiles
FOR EACH ROW
WHEN (NEW.workspace_id IS NOT NULL)
EXECUTE FUNCTION public.ensure_profile_workspace_membership();

-- 7) Enable RLS on the new tables
ALTER TABLE public.workspace_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_workspaces ENABLE ROW LEVEL SECURITY;

-- 8) Policies for workspace_limits
DROP POLICY IF EXISTS "profiles_can_read_their_workspace_limits" ON public.workspace_limits;
DROP POLICY IF EXISTS "supervisors_can_read_workspace_limits" ON public.workspace_limits;
DROP POLICY IF EXISTS "profiles_can_manage_their_workspace_limits" ON public.workspace_limits;

CREATE POLICY "profiles_can_read_their_workspace_limits"
  ON public.workspace_limits FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "supervisors_can_read_workspace_limits"
  ON public.workspace_limits FOR SELECT
  USING (public.is_supervisor() OR profile_id = auth.uid());

CREATE POLICY "profiles_can_manage_their_workspace_limits"
  ON public.workspace_limits FOR ALL
  USING (profile_id = auth.uid() OR public.is_supervisor())
  WITH CHECK (profile_id = auth.uid() OR public.is_supervisor());

-- 9) Policies for profile_workspaces
DROP POLICY IF EXISTS "profiles_can_read_their_profile_workspaces" ON public.profile_workspaces;
DROP POLICY IF EXISTS "profiles_can_manage_their_profile_workspaces" ON public.profile_workspaces;

CREATE POLICY "profiles_can_read_their_profile_workspaces"
  ON public.profile_workspaces FOR SELECT
  USING (profile_id = auth.uid() OR public.is_supervisor());

CREATE POLICY "profiles_can_manage_their_profile_workspaces"
  ON public.profile_workspaces FOR ALL
  USING (profile_id = auth.uid() OR public.is_supervisor())
  WITH CHECK (profile_id = auth.uid() OR public.is_supervisor());

-- 10) Ensure workspace_shipping_providers RLS + policies (fix INSERT 403)
ALTER TABLE IF EXISTS public.workspace_shipping_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_shipping_providers_select" ON public.workspace_shipping_providers;
DROP POLICY IF EXISTS "workspace_shipping_providers_insert" ON public.workspace_shipping_providers;
DROP POLICY IF EXISTS "workspace_shipping_providers_update" ON public.workspace_shipping_providers;
DROP POLICY IF EXISTS "workspace_shipping_providers_delete" ON public.workspace_shipping_providers;

CREATE POLICY "workspace_shipping_providers_select"
  ON public.workspace_shipping_providers FOR SELECT
  USING (
    public.is_supervisor() OR workspace_id = public.get_my_workspace_id()
  );

CREATE POLICY "workspace_shipping_providers_insert"
  ON public.workspace_shipping_providers FOR INSERT
  WITH CHECK (
    public.is_supervisor() OR workspace_id = public.get_my_workspace_id()
  );

CREATE POLICY "workspace_shipping_providers_update"
  ON public.workspace_shipping_providers FOR UPDATE
  USING (
    public.is_supervisor() OR workspace_id = public.get_my_workspace_id()
  )
  WITH CHECK (
    public.is_supervisor() OR workspace_id = public.get_my_workspace_id()
  );

CREATE POLICY "workspace_shipping_providers_delete"
  ON public.workspace_shipping_providers FOR DELETE
  USING (
    public.is_supervisor() OR workspace_id = public.get_my_workspace_id()
  );

CREATE INDEX IF NOT EXISTS idx_workspace_shipping_providers_workspace ON public.workspace_shipping_providers(workspace_id);

-- Grant basic privileges to authenticated role for REST operations
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_limits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_workspaces TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_shipping_providers TO authenticated;

-- 11) Fix workspace_invitations SELECT policy to allow workspace members + supervisors
DROP POLICY IF EXISTS "workspace_members_can_view_workspace_invitations" ON public.workspace_invitations;
CREATE POLICY "workspace_members_can_view_workspace_invitations"
  ON public.workspace_invitations FOR SELECT
  USING (
    public.is_supervisor()
    OR workspace_id = public.get_my_workspace_id()
    OR workspace_id IN (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_workspace_invitations_workspace ON public.workspace_invitations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_email_status ON public.workspace_invitations(email, status);

-- 12) Seed minimal defaults without overwriting
INSERT INTO public.workspace_limits (profile_id, max_workspaces)
SELECT p.id, 1 FROM public.profiles p
ON CONFLICT (profile_id) DO NOTHING;

INSERT INTO public.profile_workspaces (profile_id, workspace_id, is_owner)
SELECT p.id, p.workspace_id, true FROM public.profiles p WHERE p.workspace_id IS NOT NULL
ON CONFLICT (profile_id, workspace_id) DO NOTHING;

-- End migration 022
