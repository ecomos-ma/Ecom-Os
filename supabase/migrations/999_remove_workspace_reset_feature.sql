-- ============================================================
-- REMOVE WORKSPACE RESET FEATURE
-- ============================================================
-- This migration removes all database objects created specifically
-- for the Workspace Reset/Delete Data feature.

-- STEP 1: DROP RESET-SPECIFIC COLUMNS FROM WORKSPACES TABLE
ALTER TABLE public.workspaces DROP COLUMN IF EXISTS reset_status;
ALTER TABLE public.workspaces DROP COLUMN IF EXISTS reset_started_at;
ALTER TABLE public.workspaces DROP COLUMN IF EXISTS reset_completed_at;
ALTER TABLE public.workspaces DROP COLUMN IF EXISTS reset_error;

-- STEP 2: DROP RESET AUDIT LOG TABLE (if it exists)
DROP TABLE IF EXISTS public.workspace_reset_audit_log CASCADE;

-- STEP 3: DROP RESET-SPECIFIC FUNCTIONS
DROP FUNCTION IF EXISTS public.reset_workspace_data(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.reset_workspace_simple(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_workspace_reset_status(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_workspace_reset_history(uuid, int) CASCADE;

-- STEP 4: DROP RESET-SPECIFIC INDEXES
DROP INDEX IF EXISTS idx_workspace_reset_audit_log_workspace;
DROP INDEX IF EXISTS idx_workspace_reset_audit_log_user;
