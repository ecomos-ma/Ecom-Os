-- ============================================================
-- Add centralized integration verification helpers
-- ============================================================
-- These functions provide a single source of truth for checking
-- whether an integration is active for a workspace.

-- First, ensure workspaces has the required Coliaty columns
-- (migration 047 added coliaty_api_key but code uses public/secret key pattern)
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS coliaty_public_key text,
  ADD COLUMN IF NOT EXISTS coliaty_secret_key text;

COMMENT ON COLUMN public.workspaces.coliaty_public_key IS 'Coliaty public API key for this workspace';
COMMENT ON COLUMN public.workspaces.coliaty_secret_key IS 'Coliaty secret API key for this workspace';

-- Function to check if Google Sheets integration is active for a workspace
CREATE OR REPLACE FUNCTION public.is_google_sheets_integration_active(p_workspace_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  table_exists boolean;
  column_exists boolean;
  has_credentials boolean;
BEGIN
  -- Check if table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'google_sheets_credentials'
  ) INTO table_exists;
  
  IF NOT table_exists THEN
    RETURN false;
  END IF;
  
  -- Check if column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'google_sheets_credentials'
    AND column_name = 'workspace_id'
  ) INTO column_exists;
  
  IF NOT column_exists THEN
    RETURN false;
  END IF;
  
  -- Check for actual credentials
  SELECT EXISTS (
    SELECT 1 FROM public.google_sheets_credentials
    WHERE workspace_id = p_workspace_id
    AND web_app_url IS NOT NULL
    AND web_app_url != ''
  ) INTO has_credentials;
  
  RETURN has_credentials;
END;
$$;

-- Function to check if YouCan integration is active for a workspace
-- Note: Access token is stored in youcan_tokens table, not youcan_credentials
CREATE OR REPLACE FUNCTION public.is_youcan_integration_active(p_workspace_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  table_exists boolean;
  column_exists boolean;
  has_credentials boolean;
BEGIN
  -- Check if table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'youcan_tokens'
  ) INTO table_exists;
  
  IF NOT table_exists THEN
    RETURN false;
  END IF;
  
  -- Check if column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'youcan_tokens'
    AND column_name = 'workspace_id'
  ) INTO column_exists;
  
  IF NOT column_exists THEN
    RETURN false;
  END IF;
  
  -- Check for actual credentials
  SELECT EXISTS (
    SELECT 1 FROM public.youcan_tokens
    WHERE workspace_id = p_workspace_id
    AND access_token IS NOT NULL
    AND access_token != ''
  ) INTO has_credentials;
  
  RETURN has_credentials;
END;
$$;

-- Function to check if Meta Ads integration is active for a workspace
CREATE OR REPLACE FUNCTION public.is_meta_integration_active(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE id = p_workspace_id
    AND meta_access_token IS NOT NULL
    AND meta_access_token != ''
    AND meta_ad_account_id IS NOT NULL
    AND meta_ad_account_id != ''
  );
$$;

-- Function to check if Coliaty integration is active for a workspace
CREATE OR REPLACE FUNCTION public.is_coliaty_integration_active(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE id = p_workspace_id
    AND coliaty_enabled = true
    AND (
      (coliaty_public_key IS NOT NULL AND coliaty_secret_key IS NOT NULL)
      OR
      (coliaty_api_key IS NOT NULL) -- Legacy fallback
    )
  );
$$;

-- Function to check if any shipping provider is configured for a workspace
CREATE OR REPLACE FUNCTION public.is_shipping_integration_active(p_workspace_id uuid, p_provider text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  table_exists boolean;
  column_exists boolean;
  has_credentials boolean;
BEGIN
  -- Check if table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'shipping_provider_credentials'
  ) INTO table_exists;
  
  IF NOT table_exists THEN
    RETURN false;
  END IF;
  
  -- Check if column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'shipping_provider_credentials'
    AND column_name = 'workspace_id'
  ) INTO column_exists;
  
  IF NOT column_exists THEN
    RETURN false;
  END IF;
  
  -- Check for actual credentials
  SELECT EXISTS (
    SELECT 1 FROM public.shipping_provider_credentials
    WHERE workspace_id = p_workspace_id
    AND (p_provider IS NULL OR provider = p_provider)
    AND credentials IS NOT NULL
  ) INTO has_credentials;
  
  RETURN has_credentials;
END;
$$;

-- Overloaded version without provider parameter for convenience
CREATE OR REPLACE FUNCTION public.is_shipping_integration_active(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_shipping_integration_active(p_workspace_id, NULL);
$$;

-- Function to deactivate Google Sheets integration for a workspace
CREATE OR REPLACE FUNCTION public.deactivate_google_sheets_integration(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    UPDATE public.google_sheets_credentials
    SET 
      web_app_url = NULL,
      access_token = NULL,
      refresh_token = NULL,
      webhook_token = NULL,
      last_processed_row = NULL,
      last_seen_sheet_row = NULL,
      last_successful_sync_at = NULL
    WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table THEN
    -- Table doesn't exist, skip
  END;
END;
$$;

-- Function to deactivate YouCan integration for a workspace
CREATE OR REPLACE FUNCTION public.deactivate_youcan_integration(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete credentials (if table exists)
  BEGIN
    DELETE FROM public.youcan_credentials
    WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table THEN
    -- Table doesn't exist, skip
  END;
  
  -- Delete tokens
  DELETE FROM public.youcan_tokens
  WHERE workspace_id = p_workspace_id;
  
  -- Clear webhook ID from workspaces
  UPDATE public.workspaces
  SET youcan_webhook_id = NULL
  WHERE id = p_workspace_id;
END;
$$;

-- Function to deactivate Coliaty integration for a workspace
CREATE OR REPLACE FUNCTION public.deactivate_coliaty_integration(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.workspaces
  SET 
    coliaty_enabled = false,
    coliaty_public_key = NULL,
    coliaty_secret_key = NULL,
    coliaty_api_key = NULL, -- Also clear legacy key
    coliaty_api_url = NULL,
    coliaty_webhook_token = NULL
  WHERE id = p_workspace_id;
END;
$$;

-- Function to deactivate shipping provider for a workspace
CREATE OR REPLACE FUNCTION public.deactivate_shipping_integration(p_workspace_id uuid, p_provider text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete shipping provider credentials (if table exists)
  BEGIN
    DELETE FROM public.shipping_provider_credentials
    WHERE workspace_id = p_workspace_id
    AND provider = p_provider;
  EXCEPTION WHEN undefined_table THEN
    -- Table doesn't exist, skip
  END;
END;
$$;

-- Function to deactivate Meta Ads integration for a workspace
CREATE OR REPLACE FUNCTION public.deactivate_meta_integration(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.workspaces
  SET 
    meta_access_token = NULL,
    meta_ad_account_id = NULL
  WHERE id = p_workspace_id;
END;
$$;

-- Grant execute permissions to authenticated role
GRANT EXECUTE ON FUNCTION public.is_google_sheets_integration_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_youcan_integration_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_coliaty_integration_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_shipping_integration_active(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_shipping_integration_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_google_sheets_integration(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_youcan_integration(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_coliaty_integration(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_shipping_integration(uuid, text) TO authenticated;

-- Grant execute permissions to service_role (for Edge Functions)
GRANT EXECUTE ON FUNCTION public.is_google_sheets_integration_active(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_youcan_integration_active(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_coliaty_integration_active(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_shipping_integration_active(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_shipping_integration_active(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.deactivate_google_sheets_integration(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.deactivate_youcan_integration(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.deactivate_coliaty_integration(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.deactivate_shipping_integration(uuid, text) TO service_role;
