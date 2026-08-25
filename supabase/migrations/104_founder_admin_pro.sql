-- Founder-only Admin Pro foundation.
-- This migration is additive and replaces the old broad super_admin/supervisor
-- platform access with an exact founder identity check.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('founder', 'super_admin', 'supervisor', 'manager', 'employee', 'user', 'owner', 'admin', 'viewer', 'agent'));

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS allowed_sections jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

UPDATE public.profiles p
SET email = u.email,
    role = 'founder'
FROM auth.users u
WHERE p.id = u.id
  AND lower(u.email) = 'amineelaaouamecom@gmail.com';

CREATE OR REPLACE FUNCTION public.is_founder()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'founder'
      AND lower(coalesce(auth.jwt() ->> 'email', '')) = 'amineelaaouamecom@gmail.com'
  );
$$;

-- Legacy policies call these helpers. Keeping the names but mapping them to the
-- founder check removes the old cross-workspace supervisor backdoor.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$ SELECT public.is_founder(); $$;

CREATE OR REPLACE FUNCTION public.is_supervisor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$ SELECT public.is_founder(); $$;

CREATE OR REPLACE FUNCTION public.is_supervisor_or_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$ SELECT public.is_founder(); $$;

-- A member may only update their cosmetic identity fields. In particular they
-- cannot promote their own role, alter workspace scope, reactivate an account,
-- or grant themselves sections.
CREATE OR REPLACE FUNCTION public.is_safe_self_profile_update(
  proposed_role text,
  proposed_workspace_id uuid,
  proposed_email text,
  proposed_active boolean,
  proposed_sections text[],
  proposed_last_login timestamptz,
  proposed_deleted_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IS NOT DISTINCT FROM proposed_role
      AND p.workspace_id IS NOT DISTINCT FROM proposed_workspace_id
      AND p.email IS NOT DISTINCT FROM proposed_email
      AND p.is_active IS NOT DISTINCT FROM proposed_active
      AND p.allowed_sections IS NOT DISTINCT FROM proposed_sections
      AND p.last_login_at IS NOT DISTINCT FROM proposed_last_login
      AND p.deleted_at IS NOT DISTINCT FROM proposed_deleted_at
  );
$$;

DO $$
DECLARE policy_name text;
BEGIN
  FOR policy_name IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', policy_name);
  END LOOP;
END $$;

CREATE POLICY profiles_select_scoped
  ON public.profiles FOR SELECT
  USING (public.is_founder() OR id = auth.uid() OR workspace_id = public.get_my_workspace_id());

CREATE POLICY profiles_update_scoped
  ON public.profiles FOR UPDATE
  USING (public.is_founder() OR id = auth.uid())
  WITH CHECK (
    public.is_founder()
    OR (id = auth.uid() AND public.is_safe_self_profile_update(
      role, workspace_id, email, is_active, allowed_sections, last_login_at, deleted_at
    ))
  );

-- Invitation acceptance used to update role and workspace_id from the browser.
-- Keep that workflow, but make the privileged transition server-side.
DROP FUNCTION IF EXISTS public.accept_workspace_invitation(uuid);

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

  IF NOT FOUND THEN RAISE EXCEPTION 'INVITATION_NOT_FOUND_OR_NOT_ALLOWED'; END IF;

  UPDATE public.profiles
  SET workspace_id = invitation_row.workspace_id,
      allowed_sections = ARRAY(
        SELECT jsonb_array_elements_text(to_jsonb(invitation_row.allowed_sections))
      ),
      role = CASE
        WHEN invitation_row.role IN ('owner', 'supervisor', 'agent') THEN invitation_row.role
        ELSE 'agent'
      END,
      is_active = true
  WHERE id = auth.uid();

  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

  UPDATE public.workspace_invitations
  SET status = 'accepted', accepted_at = now(), user_id = auth.uid()
  WHERE id = invitation_row.id;
END;
$$;

-- Founder receives explicit read/write policies on the tenant entities. These
-- policies do not grant the same access to any ordinary supervisor or admin.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'workspaces', 'orders', 'order_items', 'customers', 'products', 'campaigns',
    'ad_spend', 'meta_campaigns', 'shipments', 'expenses', 'workspace_invitations'
  ] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS founder_full_access ON public.%I', table_name);
      EXECUTE format('CREATE POLICY founder_full_access ON public.%I FOR ALL USING (public.is_founder()) WITH CHECK (public.is_founder())', table_name);
    END IF;
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.founder_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS founder_audit_events_created_at_idx ON public.founder_audit_events (created_at DESC);

CREATE TABLE IF NOT EXISTS public.founder_support_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  founder_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (char_length(trim(reason)) BETWEEN 8 AND 500),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS founder_support_sessions_lookup_idx ON public.founder_support_sessions (founder_id, workspace_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (char_length(trim(subject)) BETWEEN 3 AND 180),
  message text NOT NULL CHECK (char_length(trim(message)) BETWEEN 3 AND 5000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON public.support_tickets (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_workspace_idx ON public.support_tickets (workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 5000),
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.founder_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 3 AND 160),
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 3 AND 5000),
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'workspace')),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'archived')),
  publish_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS founder_announcements_status_idx ON public.founder_announcements (status, publish_at DESC);

ALTER TABLE public.founder_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.founder_support_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.founder_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY founder_audit_events_founder_only ON public.founder_audit_events FOR ALL USING (public.is_founder()) WITH CHECK (public.is_founder());
CREATE POLICY founder_support_sessions_founder_only ON public.founder_support_sessions FOR ALL USING (public.is_founder()) WITH CHECK (public.is_founder());
CREATE POLICY support_tickets_founder_access ON public.support_tickets FOR ALL USING (public.is_founder()) WITH CHECK (public.is_founder());
CREATE POLICY support_tickets_customer_read ON public.support_tickets FOR SELECT USING (created_by = auth.uid());
CREATE POLICY support_tickets_customer_create ON public.support_tickets FOR INSERT WITH CHECK (
  created_by = auth.uid()
  AND (workspace_id IS NULL OR workspace_id = public.get_my_workspace_id())
);
CREATE POLICY support_ticket_messages_founder_access ON public.support_ticket_messages FOR ALL USING (public.is_founder()) WITH CHECK (public.is_founder());
CREATE POLICY support_ticket_messages_customer_read ON public.support_ticket_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.created_by = auth.uid())
  AND is_internal = false
);
CREATE POLICY founder_announcements_founder_only ON public.founder_announcements FOR ALL USING (public.is_founder()) WITH CHECK (public.is_founder());
CREATE POLICY founder_announcements_audience_read ON public.founder_announcements FOR SELECT USING (
  status = 'published' AND (audience = 'all' OR workspace_id = public.get_my_workspace_id())
);

CREATE OR REPLACE FUNCTION public.founder_audit(
  p_action text, p_target_type text DEFAULT NULL, p_target_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL, p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  INSERT INTO public.founder_audit_events (actor_id, action, target_type, target_id, reason, metadata)
  VALUES (auth.uid(), p_action, p_target_type, p_target_id, p_reason, coalesce(p_metadata, '{}'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_admin_snapshot()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE payload jsonb;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  SELECT jsonb_build_object(
    'users', (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL),
    'active_users', (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL AND coalesce(is_active, true)),
    'workspaces', (SELECT count(*) FROM public.workspaces),
    'active_workspaces', (SELECT count(*) FROM public.workspaces WHERE coalesce(status, 'active') = 'active'),
    'orders_today', (SELECT count(*) FROM public.orders WHERE created_at >= date_trunc('day', now())),
    'orders_month', (SELECT count(*) FROM public.orders WHERE created_at >= date_trunc('month', now())),
    'revenue_month', (SELECT coalesce(sum(total), 0) FROM public.orders WHERE created_at >= date_trunc('month', now())),
    'products', (SELECT count(*) FROM public.products),
    'open_tickets', (SELECT count(*) FROM public.support_tickets WHERE status IN ('open', 'in_progress', 'waiting_on_customer')),
    'enabled_tool_providers', (SELECT count(*) FROM public.tool_api_providers WHERE enabled),
    'recent_events', coalesce((SELECT jsonb_agg(row_to_json(e)) FROM (
      SELECT id, action, target_type, target_id, reason, created_at
      FROM public.founder_audit_events ORDER BY created_at DESC LIMIT 8
    ) e), '[]'::jsonb)
  ) INTO payload;
  RETURN payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_list_orders(
  p_limit integer DEFAULT 25, p_offset integer DEFAULT 0, p_query text DEFAULT NULL,
  p_status text DEFAULT NULL, p_workspace_id uuid DEFAULT NULL
)
RETURNS TABLE(id uuid, order_number text, status text, total numeric, phone text, created_at timestamptz, workspace_id uuid, workspace_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  RETURN QUERY
  SELECT o.id, o.order_number, o.status, o.total, o.phone, o.created_at, o.workspace_id, w.name
  FROM public.orders o LEFT JOIN public.workspaces w ON w.id = o.workspace_id
  WHERE (p_query IS NULL OR o.order_number ILIKE '%' || p_query || '%' OR coalesce(o.phone, '') ILIKE '%' || p_query || '%')
    AND (p_status IS NULL OR o.status = p_status)
    AND (p_workspace_id IS NULL OR o.workspace_id = p_workspace_id)
  ORDER BY o.created_at DESC
  LIMIT least(greatest(coalesce(p_limit, 25), 1), 100)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_list_users(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_query text DEFAULT NULL)
RETURNS TABLE(id uuid, full_name text, email text, role text, workspace_id uuid, workspace_name text, is_active boolean, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  RETURN QUERY
  SELECT p.id, p.full_name, p.email, p.role, p.workspace_id, w.name, coalesce(p.is_active, true), p.created_at
  FROM public.profiles p LEFT JOIN public.workspaces w ON w.id = p.workspace_id
  WHERE p.deleted_at IS NULL AND (p_query IS NULL OR coalesce(p.full_name, '') ILIKE '%' || p_query || '%' OR coalesce(p.email, '') ILIKE '%' || p_query || '%')
  ORDER BY p.created_at DESC LIMIT least(greatest(coalesce(p_limit, 50), 1), 100) OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_list_workspaces(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_query text DEFAULT NULL)
RETURNS TABLE(id uuid, name text, status text, plan text, created_at timestamptz, member_count bigint, order_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  RETURN QUERY
  SELECT w.id, w.name, coalesce(w.status, 'active'), w.plan, w.created_at,
    (SELECT count(*) FROM public.profiles p WHERE p.workspace_id = w.id AND p.deleted_at IS NULL),
    (SELECT count(*) FROM public.orders o WHERE o.workspace_id = w.id)
  FROM public.workspaces w
  WHERE p_query IS NULL OR w.name ILIKE '%' || p_query || '%'
  ORDER BY w.created_at DESC LIMIT least(greatest(coalesce(p_limit, 50), 1), 100) OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_set_profile_active(p_profile_id uuid, p_is_active boolean, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  IF p_profile_id = auth.uid() THEN RAISE EXCEPTION 'FOUNDER_ACCOUNT_CANNOT_BE_CHANGED_HERE'; END IF;
  UPDATE public.profiles SET is_active = p_is_active WHERE id = p_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  PERFORM public.founder_audit(CASE WHEN p_is_active THEN 'user_activated' ELSE 'user_suspended' END, 'profile', p_profile_id, p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_set_workspace_status(p_workspace_id uuid, p_status text, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  IF p_status NOT IN ('active', 'suspended') THEN RAISE EXCEPTION 'INVALID_WORKSPACE_STATUS'; END IF;
  UPDATE public.workspaces SET status = p_status WHERE id = p_workspace_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND'; END IF;
  PERFORM public.founder_audit('workspace_' || p_status, 'workspace', p_workspace_id, p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_start_support_mode(p_workspace_id uuid, p_reason text)
RETURNS public.founder_support_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE session_row public.founder_support_sessions;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  IF char_length(trim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'SUPPORT_REASON_REQUIRED'; END IF;
  UPDATE public.founder_support_sessions
    SET ended_at = now()
    WHERE founder_id = auth.uid() AND ended_at IS NULL AND expires_at > now();
  INSERT INTO public.founder_support_sessions (founder_id, workspace_id, reason)
    VALUES (auth.uid(), p_workspace_id, trim(p_reason)) RETURNING * INTO session_row;
  PERFORM public.founder_audit('support_mode_started', 'workspace', p_workspace_id, trim(p_reason), jsonb_build_object('session_id', session_row.id));
  RETURN session_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_end_support_mode(p_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE target_workspace uuid;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  UPDATE public.founder_support_sessions SET ended_at = now()
    WHERE id = p_session_id AND founder_id = auth.uid() AND ended_at IS NULL
    RETURNING workspace_id INTO target_workspace;
  IF NOT FOUND THEN RAISE EXCEPTION 'SUPPORT_SESSION_NOT_FOUND'; END IF;
  PERFORM public.founder_audit('support_mode_ended', 'workspace', target_workspace, NULL, jsonb_build_object('session_id', p_session_id));
END;
$$;

-- Open a real tenant dashboard only through an active, unexpired Support Mode
-- session. The returned workspace projection deliberately excludes every API
-- token and credential column.
CREATE OR REPLACE FUNCTION public.founder_open_support_dashboard(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE payload jsonb;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;

  SELECT jsonb_build_object(
    'workspace', jsonb_build_object(
      'id', w.id,
      'name', w.name,
      'status', coalesce(w.status, 'active'),
      'created_at', w.created_at,
      'status_language', coalesce(to_jsonb(w) ->> 'status_language', 'en')
    ),
    'profile', jsonb_build_object(
      'id', p.id,
      'workspace_id', p.workspace_id,
      'full_name', p.full_name,
      'email', p.email,
      'role', p.role,
      'created_at', p.created_at,
      'is_active', coalesce(p.is_active, true),
      'allowed_sections', coalesce(to_jsonb(p.allowed_sections), '[]'::jsonb),
      'avatar_url', p.avatar_url
    )
  ) INTO payload
  FROM public.founder_support_sessions s
  JOIN public.workspaces w ON w.id = s.workspace_id
  LEFT JOIN LATERAL (
    SELECT * FROM public.profiles candidate
    WHERE candidate.workspace_id = w.id AND candidate.deleted_at IS NULL
    ORDER BY (candidate.role = 'owner') DESC, candidate.created_at ASC
    LIMIT 1
  ) p ON true
  WHERE s.id = p_session_id
    AND s.founder_id = auth.uid()
    AND s.ended_at IS NULL
    AND s.expires_at > now();

  IF payload IS NULL THEN RAISE EXCEPTION 'SUPPORT_SESSION_NOT_ACTIVE'; END IF;
  RETURN payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_list_support_tickets(p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid, subject text, message text, status text, priority text, workspace_id uuid, workspace_name text, requester_email text, created_at timestamptz, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  RETURN QUERY SELECT t.id, t.subject, t.message, t.status, t.priority, t.workspace_id, w.name, p.email, t.created_at, t.updated_at
  FROM public.support_tickets t LEFT JOIN public.workspaces w ON w.id = t.workspace_id LEFT JOIN public.profiles p ON p.id = t.created_by
  ORDER BY t.updated_at DESC LIMIT least(greatest(coalesce(p_limit, 50), 1), 100);
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_update_support_ticket(p_ticket_id uuid, p_status text, p_priority text DEFAULT NULL, p_reply text DEFAULT NULL, p_internal boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  IF p_status NOT IN ('open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed') THEN RAISE EXCEPTION 'INVALID_TICKET_STATUS'; END IF;
  UPDATE public.support_tickets SET status = p_status, priority = coalesce(p_priority, priority), assigned_to = auth.uid(), updated_at = now() WHERE id = p_ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TICKET_NOT_FOUND'; END IF;
  IF char_length(trim(coalesce(p_reply, ''))) > 0 THEN
    INSERT INTO public.support_ticket_messages (ticket_id, author_id, body, is_internal) VALUES (p_ticket_id, auth.uid(), trim(p_reply), coalesce(p_internal, false));
  END IF;
  PERFORM public.founder_audit('support_ticket_updated', 'support_ticket', p_ticket_id, NULL, jsonb_build_object('status', p_status));
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_health_overview()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  RETURN jsonb_build_object(
    'database', jsonb_build_object('status', CASE WHEN pg_is_in_recovery() THEN 'warning' ELSE 'healthy' END, 'label', 'Postgres'),
    'tools', jsonb_build_object('status', CASE WHEN EXISTS (SELECT 1 FROM public.tool_api_providers WHERE enabled) THEN 'healthy' ELSE 'warning' END, 'enabled_providers', (SELECT count(*) FROM public.tool_api_providers WHERE enabled)),
    'open_tickets', (SELECT count(*) FROM public.support_tickets WHERE status IN ('open', 'in_progress', 'waiting_on_customer')),
    'recent_failures', (SELECT count(*) FROM public.tool_api_usage_logs WHERE success = false AND created_at > now() - interval '24 hours')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_platform_metrics() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_search(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.founder_admin_snapshot() TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_list_orders(integer, integer, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_list_users(integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_list_workspaces(integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_set_profile_active(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_set_workspace_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_start_support_mode(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_end_support_mode(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_open_support_dashboard(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_list_support_tickets(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_update_support_ticket(uuid, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_health_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation(uuid) TO authenticated;
