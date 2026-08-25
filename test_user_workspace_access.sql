-- ============================================================
-- TEST user_has_workspace_access FUNCTION
-- ============================================================

-- First, get your workspace_id
SELECT id, name FROM workspaces;

-- Then test the access function (replace YOUR_WORKSPACE_ID_HERE with actual id)
SELECT user_has_workspace_access('YOUR_WORKSPACE_ID_HERE');
