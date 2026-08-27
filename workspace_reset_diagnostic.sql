-- ============================================================
-- WORKSPACE RESET DIAGNOSTIC SCRIPT
-- Shows all tables with workspace_id and row counts for a specific workspace
-- ============================================================

-- Set your workspace_id here
-- REPLACE 'YOUR_WORKSPACE_ID_HERE' with your actual workspace UUID
DO $$
DECLARE
  v_workspace_id TEXT := 'YOUR_WORKSPACE_ID_HERE';
BEGIN
  RAISE NOTICE '=== WORKSPACE RESET DIAGNOSTIC ===';
  RAISE NOTICE 'Workspace ID: %', v_workspace_id;
  RAISE NOTICE 'IMPORTANT: Replace YOUR_WORKSPACE_ID_HERE with your actual workspace UUID before running!';
END $$;

-- Create a function to get row count for a table/workspace combination
CREATE OR REPLACE FUNCTION get_workspace_row_count(table_name TEXT, workspace_id TEXT)
RETURNS BIGINT AS $$
DECLARE
  query TEXT;
  count_result BIGINT;
BEGIN
  query := format('SELECT COUNT(*) FROM %s WHERE workspace_id = $1::uuid', table_name);
  EXECUTE query USING workspace_id INTO count_result;
  RETURN count_result;
EXCEPTION WHEN OTHERS THEN
  RETURN -1; -- Error or table doesn't have workspace_id
END;
$$ LANGUAGE plpgsql;

-- Main diagnostic query
WITH tables_to_check AS (
  SELECT 
    'orders' as table_name,
    'Business orders' as description
  UNION ALL SELECT 'customers', 'Customer records'
  UNION ALL SELECT 'products', 'Product catalog'
  UNION ALL SELECT 'campaigns', 'Marketing campaigns'
  UNION ALL SELECT 'expenses', 'Expense records'
  UNION ALL SELECT 'ad_spend', 'Ad spend data'
  UNION ALL SELECT 'order_items', 'Order line items'
  UNION ALL SELECT 'shipments', 'Shipping records'
  UNION ALL SELECT 'shipment_events', 'Shipment tracking events'
  UNION ALL SELECT 'shipping_logs', 'Shipping audit logs'
  UNION ALL SELECT 'inventory', 'Inventory records'
  UNION ALL SELECT 'stock_history', 'Stock change history'
  UNION ALL SELECT 'meta_campaigns', 'Meta/Facebook campaigns'
  UNION ALL SELECT 'meta_ads_daily', 'Meta daily ad spend'
  UNION ALL SELECT 'meta_settings', 'Meta integration settings'
  UNION ALL SELECT 'user_notifications', 'User notifications'
  UNION ALL SELECT 'team_invitations', 'Team invitations'
  UNION ALL SELECT 'team_audit_log', 'Team audit trail'
  UNION ALL SELECT 'workspace_invoices', 'Workspace invoices'
  UNION ALL SELECT 'cod_scenarios', 'COD scenarios'
  UNION ALL SELECT 'workspace_shipping_providers', 'Shipping provider configs'
  UNION ALL SELECT 'shipping_provider_credentials', 'Shipping provider credentials'
  UNION ALL SELECT 'shipping_provider_status', 'Shipping provider status'
  UNION ALL SELECT 'shipping_sync_logs', 'Shipping sync logs'
  UNION ALL SELECT 'google_sheet_column_mappings', 'Google Sheets column mappings'
  UNION ALL SELECT 'workspace_google_sheet_sync_log', 'Google Sheets sync logs'
  UNION ALL SELECT 'workspace_google_sheet_sync', 'Google Sheets sync configs'
  UNION ALL SELECT 'workspace_google_sheet_mapping', 'Google Sheets field mappings'
  UNION ALL SELECT 'integration_status', 'Integration status records'
  UNION ALL SELECT 'integrations', 'Integration records'
  UNION ALL SELECT 'notifications', 'Legacy notifications'
  UNION ALL SELECT 'performance_badges', 'Performance badges'
),
-- Tables to PRESERVE (not delete)
tables_to_preserve AS (
  SELECT 
    'workspaces' as table_name,
    'Workspace configuration (KEEP)' as description
  UNION ALL SELECT 'profiles', 'User profiles (KEEP)'
  UNION ALL SELECT 'youcan_tokens', 'YouCan OAuth tokens (KEEP - unless you want to re-auth)'
  UNION ALL SELECT 'youcan_credentials', 'YouCan OAuth credentials (KEEP - unless you want to re-auth)'
  UNION ALL SELECT 'google_sheets_credentials', 'Google Sheets credentials (KEEP - unless you want to re-setup)'
  UNION ALL SELECT 'ozon_cities', 'Ozon reference cities (KEEP)'
  UNION ALL SELECT 'coliaty_cities', 'Coliaty reference cities (KEEP)'
  UNION ALL SELECT 'city_arabic_names', 'City Arabic name mappings (KEEP)'
  UNION ALL SELECT 'ai_providers', 'AI provider configurations (KEEP)'
  UNION ALL SELECT 'ai_landing_pages', 'AI landing pages (KEEP)'
  UNION ALL SELECT 'ai_marketing_angles', 'AI marketing angles (KEEP)'
  UNION ALL SELECT 'ai_offers', 'AI offers (KEEP)'
  UNION ALL SELECT 'ai_products', 'AI products (KEEP)'
  UNION ALL SELECT 'ai_product_analyses', 'AI product analyses (KEEP)'
  UNION ALL SELECT 'ai_generation_jobs', 'AI generation jobs (KEEP)'
  UNION ALL SELECT 'ai_prompt_versions', 'AI prompt versions (KEEP)'
  UNION ALL SELECT 'ai_style_profiles', 'AI style profiles (KEEP)'
  UNION ALL SELECT 'ai_style_versions', 'AI style versions (KEEP)'
  UNION ALL SELECT 'ai_audit_logs', 'AI audit logs (KEEP)'
  UNION ALL SELECT 'ai_sawty_generations', 'AI SAWTY generations (KEEP)'
  UNION ALL SELECT 'ai_sawty_audio', 'AI SAWTY audio (KEEP)'
)
SELECT 
  'TO DELETE' as category,
  table_name,
  description,
  CASE 
    WHEN get_workspace_row_count(table_name, 'YOUR_WORKSPACE_ID_HERE') = -1 THEN 'ERROR'
    ELSE get_workspace_row_count(table_name, 'YOUR_WORKSPACE_ID_HERE')::TEXT
  END as row_count
FROM tables_to_check
UNION ALL
SELECT 
  'TO PRESERVE' as category,
  table_name,
  description,
  CASE 
    WHEN get_workspace_row_count(table_name, 'YOUR_WORKSPACE_ID_HERE') = -1 THEN 'N/A (no workspace_id)'
    ELSE get_workspace_row_count(table_name, 'YOUR_WORKSPACE_ID_HERE')::TEXT
  END as row_count
FROM tables_to_preserve
ORDER BY category DESC, table_name;

-- Show workspace info
SELECT 
  '=== WORKSPACE INFO ===' as info_section,
  id,
  name,
  carrier,
  created_at
FROM workspaces 
WHERE id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

-- Show users in this workspace
SELECT 
  '=== USERS IN WORKSPACE ===' as info_section,
  p.id,
  p.full_name,
  p.role,
  p.created_at
FROM profiles p
WHERE p.workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

-- Show integration credentials for this workspace
SELECT 
  '=== INTEGRATION CREDENTIALS (PRESERVED) ===' as info_section,
  'YouCan Tokens' as integration_type,
  COUNT(*) as credential_count
FROM youcan_tokens
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid
UNION ALL
SELECT 
  '=== INTEGRATION CREDENTIALS (PRESERVED) ===' as info_section,
  'YouCan Credentials' as integration_type,
  COUNT(*) as credential_count
FROM youcan_credentials
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid
UNION ALL
SELECT 
  '=== INTEGRATION CREDENTIALS (PRESERVED) ===' as info_section,
  'Google Sheets Credentials' as integration_type,
  COUNT(*) as credential_count
FROM google_sheets_credentials
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;