-- Confirmation CRM: workspace-scoped notes, callbacks, activity, and private
-- browser microphone recordings. This is additive and preserves the existing
-- orders.status (confirmation) / orders.delivery_status (shipping) split.

CREATE OR REPLACE FUNCTION public.confirmation_crm_is_workspace_member(p_workspace_id uuid)
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
        AND coalesce(p.is_active, true)
        AND p.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.profile_workspaces pw
      JOIN public.profiles p ON p.id = pw.profile_id
      WHERE pw.profile_id = auth.uid()
        AND pw.workspace_id = p_workspace_id
        AND coalesce(p.is_active, true)
        AND p.deleted_at IS NULL
    );
$$;

CREATE OR REPLACE FUNCTION public.confirmation_crm_can_review_recordings(p_workspace_id uuid)
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
        AND p.role IN ('owner', 'admin', 'supervisor', 'manager')
        AND coalesce(p.is_active, true)
        AND p.deleted_at IS NULL
    );
$$;

CREATE OR REPLACE FUNCTION public.confirmation_crm_normalize_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
BEGIN
  IF digits = '' THEN
    RETURN '';
  END IF;

  IF digits LIKE '00%' THEN
    digits := substr(digits, 3);
  END IF;

  IF length(digits) = 10 AND digits LIKE '0%' THEN
    RETURN '212' || substr(digits, 2);
  END IF;

  IF length(digits) = 9 AND digits ~ '^[67]' THEN
    RETURN '212' || digits;
  END IF;

  RETURN digits;
END;
$$;

CREATE TABLE IF NOT EXISTS public.confirmation_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders("Order ID") ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  activity_type text NOT NULL CHECK (activity_type IN (
    'ORDER_OPENED', 'NOTE_ADDED', 'CALL_STARTED', 'CALL_ENDED',
    'CALLBACK_SCHEDULED', 'CALLBACK_COMPLETED', 'RECORDING_SAVED'
  )),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.confirmation_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders("Order ID") ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.confirmation_callbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders("Order ID") ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  note text CHECK (note IS NULL OR char_length(trim(note)) <= 1000),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.confirmation_call_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders("Order ID") ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  storage_path text NOT NULL UNIQUE,
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  mime_type text,
  file_size bigint CHECK (file_size IS NULL OR file_size >= 0),
  recording_source text NOT NULL DEFAULT 'browser_microphone'
    CHECK (recording_source IN ('browser_microphone', 'telephony_provider')),
  started_at timestamptz,
  ended_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS confirmation_activities_order_created_idx
  ON public.confirmation_activities (workspace_id, order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS confirmation_notes_order_created_idx
  ON public.confirmation_notes (workspace_id, order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS confirmation_callbacks_queue_idx
  ON public.confirmation_callbacks (workspace_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS confirmation_callbacks_agent_queue_idx
  ON public.confirmation_callbacks (workspace_id, agent_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS confirmation_call_recordings_order_created_idx
  ON public.confirmation_call_recordings (workspace_id, order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS confirmation_call_recordings_agent_created_idx
  ON public.confirmation_call_recordings (workspace_id, agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_confirmation_phone_idx
  ON public.orders (workspace_id, public.confirmation_crm_normalize_phone(phone));

CREATE OR REPLACE FUNCTION public.confirmation_crm_set_callback_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_confirmation_callbacks_updated_at ON public.confirmation_callbacks;
CREATE TRIGGER trg_confirmation_callbacks_updated_at
BEFORE UPDATE ON public.confirmation_callbacks
FOR EACH ROW EXECUTE FUNCTION public.confirmation_crm_set_callback_updated_at();

ALTER TABLE public.confirmation_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.confirmation_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.confirmation_callbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.confirmation_call_recordings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS confirmation_activities_workspace_read ON public.confirmation_activities;
DROP POLICY IF EXISTS confirmation_activities_agent_insert ON public.confirmation_activities;
CREATE POLICY confirmation_activities_workspace_read
  ON public.confirmation_activities FOR SELECT
  USING (public.confirmation_crm_is_workspace_member(workspace_id));
CREATE POLICY confirmation_activities_agent_insert
  ON public.confirmation_activities FOR INSERT
  WITH CHECK (
    public.confirmation_crm_is_workspace_member(workspace_id)
    AND agent_id = auth.uid()
  );

DROP POLICY IF EXISTS confirmation_notes_workspace_read ON public.confirmation_notes;
DROP POLICY IF EXISTS confirmation_notes_author_insert ON public.confirmation_notes;
CREATE POLICY confirmation_notes_workspace_read
  ON public.confirmation_notes FOR SELECT
  USING (public.confirmation_crm_is_workspace_member(workspace_id));
CREATE POLICY confirmation_notes_author_insert
  ON public.confirmation_notes FOR INSERT
  WITH CHECK (
    public.confirmation_crm_is_workspace_member(workspace_id)
    AND author_id = auth.uid()
  );

DROP POLICY IF EXISTS confirmation_callbacks_workspace_read ON public.confirmation_callbacks;
DROP POLICY IF EXISTS confirmation_callbacks_agent_insert ON public.confirmation_callbacks;
DROP POLICY IF EXISTS confirmation_callbacks_agent_update ON public.confirmation_callbacks;
CREATE POLICY confirmation_callbacks_workspace_read
  ON public.confirmation_callbacks FOR SELECT
  USING (public.confirmation_crm_is_workspace_member(workspace_id));
CREATE POLICY confirmation_callbacks_agent_insert
  ON public.confirmation_callbacks FOR INSERT
  WITH CHECK (
    public.confirmation_crm_is_workspace_member(workspace_id)
    AND agent_id = auth.uid()
  );
CREATE POLICY confirmation_callbacks_agent_update
  ON public.confirmation_callbacks FOR UPDATE
  USING (
    agent_id = auth.uid()
    OR public.confirmation_crm_can_review_recordings(workspace_id)
  )
  WITH CHECK (public.confirmation_crm_is_workspace_member(workspace_id));

DROP POLICY IF EXISTS confirmation_recordings_scoped_read ON public.confirmation_call_recordings;
DROP POLICY IF EXISTS confirmation_recordings_agent_insert ON public.confirmation_call_recordings;
CREATE POLICY confirmation_recordings_scoped_read
  ON public.confirmation_call_recordings FOR SELECT
  USING (
    agent_id = auth.uid()
    OR public.confirmation_crm_can_review_recordings(workspace_id)
  );
CREATE POLICY confirmation_recordings_agent_insert
  ON public.confirmation_call_recordings FOR INSERT
  WITH CHECK (
    public.confirmation_crm_is_workspace_member(workspace_id)
    AND agent_id = auth.uid()
  );

GRANT SELECT, INSERT ON public.confirmation_activities TO authenticated;
GRANT SELECT, INSERT ON public.confirmation_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.confirmation_callbacks TO authenticated;
GRANT SELECT, INSERT ON public.confirmation_call_recordings TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'call-recordings',
  'call-recordings',
  false,
  26214400,
  ARRAY['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS confirmation_recordings_upload ON storage.objects;
DROP POLICY IF EXISTS confirmation_recordings_read ON storage.objects;
DROP POLICY IF EXISTS confirmation_recordings_delete ON storage.objects;
CREATE POLICY confirmation_recordings_upload
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'call-recordings'
    AND split_part(name, '/', 2) = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.profile_workspaces pw
      JOIN public.profiles p ON p.id = pw.profile_id
      WHERE pw.profile_id = auth.uid()
        AND pw.workspace_id::text = split_part(name, '/', 1)
        AND coalesce(p.is_active, true)
        AND p.deleted_at IS NULL
    )
  );
CREATE POLICY confirmation_recordings_read
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'call-recordings'
    AND EXISTS (
      SELECT 1
      FROM public.confirmation_call_recordings r
      WHERE r.storage_path = name
        AND (r.agent_id = auth.uid() OR public.confirmation_crm_can_review_recordings(r.workspace_id))
    )
  );
CREATE POLICY confirmation_recordings_delete
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'call-recordings'
    AND (
      split_part(name, '/', 2) = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM public.confirmation_call_recordings r
        WHERE r.storage_path = name
          AND public.confirmation_crm_can_review_recordings(r.workspace_id)
      )
    )
  );

CREATE OR REPLACE FUNCTION public.get_confirmation_crm_summary(
  p_workspace_id uuid,
  p_agent_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.confirmation_crm_is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED';
  END IF;

  IF p_agent_id IS NOT NULL
    AND p_agent_id <> auth.uid()
    AND NOT public.confirmation_crm_can_review_recordings(p_workspace_id) THEN
    RAISE EXCEPTION 'AGENT_SCOPE_NOT_ALLOWED';
  END IF;

  WITH latest_assignments AS (
    SELECT DISTINCT ON (oa.order_id)
      oa.order_id,
      oa.assigned_to
    FROM public.order_assignments oa
    WHERE oa.workspace_id = p_workspace_id
    ORDER BY oa.order_id, oa.assigned_at DESC, oa.created_at DESC
  ),
  base AS (
    SELECT o.*
    FROM public.orders o
    LEFT JOIN latest_assignments la ON la.order_id = o."Order ID"
    WHERE o.workspace_id = p_workspace_id
      AND (p_agent_id IS NULL OR la.assigned_to = p_agent_id)
  ),
  status_counts AS (
    SELECT coalesce(nullif(trim(status), ''), 'pending') AS status_value, count(*)::integer AS total
    FROM base
    GROUP BY coalesce(nullif(trim(status), ''), 'pending')
  ),
  callback_counts AS (
    SELECT
      count(*) FILTER (WHERE c.status = 'scheduled' AND c.scheduled_at <= now())::integer AS due,
      count(*) FILTER (WHERE c.status = 'scheduled' AND c.scheduled_at < date_trunc('day', now()))::integer AS overdue,
      count(*) FILTER (WHERE c.status = 'scheduled' AND c.scheduled_at >= date_trunc('day', now()) AND c.scheduled_at < date_trunc('day', now()) + interval '1 day')::integer AS today
    FROM public.confirmation_callbacks c
    JOIN base b ON b."Order ID" = c.order_id
    WHERE p_agent_id IS NULL OR c.agent_id = p_agent_id
  ),
  activity_counts AS (
    SELECT
      count(*)::integer AS actions_today,
      count(*) FILTER (WHERE a.activity_type = 'CALL_STARTED')::integer AS calls_today,
      count(DISTINCT a.order_id)::integer AS handled_today
    FROM public.confirmation_activities a
    JOIN base b ON b."Order ID" = a.order_id
    WHERE a.created_at >= date_trunc('day', now())
      AND (p_agent_id IS NULL OR a.agent_id = p_agent_id)
  )
  SELECT jsonb_build_object(
    'total_orders', (SELECT count(*)::integer FROM base),
    'orders_created_today', (SELECT count(*)::integer FROM base WHERE created_at >= date_trunc('day', now())),
    'confirmed_today', (SELECT count(*)::integer FROM base WHERE confirmed_at >= date_trunc('day', now())),
    'remaining_orders', (
      SELECT count(*)::integer FROM base
      WHERE lower(trim(coalesce(status, ''))) NOT IN (
        'confirmed', 'confirme', 'confirmé', 'cancelled', 'canceled', 'annulé', 'annule',
        'shipped', 'expédié', 'expedie', 'delivered', 'livré', 'livre', 'returned', 'retourné', 'retourne'
      )
    ),
    'status_counts', coalesce((SELECT jsonb_object_agg(status_value, total) FROM status_counts), '{}'::jsonb),
    'callbacks_due', coalesce((SELECT due FROM callback_counts), 0),
    'callbacks_overdue', coalesce((SELECT overdue FROM callback_counts), 0),
    'callbacks_today', coalesce((SELECT today FROM callback_counts), 0),
    'calls_today', coalesce((SELECT calls_today FROM activity_counts), 0),
    'actions_today', coalesce((SELECT actions_today FROM activity_counts), 0),
    'handled_today', coalesce((SELECT handled_today FROM activity_counts), 0)
  ) INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_confirmation_customer_history(
  p_workspace_id uuid,
  p_customer_id uuid DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_exclude_order_id uuid DEFAULT NULL
)
RETURNS TABLE (
  order_id uuid,
  order_number text,
  product_variant text,
  sku text,
  total numeric,
  status text,
  delivery_status text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.confirmation_crm_is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED';
  END IF;

  RETURN QUERY
  SELECT
    o."Order ID",
    o.order_number,
    o.product_variant,
    o.sku,
    o.total,
    o.status,
    o.delivery_status,
    o.created_at
  FROM public.orders o
  WHERE o.workspace_id = p_workspace_id
    AND (p_exclude_order_id IS NULL OR o."Order ID" <> p_exclude_order_id)
    AND (
      (p_customer_id IS NOT NULL AND o.customer_id = p_customer_id)
      OR (
        nullif(public.confirmation_crm_normalize_phone(p_phone), '') IS NOT NULL
        AND public.confirmation_crm_normalize_phone(o.phone) = public.confirmation_crm_normalize_phone(p_phone)
      )
    )
  ORDER BY o.created_at DESC
  LIMIT 20;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_confirmation_crm_summary(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_confirmation_customer_history(uuid, uuid, text, uuid) TO authenticated;

DO $$
DECLARE
  relation_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH relation_name IN ARRAY ARRAY[
      'confirmation_activities',
      'confirmation_notes',
      'confirmation_callbacks',
      'confirmation_call_recordings'
    ] LOOP
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', relation_name);
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END;
    END LOOP;
  END IF;
END;
$$;
