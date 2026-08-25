-- Urgent founder-console corrections. This migration is additive and uses V3
-- RPC names so it can be applied after the repaired 105 migration safely.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_active timestamptz;
ALTER TABLE public.profile_workspaces ADD COLUMN IF NOT EXISTS role text;
UPDATE public.profile_workspaces pw
SET role = CASE WHEN pw.is_owner THEN 'owner' ELSE coalesce(p.role, 'user') END
FROM public.profiles p
WHERE p.id = pw.profile_id AND pw.role IS NULL;
ALTER TABLE public.profile_workspaces DROP CONSTRAINT IF EXISTS profile_workspaces_role_check;
ALTER TABLE public.profile_workspaces ADD CONSTRAINT profile_workspaces_role_check
  CHECK (role IS NULL OR role IN ('owner', 'admin', 'manager', 'agent', 'employee', 'viewer', 'user', 'supervisor'));

ALTER TABLE public.founder_announcements ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'info';
ALTER TABLE public.founder_announcements ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;
ALTER TABLE public.founder_announcements ADD COLUMN IF NOT EXISTS target_profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.founder_announcements ADD COLUMN IF NOT EXISTS target_plan text;
ALTER TABLE public.founder_announcements ADD COLUMN IF NOT EXISTS cta_label text;
ALTER TABLE public.founder_announcements ADD COLUMN IF NOT EXISTS cta_url text;
ALTER TABLE public.founder_announcements ADD COLUMN IF NOT EXISTS start_at timestamptz;
ALTER TABLE public.founder_announcements ADD COLUMN IF NOT EXISTS end_at timestamptz;
ALTER TABLE public.founder_announcements ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
ALTER TABLE public.founder_announcements ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.founder_announcements DROP CONSTRAINT IF EXISTS founder_announcements_audience_check;
ALTER TABLE public.founder_announcements ADD CONSTRAINT founder_announcements_audience_check
  CHECK (audience IN ('all', 'workspace', 'roles', 'user', 'plan'));
CREATE INDEX IF NOT EXISTS founder_announcements_delivery_idx
  ON public.founder_announcements (is_active, status, start_at, end_at);

ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS value jsonb;
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.founder_platform_audit_v3(
  p_action text,
  p_target_type text DEFAULT NULL,
  p_target_id uuid DEFAULT NULL,
  p_target_name text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE actor_role text;
BEGIN
  SELECT role INTO actor_role FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.platform_audit_logs(actor_id, actor_email, actor_role, action, target_type, target_id, target_name, metadata)
  VALUES (auth.uid(), lower(coalesce(auth.jwt() ->> 'email', '')), actor_role, p_action, p_target_type, p_target_id, p_target_name, coalesce(p_metadata, '{}'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_last_active()
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE touched_at timestamptz := now();
BEGIN
  UPDATE public.profiles SET last_active = touched_at WHERE id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  RETURN touched_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_last_login()
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE touched_at timestamptz := now();
BEGIN
  UPDATE public.profiles SET last_login_at = touched_at, last_active = touched_at WHERE id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  RETURN touched_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_open_workspace_dashboard_v3(
  p_workspace_id uuid,
  p_profile_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE session_row public.founder_support_sessions;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profile_workspaces WHERE profile_id = p_profile_id AND workspace_id = p_workspace_id) THEN
    RAISE EXCEPTION 'PROFILE_IS_NOT_A_WORKSPACE_MEMBER';
  END IF;
  UPDATE public.founder_support_sessions
    SET ended_at = now()
    WHERE founder_id = auth.uid() AND ended_at IS NULL AND expires_at > now();
  INSERT INTO public.founder_support_sessions(founder_id, workspace_id, target_profile_id, reason)
  VALUES (auth.uid(), p_workspace_id, p_profile_id, 'Founder opened workspace dashboard')
  RETURNING * INTO session_row;
  PERFORM public.founder_audit('founder_opened_workspace_dashboard', 'workspace', p_workspace_id, 'Founder opened workspace dashboard', jsonb_build_object('session_id', session_row.id, 'profile_id', p_profile_id));
  PERFORM public.founder_platform_audit_v3('founder_opened_workspace_dashboard', 'workspace', p_workspace_id, NULL, jsonb_build_object('profile_id', p_profile_id, 'session_id', session_row.id));
  RETURN jsonb_build_object('id', session_row.id, 'workspace_id', p_workspace_id, 'profile_id', p_profile_id, 'expires_at', session_row.expires_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_update_user_role_v3(
  p_profile_id uuid,
  p_platform_role text DEFAULT NULL,
  p_workspace_id uuid DEFAULT NULL,
  p_membership_role text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE old_platform_role text;
DECLARE old_membership_role text;
DECLARE target_email text;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  SELECT coalesce(au.email, p.email), p.role INTO target_email, old_platform_role
  FROM public.profiles p LEFT JOIN auth.users au ON au.id = p.id WHERE p.id = p_profile_id;
  IF target_email IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  IF p_profile_id = auth.uid() OR lower(target_email) = 'amineelaaouamecom@gmail.com' THEN RAISE EXCEPTION 'FOUNDER_ROLE_CANNOT_BE_CHANGED'; END IF;
  IF p_platform_role IS NULL AND p_membership_role IS NULL THEN RAISE EXCEPTION 'ROLE_REQUIRED'; END IF;
  IF p_platform_role IS NOT NULL AND p_platform_role NOT IN ('owner', 'admin', 'manager', 'agent', 'employee', 'viewer', 'user', 'supervisor') THEN RAISE EXCEPTION 'INVALID_PLATFORM_ROLE'; END IF;
  IF p_membership_role IS NOT NULL AND (p_workspace_id IS NULL OR p_membership_role NOT IN ('owner', 'admin', 'manager', 'agent', 'employee', 'viewer', 'user', 'supervisor')) THEN RAISE EXCEPTION 'INVALID_MEMBERSHIP_ROLE'; END IF;
  IF p_platform_role IS NOT NULL THEN UPDATE public.profiles SET role = p_platform_role WHERE id = p_profile_id; END IF;
  IF p_membership_role IS NOT NULL THEN
    SELECT role INTO old_membership_role FROM public.profile_workspaces WHERE profile_id = p_profile_id AND workspace_id = p_workspace_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'WORKSPACE_MEMBERSHIP_NOT_FOUND'; END IF;
    UPDATE public.profile_workspaces SET role = p_membership_role, is_owner = (p_membership_role = 'owner') WHERE profile_id = p_profile_id AND workspace_id = p_workspace_id;
  END IF;
  PERFORM public.founder_platform_audit_v3('user_role_changed', 'profile', p_profile_id, target_email, jsonb_build_object('old_platform_role', old_platform_role, 'new_platform_role', p_platform_role, 'workspace_id', p_workspace_id, 'old_membership_role', old_membership_role, 'new_membership_role', p_membership_role));
  PERFORM public.founder_audit('user_role_changed', 'profile', p_profile_id, NULL, jsonb_build_object('old_platform_role', old_platform_role, 'new_platform_role', p_platform_role, 'workspace_id', p_workspace_id, 'old_membership_role', old_membership_role, 'new_membership_role', p_membership_role));
  RETURN jsonb_build_object('platform_role', coalesce(p_platform_role, old_platform_role), 'membership_role', p_membership_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_get_user_360_v3(p_profile_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  SELECT jsonb_build_object(
    'user', jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', coalesce(au.email, p.email), 'role', p.role, 'last_active', p.last_active, 'last_login_at', p.last_login_at, 'created_at', p.created_at),
    'memberships', coalesce((SELECT jsonb_agg(jsonb_build_object('workspace_id', pw.workspace_id, 'workspace_name', w.name, 'workspace_status', coalesce(w.status, 'active'), 'plan', coalesce(w.plan, 'free'), 'is_owner', pw.is_owner, 'member_role', coalesce(pw.role, CASE WHEN pw.is_owner THEN 'owner' ELSE p.role END), 'orders', (SELECT count(*) FROM public.orders o WHERE o.workspace_id = pw.workspace_id), 'revenue', (SELECT coalesce(sum(o.total), 0) FROM public.orders o WHERE o.workspace_id = pw.workspace_id)) ORDER BY pw.created_at DESC) FROM public.profile_workspaces pw JOIN public.workspaces w ON w.id = pw.workspace_id WHERE pw.profile_id = p.id), '[]'::jsonb)
  ) INTO result
  FROM public.profiles p LEFT JOIN auth.users au ON au.id = p.id WHERE p.id = p_profile_id;
  IF result IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_global_orders_v3(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25,
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_workspace_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_sort text DEFAULT 'newest'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE current_page integer := greatest(coalesce(p_page, 1), 1);
DECLARE size_value integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
DECLARE result jsonb;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  WITH filtered AS (
    SELECT o."Order ID" AS id, o.workspace_id, o.order_number, o.phone, o.city, o.total, o.status, o.created_at,
      coalesce(to_jsonb(o) ->> 'Order ID', o.order_number, o."Order ID"::text) AS external_order_id,
      coalesce(to_jsonb(o) ->> 'customer_name', to_jsonb(o) ->> 'Customer', to_jsonb(o) ->> 'customer') AS customer_name,
      coalesce(to_jsonb(o) ->> 'tracking_number', to_jsonb(o) ->> 'tracking', to_jsonb(o) ->> 'shipment_id') AS tracking_number,
      w.name AS workspace_name
    FROM public.orders o
    LEFT JOIN public.workspaces w ON w.id = o.workspace_id
    WHERE (p_search IS NULL OR trim(p_search) = '' OR coalesce(to_jsonb(o) ->> 'Order ID', o.order_number, '') ILIKE '%' || trim(p_search) || '%' OR coalesce(o.order_number, '') ILIKE '%' || trim(p_search) || '%' OR coalesce(o.phone, '') ILIKE '%' || trim(p_search) || '%' OR coalesce(to_jsonb(o) ->> 'customer_name', to_jsonb(o) ->> 'Customer', '') ILIKE '%' || trim(p_search) || '%' OR coalesce(to_jsonb(o) ->> 'tracking_number', to_jsonb(o) ->> 'tracking', to_jsonb(o) ->> 'shipment_id', '') ILIKE '%' || trim(p_search) || '%' OR coalesce(w.name, '') ILIKE '%' || trim(p_search) || '%')
      AND (p_status IS NULL OR trim(p_status) = '' OR lower(o.status) = lower(trim(p_status)))
      AND (p_workspace_id IS NULL OR o.workspace_id = p_workspace_id)
      AND (p_start_date IS NULL OR o.created_at >= p_start_date::timestamptz)
      AND (p_end_date IS NULL OR o.created_at < (p_end_date + 1)::timestamptz)
  ), paged AS (
    SELECT * FROM filtered
    ORDER BY CASE WHEN p_sort = 'oldest' THEN created_at END ASC, CASE WHEN p_sort <> 'oldest' THEN created_at END DESC, id DESC
    LIMIT size_value OFFSET (current_page - 1) * size_value
  )
  SELECT jsonb_build_object(
    'orders', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'order_number', external_order_id, 'source_order_number', order_number, 'workspace_id', workspace_id, 'workspace_name', workspace_name, 'customer_name', customer_name, 'phone', phone, 'city', city, 'tracking_number', tracking_number, 'total', total, 'status', status, 'created_at', created_at) ORDER BY created_at DESC) FROM paged), '[]'::jsonb),
    'total_count', (SELECT count(*) FROM filtered),
    'page', current_page,
    'page_size', size_value
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_list_platform_settings_v3()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'settings_key', s.setting_key, 'value', CASE WHEN lower(s.setting_key) ~ '(secret|token|password|smtp|api[_-]?key)' THEN NULL ELSE s.value END, 'is_sensitive', lower(s.setting_key) ~ '(secret|token|password|smtp|api[_-]?key)', 'description', s.description, 'category', s.category, 'updated_at', s.updated_at, 'updated_by', coalesce(au.email, 'System')) ORDER BY s.category NULLS LAST, s.setting_key), '[]'::jsonb) INTO result
  FROM public.platform_settings s LEFT JOIN auth.users au ON au.id = s.updated_by;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_update_platform_setting_v3(p_setting_id uuid, p_value jsonb, p_description text DEFAULT NULL, p_category text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE old_value jsonb;
DECLARE setting_key_value text;
DECLARE result jsonb;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  SELECT value, setting_key INTO old_value, setting_key_value FROM public.platform_settings WHERE id = p_setting_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SETTING_NOT_FOUND'; END IF;
  IF lower(setting_key_value) ~ '(secret|token|password|smtp|api[_-]?key)' THEN RAISE EXCEPTION 'PROTECTED_SECRET_SETTING'; END IF;
  UPDATE public.platform_settings SET value = p_value, description = coalesce(p_description, description), category = coalesce(nullif(trim(coalesce(p_category, '')), ''), category), updated_by = auth.uid(), updated_at = now() WHERE id = p_setting_id RETURNING jsonb_build_object('id', id, 'settings_key', setting_key, 'value', value, 'description', description, 'category', category, 'updated_at', updated_at) INTO result;
  PERFORM public.founder_platform_audit_v3('platform_setting_updated', 'platform_setting', p_setting_id, setting_key_value, jsonb_build_object('old_value', old_value, 'new_value', p_value));
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_create_platform_setting_v3(p_settings_key text, p_value jsonb, p_description text DEFAULT NULL, p_category text DEFAULT 'general')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  IF trim(coalesce(p_settings_key, '')) = '' OR lower(p_settings_key) ~ '(secret|token|password|smtp|api[_-]?key)' THEN RAISE EXCEPTION 'INVALID_SETTING_KEY'; END IF;
  INSERT INTO public.platform_settings(setting_key, value, description, category, updated_by, updated_at) VALUES(trim(p_settings_key), p_value, nullif(trim(coalesce(p_description, '')), ''), nullif(trim(coalesce(p_category, '')), ''), auth.uid(), now()) RETURNING jsonb_build_object('id', id, 'settings_key', setting_key, 'value', value) INTO result;
  PERFORM public.founder_platform_audit_v3('platform_setting_created', 'platform_setting', (result ->> 'id')::uuid, trim(p_settings_key), jsonb_build_object('value', p_value));
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_delete_platform_setting_v3(p_setting_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE setting_key_value text;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  SELECT setting_key INTO setting_key_value FROM public.platform_settings WHERE id = p_setting_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SETTING_NOT_FOUND'; END IF;
  IF lower(setting_key_value) IN ('platform_name', 'maintenance_mode', 'registration_enabled', 'default') OR lower(setting_key_value) ~ '(secret|token|password|smtp|api[_-]?key)' THEN RAISE EXCEPTION 'PROTECTED_SETTING_CANNOT_BE_DELETED'; END IF;
  DELETE FROM public.platform_settings WHERE id = p_setting_id;
  PERFORM public.founder_platform_audit_v3('platform_setting_deleted', 'platform_setting', p_setting_id, setting_key_value);
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_list_announcements_v3()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body, 'type', a.type, 'priority', a.priority, 'audience', a.audience, 'workspace_id', a.workspace_id, 'target_profile_id', a.target_profile_id, 'target_plan', a.target_plan, 'audience_roles', a.audience_roles, 'cta_label', a.cta_label, 'cta_url', a.cta_url, 'start_at', a.start_at, 'end_at', a.end_at, 'publish_at', a.publish_at, 'status', a.status, 'is_active', a.is_active, 'sticky', a.sticky, 'dismissible', a.dismissible, 'language', a.language, 'created_at', a.created_at, 'updated_at', a.updated_at, 'read_count', (SELECT count(*) FROM public.founder_announcement_receipts r WHERE r.announcement_id = a.id AND r.read_at IS NOT NULL), 'dismissed_count', (SELECT count(*) FROM public.founder_announcement_receipts r WHERE r.announcement_id = a.id AND r.dismissed_at IS NOT NULL)) ORDER BY a.created_at DESC), '[]'::jsonb) INTO result FROM public.founder_announcements a;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_save_announcement_v3(
  p_id uuid DEFAULT NULL, p_title text DEFAULT NULL, p_body text DEFAULT NULL, p_type text DEFAULT 'info', p_priority integer DEFAULT 0,
  p_audience text DEFAULT 'all', p_workspace_id uuid DEFAULT NULL, p_target_profile_id uuid DEFAULT NULL, p_target_plan text DEFAULT NULL,
  p_audience_roles text[] DEFAULT '{}'::text[], p_cta_label text DEFAULT NULL, p_cta_url text DEFAULT NULL,
  p_start_at timestamptz DEFAULT NULL, p_end_at timestamptz DEFAULT NULL, p_publish_at timestamptz DEFAULT NULL,
  p_status text DEFAULT 'published', p_is_active boolean DEFAULT true, p_sticky boolean DEFAULT false, p_dismissible boolean DEFAULT true, p_language text DEFAULT 'en'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE item public.founder_announcements;
DECLARE action_name text;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  IF char_length(trim(coalesce(p_title, ''))) < 3 OR char_length(trim(coalesce(p_body, ''))) < 3 THEN RAISE EXCEPTION 'ANNOUNCEMENT_CONTENT_REQUIRED'; END IF;
  IF p_type NOT IN ('info', 'success', 'warning', 'critical', 'security', 'maintenance', 'promotion', 'update') OR p_audience NOT IN ('all', 'workspace', 'roles', 'user', 'plan') OR p_status NOT IN ('draft', 'scheduled', 'published', 'archived') THEN RAISE EXCEPTION 'INVALID_ANNOUNCEMENT_CONFIGURATION'; END IF;
  IF p_audience = 'workspace' AND p_workspace_id IS NULL THEN RAISE EXCEPTION 'WORKSPACE_REQUIRED'; END IF;
  IF p_audience = 'user' AND p_target_profile_id IS NULL THEN RAISE EXCEPTION 'USER_REQUIRED'; END IF;
  IF p_audience = 'roles' AND coalesce(array_length(p_audience_roles, 1), 0) = 0 THEN RAISE EXCEPTION 'ROLE_REQUIRED'; END IF;
  IF p_audience = 'plan' AND nullif(trim(coalesce(p_target_plan, '')), '') IS NULL THEN RAISE EXCEPTION 'PLAN_REQUIRED'; END IF;
  IF p_end_at IS NOT NULL AND p_start_at IS NOT NULL AND p_end_at <= p_start_at THEN RAISE EXCEPTION 'INVALID_ANNOUNCEMENT_DATES'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.founder_announcements(title, body, type, priority, audience, workspace_id, target_profile_id, target_plan, audience_roles, cta_label, cta_url, start_at, end_at, publish_at, status, is_active, sticky, dismissible, language, created_by)
    VALUES (trim(p_title), trim(p_body), p_type, p_priority, p_audience, p_workspace_id, p_target_profile_id, nullif(trim(coalesce(p_target_plan, '')), ''), coalesce(p_audience_roles, '{}'::text[]), nullif(trim(coalesce(p_cta_label, '')), ''), nullif(trim(coalesce(p_cta_url, '')), ''), p_start_at, p_end_at, p_publish_at, p_status, p_is_active, p_sticky, p_dismissible, coalesce(nullif(trim(p_language), ''), 'en'), auth.uid())
    RETURNING * INTO item;
    action_name := 'announcement_created';
  ELSE
    UPDATE public.founder_announcements SET title = trim(p_title), body = trim(p_body), type = p_type, priority = p_priority, audience = p_audience, workspace_id = p_workspace_id, target_profile_id = p_target_profile_id, target_plan = nullif(trim(coalesce(p_target_plan, '')), ''), audience_roles = coalesce(p_audience_roles, '{}'::text[]), cta_label = nullif(trim(coalesce(p_cta_label, '')), ''), cta_url = nullif(trim(coalesce(p_cta_url, '')), ''), start_at = p_start_at, end_at = p_end_at, publish_at = p_publish_at, status = p_status, is_active = p_is_active, sticky = p_sticky, dismissible = p_dismissible, language = coalesce(nullif(trim(p_language), ''), 'en'), updated_at = now() WHERE id = p_id RETURNING * INTO item;
    IF NOT FOUND THEN RAISE EXCEPTION 'ANNOUNCEMENT_NOT_FOUND'; END IF;
    action_name := 'announcement_updated';
  END IF;
  PERFORM public.founder_platform_audit_v3(action_name, 'announcement', item.id, item.title, jsonb_build_object('status', item.status, 'is_active', item.is_active, 'audience', item.audience));
  RETURN jsonb_build_object('id', item.id, 'status', item.status, 'is_active', item.is_active);
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_toggle_announcement_v3(p_id uuid, p_is_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE title_value text;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  UPDATE public.founder_announcements SET is_active = p_is_active, updated_at = now() WHERE id = p_id RETURNING title INTO title_value;
  IF NOT FOUND THEN RAISE EXCEPTION 'ANNOUNCEMENT_NOT_FOUND'; END IF;
  PERFORM public.founder_platform_audit_v3(CASE WHEN p_is_active THEN 'announcement_activated' ELSE 'announcement_deactivated' END, 'announcement', p_id, title_value);
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_duplicate_announcement_v3(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE source_row public.founder_announcements;
DECLARE copied public.founder_announcements;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  SELECT * INTO source_row FROM public.founder_announcements WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ANNOUNCEMENT_NOT_FOUND'; END IF;
  INSERT INTO public.founder_announcements(title, body, type, priority, audience, workspace_id, target_profile_id, target_plan, audience_roles, cta_label, cta_url, start_at, end_at, publish_at, status, is_active, sticky, dismissible, language, created_by)
  VALUES ('Copy of ' || source_row.title, source_row.body, source_row.type, source_row.priority, source_row.audience, source_row.workspace_id, source_row.target_profile_id, source_row.target_plan, source_row.audience_roles, source_row.cta_label, source_row.cta_url, source_row.start_at, source_row.end_at, NULL, 'draft', false, source_row.sticky, source_row.dismissible, source_row.language, auth.uid()) RETURNING * INTO copied;
  PERFORM public.founder_platform_audit_v3('announcement_duplicated', 'announcement', copied.id, copied.title, jsonb_build_object('source_id', p_id));
  RETURN jsonb_build_object('id', copied.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_delete_announcement_v3(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE title_value text;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'FOUNDER_ACCESS_REQUIRED'; END IF;
  DELETE FROM public.founder_announcements WHERE id = p_id RETURNING title INTO title_value;
  IF NOT FOUND THEN RAISE EXCEPTION 'ANNOUNCEMENT_NOT_FOUND'; END IF;
  PERFORM public.founder_platform_audit_v3('announcement_deleted', 'announcement', p_id, title_value);
END;
$$;

CREATE OR REPLACE FUNCTION public.founder_list_my_announcements_v3()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE result jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body, 'type', a.type, 'priority', a.priority, 'cta_label', a.cta_label, 'cta_url', a.cta_url, 'dismissible', a.dismissible, 'sticky', a.sticky, 'created_at', a.created_at) ORDER BY a.sticky DESC, a.priority DESC, a.created_at DESC), '[]'::jsonb) INTO result
  FROM public.founder_announcements a
  JOIN public.profiles p ON p.id = auth.uid()
  LEFT JOIN public.workspaces w ON w.id = p.workspace_id
  LEFT JOIN public.founder_announcement_receipts r ON r.announcement_id = a.id AND r.profile_id = p.id
  WHERE a.is_active AND a.status = 'published' AND (a.publish_at IS NULL OR a.publish_at <= now()) AND (a.start_at IS NULL OR a.start_at <= now()) AND (a.end_at IS NULL OR a.end_at > now()) AND (a.audience = 'all' OR (a.audience = 'workspace' AND a.workspace_id = p.workspace_id) OR (a.audience = 'roles' AND p.role = ANY(a.audience_roles)) OR (a.audience = 'user' AND a.target_profile_id = p.id) OR (a.audience = 'plan' AND a.target_plan = coalesce(w.plan, 'free'))) AND (r.dismissed_at IS NULL OR NOT a.dismissible);
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_last_active() TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_last_login() TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_open_workspace_dashboard_v3(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_update_user_role_v3(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_get_user_360_v3(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_global_orders_v3(integer, integer, text, text, uuid, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_list_platform_settings_v3() TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_update_platform_setting_v3(uuid, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_create_platform_setting_v3(text, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_delete_platform_setting_v3(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_list_announcements_v3() TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_save_announcement_v3(uuid, text, text, text, integer, text, uuid, uuid, text, text[], text, text, timestamptz, timestamptz, timestamptz, text, boolean, boolean, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_toggle_announcement_v3(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_duplicate_announcement_v3(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_delete_announcement_v3(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_list_my_announcements_v3() TO authenticated;
