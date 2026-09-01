CREATE TABLE IF NOT EXISTS public.ecom_error_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_id text NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  module text NOT NULL,
  action text,
  error_code text NOT NULL,
  safe_message text NOT NULL,
  severity text NOT NULL DEFAULT 'error' CHECK (severity IN ('info','warning','error','critical')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_status text NOT NULL DEFAULT 'open' CHECK (resolved_status IN ('open','investigating','resolved','ignored')),
  occurrence_count integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ecom_error_events_dedupe_idx ON public.ecom_error_events(workspace_id,module,error_code,safe_message,resolved_status);
CREATE INDEX IF NOT EXISTS ecom_error_events_workspace_created_idx ON public.ecom_error_events(workspace_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ecom_error_events_severity_idx ON public.ecom_error_events(severity,created_at DESC);
ALTER TABLE public.ecom_error_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ecom_error_events_read ON public.ecom_error_events;
CREATE POLICY ecom_error_events_read ON public.ecom_error_events FOR SELECT TO authenticated USING (workspace_id IS NULL OR public.whatsapp_is_workspace_member(workspace_id));
DROP POLICY IF EXISTS ecom_error_events_insert ON public.ecom_error_events;
CREATE POLICY ecom_error_events_insert ON public.ecom_error_events FOR INSERT TO authenticated WITH CHECK (workspace_id IS NULL OR public.whatsapp_is_workspace_member(workspace_id));
GRANT SELECT, INSERT ON public.ecom_error_events TO authenticated;
