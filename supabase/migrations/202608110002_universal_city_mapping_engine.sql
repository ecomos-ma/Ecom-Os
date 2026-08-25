-- Universal, provider-aware city mapping engine.
-- The raw order city is retained separately from the official provider city.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.shipping_provider_cities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
    provider_key text NOT NULL,
    provider_city_id text NOT NULL,
    provider_city_code text,
    provider_city_name text NOT NULL,
    aliases text[] NOT NULL DEFAULT ARRAY[]::text[],
    delivered_price numeric,
    returned_price numeric,
    refused_price numeric,
    same_city_price numeric,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT shipping_provider_cities_provider_key_check CHECK (length(trim(provider_key)) > 0),
    CONSTRAINT shipping_provider_cities_city_id_check CHECK (length(trim(provider_city_id)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS shipping_provider_cities_unique_city
    ON public.shipping_provider_cities (workspace_id, provider_key, provider_city_id);

CREATE INDEX IF NOT EXISTS shipping_provider_cities_lookup_idx
    ON public.shipping_provider_cities (workspace_id, provider_key, is_active);

CREATE INDEX IF NOT EXISTS shipping_provider_cities_name_trgm_idx
    ON public.shipping_provider_cities USING gin (provider_city_name gin_trgm_ops);

ALTER TABLE public.shipping_provider_cities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members can read provider cities" ON public.shipping_provider_cities;
CREATE POLICY "Workspace members can read provider cities"
    ON public.shipping_provider_cities
    FOR SELECT
    USING (public.user_has_workspace_access(workspace_id));

DROP POLICY IF EXISTS "Workspace members can manage provider cities" ON public.shipping_provider_cities;
CREATE POLICY "Workspace members can manage provider cities"
    ON public.shipping_provider_cities
    FOR ALL
    USING (public.user_has_workspace_access(workspace_id))
    WITH CHECK (public.user_has_workspace_access(workspace_id));

CREATE TABLE IF NOT EXISTS public.city_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider_key text NOT NULL,
  raw_city text NOT NULL,
  normalized_raw_city text NOT NULL,
  provider_city_id text NOT NULL,
  provider_city_name text NOT NULL,
  provider_city_code text,
  confidence numeric(5,4),
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'automatic', 'imported', 'learned')),
  usage_count integer NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  last_used_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider_key, normalized_raw_city)
);

CREATE INDEX IF NOT EXISTS city_mappings_workspace_provider_idx
  ON public.city_mappings (workspace_id, provider_key);
CREATE INDEX IF NOT EXISTS city_mappings_provider_normalized_idx
  ON public.city_mappings (provider_key, normalized_raw_city);
CREATE INDEX IF NOT EXISTS city_mappings_provider_city_idx
  ON public.city_mappings (workspace_id, provider_key, provider_city_id);
CREATE INDEX IF NOT EXISTS city_mappings_raw_city_trgm_idx
  ON public.city_mappings USING gin (raw_city gin_trgm_ops);

ALTER TABLE public.city_mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "City mappings workspace read" ON public.city_mappings;
CREATE POLICY "City mappings workspace read"
  ON public.city_mappings FOR SELECT
  USING (public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "City mappings workspace insert" ON public.city_mappings;
CREATE POLICY "City mappings workspace insert"
  ON public.city_mappings FOR INSERT
  WITH CHECK (public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "City mappings workspace update" ON public.city_mappings;
CREATE POLICY "City mappings workspace update"
  ON public.city_mappings FOR UPDATE
  USING (public.user_has_workspace_access(workspace_id))
  WITH CHECK (public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "City mappings workspace delete" ON public.city_mappings;
CREATE POLICY "City mappings workspace delete"
  ON public.city_mappings FOR DELETE
  USING (public.user_has_workspace_access(workspace_id));

CREATE OR REPLACE FUNCTION public.touch_city_mapping_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS city_mappings_updated_at ON public.city_mappings;
CREATE TRIGGER city_mappings_updated_at
  BEFORE UPDATE ON public.city_mappings
  FOR EACH ROW EXECUTE FUNCTION public.touch_city_mapping_updated_at();

-- A single concurrency-safe write path prevents an automatic guess from
-- replacing a seller's manual/learned correction.
CREATE OR REPLACE FUNCTION public.upsert_city_mapping(
  p_workspace_id uuid,
  p_provider_key text,
  p_raw_city text,
  p_normalized_raw_city text,
  p_provider_city_id text,
  p_provider_city_name text,
  p_provider_city_code text DEFAULT NULL,
  p_confidence numeric DEFAULT NULL,
  p_source text DEFAULT 'manual'
)
RETURNS public.city_mappings
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  result_row public.city_mappings;
BEGIN
  INSERT INTO public.city_mappings (
    workspace_id,
    provider_key,
    raw_city,
    normalized_raw_city,
    provider_city_id,
    provider_city_name,
    provider_city_code,
    confidence,
    source,
    created_by
  ) VALUES (
    p_workspace_id,
    lower(trim(p_provider_key)),
    p_raw_city,
    p_normalized_raw_city,
    p_provider_city_id,
    p_provider_city_name,
    p_provider_city_code,
    p_confidence,
    p_source,
    auth.uid()
  )
  ON CONFLICT (workspace_id, provider_key, normalized_raw_city)
  DO UPDATE SET
    raw_city = EXCLUDED.raw_city,
    provider_city_id = EXCLUDED.provider_city_id,
    provider_city_name = EXCLUDED.provider_city_name,
    provider_city_code = EXCLUDED.provider_city_code,
    confidence = EXCLUDED.confidence,
    source = EXCLUDED.source,
    updated_at = now()
  WHERE public.city_mappings.source NOT IN ('manual', 'learned')
     OR EXCLUDED.source IN ('manual', 'learned');

  SELECT * INTO result_row
  FROM public.city_mappings
  WHERE workspace_id = p_workspace_id
    AND provider_key = lower(trim(p_provider_key))
    AND normalized_raw_city = p_normalized_raw_city;

  RETURN result_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_city_mapping(uuid, text, text, text, text, text, text, numeric, text)
  TO authenticated;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS raw_city text,
  ADD COLUMN IF NOT EXISTS provider_city_id text,
  ADD COLUMN IF NOT EXISTS city_mapping_status text NOT NULL DEFAULT 'unresolved'
    CHECK (city_mapping_status IN ('resolved', 'suggested', 'unresolved')),
  ADD COLUMN IF NOT EXISTS city_mapping_confidence numeric(5,4),
  ADD COLUMN IF NOT EXISTS city_mapping_source text;

UPDATE public.orders
SET raw_city = COALESCE(NULLIF(raw_city, ''), NULLIF(city, ''), NULLIF(city_name, ''))
WHERE raw_city IS NULL OR raw_city = '';

CREATE INDEX IF NOT EXISTS orders_provider_city_id_idx
  ON public.orders (workspace_id, shipping_provider, provider_city_id);
CREATE INDEX IF NOT EXISTS orders_city_mapping_status_idx
  ON public.orders (workspace_id, city_mapping_status);

COMMENT ON TABLE public.city_mappings IS
  'Workspace-scoped provider-specific aliases learned by the universal city mapping engine.';
COMMENT ON COLUMN public.orders.raw_city IS
  'Original city string received from the order source; never replaced by provider normalization.';
COMMENT ON COLUMN public.orders.provider_city_id IS
  'Official city identifier for the selected shipping provider. IDs are provider-specific strings.';
