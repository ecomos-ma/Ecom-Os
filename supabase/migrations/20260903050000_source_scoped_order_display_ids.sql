-- Stable seller-facing order IDs, independent per workspace and source.
-- Internal UUIDs and all provider/external IDs remain unchanged.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_source text,
  ADD COLUMN IF NOT EXISTS order_sequence_number bigint,
  ADD COLUMN IF NOT EXISTS display_order_id text;

CREATE TABLE IF NOT EXISTS public.order_number_counters (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  prefix text NOT NULL,
  next_number bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, prefix)
);

ALTER TABLE public.order_number_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages order counters" ON public.order_number_counters;
CREATE POLICY "Service role manages order counters" ON public.order_number_counters
  FOR ALL USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.normalize_order_source(p_source text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(coalesce(p_source, 'manual')))
    WHEN 'youcan' THEN 'youcan'
    WHEN 'sheets' THEN 'google_sheets'
    WHEN 'google_sheet' THEN 'google_sheets'
    WHEN 'google_sheets' THEN 'google_sheets'
    WHEN 'shopify' THEN 'shopify'
    WHEN 'manual' THEN 'manual'
    ELSE 'manual'
  END;
$$;

CREATE OR REPLACE FUNCTION public.order_source_prefix(p_source text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE public.normalize_order_source(p_source)
    WHEN 'youcan' THEN 'YC'
    WHEN 'google_sheets' THEN 'GS'
    WHEN 'shopify' THEN 'SF'
    ELSE 'MN'
  END;
$$;

ALTER TABLE public.order_number_counters
  ALTER COLUMN next_number TYPE bigint;

CREATE OR REPLACE FUNCTION public.next_workspace_order_sequence(
  p_workspace_id uuid,
  p_order_source text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source text := public.normalize_order_source(p_order_source);
  v_number bigint;
BEGIN
  INSERT INTO public.order_number_counters (workspace_id, prefix, next_number)
  VALUES (p_workspace_id, v_source, 2)
  ON CONFLICT (workspace_id, prefix) DO UPDATE
    SET next_number = public.order_number_counters.next_number + 1,
        updated_at = now()
  RETURNING next_number - 1 INTO v_number;

  RETURN v_number;
END;
$$;

-- Keep all currently valid short IDs stable. IDs from the legacy migration
-- (ORD-/SH-) are treated as invalid for the corrected source mapping.
WITH existing AS (
  SELECT
    o."Order ID" AS id,
    public.normalize_order_source(o.source) AS normalized_source,
    substring(o.order_number from '^[A-Z]+-([0-9]+)$')::bigint AS existing_number
  FROM public.orders o
  WHERE o.order_number ~ '^(YC|GS|SF|MN)-[0-9]+$'
    AND split_part(o.order_number, '-', 1) = public.order_source_prefix(o.source)
)
UPDATE public.orders o
SET order_source = e.normalized_source,
    order_sequence_number = e.existing_number,
    display_order_id = public.order_source_prefix(e.normalized_source) || '-' || e.existing_number::text,
    order_number = public.order_source_prefix(e.normalized_source) || '-' || e.existing_number::text
FROM existing e
WHERE o."Order ID" = e.id;

-- Assign new numbers to legacy UUID/ORD-/SH- values without renumbering any
-- already-valid YC/GS/SF/MN ID. Invalid rows are ordered by creation time.
WITH legacy AS (
  SELECT
    o."Order ID" AS id,
    public.normalize_order_source(o.source) AS normalized_source,
    row_number() OVER (
      PARTITION BY o.workspace_id, public.normalize_order_source(o.source)
      ORDER BY o.created_at NULLS LAST, o."Order ID"
    ) AS legacy_rank
  FROM public.orders o
  WHERE o.order_sequence_number IS NULL
), maxima AS (
  SELECT workspace_id, order_source, max(order_sequence_number) AS current_max
  FROM public.orders
  WHERE order_sequence_number IS NOT NULL
  GROUP BY workspace_id, order_source
)
UPDATE public.orders o
SET order_source = l.normalized_source,
    order_sequence_number = coalesce(m.current_max, 0) + l.legacy_rank,
    display_order_id = public.order_source_prefix(l.normalized_source)
      || '-' || (coalesce(m.current_max, 0) + l.legacy_rank)::text,
    order_number = public.order_source_prefix(l.normalized_source)
      || '-' || (coalesce(m.current_max, 0) + l.legacy_rank)::text
FROM legacy l
LEFT JOIN maxima m
  ON m.workspace_id = o.workspace_id
 AND m.order_source = l.normalized_source
WHERE o."Order ID" = l.id;

INSERT INTO public.order_number_counters (workspace_id, prefix, next_number)
SELECT workspace_id, order_source, max(order_sequence_number) + 1
FROM public.orders
WHERE workspace_id IS NOT NULL
  AND order_source IS NOT NULL
  AND order_sequence_number IS NOT NULL
GROUP BY workspace_id, order_source
ON CONFLICT (workspace_id, prefix) DO UPDATE
  SET next_number = GREATEST(public.order_number_counters.next_number, EXCLUDED.next_number),
      updated_at = now();

ALTER TABLE public.orders
  ALTER COLUMN order_source SET NOT NULL,
  ALTER COLUMN order_sequence_number SET NOT NULL,
  ALTER COLUMN display_order_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_workspace_source_sequence_key'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_workspace_source_sequence_key
      UNIQUE (workspace_id, order_source, order_sequence_number);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS orders_workspace_display_order_id_idx
  ON public.orders (workspace_id, display_order_id);

CREATE INDEX IF NOT EXISTS orders_workspace_source_created_idx
  ON public.orders (workspace_id, order_source, created_at DESC);

CREATE OR REPLACE FUNCTION public.assign_source_scoped_order_display_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source text;
  v_sequence bigint;
  v_display_id text;
BEGIN
  IF NEW.workspace_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_source := public.normalize_order_source(coalesce(NEW.order_source, NEW.source));
  v_sequence := public.next_workspace_order_sequence(NEW.workspace_id, v_source);
  v_display_id := public.order_source_prefix(v_source) || '-' || v_sequence::text;

  NEW.order_source := v_source;
  NEW.order_sequence_number := v_sequence;
  NEW.display_order_id := v_display_id;
  NEW.order_number := v_display_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_workspace_order_number_trigger ON public.orders;
DROP TRIGGER IF EXISTS orders_source_scoped_display_id_trigger ON public.orders;
CREATE TRIGGER orders_source_scoped_display_id_trigger
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_source_scoped_order_display_id();

COMMENT ON COLUMN public.orders.order_source IS 'Normalized source for seller-facing numbering: youcan, google_sheets, shopify, or manual.';
COMMENT ON COLUMN public.orders.order_sequence_number IS 'Permanent workspace/source-local sequence; never reused after deletion.';
COMMENT ON COLUMN public.orders.display_order_id IS 'Stable seller-facing ID such as YC-1, GS-1, SF-1, or MN-1.';
