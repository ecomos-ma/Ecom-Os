-- Sendit shipping provider. Credentials and webhook secret remain server-only:
-- RLS is enabled and this migration deliberately creates no browser policies.

ALTER TABLE public.workspaces DROP CONSTRAINT IF EXISTS workspaces_carrier_check;
ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_carrier_check
  CHECK (carrier IN ('ozon', 'coliaty', 'forcelog', 'ameex', 'sendit'));

ALTER TABLE public.city_arabic_names DROP CONSTRAINT IF EXISTS city_arabic_names_carrier_check;
ALTER TABLE public.city_arabic_names
  ADD CONSTRAINT city_arabic_names_carrier_check
  CHECK (carrier IN ('ozon', 'coliaty', 'forcelog', 'ameex', 'sendit'));

CREATE TABLE IF NOT EXISTS public.workspace_sendit_integrations (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  public_key text NOT NULL,
  secret_key text NOT NULL,
  public_key_last4 text NOT NULL,
  secret_key_last4 text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  pickup_district_id bigint,
  allow_open boolean NOT NULL DEFAULT false,
  allow_try boolean NOT NULL DEFAULT false,
  packaging_id bigint,
  webhook_secret text,
  last_tested_at timestamptz,
  last_test_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_sendit_pickup_district_check CHECK (pickup_district_id IS NULL OR pickup_district_id > 0),
  CONSTRAINT workspace_sendit_packaging_check CHECK (packaging_id IS NULL OR packaging_id > 0)
);

ALTER TABLE public.workspace_sendit_integrations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.sendit_parcel_creation_locks (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  order_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, order_id)
);

ALTER TABLE public.sendit_parcel_creation_locks ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.workspace_sendit_integrations IS
  'Server-only Sendit public/secret keys, delivery preferences, and future webhook secret. No browser RLS policies.';
COMMENT ON TABLE public.sendit_parcel_creation_locks IS
  'Short-lived server-side mutex that prevents duplicate Sendit delivery creation.';
