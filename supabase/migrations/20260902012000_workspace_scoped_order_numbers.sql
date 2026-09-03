-- Keep customer-facing order references short and unique per workspace/source.
-- Existing UUID/provider references are converted once; external IDs remain in
-- external_order_id / youcan_order_id and are not lost.

CREATE TABLE IF NOT EXISTS public.order_number_counters (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  prefix text NOT NULL,
  next_number integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, prefix)
);

ALTER TABLE public.order_number_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages order counters" ON public.order_number_counters;
CREATE POLICY "Service role manages order counters" ON public.order_number_counters
  FOR ALL USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.next_workspace_order_number(p_workspace_id uuid, p_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_number integer;
BEGIN
  INSERT INTO public.order_number_counters (workspace_id, prefix, next_number)
  VALUES (p_workspace_id, upper(p_prefix), 2)
  ON CONFLICT (workspace_id, prefix) DO UPDATE
    SET next_number = order_number_counters.next_number + 1, updated_at = now()
  RETURNING next_number - 1 INTO v_number;
  RETURN upper(p_prefix) || '-' || v_number::text;
END;
$$;

-- The old global constraint prevented two workspaces from both having YC-1.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_number_key;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_number_workspace_id_key;
ALTER TABLE public.orders ADD CONSTRAINT orders_order_number_workspace_id_key UNIQUE (workspace_id, order_number);

-- Normalize all existing records in a stable, workspace-local order.
WITH ranked AS (
  SELECT "Order ID" AS id,
    CASE lower(coalesce(source, 'manual'))
      WHEN 'youcan' THEN 'YC' WHEN 'sheets' THEN 'GS' WHEN 'google_sheets' THEN 'GS'
      WHEN 'shopify' THEN 'SH' WHEN 'meta' THEN 'META' WHEN 'tiktok' THEN 'TT'
      ELSE 'ORD'
    END AS prefix,
    row_number() OVER (
      PARTITION BY workspace_id, CASE lower(coalesce(source, 'manual'))
        WHEN 'youcan' THEN 'YC' WHEN 'sheets' THEN 'GS' WHEN 'google_sheets' THEN 'GS'
        WHEN 'shopify' THEN 'SH' WHEN 'meta' THEN 'META' WHEN 'tiktok' THEN 'TT' ELSE 'ORD' END
      ORDER BY created_at NULLS LAST, "Order ID"
    ) AS sequence
  FROM public.orders
)
UPDATE public.orders o
SET order_number = r.prefix || '-' || r.sequence::text
FROM ranked r
WHERE o."Order ID" = r.id;

INSERT INTO public.order_number_counters (workspace_id, prefix, next_number)
SELECT workspace_id, prefix, max(sequence)::integer + 1
FROM (
  SELECT workspace_id,
    CASE lower(coalesce(source, 'manual'))
      WHEN 'youcan' THEN 'YC' WHEN 'sheets' THEN 'GS' WHEN 'google_sheets' THEN 'GS'
      WHEN 'shopify' THEN 'SH' WHEN 'meta' THEN 'META' WHEN 'tiktok' THEN 'TT' ELSE 'ORD' END AS prefix,
    row_number() OVER (PARTITION BY workspace_id, CASE lower(coalesce(source, 'manual'))
      WHEN 'youcan' THEN 'YC' WHEN 'sheets' THEN 'GS' WHEN 'google_sheets' THEN 'GS'
      WHEN 'shopify' THEN 'SH' WHEN 'meta' THEN 'META' WHEN 'tiktok' THEN 'TT' ELSE 'ORD' END
      ORDER BY created_at NULLS LAST, "Order ID") AS sequence
  FROM public.orders
) q
GROUP BY workspace_id, prefix
ON CONFLICT (workspace_id, prefix) DO UPDATE SET next_number = GREATEST(order_number_counters.next_number, EXCLUDED.next_number);

CREATE OR REPLACE FUNCTION public.assign_workspace_order_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prefix text;
BEGIN
  v_prefix := CASE lower(coalesce(NEW.source, 'manual'))
    WHEN 'youcan' THEN 'YC' WHEN 'sheets' THEN 'GS' WHEN 'google_sheets' THEN 'GS'
    WHEN 'shopify' THEN 'SH' WHEN 'meta' THEN 'META' WHEN 'tiktok' THEN 'TT' ELSE 'ORD' END;
  IF NEW.order_number IS NULL OR NEW.order_number !~ ('^' || v_prefix || '-[0-9]+$') THEN
    NEW.order_number := public.next_workspace_order_number(NEW.workspace_id, v_prefix);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_workspace_order_number_trigger ON public.orders;
CREATE TRIGGER orders_workspace_order_number_trigger
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_workspace_order_number();
