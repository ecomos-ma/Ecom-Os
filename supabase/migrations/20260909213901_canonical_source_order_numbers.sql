-- Stable seller-facing order numbers, scoped by workspace and source.
-- Provider identifiers stay in their dedicated external-id columns.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_source text,
  ADD COLUMN IF NOT EXISTS order_sequence_number bigint,
  ADD COLUMN IF NOT EXISTS display_order_id text;

CREATE TABLE IF NOT EXISTS public.order_display_counters (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  order_source text NOT NULL,
  last_value bigint NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, order_source)
);

ALTER TABLE public.order_display_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.order_display_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.order_display_counters TO service_role;

CREATE OR REPLACE FUNCTION public.canonical_order_source_v1(p_source text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE lower(trim(coalesce(p_source, 'manual')))
    WHEN 'youcan' THEN 'youcan'
    WHEN 'sheets' THEN 'google_sheets'
    WHEN 'google_sheet' THEN 'google_sheets'
    WHEN 'google_sheets' THEN 'google_sheets'
    WHEN 'shopify' THEN 'shopify'
    ELSE 'manual'
  END;
$$;

CREATE OR REPLACE FUNCTION public.order_source_prefix_v1(p_source text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE public.canonical_order_source_v1(p_source)
    WHEN 'youcan' THEN 'YC'
    WHEN 'google_sheets' THEN 'GS'
    WHEN 'shopify' THEN 'SF'
    ELSE 'MN'
  END;
$$;

CREATE OR REPLACE FUNCTION public.next_order_display_sequence_v1(
  p_workspace_id uuid,
  p_order_source text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source text := public.canonical_order_source_v1(p_order_source);
  v_number bigint;
BEGIN
  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id is required';
  END IF;

  INSERT INTO public.order_display_counters (workspace_id, order_source, last_value)
  VALUES (p_workspace_id, v_source, 1)
  ON CONFLICT (workspace_id, order_source) DO UPDATE
    SET last_value = public.order_display_counters.last_value + 1,
        updated_at = now()
  RETURNING last_value INTO v_number;

  RETURN v_number;
END;
$$;

-- Preserve the stable identity used by the legacy direct Sheets webhook before
-- its provider-shaped order_number is replaced by the canonical display ID.
UPDATE public.orders
SET sync_key = 'webhook:' || coalesce(nullif(sheet_id, ''), 'manual') || ':'
  || regexp_replace(order_number, '^#?GS-', '')
WHERE lower(coalesce(source, '')) IN ('sheets', 'google_sheet', 'google_sheets')
  AND sync_key IS NULL
  AND order_number ~ '^#?GS-.+';

-- Avoid transient collisions with the existing immediate UNIQUE constraint
-- while rows exchange legacy numbers for their deterministic new sequence.
-- This is transaction-local; provider IDs remain in their dedicated columns.
UPDATE public.orders
SET order_number = '__resequence__-' || "Order ID"::text;

-- Reconcile all existing rows once in deterministic creation order. The
-- internal UUID and provider identifiers are not changed.
WITH ranked AS (
  SELECT
    o."Order ID" AS id,
    public.canonical_order_source_v1(
      coalesce(nullif(o.source, ''), nullif(o.source_platform, ''), 'manual')
    ) AS normalized_source,
    row_number() OVER (
      PARTITION BY o.workspace_id, public.canonical_order_source_v1(
        coalesce(nullif(o.source, ''), nullif(o.source_platform, ''), 'manual')
      )
      ORDER BY o.created_at NULLS LAST, o."Order ID"
    )::bigint AS sequence_number
  FROM public.orders o
)
UPDATE public.orders o
SET order_source = r.normalized_source,
    order_sequence_number = r.sequence_number,
    display_order_id = public.order_source_prefix_v1(r.normalized_source) || '-' || r.sequence_number::text,
    order_number = public.order_source_prefix_v1(r.normalized_source) || '-' || r.sequence_number::text
FROM ranked r
WHERE o."Order ID" = r.id;

INSERT INTO public.order_display_counters (workspace_id, order_source, last_value)
SELECT workspace_id, order_source, max(order_sequence_number)
FROM public.orders
GROUP BY workspace_id, order_source
ON CONFLICT (workspace_id, order_source) DO UPDATE
  SET last_value = GREATEST(public.order_display_counters.last_value, EXCLUDED.last_value),
      updated_at = now();

-- Keep the older source-specific allocators from returning a value lower than
-- the reconciled seller-facing sequence. The canonical insert trigger below
-- remains the final authority.
INSERT INTO public.google_sheets_order_counters (workspace_id, next_sequence_number)
SELECT workspace_id, max(order_sequence_number)::integer
FROM public.orders
WHERE order_source = 'google_sheets'
GROUP BY workspace_id
ON CONFLICT (workspace_id) DO UPDATE
  SET next_sequence_number = GREATEST(public.google_sheets_order_counters.next_sequence_number, EXCLUDED.next_sequence_number),
      updated_at = now();

INSERT INTO public.youcan_order_counters (workspace_id, next_sequence_number)
SELECT workspace_id, max(order_sequence_number)::integer
FROM public.orders
WHERE order_source = 'youcan'
GROUP BY workspace_id
ON CONFLICT (workspace_id) DO UPDATE
  SET next_sequence_number = GREATEST(public.youcan_order_counters.next_sequence_number, EXCLUDED.next_sequence_number),
      updated_at = now();

ALTER TABLE public.orders
  ALTER COLUMN order_source SET NOT NULL,
  ALTER COLUMN order_sequence_number SET NOT NULL,
  ALTER COLUMN display_order_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_workspace_source_sequence_idx
  ON public.orders (workspace_id, order_source, order_sequence_number);

CREATE UNIQUE INDEX IF NOT EXISTS orders_workspace_display_order_id_idx
  ON public.orders (workspace_id, display_order_id);

CREATE INDEX IF NOT EXISTS orders_workspace_source_created_idx
  ON public.orders (workspace_id, order_source, created_at DESC);

CREATE OR REPLACE FUNCTION public.assign_canonical_order_number_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source text;
  v_sequence bigint;
  v_display_id text;
BEGIN
  v_source := public.canonical_order_source_v1(
    coalesce(nullif(NEW.order_source, ''), nullif(NEW.source, ''), nullif(NEW.source_platform, ''), 'manual')
  );
  v_sequence := public.next_order_display_sequence_v1(NEW.workspace_id, v_source);
  v_display_id := public.order_source_prefix_v1(v_source) || '-' || v_sequence::text;

  NEW.order_source := v_source;
  NEW.order_sequence_number := v_sequence;
  NEW.display_order_id := v_display_id;
  NEW.order_number := v_display_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_source_scoped_display_id_trigger ON public.orders;
DROP TRIGGER IF EXISTS orders_workspace_order_number_trigger ON public.orders;
CREATE TRIGGER orders_source_scoped_display_id_trigger
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_canonical_order_number_v1();

REVOKE ALL ON FUNCTION public.canonical_order_source_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.order_source_prefix_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_order_display_sequence_v1(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_canonical_order_number_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canonical_order_source_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.order_source_prefix_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.next_order_display_sequence_v1(uuid, text) TO service_role;

COMMENT ON COLUMN public.orders.order_source IS 'Normalized source used for workspace-scoped seller-facing numbering.';
COMMENT ON COLUMN public.orders.order_sequence_number IS 'Permanent workspace/source-local sequence number.';
COMMENT ON COLUMN public.orders.display_order_id IS 'Stable seller-facing ID such as YC-1, GS-1, SF-1, or MN-1.';
