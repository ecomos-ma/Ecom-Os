-- Ameex shipping provider. Credentials remain server-only: both tables below
-- have RLS enabled and intentionally have no browser access policies.

ALTER TABLE public.workspaces DROP CONSTRAINT IF EXISTS workspaces_carrier_check;
ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_carrier_check
  CHECK (carrier IN ('ozon', 'coliaty', 'forcelog', 'ameex'));

ALTER TABLE public.city_arabic_names DROP CONSTRAINT IF EXISTS city_arabic_names_carrier_check;
ALTER TABLE public.city_arabic_names
  ADD CONSTRAINT city_arabic_names_carrier_check
  CHECK (carrier IN ('ozon', 'coliaty', 'forcelog', 'ameex'));

CREATE TABLE IF NOT EXISTS public.workspace_ameex_integrations (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_api_id text NOT NULL,
  client_api_key text NOT NULL,
  client_id_last4 text NOT NULL,
  client_key_last4 text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  open_on_delivery boolean NOT NULL DEFAULT false,
  try_on_delivery boolean NOT NULL DEFAULT false,
  fragile boolean NOT NULL DEFAULT false,
  last_tested_at timestamptz,
  last_test_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workspace_ameex_integrations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.ameex_city_mappings (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  normalized_city text NOT NULL,
  display_name text NOT NULL,
  ameex_city_id bigint NOT NULL CHECK (ameex_city_id > 0),
  aliases text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, normalized_city)
);

CREATE INDEX IF NOT EXISTS idx_ameex_city_mappings_workspace_display
  ON public.ameex_city_mappings (workspace_id, display_name);

ALTER TABLE public.ameex_city_mappings ENABLE ROW LEVEL SECURITY;

-- Server-side mutex for Add Parcel requests. It prevents duplicate provider
-- submissions when a seller double-clicks or two browser tabs submit at once.
CREATE TABLE IF NOT EXISTS public.ameex_parcel_creation_locks (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  order_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, order_id)
);

ALTER TABLE public.ameex_parcel_creation_locks ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.workspace_ameex_integrations IS
  'Server-only Ameex C-Api-Id and C-Api-Key credentials. No browser RLS policies.';
COMMENT ON TABLE public.ameex_city_mappings IS
  'Workspace-scoped Ecom city to Ameex numeric City ID mappings. Ameex has no documented city-list endpoint.';
