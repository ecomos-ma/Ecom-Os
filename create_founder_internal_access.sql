-- ============================================================
-- FOUNDER INTERNAL ACCESS SECURITY LAYER
-- ============================================================
-- This creates server-side security for the hidden founder page
-- Access is restricted to ziadennachat5@gmail.com only

-- 1. Create function to check if user is authorized founder
CREATE OR REPLACE FUNCTION public.is_founder_internal_user()
RETURNS boolean AS $$
BEGIN
  -- Check if the current user's email matches the authorized founder email
  -- This runs in the database context and cannot be bypassed from frontend
  RETURN (
    auth.uid() IS NOT NULL 
    AND (
      SELECT email 
      FROM auth.users 
      WHERE id = auth.uid()
    ) = 'ziadennachat5@gmail.com'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_founder_internal_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_founder_internal_user() TO anon;

-- 2. Create a sample table for founder internal data (if needed later)
-- This table will have RLS policies that only allow the founder to access
CREATE TABLE IF NOT EXISTS public.founder_internal_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  value jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.founder_internal_data ENABLE ROW LEVEL SECURITY;

-- Policy: Only the authorized founder can access this table
DROP POLICY IF EXISTS "Founder internal access only" ON public.founder_internal_data;

CREATE POLICY "Founder internal access only"
  ON public.founder_internal_data FOR ALL
  USING (public.is_founder_internal_user())
  WITH CHECK (public.is_founder_internal_user());

-- 3. Create function for founder-specific operations
CREATE OR REPLACE FUNCTION public.founder_internal_operation(operation_key text, operation_data jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- This function can only be called by the authorized founder
  IF NOT public.is_founder_internal_user() THEN
    RAISE EXCEPTION 'Unauthorized: founder access required' USING ERRCODE = '42501';
  END IF;
  
  -- Log the operation for audit
  INSERT INTO public.founder_internal_data (key, value)
  VALUES (operation_key || '_log', jsonb_build_object(
    'operation', operation_key,
    'data', operation_data,
    'timestamp', now(),
    'user_id', auth.uid()
  ));
  
  -- Return success
  v_result := jsonb_build_object(
    'success', true,
    'message', 'Operation completed',
    'timestamp', now()
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Add comment for documentation
COMMENT ON FUNCTION public.is_founder_internal_user IS 
'Server-side security check: returns true only if the authenticated user is ziadennachat5@gmail.com. Used for RLS policies and edge functions to protect founder-only resources.';

COMMENT ON FUNCTION public.founder_internal_operation IS 
'Executes founder-specific internal operations with server-side authorization. Only accessible to ziadennachat5@gmail.com via is_founder_internal_user() check.';
