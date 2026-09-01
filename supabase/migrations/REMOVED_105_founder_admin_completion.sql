-- Founder Admin completion layer. This migration intentionally adds V2 RPCs
-- instead of changing the signatures of the already deployed founder RPCs.
-- It is safe to apply after 104_founder_admin_pro.sql.

ALTER TABLE public.founder_support_sessions
  ADD COLUMN IF NOT EXISTS target_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.founder_account_controls (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'suspended', 'closed')),
  reason text,
  user_message text,
  effective_until timestamptz,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.founder_user_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS founder_user_notes_profile_idx ON public.founder_user_notes(profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.founder_notification_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source text NOT NULL,
  source_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id, source, source_id)
);

CREATE TABLE IF NOT EXISTS public.founder_announcement_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.founder_announcements(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(announcement_id, profile_id)
);
CREATE INDEX IF NOT EXISTS founder_announcement_receipts_announcement_idx ON public.founder_announcement_receipts(announcement_id);

ALTER TABLE public.founder_announcements
  ADD COLUMN IF NOT EXISTS audience_roles text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS dismissible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sticky boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.founder_announcements';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END;
$$;

ALTER TABLE public.founder_account_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.founder_user_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.founder_notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.founder_announcement_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS founder_account_controls_founder_only ON public.founder_account_controls;
DROP POLICY IF EXISTS founder_user_notes_founder_only ON public.founder_user_notes;
DROP POLICY IF EXISTS founder_notification_reads_founder_only ON public.founder_notification_reads;
DROP POLICY IF EXISTS founder_announcement_receipts_founder_only ON public.founder_announcement_receipts;
CREATE POLICY founder_account_controls_founder_only ON public.founder_account_controls FOR ALL USING (public.is_founder()) WITH CHECK (public.is_founder());
CREATE POLICY founder_user_notes_founder_only ON public.founder_user_notes FOR ALL USING (public.is_founder()) WITH CHECK (public.is_founder());
CREATE POLICY founder_notification_reads_founder_only ON public.founder_notification_reads FOR ALL USING (public.is_founder()) WITH CHECK (public.is_founder());
CREATE POLICY founder_announcement_receipts_founder_only ON public.founder_announcement_receipts FOR ALL USING (public.is_founder()) WITH CHECK (public.is_founder());

-- A suspended or closed tenant must no longer receive a workspace through the
-- normal tenant RLS helper. Founder policies remain separately guarded by
-- is_founder(), so this does not weaken founder access.
CREATE OR REPLACE FUNCTION public.get_my_workspace_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT workspace_id
  FROM public.profiles
  WHERE id = auth.uid()
    AND coalesce(is_active, true)
    AND deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.founder_list_users_v2(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_query text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_plan text DEFAULT NULL,
  p_has_workspace boolean DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;

  WITH filtered AS (
    SELECT p.id, p.full_name, coalesce(au.email, p.email) AS email, p.role,
      p.workspace_id, p.is_active, p.created_at, p.deleted_at,
      coalesce(to_jsonb(p)->>'last_active', to_jsonb(p)->>'last_login_at') AS last_active,
      coalesce(ac.state, CASE WHEN p.deleted_at IS NOT NULL THEN 'closed' WHEN coalesce(p.is_active, true) THEN 'active' ELSE 'suspended' END) AS account_state,
      ac.reason AS control_reason, ac.effective_until
    FROM public.profiles p
    LEFT JOIN auth.users au ON au.id = p.id
    LEFT JOIN public.founder_account_controls ac ON ac.profile_id = p.id
    WHERE (p_query IS NULL OR trim(p_query) = '' OR coalesce(p.full_name, '') ILIKE '%' || trim(p_query) || '%' OR coalesce(au.email, p.email, '') ILIKE '%' || trim(p_query) || '%')
      AND (p_role IS NULL OR p.role = p_role)
      AND (p_status IS NULL OR coalesce(ac.state, CASE WHEN p.deleted_at IS NOT NULL THEN 'closed' WHEN coalesce(p.is_active, true) THEN 'active' ELSE 'suspended' END) = p_status)
      AND (p_has_workspace IS NULL OR (p.workspace_id IS NOT NULL) = p_has_workspace)
      AND (p_plan IS NULL OR EXISTS (SELECT 1 FROM public.profile_workspaces pw JOIN public.workspaces w ON w.id = pw.workspace_id WHERE pw.profile_id = p.id AND coalesce(w.plan, 'free') = p_plan))
  ), paged AS (
    SELECT * FROM filtered ORDER BY created_at DESC
    LIMIT least(greatest(coalesce(p_limit, 50), 1), 100)
    OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'rows', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', item.id,
      'full_name', item.full_name,
      'email', item.email,
      'role', item.role,
      'workspace_id', item.workspace_id,
      'is_active', item.is_active,
      'status', item.account_state,
      'reason', item.control_reason,
      'effective_until', item.effective_until,
      'created_at', item.created_at,
      'last_active', item.last_active,
      'memberships', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'workspace_id', pw.workspace_id,
        'workspace_name', w.name,
        'workspace_status', coalesce(w.status, 'active'),
        'plan', coalesce(w.plan, 'free'),
        'is_owner', pw.is_owner,
        'member_role', CASE WHEN pw.is_owner THEN 'owner' ELSE item.role END,
        'orders', (SELECT count(*) FROM public.orders o WHERE o.workspace_id = pw.workspace_id),
        'revenue', (SELECT coalesce(sum(CASE WHEN (to_jsonb(o)->>'total') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (to_jsonb(o)->>'total')::numeric ELSE 0 END), 0) FROM public.orders o WHERE o.workspace_id = pw.workspace_id))
        ORDER BY pw.created_at DESC)
        FROM public.profile_workspaces pw
        JOIN public.workspaces w ON w.id = pw.workspace_id
        WHERE pw.profile_id = item.id
      ), '[]'::jsonb)
    ) ORDER BY item.created_at DESC) FROM paged item), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_get_user_360_v2(p_profile_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  SELECT jsonb_build_object(
    'user', jsonb_build_object(
      'id', p.id, 'full_name', p.full_name, 'email', coalesce(au.email, p.email),
      'role', p.role, 'created_at', p.created_at, 'workspace_id', p.workspace_id,
      'status', coalesce(ac.state, CASE WHEN p.deleted_at IS NOT NULL THEN 'closed' WHEN coalesce(p.is_active, true) THEN 'active' ELSE 'suspended' END),
      'reason', ac.reason, 'user_message', ac.user_message, 'effective_until', ac.effective_until,
      'last_active', coalesce(to_jsonb(p)->>'last_active', to_jsonb(p)->>'last_login_at')
    ),
    'memberships', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'workspace_id', pw.workspace_id, 'workspace_name', w.name, 'workspace_status', coalesce(w.status, 'active'),
      'plan', coalesce(w.plan, 'free'), 'is_owner', pw.is_owner, 'created_at', pw.created_at,
      'orders', (SELECT count(*) FROM public.orders o WHERE o.workspace_id = pw.workspace_id),
      'revenue', (SELECT coalesce(sum(CASE WHEN (to_jsonb(o)->>'total') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (to_jsonb(o)->>'total')::numeric ELSE 0 END), 0) FROM public.orders o WHERE o.workspace_id = pw.workspace_id),
      'stage', CASE WHEN (SELECT count(*) FROM public.orders o WHERE o.workspace_id = pw.workspace_id) = 0 THEN 'setup' WHEN (SELECT count(*) FROM public.orders o WHERE o.workspace_id = pw.workspace_id) < 50 THEN 'early operations' ELSE 'operating' END
    ) ORDER BY pw.created_at DESC) FROM public.profile_workspaces pw JOIN public.workspaces w ON w.id = pw.workspace_id WHERE pw.profile_id = p.id), '[]'::jsonb),
    'activity', coalesce((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'action', e.action, 'reason', e.reason, 'created_at', e.created_at) ORDER BY e.created_at DESC) FROM (SELECT id, action, reason, created_at FROM public.founder_audit_events WHERE target_id = p.id ORDER BY created_at DESC LIMIT 20) e), '[]'::jsonb),
    'notes', coalesce((SELECT jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'created_at', n.created_at) ORDER BY n.created_at DESC) FROM public.founder_user_notes n WHERE n.profile_id = p.id), '[]'::jsonb),
    'tickets', coalesce((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'subject', t.subject, 'status', t.status, 'priority', t.priority, 'created_at', t.created_at) ORDER BY t.updated_at DESC) FROM public.support_tickets t WHERE t.created_by = p.id), '[]'::jsonb)
  ) INTO result
  FROM public.profiles p
  LEFT JOIN auth.users au ON au.id = p.id
  LEFT JOIN public.founder_account_controls ac ON ac.profile_id = p.id
  WHERE p.id = p_profile_id;
  IF result IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_add_user_note_v2(p_profile_id uuid, p_body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  IF char_length(trim(coalesce(p_body, ''))) = 0 THEN RAISE EXCEPTION 'NOTE_REQUIRED'; END IF;
  INSERT INTO public.founder_user_notes(profile_id, author_id, body) VALUES (p_profile_id, auth.uid(), trim(p_body));
  PERFORM public.founder_audit('user_note_added', 'profile', p_profile_id, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_set_user_state_v2(
  p_profile_id uuid, p_state text, p_reason text, p_user_message text DEFAULT NULL, p_effective_until timestamptz DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  IF p_state NOT IN ('active', 'suspended', 'closed') THEN RAISE EXCEPTION 'INVALID_ACCOUNT_STATE'; END IF;
  IF char_length(trim(coalesce(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'AUDIT_REASON_REQUIRED'; END IF;
  IF p_profile_id = auth.uid() OR EXISTS (SELECT 1 FROM auth.users WHERE id = p_profile_id AND lower(coalesce(email, '')) = 'amineelaaouamecom@gmail.com') THEN RAISE EXCEPTION 'FOUNDER_ACCOUNT_CANNOT_BE_CHANGED_HERE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id) THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  UPDATE public.profiles SET is_active = p_state = 'active', deleted_at = CASE WHEN p_state = 'closed' THEN now() ELSE NULL END WHERE id = p_profile_id;
  INSERT INTO public.founder_account_controls(profile_id, state, reason, user_message, effective_until, changed_by, changed_at)
  VALUES (p_profile_id, p_state, trim(p_reason), nullif(trim(coalesce(p_user_message, '')), ''), p_effective_until, auth.uid(), now())
  ON CONFLICT (profile_id) DO UPDATE SET state = EXCLUDED.state, reason = EXCLUDED.reason, user_message = EXCLUDED.user_message, effective_until = EXCLUDED.effective_until, changed_by = EXCLUDED.changed_by, changed_at = EXCLUDED.changed_at;
  PERFORM public.founder_audit('user_' || p_state, 'profile', p_profile_id, trim(p_reason), jsonb_build_object('effective_until', p_effective_until));
END;
$$;

-- A disabled user may read only their own safe, customer-facing account
-- notice. Audit reasons and founder metadata never leave the founder console.
CREATE OR REPLACE FUNCTION public.get_my_account_notice()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT jsonb_build_object(
    'state', coalesce(ac.state, CASE WHEN p.deleted_at IS NOT NULL THEN 'closed' WHEN coalesce(p.is_active, true) THEN 'active' ELSE 'suspended' END),
    'message', coalesce(ac.user_message, 'Your account is currently unavailable. Please contact support if you need help.'),
    'effective_until', ac.effective_until
  )
  FROM public.profiles p
  LEFT JOIN public.founder_account_controls ac ON ac.profile_id = p.id
  WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.founder_start_support_mode_v2(p_workspace_id uuid, p_profile_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE session_row public.founder_support_sessions;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  IF char_length(trim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'SUPPORT_REASON_REQUIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profile_workspaces WHERE profile_id = p_profile_id AND workspace_id = p_workspace_id) THEN RAISE EXCEPTION 'PROFILE_IS_NOT_A_WORKSPACE_MEMBER'; END IF;
  UPDATE public.founder_support_sessions SET ended_at = now() WHERE founder_id = auth.uid() AND ended_at IS NULL AND expires_at > now();
  INSERT INTO public.founder_support_sessions(founder_id, workspace_id, target_profile_id, reason) VALUES(auth.uid(), p_workspace_id, p_profile_id, trim(p_reason)) RETURNING * INTO session_row;
  PERFORM public.founder_audit('support_mode_started', 'workspace', p_workspace_id, trim(p_reason), jsonb_build_object('session_id', session_row.id, 'profile_id', p_profile_id));
  RETURN jsonb_build_object('id', session_row.id, 'workspace_id', session_row.workspace_id, 'profile_id', p_profile_id, 'reason', session_row.reason, 'expires_at', session_row.expires_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_open_support_dashboard(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE payload jsonb;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  SELECT jsonb_build_object(
    'workspace', jsonb_build_object('id', w.id, 'name', w.name, 'status', coalesce(w.status, 'active'), 'created_at', w.created_at, 'status_language', coalesce(to_jsonb(w)->>'status_language', 'en')),
    'profile', jsonb_build_object('id', p.id, 'workspace_id', p.workspace_id, 'full_name', p.full_name, 'email', coalesce(au.email, p.email), 'role', p.role, 'created_at', p.created_at, 'is_active', coalesce(p.is_active, true), 'allowed_sections', coalesce(to_jsonb(p.allowed_sections), '[]'::jsonb), 'avatar_url', p.avatar_url)
  ) INTO payload
  FROM public.founder_support_sessions s
  JOIN public.workspaces w ON w.id = s.workspace_id
  JOIN public.profiles p ON p.id = coalesce(s.target_profile_id, (SELECT candidate.id FROM public.profiles candidate WHERE candidate.workspace_id = w.id AND candidate.deleted_at IS NULL ORDER BY (candidate.role = 'owner') DESC, candidate.created_at ASC LIMIT 1))
  LEFT JOIN auth.users au ON au.id = p.id
  WHERE s.id = p_session_id AND s.founder_id = auth.uid() AND s.ended_at IS NULL AND s.expires_at > now();
  IF payload IS NULL THEN RAISE EXCEPTION 'SUPPORT_SESSION_NOT_ACTIVE'; END IF;
  RETURN payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_list_orders_v2(
  p_limit integer DEFAULT 25, p_offset integer DEFAULT 0, p_query text DEFAULT NULL,
  p_status text DEFAULT NULL, p_workspace_id uuid DEFAULT NULL, p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL, p_sort text DEFAULT 'newest'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  WITH base AS (
    SELECT o.id, o.workspace_id, o.created_at, to_jsonb(o) AS data, w.name AS workspace_name
    FROM public.orders o LEFT JOIN public.workspaces w ON w.id = o.workspace_id
    WHERE (p_query IS NULL OR trim(p_query) = '' OR coalesce(to_jsonb(o)->>'order_number', to_jsonb(o)->>'Order ID', '') ILIKE '%' || trim(p_query) || '%' OR coalesce(to_jsonb(o)->>'phone', to_jsonb(o)->>'customer_phone', '') ILIKE '%' || trim(p_query) || '%' OR coalesce(w.name, '') ILIKE '%' || trim(p_query) || '%')
      AND (p_status IS NULL OR lower(coalesce(to_jsonb(o)->>'status', '')) = lower(p_status))
      AND (p_workspace_id IS NULL OR o.workspace_id = p_workspace_id)
      AND (p_from IS NULL OR o.created_at >= p_from)
      AND (p_to IS NULL OR o.created_at <= p_to)
  ), paged AS (
    SELECT * FROM base
    ORDER BY
      CASE WHEN p_sort = 'oldest' THEN created_at END ASC,
      CASE WHEN p_sort = 'total_low' THEN CASE WHEN (data->>'total') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (data->>'total')::numeric ELSE 0 END END ASC,
      CASE WHEN p_sort = 'total_high' THEN CASE WHEN (data->>'total') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (data->>'total')::numeric ELSE 0 END END DESC,
      CASE WHEN p_sort NOT IN ('oldest', 'total_low', 'total_high') THEN created_at END DESC,
      id DESC
    LIMIT least(greatest(coalesce(p_limit, 25), 1), 100)
    OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM base),
    'rows', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', item.id, 'order_number', coalesce(item.data->>'order_number', item.data->>'Order ID', item.id::text),
      'status', coalesce(item.data->>'status', 'unknown'), 'total', CASE WHEN (item.data->>'total') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (item.data->>'total')::numeric ELSE 0 END,
      'phone', coalesce(item.data->>'phone', item.data->>'customer_phone'), 'customer_name', coalesce(item.data->>'customer_name', item.data->>'name'),
      'city', item.data->>'city', 'payment_method', item.data->>'payment_method', 'created_at', item.created_at,
      'workspace_id', item.workspace_id, 'workspace_name', item.workspace_name
    ) ORDER BY item.created_at DESC) FROM paged item), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_get_order_detail_v2(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  SELECT jsonb_build_object('order', to_jsonb(o), 'workspace', jsonb_build_object('id', w.id, 'name', w.name), 'items', coalesce((SELECT jsonb_agg(to_jsonb(oi)) FROM public.order_items oi WHERE oi.order_id = o.id), '[]'::jsonb))
  INTO result FROM public.orders o LEFT JOIN public.workspaces w ON w.id = o.workspace_id WHERE o.id = p_order_id;
  IF result IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_list_audit_events_v2(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  SELECT jsonb_build_object('total', (SELECT count(*) FROM public.founder_audit_events), 'rows', coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC) FROM (SELECT id, action, target_type, target_id, reason, metadata, created_at FROM public.founder_audit_events ORDER BY created_at DESC LIMIT least(greatest(coalesce(p_limit, 50), 1), 100) OFFSET greatest(coalesce(p_offset, 0), 0)) e), '[]'::jsonb)) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_list_notifications_v2(p_limit integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  WITH notices AS (
    SELECT 'support_ticket'::text AS source, t.id AS source_id, 'Support ticket: ' || t.subject AS title, t.message AS detail, t.updated_at AS created_at, t.status AS severity FROM public.support_tickets t WHERE t.status IN ('open', 'in_progress', 'waiting_on_customer')
    UNION ALL
    SELECT 'provider_failure'::text, l.id, 'Tools provider request failed', coalesce(l.error_message, l.action || 'Tools API'), l.created_at, 'warning' FROM public.tool_api_usage_logs l WHERE l.success = false AND l.created_at > now() - interval '7 days'
    UNION ALL
    SELECT 'audit'::text, e.id, replace(e.action, '_', ' '), coalesce(e.reason, e.target_type, 'Founder action'), e.created_at, 'info' FROM public.founder_audit_events e WHERE e.created_at > now() - interval '7 days'
  )
  SELECT jsonb_build_object('rows', coalesce((SELECT jsonb_agg(jsonb_build_object('source', n.source, 'source_id', n.source_id, 'title', n.title, 'detail', n.detail, 'created_at', n.created_at, 'severity', n.severity, 'read', r.id IS NOT NULL) ORDER BY n.created_at DESC) FROM (SELECT * FROM notices ORDER BY created_at DESC LIMIT least(greatest(coalesce(p_limit, 30), 1), 100)) n LEFT JOIN public.founder_notification_reads r ON r.profile_id = auth.uid() AND r.source = n.source AND r.source_id = n.source_id), '[]'::jsonb), 'unread', (SELECT count(*) FROM notices n WHERE NOT EXISTS (SELECT 1 FROM public.founder_notification_reads r WHERE r.profile_id = auth.uid() AND r.source = n.source AND r.source_id = n.source_id))) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_mark_notification_read_v2(p_source text, p_source_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  INSERT INTO public.founder_notification_reads(profile_id, source, source_id) VALUES (auth.uid(), trim(p_source), p_source_id) ON CONFLICT (profile_id, source, source_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_global_search_v2(p_query text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  IF char_length(trim(coalesce(p_query, ''))) < 2 THEN RETURN '[]'::jsonb; END IF;
  WITH results AS (
    SELECT 'user'::text AS kind, p.id, coalesce(p.full_name, au.email, 'Unnamed user') AS title, coalesce(au.email, p.email, p.role) AS detail, '/admin/users?user=' || p.id AS href, p.created_at FROM public.profiles p LEFT JOIN auth.users au ON au.id = p.id WHERE coalesce(p.full_name, '') ILIKE '%' || trim(p_query) || '%' OR coalesce(au.email, p.email, '') ILIKE '%' || trim(p_query) || '%'
    UNION ALL
    SELECT 'workspace', w.id, w.name, coalesce(w.plan, 'free') || ' · ' || coalesce(w.status, 'active'), '/admin/users?workspace=' || w.id, w.created_at FROM public.workspaces w WHERE w.name ILIKE '%' || trim(p_query) || '%'
    UNION ALL
    SELECT 'order', o.id, coalesce(to_jsonb(o)->>'order_number', to_jsonb(o)->>'Order ID', o.id::text), coalesce(w.name, 'Deleted workspace'), '/admin/orders?order=' || o.id, o.created_at FROM public.orders o LEFT JOIN public.workspaces w ON w.id = o.workspace_id WHERE coalesce(to_jsonb(o)->>'order_number', to_jsonb(o)->>'Order ID', '') ILIKE '%' || trim(p_query) || '%' OR coalesce(to_jsonb(o)->>'phone', '') ILIKE '%' || trim(p_query) || '%'
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'id', id, 'title', title, 'detail', detail, 'href', href) ORDER BY created_at DESC), '[]'::jsonb) INTO result FROM (SELECT * FROM results ORDER BY created_at DESC LIMIT 20) limited;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_list_announcements_v2(p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body, 'audience', a.audience, 'workspace_id', a.workspace_id, 'audience_roles', a.audience_roles, 'status', a.status, 'publish_at', a.publish_at, 'dismissible', a.dismissible, 'sticky', a.sticky, 'created_at', a.created_at, 'read_count', (SELECT count(*) FROM public.founder_announcement_receipts r WHERE r.announcement_id = a.id AND r.read_at IS NOT NULL), 'dismissed_count', (SELECT count(*) FROM public.founder_announcement_receipts r WHERE r.announcement_id = a.id AND r.dismissed_at IS NOT NULL)) ORDER BY a.created_at DESC), '[]'::jsonb) INTO result FROM (SELECT * FROM public.founder_announcements ORDER BY created_at DESC LIMIT least(greatest(coalesce(p_limit, 50), 1), 100)) a;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_upsert_announcement_v2(
  p_id uuid DEFAULT NULL, p_title text DEFAULT NULL, p_body text DEFAULT NULL, p_audience text DEFAULT 'all', p_workspace_id uuid DEFAULT NULL,
  p_audience_roles text[] DEFAULT '{}'::text[], p_status text DEFAULT 'draft', p_publish_at timestamptz DEFAULT NULL, p_dismissible boolean DEFAULT true, p_sticky boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE item public.founder_announcements;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  IF char_length(trim(coalesce(p_title, ''))) < 3 OR char_length(trim(coalesce(p_body, ''))) < 3 THEN RAISE EXCEPTION 'ANNOUNCEMENT_CONTENT_REQUIRED'; END IF;
  IF p_audience NOT IN ('all', 'workspace', 'roles') OR p_status NOT IN ('draft', 'scheduled', 'published', 'archived') THEN RAISE EXCEPTION 'INVALID_ANNOUNCEMENT_CONFIGURATION'; END IF;
  IF p_audience = 'workspace' AND p_workspace_id IS NULL THEN RAISE EXCEPTION 'WORKSPACE_REQUIRED'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.founder_announcements(title, body, audience, workspace_id, audience_roles, status, publish_at, dismissible, sticky, created_by) VALUES(trim(p_title), trim(p_body), p_audience, p_workspace_id, coalesce(p_audience_roles, '{}'::text[]), p_status, p_publish_at, p_dismissible, p_sticky, auth.uid()) RETURNING * INTO item;
  ELSE
    UPDATE public.founder_announcements SET title = trim(p_title), body = trim(p_body), audience = p_audience, workspace_id = p_workspace_id, audience_roles = coalesce(p_audience_roles, '{}'::text[]), status = p_status, publish_at = p_publish_at, dismissible = p_dismissible, sticky = p_sticky, updated_at = now() WHERE id = p_id RETURNING * INTO item;
    IF item.id IS NULL THEN RAISE EXCEPTION 'ANNOUNCEMENT_NOT_FOUND'; END IF;
  END IF;
  PERFORM public.founder_audit('announcement_' || p_status, 'announcement', item.id, NULL);
  RETURN jsonb_build_object('id', item.id, 'status', item.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_list_my_announcements_v2()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE result jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body, 'dismissible', a.dismissible, 'sticky', a.sticky, 'created_at', a.created_at) ORDER BY a.sticky DESC, a.publish_at DESC NULLS LAST, a.created_at DESC), '[]'::jsonb) INTO result
  FROM public.founder_announcements a JOIN public.profiles p ON p.id = auth.uid() LEFT JOIN public.founder_announcement_receipts r ON r.announcement_id = a.id AND r.profile_id = p.id
  WHERE a.status = 'published' AND (a.publish_at IS NULL OR a.publish_at <= now()) AND (a.audience = 'all' OR (a.audience = 'workspace' AND a.workspace_id = p.workspace_id) OR (a.audience = 'roles' AND p.role = ANY(a.audience_roles))) AND (r.dismissed_at IS NULL OR NOT a.dismissible);
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_mark_announcement_v2(p_announcement_id uuid, p_dismiss boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  INSERT INTO public.founder_announcement_receipts(announcement_id, profile_id, read_at, dismissed_at) VALUES(p_announcement_id, auth.uid(), now(), CASE WHEN p_dismiss THEN now() ELSE NULL END)
  ON CONFLICT (announcement_id, profile_id) DO UPDATE SET read_at = now(), dismissed_at = CASE WHEN p_dismiss THEN now() ELSE public.founder_announcement_receipts.dismissed_at END;
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_intelligence_v2(
  p_query text DEFAULT NULL, p_platform text DEFAULT NULL, p_limit integer DEFAULT 24
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  SELECT jsonb_build_object(
    'campaigns', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'platform', c.platform, 'workspace_id', c.workspace_id, 'created_at', c.created_at) ORDER BY c.created_at DESC) FROM (SELECT * FROM public.campaigns WHERE (p_query IS NULL OR trim(p_query) = '' OR coalesce(name, '') ILIKE '%' || trim(p_query) || '%') AND (p_platform IS NULL OR platform = p_platform) ORDER BY created_at DESC LIMIT least(greatest(coalesce(p_limit, 24), 1), 100)) c), '[]'::jsonb),
    'products', coalesce((SELECT jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.name, 'status', pr.status, 'price', pr.price, 'stock', pr.stock, 'workspace_id', pr.workspace_id, 'created_at', pr.created_at) ORDER BY pr.created_at DESC) FROM (SELECT * FROM public.products WHERE p_query IS NULL OR trim(p_query) = '' OR coalesce(name, '') ILIKE '%' || trim(p_query) || '%' ORDER BY created_at DESC LIMIT least(greatest(coalesce(p_limit, 24), 1), 100)) pr), '[]'::jsonb),
    'capabilities', jsonb_build_object('spend_metrics', false, 'seller_attribution', false, 'note', 'Spend, ROAS, CPA and seller rankings remain unavailable until a verified source table supplies those fields.')
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_platform_overview_v2()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE plans jsonb := '[]'::jsonb; invoices jsonb := '[]'::jsonb; settings jsonb := '[]'::jsonb; events jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  IF to_regclass('public.subscription_plans') IS NOT NULL THEN EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) FROM (SELECT * FROM public.subscription_plans LIMIT 100) x' INTO plans; END IF;
  IF to_regclass('public.workspace_invoices') IS NOT NULL THEN EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) FROM (SELECT * FROM public.workspace_invoices LIMIT 100) x' INTO invoices; END IF;
  IF to_regclass('public.platform_settings') IS NOT NULL THEN EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) FROM (SELECT * FROM public.platform_settings LIMIT 100) x' INTO settings; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'action', e.action, 'target_type', e.target_type, 'target_id', e.target_id, 'reason', e.reason, 'created_at', e.created_at) ORDER BY e.created_at DESC), '[]'::jsonb) INTO events FROM (SELECT * FROM public.founder_audit_events ORDER BY created_at DESC LIMIT 100) e;
  RETURN jsonb_build_object('plans', plans, 'invoices', invoices, 'settings', settings, 'events', events);
END;
$$;

GRANT EXECUTE ON FUNCTION public.founder_list_users_v2(integer, integer, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_get_user_360_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_add_user_note_v2(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_set_user_state_v2(uuid, text, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_account_notice() TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_start_support_mode_v2(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_open_support_dashboard(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_list_orders_v2(integer, integer, text, text, uuid, timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_get_order_detail_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_list_audit_events_v2(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_list_notifications_v2(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_mark_notification_read_v2(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_global_search_v2(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_list_announcements_v2(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_upsert_announcement_v2(uuid, text, text, text, uuid, text[], text, timestamptz, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_list_my_announcements_v2() TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_mark_announcement_v2(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_intelligence_v2(text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_platform_overview_v2() TO authenticated;
