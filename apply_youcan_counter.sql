-- ============================================================
-- YOUCAN SEQUENTIAL ORDER NUMBERING SYSTEM
-- ============================================================

-- 1. Create table to track YouCan order sequence per workspace
CREATE TABLE IF NOT EXISTS public.youcan_order_counters (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  next_sequence_number integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.youcan_order_counters ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can manage counters
DROP POLICY IF EXISTS "Service role can manage youcan counters" ON public.youcan_order_counters;

CREATE POLICY "Service role can manage youcan counters"
  ON public.youcan_order_counters FOR ALL
  USING (auth.role() = 'service_role');

-- 2. Create atomic function to get next sequence number
CREATE OR REPLACE FUNCTION public.get_next_youcan_order_number(p_workspace_id uuid)
RETURNS text AS $$
DECLARE
  v_next_num integer;
  v_order_number text;
BEGIN
  INSERT INTO public.youcan_order_counters (workspace_id, next_sequence_number)
  VALUES (p_workspace_id, 1)
  ON CONFLICT (workspace_id) 
  DO UPDATE SET 
    next_sequence_number = youcan_order_counters.next_sequence_number + 1,
    updated_at = now()
  RETURNING next_sequence_number INTO v_next_num;
  
  v_order_number := 'YC-' || v_next_num::text;
  
  RETURN v_order_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create index for performance
CREATE INDEX IF NOT EXISTS youcan_order_counters_workspace_idx 
  ON public.youcan_order_counters(workspace_id);

-- 4. Add comment
COMMENT ON FUNCTION public.get_next_youcan_order_number IS 
'Atomically generates the next sequential YouCan order number for a workspace. 
Returns format: YC-{number}. Each workspace has its own independent sequence starting from 1.';