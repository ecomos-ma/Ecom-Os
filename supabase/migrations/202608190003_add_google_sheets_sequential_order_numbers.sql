-- ============================================================
-- GOOGLE SHEETS SEQUENTIAL ORDER NUMBERING SYSTEM
-- ============================================================
-- This migration adds workspace-scoped sequential order numbers
-- for Google Sheets orders while preserving existing order numbers
-- and maintaining sync_key-based deduplication.

-- 1. Create table to track Google Sheets order sequence per workspace
CREATE TABLE IF NOT EXISTS public.google_sheets_order_counters (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  next_sequence_number integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.google_sheets_order_counters ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can manage counters (for edge function access)
-- Drop existing policy if it exists, then create
DROP POLICY IF EXISTS "Service role can manage counters" ON public.google_sheets_order_counters;

CREATE POLICY "Service role can manage counters"
  ON public.google_sheets_order_counters FOR ALL
  USING (auth.role() = 'service_role');

-- 2. Create atomic function to get next sequence number
CREATE OR REPLACE FUNCTION public.get_next_google_sheets_order_number(p_workspace_id uuid)
RETURNS text AS $$
DECLARE
  v_next_num integer;
  v_order_number text;
BEGIN
  -- Insert or update counter atomically and get the next number
  INSERT INTO public.google_sheets_order_counters (workspace_id, next_sequence_number)
  VALUES (p_workspace_id, 1)
  ON CONFLICT (workspace_id) 
  DO UPDATE SET 
    next_sequence_number = google_sheets_order_counters.next_sequence_number + 1,
    updated_at = now()
  RETURNING next_sequence_number INTO v_next_num;
  
  -- Format as GS-{number}
  v_order_number := 'GS-' || v_next_num::text;
  
  RETURN v_order_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create index for performance
CREATE INDEX IF NOT EXISTS google_sheets_order_counters_workspace_idx 
  ON public.google_sheets_order_counters(workspace_id);

-- 4. Add comment documenting the function
COMMENT ON FUNCTION public.get_next_google_sheets_order_number IS 
'Atomically generates the next sequential Google Sheets order number for a workspace. 
Returns format: GS-{number}. Each workspace has its own independent sequence starting from 1.';
