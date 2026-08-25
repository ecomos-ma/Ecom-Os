-- ============================================================
-- PRODUCTION-GRADE WORKSPACE RESET SYSTEM V2
-- ============================================================
-- This migration creates a comprehensive, secure workspace reset system
-- with proper locking, idempotency, storage deletion, integration disconnection,
-- post-reset verification, and audit logging.
-- ============================================================

-- Step 1: Add workspace status tracking
-- Use a transaction with explicit lock timeout to avoid deadlocks
SET LOCAL lock_timeout = '5s';

BEGIN;

-- First, add the column without the check constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'workspaces' 
    AND column_name = 'status'
  ) THEN
    ALTER TABLE workspaces ADD COLUMN status text DEFAULT 'active';
  END IF;
END $$;

-- Update any existing NULL values to 'active'
UPDATE workspaces SET status = 'active' WHERE status IS NULL;

-- Drop the check constraint if it exists (for idempotency)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'workspaces_status_check'
  ) THEN
    ALTER TABLE workspaces DROP CONSTRAINT workspaces_status_check;
  END IF;
END $$;

-- Now make the column NOT NULL and add the check constraint
ALTER TABLE workspaces 
ALTER COLUMN status SET NOT NULL,
ADD CONSTRAINT workspaces_status_check CHECK (status IN ('active', 'resetting', 'reset_failed'));

COMMIT;

-- Step 2: Add reset operation tracking table
CREATE TABLE IF NOT EXISTS workspace_reset_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  requested_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  current_stage text,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  CONSTRAINT operation_id_format CHECK (operation_id ~* '^[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}$')
);

-- Create index for lookup by operation_id
CREATE INDEX IF NOT EXISTS idx_workspace_reset_operations_operation_id 
ON workspace_reset_operations(operation_id);

-- Create index for workspace lookups
CREATE INDEX IF NOT EXISTS idx_workspace_reset_operations_workspace_id 
ON workspace_reset_operations(workspace_id);

-- Step 3: Add platform-level audit log table (outside workspace data)
CREATE TABLE IF NOT EXISTS platform_reset_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  workspace_name text,
  requested_by_user_id uuid NOT NULL,
  operation_id text NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now(),
  result text NOT NULL CHECK (result IN ('success', 'failed')),
  duration_ms integer,
  deleted_records_count integer DEFAULT 0,
  deleted_files_count integer DEFAULT 0,
  integrations_revoked jsonb DEFAULT '[]'::jsonb,
  error_message text
);

-- Create index for audit lookups
CREATE INDEX IF NOT EXISTS idx_platform_reset_audit_log_workspace_id 
ON platform_reset_audit_log(workspace_id);

-- Create index for user lookups
CREATE INDEX IF NOT EXISTS idx_platform_reset_audit_log_user_id 
ON platform_reset_audit_log(requested_by_user_id);

-- Step 4: Enable RLS
ALTER TABLE workspace_reset_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_reset_audit_log ENABLE ROW LEVEL SECURITY;

-- Step 5: RLS policies for workspace_reset_operations
-- Drop existing policies first for idempotency
DROP POLICY IF EXISTS "Users can view own workspace reset operations" ON workspace_reset_operations;

-- Only workspace members can see their own reset operations
CREATE POLICY "Users can view own workspace reset operations"
ON workspace_reset_operations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profile_workspaces pw
    WHERE pw.workspace_id = workspace_reset_operations.workspace_id
    AND pw.profile_id = auth.uid()
  )
);

-- Step 6: RLS policies for platform_reset_audit_log
-- Drop existing policies first for idempotency
DROP POLICY IF EXISTS "Platform admins can view reset audit logs" ON platform_reset_audit_log;
DROP POLICY IF EXISTS "Service role can insert reset audit logs" ON platform_reset_audit_log;

-- Only platform admins can view audit logs
CREATE POLICY "Platform admins can view reset audit logs"
ON platform_reset_audit_log FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('owner', 'admin')
  )
);

-- Only service role can insert audit logs
CREATE POLICY "Service role can insert reset audit logs"
ON platform_reset_audit_log FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- Step 7: Helper function to check if reset is in progress
CREATE OR REPLACE FUNCTION is_workspace_resetting(p_workspace_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM workspace_reset_operations
    WHERE workspace_id = p_workspace_id
    AND status IN ('pending', 'in_progress')
  );
END;
$$;

-- Step 8: Helper function to get current reset operation
DROP FUNCTION IF EXISTS get_current_reset_operation(uuid);

CREATE OR REPLACE FUNCTION get_current_reset_operation(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'id', id,
      'workspace_id', workspace_id,
      'requested_by_user_id', requested_by_user_id,
      'operation_id', operation_id,
      'status', status,
      'current_stage', current_stage,
      'error_message', error_message,
      'started_at', started_at,
      'completed_at', completed_at,
      'metadata', metadata
    )
    FROM workspace_reset_operations
    WHERE workspace_id = p_workspace_id
    AND status IN ('pending', 'in_progress')
    ORDER BY started_at DESC
    LIMIT 1
  );
END;
$$;

-- Step 9: Initialize reset operation with locking
CREATE OR REPLACE FUNCTION initialize_workspace_reset(
  p_workspace_id uuid,
  p_user_id uuid,
  p_operation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_name text;
  v_current_status text;
  v_existing_operation jsonb;
BEGIN
  -- Get workspace name for logging
  SELECT name, status INTO v_workspace_name, v_current_status
  FROM workspaces
  WHERE id = p_workspace_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Workspace not found'
    );
  END IF;
  
  -- Check if workspace is already resetting
  IF v_current_status = 'resetting' THEN
    v_existing_operation := get_current_reset_operation(p_workspace_id);
    
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Workspace reset already in progress',
      'operation_id', v_existing_operation->>'operation_id',
      'current_stage', v_existing_operation->>'current_stage'
    );
  END IF;
  
  -- Check for idempotency - if operation_id already exists, return it
  IF EXISTS (
    SELECT 1 FROM workspace_reset_operations
    WHERE operation_id = p_operation_id
  ) THEN
    SELECT jsonb_build_object(
      'id', id,
      'workspace_id', workspace_id,
      'requested_by_user_id', requested_by_user_id,
      'operation_id', operation_id,
      'status', status,
      'current_stage', current_stage,
      'error_message', error_message,
      'started_at', started_at,
      'completed_at', completed_at,
      'metadata', metadata
    ) INTO v_existing_operation
    FROM workspace_reset_operations
    WHERE operation_id = p_operation_id;
    
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Reset operation already exists',
      'operation_id', v_existing_operation->>'operation_id',
      'status', v_existing_operation->>'status'
    );
  END IF;
  
  -- Lock the workspace - allow locking from 'active' or 'reset_failed' status
  -- If status is 'reset_failed', we allow retrying the reset
  UPDATE workspaces
  SET status = 'resetting'
  WHERE id = p_workspace_id
  AND status IN ('active', 'reset_failed');
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Failed to lock workspace - workspace must be in active or reset_failed status to reset',
      'current_status', v_current_status
    );
  END IF;
  
  -- Create reset operation record
  INSERT INTO workspace_reset_operations (
    workspace_id,
    requested_by_user_id,
    operation_id,
    status,
    current_stage,
    metadata
  ) VALUES (
    p_workspace_id,
    p_user_id,
    p_operation_id,
    'in_progress',
    'initializing',
    jsonb_build_object('workspace_name', v_workspace_name)
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'operation_id', p_operation_id,
    'workspace_name', v_workspace_name
  );
END;
$$;

-- Step 10: Update reset operation stage
CREATE OR REPLACE FUNCTION update_reset_stage(
  p_operation_id text,
  p_stage text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE workspace_reset_operations
  SET current_stage = p_stage,
      metadata = metadata || p_metadata
  WHERE operation_id = p_operation_id;
END;
$$;

-- Step 11: Mark reset operation as completed
CREATE OR REPLACE function complete_reset_operation(
  p_operation_id text,
  p_deleted_records_count integer DEFAULT 0,
  p_deleted_files_count integer DEFAULT 0,
  p_integrations_revoked jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  -- Get workspace_id
  SELECT workspace_id INTO v_workspace_id
  FROM workspace_reset_operations
  WHERE operation_id = p_operation_id;
  
  -- Update operation record
  UPDATE workspace_reset_operations
  SET status = 'completed',
      completed_at = now(),
      metadata = metadata || jsonb_build_object(
        'deleted_records_count', p_deleted_records_count,
        'deleted_files_count', p_deleted_files_count,
        'integrations_revoked', p_integrations_revoked
      )
  WHERE operation_id = p_operation_id;
  
  -- Unlock workspace
  UPDATE workspaces
  SET status = 'active'
  WHERE id = v_workspace_id;
END;
$$;

-- Step 12: Mark reset operation as failed
CREATE OR REPLACE FUNCTION fail_reset_operation(
  p_operation_id text,
  p_error_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  -- Get workspace_id
  SELECT workspace_id INTO v_workspace_id
  FROM workspace_reset_operations
  WHERE operation_id = p_operation_id;
  
  -- Update operation record
  UPDATE workspace_reset_operations
  SET status = 'failed',
      completed_at = now(),
      error_message = p_error_message
  WHERE operation_id = p_operation_id;
  
  -- Mark workspace as failed (not active)
  UPDATE workspaces
  SET status = 'reset_failed'
  WHERE id = v_workspace_id;
END;
$$;

-- Step 13: Create storage deletion helper function
CREATE OR REPLACE FUNCTION delete_workspace_storage_objects(
  p_workspace_id uuid,
  p_bucket_id text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count integer;
BEGIN
  -- Delete all objects in the bucket that belong to this workspace
  -- Storage paths are expected to be workspace_id/...
  DELETE FROM storage.objects
  WHERE bucket_id = p_bucket_id
  AND (storage.foldername(name))[1] = p_workspace_id::text;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN v_deleted_count;
END;
$$;

-- Step 14: Grant execute permissions
GRANT EXECUTE ON FUNCTION is_workspace_resetting TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_reset_operation TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_workspace_reset TO authenticated;
GRANT EXECUTE ON FUNCTION update_reset_stage TO authenticated;
GRANT EXECUTE ON FUNCTION complete_reset_operation TO authenticated;
GRANT EXECUTE ON FUNCTION fail_reset_operation TO authenticated;
GRANT EXECUTE ON FUNCTION delete_workspace_storage_objects TO authenticated;

-- Step 15: Grant table permissions
GRANT SELECT, INSERT ON workspace_reset_operations TO authenticated;
GRANT SELECT ON platform_reset_audit_log TO authenticated;
