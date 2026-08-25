-- ForceLog shipping provider: additive workspace configuration and city cache.
-- Credentials are server-only: RLS is enabled with no browser policies.

ALTER TABLE public.workspaces DROP CONSTRAINT IF EXISTS workspaces_carrier_check;
ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_carrier_check
  CHECK (carrier IN ('ozon', 'coliaty', 'forcelog'));

ALTER TABLE public.city_arabic_names DROP CONSTRAINT IF EXISTS city_arabic_names_carrier_check;
ALTER TABLE public.city_arabic_names
  ADD CONSTRAINT city_arabic_names_carrier_check
  CHECK (carrier IN ('ozon', 'coliaty', 'forcelog'));

CREATE TABLE IF NOT EXISTS public.workspace_forcelog_integrations (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  api_key text NOT NULL,
  key_last4 text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_tested_at timestamptz,
  last_test_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workspace_forcelog_integrations ENABLE ROW LEVEL SECURITY;
-- No browser SELECT/INSERT/UPDATE/DELETE policy by design. The authenticated
-- forcelog-api Edge Function is the only credential management path.

CREATE TABLE IF NOT EXISTS public.forcelog_cities (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider_city_id bigint NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  delivered_price numeric(12,2),
  same_city_price numeric(12,2),
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, provider_city_id)
);

CREATE INDEX IF NOT EXISTS idx_forcelog_cities_workspace_name
  ON public.forcelog_cities (workspace_id, name);
CREATE INDEX IF NOT EXISTS idx_forcelog_cities_workspace_code
  ON public.forcelog_cities (workspace_id, code);

ALTER TABLE public.forcelog_cities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ForceLog cities workspace read" ON public.forcelog_cities;
CREATE POLICY "ForceLog cities workspace read"
  ON public.forcelog_cities FOR SELECT
  USING (
    workspace_id IN (
      SELECT id FROM public.workspaces WHERE created_by = auth.uid()
      UNION
      SELECT workspace_id FROM public.profile_workspaces WHERE profile_id = auth.uid()
    )
  );
