-- ============================================================
-- EcomOS · Multi-Workspace Limits and Profile Workspace Mapping
-- Run this in Supabase SQL Editor or via migration tooling
-- ============================================================

-- Add support for per-profile workspace limits and workspace membership mapping.

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.workspace_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','unlimited','custom')),
  max_workspaces integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id)
);

CREATE TABLE IF NOT EXISTS public.profile_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  is_owner boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id, workspace_id)
);

ALTER TABLE public.workspace_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_workspaces ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "profiles_can_read_their_profile_workspaces"
  ON public.profile_workspaces FOR SELECT
  USING (profile_id = auth.uid() OR public.is_supervisor());

CREATE POLICY "profiles_can_manage_their_profile_workspaces"
  ON public.profile_workspaces FOR ALL
  USING (profile_id = auth.uid() OR public.is_supervisor())
  WITH CHECK (profile_id = auth.uid() OR public.is_supervisor());

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

CREATE OR REPLACE FUNCTION public.get_my_workspace_limit()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT coalesce(max_workspaces, 1) FROM public.workspace_limits WHERE profile_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_workspace_plan()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT coalesce(plan, 'free') FROM public.workspace_limits WHERE profile_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.create_workspace_for_user(workspace_name text)
RETURNS public.workspaces LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  profile_count integer;
  allowed integer := 1;
  new_workspace public.workspaces%ROWTYPE;
BEGIN
  SELECT count(*) INTO profile_count FROM public.profile_workspaces WHERE profile_id = auth.uid();
  SELECT coalesce(max_workspaces, 1) INTO allowed FROM public.workspace_limits WHERE profile_id = auth.uid();

  IF profile_count >= allowed THEN
    RAISE EXCEPTION 'WORKSPACE_LIMIT_REACHED';
  END IF;

  INSERT INTO public.workspaces (name, created_by)
  VALUES (workspace_name, auth.uid())
  RETURNING * INTO new_workspace;

  INSERT INTO public.profile_workspaces (profile_id, workspace_id, is_owner)
  VALUES (auth.uid(), new_workspace.id, true)
  ON CONFLICT DO NOTHING;

  UPDATE public.profiles SET workspace_id = new_workspace.id WHERE id = auth.uid();

  RETURN new_workspace;
END;
$$;

CREATE OR REPLACE FUNCTION public.switch_profile_workspace(new_workspace_id uuid)
RETURNS public.profiles LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  member_count integer;
  updated_profile public.profiles%ROWTYPE;
BEGIN
  SELECT count(*) INTO member_count FROM public.profile_workspaces
  WHERE profile_id = auth.uid() AND workspace_id = new_workspace_id;

  IF member_count = 0 THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED';
  END IF;

  UPDATE public.profiles SET workspace_id = new_workspace_id WHERE id = auth.uid()
  RETURNING * INTO updated_profile;

  RETURN updated_profile;
END;
$$;

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

-- Ensure every existing profile gets a workspace limit entry and workspace membership for current workspace.
INSERT INTO public.workspace_limits (profile_id, max_workspaces)
SELECT id, 1 FROM public.profiles
ON CONFLICT (profile_id) DO NOTHING;

INSERT INTO public.profile_workspaces (profile_id, workspace_id, is_owner)
SELECT id, workspace_id, true FROM public.profiles WHERE workspace_id IS NOT NULL
ON CONFLICT (profile_id, workspace_id) DO NOTHING;

-- Admin settings enhancements
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS support_whatsapp text,
  ADD COLUMN IF NOT EXISTS support_email text;

UPDATE public.platform_settings
SET support_whatsapp = coalesce(support_whatsapp, '+212XXXXXXXXX'),
    support_email = coalesce(support_email, smtp_sender_email)
WHERE settings_key = 'default';
